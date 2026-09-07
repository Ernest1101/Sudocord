/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 dsd16
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, PresenceStore, RestAPI, UserStore } from "@webpack/common";

// ActivityType.LISTENING === 2, ActivityType.CUSTOM_STATUS === 4
const LISTENING = 2;
const CUSTOM_STATUS = 4;
const STATUS_LIMIT = 128;

const settings = definePluginSettings({
    geniusToken: {
        type: OptionType.STRING,
        description: "Genius Client Access Token для поиска песни (бесплатно: genius.com/api-clients → New API Client → Generate Access Token). Без токена — сопоставление только по названию.",
        default: ""
    },
    lyricsProxy: {
        type: OptionType.STRING,
        description: "Необязательный CORS-прокси для чтения текста напрямую со страниц Genius, например https://corsproxy.io/?url= (страницы genius.com запрещают чтение из браузера, поэтому по умолчанию текст берётся из LRCLIB).",
        default: ""
    },
    prefix: {
        type: OptionType.STRING,
        description: "Префикс статуса",
        default: "🎵"
    },
    includeTrack: {
        type: OptionType.BOOLEAN,
        description: "Статус вида «Артист — Трек: строка» (выкл — только строка песни)",
        default: false
    },
    tickMs: {
        type: OptionType.NUMBER,
        description: "Как часто проверять строку песни (мс)",
        default: 2000
    },
    offsetMs: {
        type: OptionType.NUMBER,
        description: "Сдвиг строк (мс): минус — показывать раньше, плюс — позже. Если строки от трека отстают, ставь минус, например -1500",
        default: 0
    },
    clearOnStop: {
        type: OptionType.BOOLEAN,
        description: "Убирать статус когда музыка остановилась (только если статус ставил плагин)",
        default: true
    }
});

interface LyricLine {
    t: number;
    text: string;
}

interface LyricsData {
    synced: LyricLine[];
    plain: string[];
    source: string;
}

interface TrackInfo {
    key: string;
    title: string;
    artist: string;
    durationMs: number;
}

let timer: ReturnType<typeof setInterval> | null = null;
let lastFluxAt = 0;
let fluxPlaying = false;
let fluxPositionMs = 0;
let fluxStamp = 0;
let fluxTrack: TrackInfo | null = null;

let currentKey: string | null = null;
let currentTrack: TrackInfo | null = null;
let trackStartAt = 0;
const lyricsCache = new Map<string, LyricsData | null>();
const lyricsInflight = new Map<string, Promise<LyricsData | null>>();
let lastLine = "\0";
let lastSetText: string | null = null;
let noMusicLogged = false;

function norm(s: string): string {
    return (s ?? "").toLowerCase().replace(/\(.*?\)|\[.*?\]|- remaster.*/g, "").replace(/\s+/g, " ").trim();
}

function livePositionMs(): number {
    if (fluxPlaying) return fluxPositionMs + (Date.now() - fluxStamp);
    return fluxPositionMs;
}

function onSpotifyState(e: any) {
    try {
        const t = e?.track;
        if (!t?.name) {
            fluxTrack = null;
            fluxPlaying = false;
            return;
        }
        const artist = Array.isArray(t.artists) && t.artists.length
            ? t.artists.map((a: any) => a?.name).filter(Boolean).join(", ")
            : "Unknown";
        const title = String(t.name);
        fluxTrack = {
            key: norm(`${artist} - ${title}`),
            title,
            artist,
            durationMs: Number(t.duration) || 0
        };
        fluxPlaying = e.isPlaying ?? false;
        fluxPositionMs = Number(e.position) || 0;
        fluxStamp = Date.now();
        lastFluxAt = Date.now();
    } catch (err) {
        console.error("[GeniusLyrics] spotify state failed", err);
    }
}

function presenceTrack(): { track: TrackInfo; posMs: number; } | null {
    try {
        const me = UserStore.getCurrentUser()?.id;
        if (!me) return null;
        const acts = PresenceStore.getActivities?.(me) ?? [];
        const listening = acts.find((a: any) => a?.type === LISTENING && a?.details);
        if (!listening) return null;
        const title = String((listening as any).details);
        const artist = String((listening as any).state ?? "Unknown").replace(/^by\s+/i, "");
        const ts = (listening as any).timestamps ?? {};
        const posMs = ts.start ? Math.max(0, Date.now() - Number(ts.start)) : 0;
        const durationMs = ts.start && ts.end ? Math.max(0, Number(ts.end) - Number(ts.start)) : 0;
        return { track: { key: norm(`${artist} - ${title}`), title, artist, durationMs }, posMs };
    } catch {
        return null;
    }
}

function getOwnStatusText(): string | null {
    try {
        const me = UserStore.getCurrentUser()?.id;
        if (!me) return null;
        const acts = PresenceStore.getActivities?.(me) ?? [];
        const custom = acts.find((a: any) => a?.type === CUSTOM_STATUS);
        return (custom as any)?.state ?? null;
    } catch {
        return null;
    }
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12000);
    try {
        const res = await fetch(url, { headers, signal: ctrl.signal });
        if (res.status === 429) {
            console.warn("[GeniusLyrics] rate limited by", url);
            return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(to);
    }
}

async function fetchText(url: string): Promise<string | null> {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12000);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } finally {
        clearTimeout(to);
    }
}

async function geniusMatch(track: TrackInfo): Promise<{ url: string; title: string; } | null> {
    const token = settings.store.geniusToken.trim();
    if (!token) return null;
    try {
        // токен query-параметром, а не заголовком: Authorization провоцирует
        // CORS-префлайт, который api.genius.com не проходит
        const data = await fetchJson(
            `https://api.genius.com/search?q=${encodeURIComponent(`${track.artist} ${track.title}`)}&access_token=${encodeURIComponent(token)}`
        );
        const hits = data?.response?.hits ?? [];
        const songs = hits.filter((h: any) => h?.type === "song").map((h: any) => h.result);
        if (!songs.length) return null;
        const want = norm(track.artist);
        const exact = songs.find((s: any) => norm(s?.primary_artist?.name).includes(want) || want.includes(norm(s?.primary_artist?.name)));
        const pick = exact ?? songs[0];
        if (!pick?.url) return null;
        console.info("[GeniusLyrics] genius match:", pick.full_title, pick.url);
        return { url: String(pick.url), title: String(pick.full_title ?? pick.title) };
    } catch (e) {
        console.error("[GeniusLyrics] genius search failed", e);
        return null;
    }
}

function scrapeGeniusLyrics(html: string): string[] {
    const lines: string[] = [];
    try {
        const blocks = html.match(/<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g) ?? [];
        for (const b of blocks) {
            const inner = b.replace(/^<div[^>]*>/, "").replace(/<\/div>$/, "");
            const withBreaks = inner.replace(/<br\s*\/?>/gi, "\n");
            const text = withBreaks.replace(/<[^>]+>/g, "");
            for (const raw of text.split("\n")) {
                const line = raw.trim();
                if (!line) continue;
                if (/^\[.*\]$/.test(line)) continue;
                lines.push(line);
            }
        }
    } catch (e) {
        console.error("[GeniusLyrics] scrape parse failed", e);
    }
    return lines;
}

async function geniusLyrics(track: TrackInfo): Promise<string[] | null> {
    const match = await geniusMatch(track);
    if (!match) return null;
    // 1) напрямую (сработает там, где нет CORS-ограничений)
    try {
        const html = await fetchText(match.url);
        if (html) {
            const lines = scrapeGeniusLyrics(html);
            if (lines.length) return lines;
        }
    } catch (e) {
        console.warn("[GeniusLyrics] genius direct read blocked, fallback to LRCLIB", e);
    }
    // 2) через пользовательский CORS-прокси
    const proxy = settings.store.lyricsProxy.trim();
    if (proxy) {
        try {
            const html = await fetchText(proxy + encodeURIComponent(match.url));
            if (html) {
                const lines = scrapeGeniusLyrics(html);
                if (lines.length) return lines;
            }
        } catch (e) {
            console.error("[GeniusLyrics] genius proxy read failed", e);
        }
    }
    return null;
}

function toLyricsData(syncedRaw: unknown, plainRaw: unknown, source: string): LyricsData | null {
    const synced = parseLrc(String(syncedRaw ?? ""));
    const plain = String(plainRaw ?? "").split("\n").map(l => l.trim()).filter(l => l && !/^\[.*\]$/.test(l));
    if (!synced.length && !plain.length) return null;
    return { synced, plain, source };
}

async function lrclibSearch(track: TrackInfo): Promise<LyricsData | null> {
    // нечёткий поиск: get-cached требует точного совпадения и отдаёт 404 на андеграунд
    try {
        const data = await fetchJson(`https://lrclib.net/api/search?q=${encodeURIComponent(`${track.artist} ${track.title}`)}`);
        if (!Array.isArray(data) || !data.length) return null;
        const dur = track.durationMs / 1000;
        const sorted = [...data].sort((a: any, b: any) => {
            const da = a?.duration != null && dur ? Math.abs(Number(a.duration) - dur) : 9999;
            const db = b?.duration != null && dur ? Math.abs(Number(b.duration) - dur) : 9999;
            return da - db;
        });
        for (const item of sorted.slice(0, 5)) {
            const parsed = toLyricsData(item?.syncedLyrics, item?.plainLyrics, "lrclib-search");
            if (parsed) {
                console.info(`[GeniusLyrics] lrclib search hit: ${item?.artistName} - ${item?.trackName}`);
                return parsed;
            }
        }
        return null;
    } catch (e) {
        console.error("[GeniusLyrics] lrclib search failed", e);
        return null;
    }
}

async function lrclibLyrics(track: TrackInfo): Promise<LyricsData | null> {
    const dur = Math.round(track.durationMs / 1000);
    try {
        const data = await fetchJson(
            `https://lrclib.net/api/get-cached?artist_name=${encodeURIComponent(track.artist)}&track_name=${encodeURIComponent(track.title)}${dur ? `&duration=${dur}` : ""}`
        );
        if (data && (data.syncedLyrics || data.plainLyrics)) {
            const parsed = toLyricsData(data.syncedLyrics, data.plainLyrics, "lrclib");
            if (parsed) return parsed;
        }
    } catch {
        // 404 = нет точного совпадения, идём в нечёткий поиск
    }
    return lrclibSearch(track);
}

function parseLrc(lrc: string): LyricLine[] {
    const out: LyricLine[] = [];
    for (const raw of lrc.split("\n")) {
        const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)];
        if (!stamps.length) continue;
        const text = raw.slice(stamps[stamps.length - 1].index! + stamps[stamps.length - 1][0].length).trim();
        if (!text) continue;
        for (const m of stamps) {
            out.push({ t: Number(m[1]) * 60 + Number(m[2]), text });
        }
    }
    out.sort((a, b) => a.t - b.t);
    return out;
}

function loadLyrics(track: TrackInfo): Promise<LyricsData | null> {
    const cached = lyricsCache.get(track.key);
    if (cached !== undefined) return Promise.resolve(cached);
    const inflight = lyricsInflight.get(track.key);
    if (inflight) return inflight;
    const p = (async (): Promise<LyricsData | null> => {
        try {
            const genius = await geniusLyrics(track);
            if (genius?.length) {
                const data: LyricsData = { synced: [], plain: genius, source: "genius" };
                lyricsCache.set(track.key, data);
                return data;
            }
            const lrclib = await lrclibLyrics(track);
            lyricsCache.set(track.key, lrclib);
            if (lrclib) console.info(`[GeniusLyrics] lyrics for "${track.artist} - ${track.title}" (${lrclib.source}, ${lrclib.synced.length ? "synced" : "plain"})`);
            else console.info(`[GeniusLyrics] no lyrics for "${track.artist} - ${track.title}"`);
            return lrclib;
        } catch (e) {
            console.error("[GeniusLyrics] lyrics load failed", e);
            return null;
        } finally {
            lyricsInflight.delete(track.key);
        }
    })();
    lyricsInflight.set(track.key, p);
    return p;
}

function pickLine(data: LyricsData, posMs: number, durationMs: number): string | null {
    const pos = posMs / 1000;
    if (data.synced.length) {
        let line = data.synced[0]?.text ?? null;
        for (const l of data.synced) {
            if (l.t <= pos) line = l.text;
            else break;
        }
        return line;
    }
    if (data.plain.length) {
        if (durationMs > 0) {
            const idx = Math.min(data.plain.length - 1, Math.floor((posMs / durationMs) * data.plain.length));
            return data.plain[idx] ?? null;
        }
        const idx = Math.floor(pos / 4) % data.plain.length;
        return data.plain[idx] ?? null;
    }
    return null;
}

function buildStatus(track: TrackInfo, line: string): string {
    const clean = line.replace(/\s+/g, " ").trim();
    const body = settings.store.includeTrack ? `${track.artist} – ${track.title}: ${clean}` : clean;
    const prefix = settings.store.prefix.trim();
    const text = prefix ? `${prefix} ${body}` : body;
    return text.slice(0, STATUS_LIMIT);
}

function buildTrackStatus(track: TrackInfo): string {
    const body = `${track.artist} – ${track.title}`.replace(/\s+/g, " ").trim();
    const prefix = settings.store.prefix.trim();
    const text = prefix ? `${prefix} ${body}` : body;
    return text.slice(0, STATUS_LIMIT);
}

// Discord жёстко режет /users/@me/settings (429 с retry_after):
// шлём не чаще раза в MIN_GAP_MS, свежие строки вытесняют старые из очереди,
// а после 429 молчим ровно столько, сколько просит сервер.
const MIN_GAP_MS = 30000;
let backoffUntil = 0;
let lastPushAt = 0;
let queued: { text: string | null; } | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(ms: number) {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        const q = queued;
        queued = null;
        if (q) void doPush(q.text);
    }, Math.max(0, ms));
}

async function doPush(text: string | null) {
    const wait = Math.max(backoffUntil - Date.now(), lastPushAt + MIN_GAP_MS - Date.now());
    if (wait > 0) {
        queued = { text };
        scheduleFlush(wait);
        return;
    }
    lastPushAt = Date.now();
    try {
        if (text == null) {
            await RestAPI.patch({ url: "/users/@me/settings", body: { custom_status: null } });
            lastSetText = null;
            console.info("[GeniusLyrics] status cleared");
            return;
        }
        await RestAPI.patch({
            url: "/users/@me/settings",
            body: { custom_status: { text, expires_at: null, emoji_name: null, emoji_id: null } }
        });
        lastSetText = text;
        console.info("[GeniusLyrics] status set:", text);
    } catch (e) {
        const err = e as any;
        const retryAfter = Number(err?.body?.retry_after);
        if (err?.status === 429) {
            const waitMs = (Number.isFinite(retryAfter) ? retryAfter : 30) * 1000;
            backoffUntil = Date.now() + waitMs;
            queued = { text };
            scheduleFlush(waitMs);
            console.warn(`[GeniusLyrics] rate limited, retry in ${Math.round(waitMs / 1000)}s`);
        } else {
            console.error("[GeniusLyrics] status update failed:", err?.status, err?.body ?? err);
        }
    }
}

async function setStatus(text: string | null) {
    await doPush(text);
}

async function tick() {
    try {
        const fluxFresh = fluxTrack && Date.now() - lastFluxAt < 15000;
        let track: TrackInfo | null = null;
        let posMs = 0;
        let playing = false;

        if (fluxFresh && fluxTrack) {
            track = fluxTrack;
            posMs = livePositionMs();
            playing = fluxPlaying;
        } else {
            const viaPresence = presenceTrack();
            if (viaPresence) {
                track = viaPresence.track;
                posMs = viaPresence.posMs;
                playing = true;
            }
        }

        if (!track || !playing) {
            if (settings.store.clearOnStop && lastSetText != null) {
                const current = getOwnStatusText();
                if (current == null || current === lastSetText) {
                    await setStatus(null);
                    console.info("[GeniusLyrics] stopped, status cleared");
                } else {
                    lastSetText = null;
                }
            }
            lastLine = "\0";
            if (!track && !noMusicLogged) {
                console.info("[GeniusLyrics] waiting for spotify (connect it in Discord settings)");
                noMusicLogged = true;
            }
            return;
        }
        noMusicLogged = false;

        if (track.key !== currentKey) {
            currentKey = track.key;
            currentTrack = track;
            trackStartAt = Date.now();
            lastLine = "\0";
            console.info(`[GeniusLyrics] now playing: ${track.artist} - ${track.title}`);
            void loadLyrics(track);
        } else if (currentTrack) {
            currentTrack.durationMs = track.durationMs || currentTrack.durationMs;
        }

        const data = lyricsCache.get(track.key);
        // undefined = текст ещё грузится, ждём; null = текстов нет —
        // показываем хотя бы трек, иначе в статусе застревает старая строка
        if (data === undefined) return;
        if (data === null) {
            const fb = buildTrackStatus(track);
            if (fb === lastLine) return;
            lastLine = fb;
            await setStatus(fb);
            return;
        }
        const offset = Math.min(10000, Math.max(-10000, Number(settings.store.offsetMs) || 0));
        const line = pickLine(data, Math.max(0, posMs + offset), track.durationMs);
        if (!line || line === lastLine) return;
        lastLine = line;
        await setStatus(buildStatus(track, line));
    } catch (e) {
        console.error("[GeniusLyrics] tick failed", e);
    }
}

export default definePlugin({
    name: "GeniusLyrics",
    description: "Статус профиля со строкой текущего трека Spotify: определяет трек, сверяет песню через Genius API и ставит живую строку текста в обычный статус (не RPC).",
    tags: ["SudoCord", "Spotify", "Status"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: false,

    settings,

    settingsAboutComponent() {
        return (
            <>
                <div>Включи трек в Spotify (аккаунт должен быть привязан в настройках Discord: Интеграции).</div>
                <div>Для точного поиска песни вставь Genius Client Access Token в настройки (genius.com/api-clients → New API Client → Generate Access Token, бесплатно).</div>
                <div>Текст Genius API не отдаёт, а страницы genius.com запрещают чтение из браузера — поэтому совпадение ищется в Genius, а поющийся текст тянется автоматически (синхронные строки когда есть). Статус обновляется только при смене строки, чужой ручной статус плагин не трёт.</div>
            </>
        );
    },

    start() {
        FluxDispatcher.subscribe("SPOTIFY_PLAYER_STATE", onSpotifyState);
        const ms = Math.max(1000, Number(settings.store.tickMs) || 2000);
        timer = setInterval(tick, ms);
        void tick();
    },

    stop() {
        FluxDispatcher.unsubscribe("SPOTIFY_PLAYER_STATE", onSpotifyState);
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        lyricsInflight.clear();
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        queued = null;
        backoffUntil = 0;
        lastSetText = null;
        currentKey = null;
        currentTrack = null;
        lastLine = "\0";
    }
});
