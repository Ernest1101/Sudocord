/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 dsd16
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { addSudoTabAction, removeSudoTabAction } from "@api/SudoTabActions";
import { addSudoTab, removeSudoTab } from "@api/SudoTabs";
import { SettingsTab } from "@components/settings/tabs/BaseTab";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize } from "@utils/modal";
import definePlugin, { makeRange, OptionType } from "@utils/types";
import { findAll } from "@webpack";
import { Forms, openModal, React, showToast, Toasts } from "@webpack/common";

const API = "https://ru.uwupad.me";

const settings = definePluginSettings({
    volume: {
        type: OptionType.SLIDER,
        description: "Громкость саундпада",
        markers: makeRange(0, 100, 10),
        default: 80,
        stickToMarkers: false
    },
    outputDevice: {
        type: OptionType.STRING,
        description: "ID устройства вывода (для микрофона — CABLE Input; выбирается в окне саундпада)",
        default: ""
    },
    showChatButton: {
        type: OptionType.BOOLEAN,
        description: "Кнопка саундпада в панели чата",
        default: true
    },
    defaultTab: {
        type: OptionType.SELECT,
        description: "Вкладка по умолчанию",
        options: [
            { label: "В тренде", value: "trending" },
            { label: "Популярное", value: "popular" },
            { label: "Новые", value: "latest" }
        ],
        default: "trending"
    }
});

interface UwuSound {
    id: number;
    title: string;
    duration: number;
    extension?: string;
    likes: number;
    views: number;
    downloads: number;
    originalId: number | null;
    tags: string[];
    author: string;
    uploadedAt: string;
}

const peaksCache = new Map<number, number[]>();

async function loadPeaks(sound: UwuSound): Promise<number[] | null> {
    const key = sound.originalId ?? sound.id;
    const hit = peaksCache.get(key);
    if (hit) return hit;
    try {
        const res = await VencordNative.fetchUrl(`https://cdn.uwupad.me/peaks/${key}.json`);
        if (!res.ok) return null;
        const data: unknown = JSON.parse(res.text);
        const arr: unknown = (data as any)?.data;
        if (!Array.isArray(arr) || !arr.length) return null;
        const out: number[] = [];
        for (let i = 0; i + 1 < arr.length; i += 2) {
            const a = Math.abs(Number(arr[i]) || 0);
            const b = Math.abs(Number(arr[i + 1]) || 0);
            out.push(Math.min(1, Math.max(a, b) / 128));
        }
        if (!out.length) return null;
        peaksCache.set(key, out);
        return out;
    } catch {
        return null;
    }
}

function drawWave(canvas: HTMLCanvasElement | null, peaks: number[] | null, playing: boolean) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 220;
    const h = canvas.clientHeight || 44;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = playing ? "#48c774" : "#5a5a5a";
    if (!peaks || !peaks.length) {
        ctx.fillRect(0, h / 2 - 1, w, 2);
        return;
    }
    const bars = Math.max(1, Math.floor(w / 3));
    const bw = w / bars;
    for (let i = 0; i < bars; i++) {
        const a = Math.floor((i / bars) * peaks.length);
        const b = Math.max(a + 1, Math.floor(((i + 1) / bars) * peaks.length));
        let m = 0;
        for (let j = a; j < b && j < peaks.length; j++) m = Math.max(m, peaks[j]);
        const bh = Math.max(2, m * h);
        ctx.fillRect(i * bw + bw * 0.2, (h - bh) / 2, Math.max(1, bw * 0.6), bh);
    }
}

function timeAgo(iso: string): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return "только что";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} мин. назад`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ч. назад`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} д. назад`;
    return new Date(t).toLocaleDateString("ru-RU");
}

// кэш байтов: повторный клик играет мгновенно из памяти,
// без нового запроса и гонки со свежими кликами
const probeCache = new Map<string, ArrayBuffer>();
const PROBE_CACHE_MAX = 30;

function probeCacheGet(url: string): ArrayBuffer | null {
    const buf = probeCache.get(url);
    if (buf) {
        probeCache.delete(url);
        probeCache.set(url, buf);
    }
    return buf ?? null;
}

function probeCacheSet(url: string, buf: ArrayBuffer) {
    probeCache.delete(url);
    probeCache.set(url, buf);
    while (probeCache.size > PROBE_CACHE_MAX) {
        const oldest = probeCache.keys().next();
        if (oldest.done) break;
        probeCache.delete(oldest.value);
    }
}

async function fetchJson(url: string): Promise<any> {
    // нативный фетч идёт мимо CORS: uwupad отдаёт ACAO только своему origin
    try {
        const res = await VencordNative.fetchUrl(url);
        if (!res.ok) throw new Error(`uwupad: HTTP ${res.status}`);
        return JSON.parse(res.text);
    } catch (e) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`uwupad: HTTP ${res.status}`);
        return await res.json();
    }
}

async function fetchSounds(tab: string, query: string): Promise<UwuSound[]> {
    const url = query.trim()
        ? `${API}/api/search?v3=true&query=${encodeURIComponent(query.trim())}`
        : `${API}/api/sounds/?v3=true&tab=${tab}`;
    const data = await fetchJson(url);
    const arr = Array.isArray(data?.data) ? data.data : [];
    return arr
        .filter((s: any) => Number.isFinite(Number(s?.id)) && s?.title)
        .map((s: any) => ({
            id: Number(s.id),
            title: String(s.title),
            duration: Number(s.duration) || 0,
            extension: typeof s.extension === "string" && s.extension ? s.extension.replace(/^\./, "") : "mp3",
            likes: Number(s.likes) || 0,
            views: Number(s.views) || 0,
            downloads: Number(s.downloads) || 0,
            // осторожно: Number(null) === 0, а 0 — валидное falsy-значение для ?? ниже
            originalId: s.original_id == null ? null : (Number.isFinite(Number(s.original_id)) ? Number(s.original_id) : null),
            tags: Array.isArray(s.tags) ? s.tags.map((t: any) => String(t?.name ?? t)).filter(Boolean).slice(0, 4) : [],
            author: String(s.owner?.username ?? ""),
            uploadedAt: String(s.upload_date ?? "")
        }));
}

function fileId(sound: UwuSound): number {
    // файл на CDN лежит НЕ под id звука, а под original_id (как и пики):
    // звук 106546 -> файл 67238.mp3. Без этого маппинга — ложные 404.
    return sound.originalId ?? sound.id;
}

function audioSources(sound: UwuSound): string[] {
    // свой прокси идёт первым: uwupad режет часть сетей 403-й,
    // а через наш сервер файл отдаётся всегда (проверено: 200 audio/mpeg)
    const ext = sound.extension || "mp3";
    const fid = fileId(sound);
    return [
        `https://sudocord.h4ck.me/uwu-audio/${fid}.${ext}`,
        `https://cdn.uwupad.me/${fid}.${ext}`,
        `${API}/download/${sound.id}`
    ];
}

// ---------- движок воспроизведения ----------

let audio: HTMLAudioElement | null = null;
let playingId: number | null = null;
const listeners = new Set<() => void>();

function emit() {
    for (const l of [...listeners]) {
        try {
            l();
        } catch { /* ignore */ }
    }
}

function fmtDur(sec: number): string {
    if (!sec) return "--:--";
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function isPlaying(id: number): boolean {
    return playingId === id;
}

let playToken = 0;

function haltAudio() {
    try {
        audio?.pause();
    } catch { /* ignore */ }
    audio = null;
    playingId = null;
}

export function stopSound(notify = true) {
    playToken++;
    haltAudio();
    if (notify) emit();
}

interface ProbeResult {
    diag: string;
    audio: ArrayBuffer | null;
    // true только для 404 нашего прокси: апстрим подтверждает удаление звука
    gone: boolean;
}

// id звуков, удалённых с uwupad (за сессию): карточки димятся, тост честный
const deadIds = new Set<number>();

export function isDead(id: number): boolean {
    return deadIds.has(id);
}

// читаем URL обычным fetch: видно статус, тип и первые байты
// (отличаем mp3 от страницы-заглушки), а заодно забираем байты для blob-фолбэка
async function probeSrc(src: string): Promise<ProbeResult> {
    const cached = probeCacheGet(src);
    if (cached) return { diag: "cache hit", audio: cached, gone: false };
    try {
        const res = await fetch(src);
        const ct = res.headers.get("content-type") ?? "?";
        let size = -1;
        let head = "?";
        let buf: ArrayBuffer | null = null;
        try {
            buf = await res.arrayBuffer();
            size = buf.byteLength;
            head = new TextDecoder().decode(buf.slice(0, 48));
        } catch { /* ignore */ }
        const looksAudio = res.ok && size > 1024 && /audio|mpeg|octet-stream|wav|ogg|mp3/i.test(ct) && !/<!doctype|<html/i.test(head);
        if (looksAudio && buf) probeCacheSet(src, buf);
        return {
            diag: `fetch status=${res.status} ct=${ct} bytes=${size} head=${JSON.stringify(head.slice(0, 40))}`,
            audio: looksAudio && buf ? buf : null,
            gone: res.status === 404
        };
    } catch (e: any) {
        return { diag: `fetch threw ${e?.name}: ${String(e?.message).slice(0, 100)}`, audio: null, gone: false };
    }
}

async function applySink(a: HTMLAudioElement) {
    const dev = settings.store.outputDevice;
    try {
        if (dev && typeof (a as any).setSinkId === "function") await (a as any).setSinkId(dev);
    } catch (e) {
        console.error("[Soundpad] setSinkId failed", e);
    }
}

function playBlob(sound: UwuSound, buf: ArrayBuffer, my: number): Promise<boolean> {
    return new Promise(resolve => {
        let url: string | null = null;
        try {
            url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
        } catch (e) {
            console.error("[Soundpad] blob create failed", e);
            resolve(false);
            return;
        }
        const a = new Audio();
        a.preload = "auto";
        a.volume = Math.min(1, Math.max(0, settings.store.volume / 100));
        let settled = false;
        const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            a.onended = null;
            a.onerror = null;
            if (url) {
                URL.revokeObjectURL(url);
                url = null;
            }
            resolve(ok);
        };
        a.onended = () => {
            if (playingId === sound.id && my === playToken) {
                playingId = null;
                audio = null;
                emit();
            }
            finish(true);
        };
        a.onerror = () => {
            const err = a.error;
            console.error("[Soundpad] blob failed:", "code:", err?.code, "net:", a.networkState, "ready:", a.readyState);
            try {
                a.pause();
            } catch { /* ignore */ }
            finish(false);
        };
        void (async () => {
            await applySink(a);
            if (my !== playToken) {
                try {
                    a.pause();
                } catch { /* ignore */ }
                finish(true);
                return;
            }
            audio = a;
            playingId = sound.id;
            emit();
            a.src = url as string;
            try {
                await a.play();
            } catch (e: any) {
                if (my !== playToken) {
                    finish(true);
                    return;
                }
                console.error("[Soundpad] blob play failed", e?.name, e?.message);
                finish(false);
            }
        })();
    });
}

function tryPlaySrc(sound: UwuSound, src: string, my: number): Promise<boolean> {
    return new Promise(resolve => {
        const a = new Audio();
        a.preload = "auto";
        a.volume = Math.min(1, Math.max(0, settings.store.volume / 100));
        let settled = false;
        let probing = false;
        const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            a.onended = null;
            a.onerror = null;
            resolve(ok);
        };
        const settle = async () => {
            await applySink(a);
            if (my !== playToken) {
                try {
                    a.pause();
                } catch { /* ignore */ }
                finish(true);
                return;
            }
            audio = a;
            playingId = sound.id;
            emit();
            a.src = src;
            try {
                await a.play();
            } catch (e: any) {
                if (my !== playToken) {
                    finish(true);
                    return;
                }
                // ошибку элемента разберёт onerror-ветка; если её не будет — закрываем сами
                console.error("[Soundpad] play failed", src, e?.name, e?.message);
                if (!probing) finish(false);
            }
        };
        a.onended = () => {
            if (playingId === sound.id && my === playToken) {
                playingId = null;
                audio = null;
                emit();
            }
            finish(true);
        };
        a.onerror = () => {
            const err = a.error;
            console.error(`[Soundpad] src failed: ${src}`, "code:", err?.code, "net:", a.networkState, "ready:", a.readyState);
            probing = true;
            void (async () => {
                const probe = await probeSrc(src);
                console.error(`[Soundpad] probe ${src}:`, probe.diag);
                if (my !== playToken) {
                    finish(true);
                    return;
                }
                if (probe.audio) {
                    console.info(`[Soundpad] retrying via blob: ${src}`);
                    finish(await playBlob(sound, probe.audio, my));
                    return;
                }
                if (probe.gone) deadIds.add(sound.id);
                try {
                    a.pause();
                } catch { /* ignore */ }
                finish(false);
            })();
        };
        void settle();
    });
}

export async function playSound(sound: UwuSound) {
    const my = ++playToken;
    haltAudio();
    for (const src of audioSources(sound)) {
        if (my !== playToken) return;
        try {
            if (await tryPlaySrc(sound, src, my)) return;
        } catch (e) {
            console.error("[Soundpad] src error", src, e);
        }
    }
    if (my === playToken) {
        haltAudio();
        emit();
        if (deadIds.has(sound.id)) showToast("Звук удалён с uwupad", Toasts.Type.FAILURE);
        else showToast("Не удалось загрузить звук", Toasts.Type.FAILURE);
    }
}

export function applyVolume() {
    try {
        if (audio) audio.volume = Math.min(1, Math.max(0, settings.store.volume / 100));
    } catch { /* ignore */ }
}

async function listOutputs(): Promise<MediaDeviceInfo[]> {
    try {
        const devs = await navigator.mediaDevices?.enumerateDevices?.();
        return (devs ?? []).filter(d => d.kind === "audiooutput");
    } catch {
        return [];
    }
}

// ищет VB-Cable среди устройств вывода для отправки звука в микрофон в один клик
export async function pickCableDevice(): Promise<string | null> {
    const devs = await listOutputs();
    const cable = devs.find(d => /cable/i.test(d.label || ""));
    return cable?.deviceId ?? null;
}

export async function routeToMic(): Promise<boolean> {
    const id = await pickCableDevice();
    if (!id) {
        showToast("CABLE не найден: проверь установку VB-Cable и доступ к устройствам", Toasts.Type.FAILURE);
        return false;
    }
    settings.store.outputDevice = id;
    showToast("Вывод: VB-Cable — звук пойдёт в микрофон", Toasts.Type.SUCCESS);
    return true;
}

// ---------- иконка ----------

function SpeakerIcon({ height = 20, width = 20, className }: { height?: number; width?: number; className?: string; }) {
    return (
        <svg
            className={className}
            width={width}
            height={height}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M3 9v6h4l5 5V4L7 9H3Z" />
            <path d="M16 8.8a4.4 4.4 0 0 1 0 6.4l-1-1.2a2.8 2.8 0 0 0 0-4l1-1.2Z" />
            <path d="M18.4 6.2a8 8 0 0 1 0 11.6l-1-1.2a6.4 6.4 0 0 0 0-9.2l1-1.2Z" />
        </svg>
    );
}

// ---------- модалка ----------

const TABS = [
    { label: "В тренде", value: "trending" },
    { label: "Популярное", value: "popular" },
    { label: "Новые", value: "latest" }
];

function useRerender(): () => void {
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
        const fn = () => setTick(t => t + 1);
        listeners.add(fn);
        return () => {
            listeners.delete(fn);
        };
    }, []);
    return () => setTick(t => t + 1);
}

export function SoundpadBody() {
    const rerender = useRerender();
    const [query, setQuery] = React.useState("");
    const [tab, setTab] = React.useState<string>(settings.store.defaultTab);
    const [sounds, setSounds] = React.useState<UwuSound[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState("");
    const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);

    React.useEffect(() => {
        let dead = false;
        setLoading(true);
        setError("");
        const t = setTimeout(() => {
            fetchSounds(tab, query)
                .then(list => {
                    if (!dead) {
                        setSounds(list);
                        setLoading(false);
                    }
                })
                .catch((e: any) => {
                    if (!dead) {
                        setError(e?.message ?? "Ошибка загрузки");
                        setLoading(false);
                    }
                });
        }, query ? 400 : 0);
        return () => {
            dead = true;
            clearTimeout(t);
        };
    }, [tab, query]);

    React.useEffect(() => {
        void listOutputs().then(setDevices);
    }, []);

    return (
        <div className="sp-wrap">
            <div className="sp-topbar">
                {TABS.map(t => (
                    <button
                        key={t.value}
                        onClick={() => setTab(t.value)}
                        className={tab === t.value && !query ? "sp-tab active" : "sp-tab"}
                    >
                        {t.label}
                    </button>
                ))}
                <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Поиск звука..."
                    className="sp-search"
                />
            </div>

            <div className="sp-controls">
                <label>
                    Вывод:{" "}
                    <select
                        value={settings.store.outputDevice}
                        onChange={e => {
                            settings.store.outputDevice = e.target.value;
                            rerender();
                        }}
                        className="sp-select"
                    >
                        <option value="">По умолчанию (колонки)</option>
                        {devices.map((d, i) => (
                            <option key={d.deviceId || i} value={d.deviceId}>
                                {d.label || `Устройство ${i + 1}`}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="sp-vol">
                    Громкость:
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={settings.store.volume}
                        onChange={e => {
                            settings.store.volume = Number(e.target.value);
                            applyVolume();
                            rerender();
                        }}
                    />
                    {settings.store.volume}%
                </label>
                <button
                    onClick={() => {
                        void routeToMic().then(ok => {
                            if (ok) {
                                void listOutputs().then(setDevices);
                                rerender();
                            }
                        });
                    }}
                    className="sp-btn go"
                >
                    В микрофон
                </button>
                <button onClick={() => stopSound()} className="sp-btn stop">
                    Стоп
                </button>
            </div>

            {loading && <Forms.FormText>Загрузка...</Forms.FormText>}
            {error && <Forms.FormText>Ошибка: {error}</Forms.FormText>}
            {!loading && !error && sounds.length === 0 && (
                <Forms.FormText>Ничего не найдено.</Forms.FormText>
            )}

            <div className="sp-grid">
                {sounds.map(s => (
                    <SoundCard key={s.id} sound={s} />
                ))}
            </div>

            <div className="sp-guide">
                Чтобы слышали в войсе: 1) поставь VB-Cable (vb-audio.com); 2) в Windows для своего микрофона включи
                «Прослушивать с данного устройства» → CABLE Input; 3) здесь выбери вывод CABLE Input; 4) в Discord
                микрофоном выбери CABLE Output. Кнопка «Играть» пускает звук в выбранный вывод.
            </div>
        </div>
    );
}

function SoundCard({ sound: s }: { sound: UwuSound; }) {
    const playing = isPlaying(s.id);
    const [peaks, setPeaks] = React.useState<number[] | null>(null);
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

    React.useEffect(() => {
        let dead = false;
        void loadPeaks(s).then(p => {
            if (!dead) setPeaks(p);
        });
        return () => {
            dead = true;
        };
    }, [s.id]);

    React.useEffect(() => {
        drawWave(canvasRef.current, peaks, playing);
    }, [peaks, playing]);

    const ago = timeAgo(s.uploadedAt);
    const dead = isDead(s.id);
    return (
        <div className={playing ? "sp-card playing" : dead ? "sp-card dead" : "sp-card"}>
            <button
                onClick={() => {
                    if (playing) stopSound();
                    else void playSound(s);
                }}
                className="sp-play"
                title={playing ? "Стоп" : "Играть"}
            >
                {playing ? "⏹" : "▶"}
            </button>
            <div className="sp-main">
                <div className="sp-titlerow">
                    <span className="sp-title" title={s.title}>{s.title}{dead ? " (удалён)" : ""}</span>
                    <span className="sp-dur">{fmtDur(s.duration)}</span>
                </div>
                <canvas ref={canvasRef} className="sp-wave" />
                {s.tags.length > 0 && (
                    <div className="sp-tags">
                        {s.tags.map(t => (
                            <span key={t} className="sp-tag">{t}</span>
                        ))}
                    </div>
                )}
                <div className="sp-meta">
                    ♥ {s.likes} · 👁 {s.views} · ⬇ {s.downloads}{s.author ? ` · ${s.author}` : ""}{ago ? ` · ${ago}` : ""}
                </div>
            </div>
        </div>
    );
}

export function SoundpadTab() {
    return (
        <SettingsTab>
            <SoundpadBody />
        </SettingsTab>
    );
}

export function openSoundpadModal() {
    openModal(props => (
        <ModalRoot {...props} size={ModalSize.LARGE}>
            <ModalHeader>
                <Forms.FormTitle tag="h4">Soundpad — uwupad.me</Forms.FormTitle>
                <ModalCloseButton onClick={props.onClose} />
            </ModalHeader>
            <ModalContent>
                <SoundpadBody />
            </ModalContent>
        </ModalRoot>
    ));
}

// ---------- кнопка чата ----------

const SoundpadChatButton: ChatBarButtonFactory = ({ isAnyChat }) => {
    if (!isAnyChat || !settings.store.showChatButton) return null;
    return (
        <ChatBarButton
            tooltip="Soundpad — звуки uwupad.me в микрофон"
            onClick={() => openSoundpadModal()}
        >
            <SpeakerIcon />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "Soundpad",
    description: "Встроенный саундпад: поиск звуков uwupad.me и вывод в микрофон (через VB-Cable) или колонки",
    tags: ["SudoCord", "Voice", "Utility"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,

    chatBarButton: {
        icon: SpeakerIcon,
        render: SoundpadChatButton
    },

    toolboxActions() {
        return [
            {
                text: "Найти саундборд-API (в консоль)",
                action: () => {
                    try {
                        const needles = ["soundboard-sounds", "voice-channel-effects", "VOICE_CHANNEL_EFFECT_SEND"];
                        const hit = (s: string) => needles.some(n => s.includes(n));
                        const mods = findAll((m: any) => {
                            if (!m || typeof m !== "object") return false;
                            for (const k of Object.keys(m)) {
                                try {
                                    const v = (m as any)[k];
                                    if (typeof v === "function") {
                                        if (hit(Function.prototype.toString.call(v))) return true;
                                    } else if (typeof v === "string" && hit(v)) {
                                        return true;
                                    }
                                } catch { /* ignore */ }
                            }
                            return false;
                        });
                        console.info(`[Soundpad] soundboard modules: ${mods.length}`);
                        mods.slice(0, 6).forEach((m: any, i: number) => {
                            for (const k of Object.keys(m)) {
                                try {
                                    const v = (m as any)[k];
                                    const s = typeof v === "function" ? Function.prototype.toString.call(v) : String(v);
                                    if (hit(s)) console.info(`[Soundpad] mod${i}.${k}:`, s.slice(0, 500));
                                } catch { /* ignore */ }
                            }
                        });
                        showToast(`Модулей: ${mods.length} (см. консоль)`, Toasts.Type.SUCCESS);
                    } catch (e) {
                        console.error("[Soundpad] diag failed", e);
                    }
                }
            }
        ];
    },

    start() {
        addSudoTabAction({
            key: "soundpad",
            Icon: SpeakerIcon,
            text: "Soundpad",
            action: () => openSoundpadModal()
        });
        addSudoTab({
            key: "soundpad",
            title: "Soundpad",
            panelTitle: "Soundpad",
            Component: SoundpadTab,
            Icon: SpeakerIcon
        });
    },

    stop() {
        removeSudoTabAction("soundpad");
        removeSudoTab("soundpad");
        stopSound(false);
        probeCache.clear();
    }
});
