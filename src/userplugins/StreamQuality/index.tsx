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

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findLazy } from "@webpack";

// webpack-модуль с классом голосового/стримового соединения (для битрейта и хука)
const ConnectionModule = findLazy((m: any) => {
    if (!m || typeof m !== "object") return false;
    for (const k in m) {
        if (m[k]?.prototype?.overwriteQualityForTesting && m[k]?.prototype?.setDesktopEncodingOptions) return true;
    }
    return false;
});

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

function hookConnection() {
    const mod: any = ConnectionModule;
    if (!mod) {
        setTimeout(hookConnection, 3000);
        return;
    }
    for (const k in mod) {
        const cls = mod[k];
        if (cls?.prototype?.overwriteQualityForTesting && !cls.prototype.__scHooked) {
            const orig = cls.prototype.overwriteQualityForTesting;
            cls.prototype.overwriteQualityForTesting = function (quality: any) {
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
            cls.prototype.__scHooked = true;
            console.info("[StreamQuality] hook установлен");
            return;
        }
    }
    setTimeout(hookConnection, 3000);
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
        .sc-custom-row .sc-fa-btn {
            padding: 6px 12px;
        }
    `;
    document.head.appendChild(s);
}

function findQualityPanel(): HTMLElement | null {
    // панель качества: ищем label "Разрешение" и поднимаемся к общему контейнеру
    const candidates = document.querySelectorAll('div,span,div[class*="label"]');
    for (const c of candidates) {
        if (c.childElementCount > 0) continue;
        const t = c.textContent?.trim();
        if (t !== "Разрешение") continue;
        // поднимаемся до контейнера, в котором есть и FPS-пункты
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

    const row = el("div", { display: "flex", alignItems: "center", gap: "6px", padding: "8px 10px", flexWrap: "wrap" });
    row.className = "sc-custom-row";

    row.appendChild(el("span", { fontWeight: "700", fontSize: "11px", color: "#b5bac1", textTransform: "uppercase", width: "100%" }, "Своё (SudoCord)"));

    row.appendChild(el("label", undefined, "FPS"));
    const fps = document.createElement("input");
    fps.type = "number";
    fps.placeholder = "60";
    fps.value = w.__scStreamCustom.fps ?? "";
    fps.oninput = () => { w.__scStreamCustom.fps = Number(fps.value) || undefined; };
    row.appendChild(fps);

    row.appendChild(el("label", undefined, "Высота"));
    const height = document.createElement("input");
    height.type = "number";
    height.placeholder = "1080";
    height.value = w.__scStreamCustom.height ?? "";
    height.oninput = () => {
        w.__scStreamCustom.height = Number(height.value) || undefined;
        w.__scStreamCustom.width = Math.round((Number(height.value) || 0) * 16 / 9) || undefined;
    };
    row.appendChild(height);

    const apply = el("button", undefined, "Применить");
    apply.className = "sc-fa-btn sc-fa-btn-primary";
    apply.style.padding = "6px 12px";
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
    // лёгкий тост без зависимостей
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
    // панель открывается/закрывается — проверяем периодически, дёшево
    injectInterval = setInterval(() => {
        if (!document.body) return;
        const panel = findQualityPanel();
        if (panel) injectCustomRow(panel);
    }, 1500);
}

function stopPanelWatcher() {
    if (injectInterval) clearInterval(injectInterval);
    injectInterval = null;
    document.querySelectorAll(".sc-custom-row").forEach(e => e.remove());
}

export default definePlugin({
    name: "StreamQuality",
    description: "Своё FPS и разрешение прямо в панели качества стрима + все разрешения без бустов + кастомный битрейт",
    tags: ["SudoCord", "Utility"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,

    patches: [
        {
            find: "PRESET_MOBILE_HIGH_QUALITY",
            replacement: [
                {
                    // все пресеты без бустов/нитро
                    match: /guildPremiumTier:\w+\.\w+\.\w+,?/g,
                    replace: ""
                },
                {
                    // энумы принимают любые значения (нужно для кастомных)
                    match: /default:throw Error\(`Unknown frame rate: \$\{e\}`\)/,
                    replace: "default:return e"
                },
                {
                    match: /default:throw Error\(`Unknown resolution: \$\{e\}`\)/,
                    replace: "default:return e"
                }
            ]
        }
    ],

    start() {
        hookConnection();
        startPanelWatcher();
    },

    stop() {
        stopPanelWatcher();
    },
});
