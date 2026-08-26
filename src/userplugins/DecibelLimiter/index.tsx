/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { makeRange,OptionType } from "@utils/types";
import { FluxDispatcher, MediaEngineStore, React, UserStore } from "@webpack/common";

interface InboundAudioStats {
    type: string;
    ssrc: number;
    audioLevel?: number;
    audioDetected?: boolean;
}

interface ConnectionStatsEntry {
    context?: string;
    stats?: {
        rtp?: {
            inbound?: Record<string, InboundAudioStats[]>;
        };
    };
}

interface ConnectionStatsPayload {
    connectionStats?: ConnectionStatsEntry[];
}

interface UserLevel {
    db: number;
    speaking: boolean;
    ts: number;
}

interface ReducedState {
    original: number;
    belowSince: number | null;
}

const HYSTERESIS_DB = 6;
const STALE_MS = 5000;

const settings = definePluginSettings({
    limiterEnabled: {
        type: OptionType.BOOLEAN,
        description: "Авто-понижение громкости при превышении порога",
        default: true
    },
    maxDb: {
        type: OptionType.SLIDER,
        description: "Порог громкости (dBFS): понижает, если уровень громче чем -N dB",
        markers: makeRange(0, 60, 5),
        default: 20,
        stickToMarkers: true
    },
    reduceTo: {
        type: OptionType.SLIDER,
        description: "Понижать громкость до (%) от исходной",
        markers: makeRange(0, 100, 5),
        default: 20,
        stickToMarkers: true
    },
    releaseMs: {
        type: OptionType.SLIDER,
        description: "Задержка возврата громкости после стихания (мс)",
        markers: makeRange(0, 5000, 250),
        default: 1500,
        stickToMarkers: true
    }
});

const levels = new Map<string, UserLevel>();
const reduced = new Map<string, ReducedState>();

function setUserVolume(userId: string, volume: number) {
    try {
        FluxDispatcher.dispatch({
            type: "AUDIO_SET_LOCAL_VOLUME",
            context: "default",
            userId,
            volume
        });
    } catch (err) {
        console.error("[DecibelLimiter] failed to set volume", userId, err);
    }
}

function toDb(level: number): number {
    if (!Number.isFinite(level) || level <= 1e-6) return -100;
    return Math.max(-100, 20 * Math.log10(level));
}

function restoreVolume(userId: string) {
    const mon = reduced.get(userId);
    if (!mon) return;
    setUserVolume(userId, mon.original);
    reduced.delete(userId);
}

function applyLimiter(userId: string, db: number, thresholdDb: number) {
    if (!settings.store.limiterEnabled || MediaEngineStore.isLocalMute(userId)) {
        restoreVolume(userId);
        return;
    }

    let mon = reduced.get(userId);
    if (db > thresholdDb) {
        if (!mon) {
            const original = MediaEngineStore.getLocalVolume(userId);
            if (!Number.isFinite(original) || original <= 0) return;
            mon = { original, belowSince: null };
            reduced.set(userId, mon);
            setUserVolume(userId, Math.max(0, Math.round(original * settings.store.reduceTo / 100)));
        } else {
            mon.belowSince = null;
        }
    } else if (mon) {
        if (db < thresholdDb - HYSTERESIS_DB) {
            if (mon.belowSince === null) {
                mon.belowSince = Date.now();
            } else if (Date.now() - mon.belowSince >= settings.store.releaseMs) {
                restoreVolume(userId);
            }
        } else {
            mon.belowSince = null;
        }
    }
}

function onConnectionStats(data: ConnectionStatsPayload) {
    const statsList = data?.connectionStats;
    if (!Array.isArray(statsList)) return;

    const seen = new Set<string>();
    const thresholdDb = -settings.store.maxDb;

    for (const entry of statsList) {
        if (entry?.context !== "default") continue;
        const inbound = entry.stats?.rtp?.inbound;
        if (!inbound) continue;

        for (const userId of Object.keys(inbound)) {
            if (userId === "0" || userId === "100") continue;
            const audio = Array.isArray(inbound[userId]) ? inbound[userId].find(s => s?.type === "audio") : undefined;
            if (!audio) continue;

            const db = toDb(audio.audioLevel ?? 0);
            levels.set(userId, { db, speaking: !!audio.audioDetected, ts: Date.now() });
            seen.add(userId);
            applyLimiter(userId, db, thresholdDb);
        }
    }

    const now = Date.now();
    for (const [userId, lvl] of levels) {
        if (!seen.has(userId) && now - lvl.ts > STALE_MS) {
            levels.delete(userId);
            restoreVolume(userId);
        }
    }
}

export function getUserLevel(userId: string): UserLevel | undefined {
    return levels.get(userId);
}

export function isReduced(userId: string): boolean {
    return reduced.has(userId);
}

export function getLoudestDb(): number {
    let loudest = -100;
    for (const lvl of levels.values()) {
        if (lvl.db > loudest) loudest = lvl.db;
    }
    return loudest;
}

const DbMeterComponent = () => {
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
        const i = setInterval(() => setTick(t => t + 1), 300);
        return () => clearInterval(i);
    }, []);

    const db = Math.round(getLoudestDb());
    const bar = Math.round(Math.min(1, Math.max(0, (db + 60) / 60)) * 100);
    const threshold = settings.store.maxDb;
    const color = db > -threshold ? "#ed4245" : db > -(threshold + 15) ? "#faa61a" : "#23a55a";

    const users = [...levels.entries()]
        .sort(([, a], [, b]) => b.db - a.db)
        .slice(0, 12);

    return (
        <div style={{ padding: "12px 0", fontFamily: "monospace" }}>
            <div style={{ fontWeight: 700, fontSize: "16px", marginBottom: 8, color: "#f2f3f5" }}>
                🎙️ Decibel Monitor
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: "28px", fontWeight: 700, color, minWidth: 90, textAlign: "right" }}>
                    {levels.size === 0 ? "--" : `${db}`} dB
                </span>
                <div style={{ flex: 1, height: 12, background: "#1e1f22", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{
                        width: `${bar}%`, height: "100%",
                        background: color, borderRadius: 6,
                        transition: "width 0.2s, background 0.2s"
                    }} />
                </div>
            </div>
            <div style={{ color: "#b5bac1", fontSize: 13, marginBottom: 8 }}>
                Порог: -{threshold} dBFS | Юзеров: {levels.size} | Понижено: {reduced.size}
            </div>
            {users.map(([id, lvl]) => (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#b5bac1", padding: "2px 0" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: lvl.speaking ? "#23a55a" : "#4e5058", flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {UserStore.getUser(id)?.username ?? id}
                    </span>
                    {isReduced(id) && <span style={{ color: "#ed4245" }}>▼</span>}
                    <span style={{ minWidth: 55, textAlign: "right", color: lvl.db > -threshold ? "#ed4245" : undefined }}>
                        {Math.round(lvl.db)} dB
                    </span>
                </div>
            ))}
        </div>
    );
};

export default definePlugin({
    name: "DecibelLimiter",
    description: "Реальный измеритель dB входящего голоса (из RTC-статистики Discord) + авто-понижение громкости орущих",
    tags: ["SudoCord", "Voice"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,
    settingsAboutComponent: DbMeterComponent,

    start() {
        FluxDispatcher.subscribe("MEDIA_ENGINE_CONNECTION_STATS", onConnectionStats);
    },

    stop() {
        FluxDispatcher.unsubscribe("MEDIA_ENGINE_CONNECTION_STATS", onConnectionStats);
        for (const userId of [...reduced.keys()]) {
            restoreVolume(userId);
        }
        levels.clear();
    }
});
