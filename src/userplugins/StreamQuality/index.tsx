/*
 * SudoCord, a modification for Discord's desktop app
 * Copyright (c) 2026 dsd16
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findLazy } from "@webpack";

// webpack-модуль с классом голосового/стримового соединения
const ConnectionModule = findLazy((m: any) => {
    if (!m || typeof m !== "object") return false;
    for (const k in m) {
        if (m[k]?.prototype?.overwriteQualityForTesting && m[k]?.prototype?.setDesktopEncodingOptions) return true;
    }
    return false;
});

const FPS_CYCLE = [30, 60, 75, 120];
const HEIGHT_CYCLE = [720, 1080, 1440];

const settings = definePluginSettings({
    fps: {
        type: OptionType.NUMBER,
        description: "FPS стрима (30/60/75/120). Меняется и из тулбокса",
        default: 60
    },
    height: {
        type: OptionType.NUMBER,
        description: "Высота (720/1080/1440). Ширина считается 16:9",
        default: 1080
    },
    bitrate: {
        type: OptionType.NUMBER,
        description: "Битрейт (kbit/s). 0 = стандартный",
        default: 10000
    }
});

function nextIn(list: number[], current: number): number {
    const i = list.indexOf(current);
    return list[(i + 1) % list.length];
}

// ---------- применение через хук прототипа ----------

let lastConn: any = null;
let lastQuality: any = null;
let hookTimer: ReturnType<typeof setTimeout> | null = null;
let hookAttempts = 0;

function applyCustom(quality: any): any {
    const custom = getCustom();
    const br = Number(settings.store.bitrate) || 0;

    let out = quality;
    if (custom) {
        const fps = Number(custom.fps) || undefined;
        const width = Number(custom.width) || undefined;
        const height = Number(custom.height) || undefined;
        out = {
            ...(quality ?? {}),
            encode: { ...(quality?.encode ?? {}), framerate: fps, width, height },
            capture: { ...(quality?.capture ?? {}), framerate: fps, width, height }
        };
    }
    if (br) {
        out = {
            ...(out ?? {}),
            bitrate: { minimum: 1000, target: br, maximum: br * 2 }
        };
    }
    return out;
}

function getCustom(): { fps?: number; width?: number; height?: number } | null {
    const fps = Number(settings.store.fps) || undefined;
    const height = Number(settings.store.height) || undefined;
    if (!fps && !height) return null;
    return { fps, width: height ? Math.round(height * 16 / 9) : undefined, height };
}

function hookConnection() {
    const mod: any = ConnectionModule;
    if (!mod) return;
    for (const k in mod) {
        const cls = mod[k];
        if (!cls?.prototype?.overwriteQualityForTesting || cls.prototype.__scHooked) continue;

        const orig = cls.prototype.overwriteQualityForTesting;
        cls.prototype.overwriteQualityForTesting = function (quality: any) {
            lastConn = this;
            lastQuality = quality;
            return orig.call(this, applyCustom(quality));
        };
        cls.prototype.__scHooked = true;
        console.info("[StreamQuality] hook ok");
        return;
    }
}

function applyNow() {
    if (lastConn && lastQuality) {
        lastConn.overwriteQualityForTesting(lastQuality);
        toast("Качество применено", 2);
    } else {
        toast("Начни трансляцию, затем примени", 3);
    }
}

function toast(message: string, type: number) {
    const t = document.createElement("div");
    t.textContent = message;
    Object.assign(t.style, {
        position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)",
        background: type === 2 ? "#23a55a" : type === 3 ? "#da373c" : "#5865f2",
        color: "#fff", padding: "10px 18px", borderRadius: "8px",
        zIndex: "10002", fontSize: "14px", fontWeight: "600",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)"
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

export default definePlugin({
    name: "StreamQuality",
    description: "Кастомное FPS/разрешение/битрейт стрима. Управление — тулбокс (кнопка рядом с инбоксом)",
    tags: ["SudoCord", "Utility"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,

    toolboxActions() {
        return [
            {
                text: `FPS: ${settings.store.fps} (сменить)`,
                action: () => {
                    settings.store.fps = nextIn(FPS_CYCLE, settings.store.fps);
                    applyNow();
                }
            },
            {
                text: `Высота: ${settings.store.height} (сменить)`,
                action: () => {
                    settings.store.height = nextIn(HEIGHT_CYCLE, settings.store.height);
                    applyNow();
                }
            },
            {
                text: "Применить сейчас",
                action: applyNow
            }
        ];
    },

    start() {
        hookConnection();
    },
});
