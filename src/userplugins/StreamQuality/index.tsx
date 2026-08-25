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

import "./styles.css";

import { addMessagePopoverButton, removeMessagePopoverButton } from "@api/MessagePopover";
import { get, set } from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { NavigationRouter, Toasts } from "@webpack/common";
import { Message } from "@vencord/discord-types";

const STORE_KEY = "sudocord-favorite-chat";
const MAX_FILE_BYTES = 8 * 1024 * 1024;

interface FavImage {
    dataUrl: string;
    width?: number;
    height?: number;
}

interface ChatEntry {
    id: string;
    ts: number;
    text?: string;
    images?: FavImage[];
    // for messages saved from Discord via the star menu
    saved?: {
        messageId: string;
        channelId: string;
        guildId: string | null;
        author: string;
        avatarUrl?: string;
    };
}

const settings = definePluginSettings({
    bitrate: {
        type: OptionType.NUMBER,
        description: "Битрейт стрима (kbit/s). 0 = стандартный",
        default: 10000
    }
});

// кастомные значения из полей в панели качества
interface CustomStreamValues {
    fps?: number;
    width?: number;
    height?: number;
}

let observer: MutationObserver | null = null;

function getCustom(): CustomStreamValues | null {
    const w = window as any;
    if (!w.__scStreamCustom) return null;
    const { fps, width, height } = w.__scStreamCustom;
    if (!fps && !height) return null;
    return { fps, width, height };
}

// ---------- применение через хук прототипа ----------

let lastConn: any = null;
let lastQuality: any = null;
let hookTimer: ReturnType<typeof setTimeout> | null = null;
let hookAttempts = 0;

// ленивый прокси объекта соединения (резолвится когда голос/стрим инициализируются)
const connObj = (window as any).SudoCord.Webpack.findByPropsLazy("overwriteQualityForTesting", "setDesktopEncodingOptions");

function hookConnection() {
    if (hookAttempts > 100) return;
    hookAttempts++;
    try {
        const proto = connObj?.constructor?.prototype;
        if (!proto?.overwriteQualityForTesting || proto.__scHooked) {
            hookTimer = setTimeout(hookConnection, 4000);
            return;
        }

        const orig = proto.overwriteQualityForTesting;
        proto.overwriteQualityForTesting = function (quality: any) {
            lastConn = this;
            lastQuality = quality;

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
            return orig.call(this, out);
        };
        proto.__scHooked = true;
        console.info("[StreamQuality] hook установлен");
    } catch (err: any) {
        console.warn("[StreamQuality] hook retry:", err?.message ?? err);
        hookTimer = setTimeout(hookConnection, 4000);
    }
}

// ---------- инжекция полей в панель качества ----------

const STYLE_ID = "sc-stream-quality-styles";

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
        .sc-custom-row {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 10px;
            margin-top: 4px;
            flex-wrap: wrap;
        }
        .sc-custom-row input {
            background: #1e1f22;
            color: #dbdee1;
            border: 1px solid #26272b;
            border-radius: 4px;
            padding: 6px 8px;
            font-size: 13px;
            width: 70px;
            outline: none;
            font-family: inherit;
        }
        .sc-custom-row input:focus {
            border-color: #00a8fc;
        }
        .sc-custom-row label {
            color: #b5bac1;
            font-size: 12px;
        }
        .sc-custom-row .sc-fav-btn {
            padding: 6px 12px;
        }
    `;
    document.head.appendChild(s);
}

function findQualityPanel(): HTMLElement | null {
    const candidates = document.querySelectorAll('div,span');
    for (const c of candidates) {
        if (c.childElementCount > 0) continue;
        const t = c.textContent?.trim();
        if (t !== "Разрешение") continue;
        let node: HTMLElement | null = c as HTMLElement;
        for (let i = 0; i < 6 && node; i++) {
            node = node.parentElement;
            if (!node) break;
            if (node.textContent?.includes("кадров") && node.textContent.includes("Разрешение")) {
                return node;
            }
        }
    }
    return null;
}

function injectCustomRow(panel: HTMLElement) {
    if (panel.querySelector(".sc-custom-row")) return;

    ensureStyles();

    const w = window as any;
    w.__scStreamCustom ??= { fps: undefined, width: undefined, height: undefined };

    const row = document.createElement("div");
    row.className = "sc-custom-row";

    const title = document.createElement("div");
    title.style.cssText = "font-weight:700;font-size:11px;color:#b5bac1;text-transform:uppercase;width:100%;";
    title.textContent = "Своё (SudoCord)";
    row.appendChild(title);

    const mkLabel = (t: string) => {
        const l = document.createElement("label");
        l.textContent = t;
        return l;
    };

    row.appendChild(mkLabel("FPS"));
    const fps = document.createElement("input");
    fps.type = "number";
    fps.placeholder = "60";
    fps.value = w.__scStreamCustom.fps ?? "";
    fps.oninput = () => { w.__scStreamCustom.fps = Number(fps.value) || undefined; };
    row.appendChild(fps);

    row.appendChild(mkLabel("Высота"));
    const height = document.createElement("input");
    height.type = "number";
    height.placeholder = "1080";
    height.value = w.__scStreamCustom.height ?? "";
    height.oninput = () => {
        w.__scStreamCustom.height = Number(height.value) || undefined;
        w.__scStreamCustom.width = Math.round((Number(height.value) || 0) * 16 / 9) || undefined;
    };
    row.appendChild(height);

    const apply = document.createElement("button");
    apply.className = "sc-fav-btn";
    apply.textContent = "Применить";
    apply.onclick = () => {
        if (lastConn && lastQuality) {
            lastConn.overwriteQualityForTesting(lastQuality);
            toast("Кастомное качество применено", 2);
        } else {
            toast("Начни трансляцию, затем примени", 3);
        }
    };
    row.appendChild(apply);

    panel.appendChild(row);
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

let injectInterval: ReturnType<typeof setInterval> | null = null;

function startPanelWatcher() {
    ensureStyles();
    injectInterval = setInterval(() => {
        if (!document.body) return;
        const panel = findQualityPanel();
        if (panel) injectCustomRow(panel);
    }, 1500);
}

function stopPanelWatcher() {
    if (injectInterval) clearInterval(injectInterval);
    injectInterval = null;
    if (hookTimer) clearTimeout(hookTimer);
    document.querySelectorAll(".sc-custom-row").forEach(e => e.remove());
}

export default definePlugin({
    name: "StreamQuality",
    description: "Своё FPS и разрешение прямо в панели качества стрима + кастомный битрейт",
    tags: ["SudoCord", "Utility"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,

    start() {
        hookConnection();
        startPanelWatcher();
    },

    stop() {
        stopPanelWatcher();
    },
});
