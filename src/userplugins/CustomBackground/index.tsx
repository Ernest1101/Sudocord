/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 dsd16
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { definePluginSettings, Settings } from "@api/Settings";
import { addThemeSection, removeThemeSection } from "@api/ThemeSections";
import { Card } from "@components/Card";
import { FormSwitch } from "@components/FormSwitch";
import definePlugin, { OptionType } from "@utils/types";
import { Forms, React, showToast, Toasts } from "@webpack/common";

const LAYER_ID = "sc-custom-background";
const STYLE_ID = "sc-custom-background-css";
const FILE_KEY = "CustomBackground_file";
const SOURCE_KEY = "CustomBackground_source";
const MAX_FILE_BYTES = 80 * 1024 * 1024;

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Показывать свой фон",
        default: true,
        onChange: () => render()
    },
    sourceUrl: {
        type: OptionType.STRING,
        description: "Ссылка на фон (mp4, webm, gif, png, jpg). Загруженный файл важнее ссылки.",
        default: "",
        onChange: () => render()
    },
    fit: {
        type: OptionType.SELECT,
        description: "Как вписать фон",
        options: [
            { label: "Заполнить (cover)", value: "cover" },
            { label: "Вписать целиком (contain)", value: "contain" },
            { label: "Растянуть (fill)", value: "fill" }
        ],
        default: "cover",
        onChange: () => render()
    },
    dim: {
        type: OptionType.NUMBER,
        description: "Затемнение фона, % (чтобы читался текст)",
        default: 45,
        onChange: () => render()
    },
    blur: {
        type: OptionType.NUMBER,
        description: "Размытие фона, px",
        default: 0,
        onChange: () => render()
    },
});

const VIDEO_EXT = ["mp4", "webm", "mov", "ogv"];

function isVideo(src: string, file?: Blob | null): boolean {
    if (file && file.type.startsWith("video/")) return true;
    const clean = src.split("?")[0].toLowerCase();
    return VIDEO_EXT.some(ext => clean.endsWith(`.${ext}`));
}

const SURFACE_VARS = [
    "--background-primary", "--background-secondary", "--background-tertiary",
    "--background-base-lowest", "--background-base-lower", "--background-base-low",
    "--background-base-tertiary",
    "--bg-base-primary", "--bg-base-secondary", "--bg-base-tertiary",
    "--background-surface-high", "--background-surface-higher", "--background-surface-highest",
    "--background-mobile-primary", "--background-mobile-secondary",
    "--home-background"
];

function cssText(dim: number, blur: number): string {
    const overlay = Math.min(90, Math.max(0, dim)) / 100;
    const vars = SURFACE_VARS.map(v => `    ${v}: transparent !important;`).join("\n");
    return `
#${LAYER_ID} { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; background: #000; }
#${LAYER_ID} video, #${LAYER_ID} img { width: 100%; height: 100%; display: block; }
#${LAYER_ID} .sc-bg-dim { position: absolute; inset: 0; background: rgba(0,0,0,${overlay}); }
body, #app-mount { background: transparent !important; }
/* Убираем родное матовое стекло Discord: чистая прозрачность без блюра */
#app-mount, #app-mount * { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
/* Discord 2026: отдельный фоновый слой приложения (div.background_*) */
#app-mount div[class*="background_"] { background: transparent !important; }
/* Discord 2026: второй фоновый слой (div.bg__*, красится через oklab) */
div[class*="bg__"] { background: transparent !important; }
/* Сайдбар серверов (nav.wrapper_*, глухой oklab) */
nav[class*="wrapper_"] { background: transparent !important; }
/* Список ЛС и каналов (nav.container_*, тот же глухой oklab) */
nav[class*="container_"] { background: transparent !important; }
/* ЛС (nav.privateChannels_*), скроллеры, панели войса и низа */
nav[class*="privateChannels_"] { background: transparent !important; }
div[class*="scroller_"] { background: transparent !important; }
section[class*="theme-dark"],
section[class*="panels_"] { background: transparent !important; }
div[class*="panel_"] { background: transparent !important; }
/* Поле ввода (scrollableContainer_*, channelTextArea_*) */
div[class*="scrollableContainer_"],
div[class*="channelTextArea_"] { background: transparent !important; }
:root {
${vars}
    --background-floating: rgba(30,31,34,0.85) !important;
    --channeltextarea-background: rgba(30,31,34,0.7) !important;
    --input-background: rgba(30,31,34,0.7) !important;
    --bg-mod-faint: rgba(30,31,34,0.5) !important;
    --bg-mod-subtle: rgba(30,31,34,0.6) !important;
    --bg-mod-strong: rgba(30,31,34,0.8) !important;
}
#${LAYER_ID} .sc-bg-media { filter: blur(${Math.min(20, Math.max(0, blur))}px); transform: scale(1.05); }`;
}

function probeBg(): string {
    try {
        const b = getComputedStyle(document.body).backgroundColor;
        const m = document.getElementById("app-mount");
        const a = m ? getComputedStyle(m).backgroundColor : "n/a";
        const v = getComputedStyle(document.documentElement).getPropertyValue("--background-primary").trim();
        return `body=${b} app-mount=${a} rootVar=${v || "?"}`;
    } catch {
        return "?";
    }
}

// ищет крупные непрозрачные слои внутри клиента: кто именно красит фон.
// дорого, поэтому один раз за включение.
function diagnoseOpaque() {
    try {
        const root = document.getElementById("app-mount");
        if (!root) return;
        const els = root.querySelectorAll("div, main, nav, section, aside, header, li, ul, button");
        const byKey = new Map<string, { n: number; area: number; }>();
        const limit = Math.min(els.length, 3000);
        for (let i = 0; i < limit; i++) {
            const el = els[i] as HTMLElement;
            let cs: CSSStyleDeclaration;
            try {
                cs = getComputedStyle(el);
            } catch {
                continue;
            }
            const bg = cs.backgroundColor || "";
            const img = cs.backgroundImage && cs.backgroundImage !== "none" ? " +img" : "";
            // Discord 2026 красит и через oklab()/oklch()/color() — rgb-регексом не ловится
            const opaqueFn = /^(oklab|oklch|color)\(/i.test(bg) && !/\/\s*0(\.0+)?\s*\)/.test(bg);
            const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (!m && !opaqueFn && !img) continue;
            if (m && m[4] !== undefined && Number(m[4]) < 1 && !img) continue;
            let area = 0;
            try {
                const r = el.getBoundingClientRect();
                area = r.width * r.height;
            } catch { /* ignore */ }
            if (area < 8000) continue;
            const key = `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0] || "?"} bg=${bg}${img}`;
            const cur = byKey.get(key) ?? { n: 0, area: 0 };
            cur.n++;
            cur.area = Math.max(cur.area, Math.floor(area));
            byKey.set(key, cur);
        }
        const top = [...byKey.entries()].sort((a, b) => (b[1].n * b[1].area) - (a[1].n * a[1].area)).slice(0, 12);
        if (!top.length) {
            console.info("[CustomBackground] opaque scan: none — всё стекло");
            return;
        }
        console.info("[CustomBackground] opaque layers (кто красит фон):");
        for (const [k, v] of top) console.info(`  x${v.n} area=${v.area} :: ${k}`);
    } catch (e) {
        console.error("[CustomBackground] opaque scan failed", e);
    }
}

let objectUrl: string | null = null;
let cachedFile: Blob | null = null;
let fileLoaded = false;

async function getFile(): Promise<Blob | null> {
    if (fileLoaded) return cachedFile;
    fileLoaded = true;
    try {
        const blob = await DataStore.get<Blob>(FILE_KEY);
        if (blob instanceof Blob) cachedFile = blob;
    } catch { /* ignore */ }
    return cachedFile;
}

// ставит файл фоном извне (маркетплейс SudoCord): сохраняет и перерисовывает
export async function setBackgroundFile(blob: Blob, source?: string): Promise<void> {
    await DataStore.set(FILE_KEY, blob);
    if (source) {
        try {
            await DataStore.set(SOURCE_KEY, source);
        } catch { /* ignore */ }
    }
    cachedFile = blob;
    fileLoaded = true;
    await render();
}

// откуда текущий файл фона (ссылка маркетплейса) — для галочки "установлено"
export async function getBackgroundSource(): Promise<string | null> {
    try {
        const s = await DataStore.get<string>(SOURCE_KEY);
        return typeof s === "string" && s ? s : null;
    } catch {
        return null;
    }
}

// убирает файл фона полностью
export async function clearBackgroundFile(): Promise<void> {
    try {
        await DataStore.del(FILE_KEY);
    } catch { /* ignore */ }
    try {
        await DataStore.del(SOURCE_KEY);
    } catch { /* ignore */ }
    cachedFile = null;
    fileLoaded = true;
    if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
    }
    await render();
}

function clearLayer() {
    document.getElementById(LAYER_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
    }
}

function objectFit(): string {
    const { fit } = settings.store;
    if (fit === "contain") return "contain";
    if (fit === "fill") return "fill";
    return "cover";
}

let lastRenderKey = "";
let lastProbeKey = "";

export async function render() {
    clearLayer();
    const enabled = Boolean(settings.store.enabled);
    const file = enabled ? await getFile() : null;
    let src = enabled ? settings.store.sourceUrl.trim() : "";
    if (file) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(file);
        src = objectUrl;
    }
    const hasMedia = Boolean(src) || Boolean(file);
    // окно уже стеклянное (тумблер прозрачности) — поверхности делаем
    // прозрачными сами, иначе стекло и glass-темы не видно
    let windowTransparent = false;
    try {
        windowTransparent = Boolean((Settings as any)?.transparent);
    } catch { /* ignore */ }
    const cssOn = enabled && (hasMedia || windowTransparent);
    const key = `${enabled}|${hasMedia}|${windowTransparent}`;
    if (key !== lastRenderKey) {
        lastRenderKey = key;
        console.info(`[CustomBackground] enabled=${enabled} media=${hasMedia} windowTransparent=${windowTransparent} -> css ${cssOn ? "ON" : "OFF"}`);
    }
    if (!cssOn) return;
    if (lastProbeKey !== key) {
        lastProbeKey = key;
        // интерфейс домаунтится позже старта: сканируем трижды, ловим поздние слои
        for (const delay of [800, 5000, 12000]) {
            setTimeout(() => {
                try {
                    if (lastProbeKey !== key) return;
                    console.info(`[CustomBackground] probe ${probeBg()}`);
                    diagnoseOpaque();
                } catch { /* ignore */ }
            }, delay);
        }
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = cssText(Number(settings.store.dim) || 0, Number(settings.store.blur) || 0);
    document.head.appendChild(style);

    if (!hasMedia) return;

    const layer = document.createElement("div");
    layer.id = LAYER_ID;

    const media = isVideo(src, file) ? document.createElement("video") : document.createElement("img");
    media.className = "sc-bg-media";
    (media as HTMLElement).style.objectFit = objectFit();
    if (media instanceof HTMLVideoElement) {
        media.src = src;
        media.autoplay = true;
        media.muted = true;
        media.loop = true;
        media.playsInline = true;
        void media.play().catch(() => undefined);
    } else {
        (media as HTMLImageElement).src = src;
    }
    layer.appendChild(media);

    try {
        console.info(`[CustomBackground] layer ${media.tagName} src=${file ? "file" : "url"}`);
        media.addEventListener("error", () => console.error("[CustomBackground] фон не загрузился:", file ? "файл (blob)" : src));
    } catch { /* ignore */ }

    const dim = document.createElement("div");
    dim.className = "sc-bg-dim";
    layer.appendChild(dim);

    document.body.prepend(layer);
}

export function BackgroundControls() {
    const [, setTick] = React.useState(0);
    const [fileName, setFileName] = React.useState<string | null>(null);

    React.useEffect(() => {
        let dead = false;
        void getFile().then(f => {
            if (!dead && f instanceof Blob && (f as File).name) setFileName((f as File).name);
        });
        return () => {
            dead = true;
        };
    }, []);

    const onPick = async (f: File | undefined) => {
        if (!f) return;
        if (f.size > MAX_FILE_BYTES) {
            showToast("Файл больше 80 МБ — возьми поменьше", Toasts.Type.FAILURE);
            return;
        }
        try {
            await DataStore.set(FILE_KEY, f);
            cachedFile = f;
            fileLoaded = true;
            setFileName(f.name);
            setTick(t => t + 1);
            await render();
            showToast("Фон установлен", Toasts.Type.SUCCESS);
        } catch {
            showToast("Не удалось сохранить файл", Toasts.Type.FAILURE);
        }
    };

    const onClear = async () => {
        try {
            await DataStore.del(FILE_KEY);
        } catch { /* ignore */ }
        try {
            await DataStore.del(SOURCE_KEY);
        } catch { /* ignore */ }
        cachedFile = null;
        fileLoaded = true;
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
        }
        setFileName(null);
        setTick(t => t + 1);
        await render();
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <FormSwitch
                title="Показывать свой фон"
                value={settings.store.enabled}
                onChange={v => {
                    settings.store.enabled = v;
                }}
            />
            <label style={{ color: "#b5bac1", fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                Ссылка на фон (mp4, gif, png)
                <input
                    type="text"
                    value={settings.store.sourceUrl}
                    onChange={e => {
                        settings.store.sourceUrl = e.target.value;
                    }}
                    placeholder="https://..."
                    style={{
                        padding: "8px 10px", borderRadius: 6, border: "1px solid #1e1f22",
                        background: "#1e1f22", color: "#dbdee1", fontSize: 13, outline: "none"
                    }}
                />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label style={{ color: "#b5bac1", fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                    Вписание
                    <select
                        value={settings.store.fit}
                        onChange={e => {
                            settings.store.fit = e.target.value as typeof settings.store.fit;
                        }}
                        style={{
                            padding: "8px 10px", borderRadius: 6, border: "1px solid #1e1f22",
                            background: "#1e1f22", color: "#dbdee1", fontSize: 13, outline: "none"
                        }}
                    >
                        <option value="cover">Заполнить</option>
                        <option value="contain">Вписать целиком</option>
                        <option value="fill">Растянуть</option>
                    </select>
                </label>
                <label style={{ color: "#b5bac1", fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                    Затемнение, %
                    <input
                        type="number"
                        min={0}
                        max={90}
                        value={settings.store.dim}
                        onChange={e => {
                            settings.store.dim = Number(e.target.value);
                        }}
                        style={{
                            padding: "8px 10px", borderRadius: 6, border: "1px solid #1e1f22",
                            background: "#1e1f22", color: "#dbdee1", fontSize: 13, outline: "none", width: 90
                        }}
                    />
                </label>
                <label style={{ color: "#b5bac1", fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                    Размытие, px
                    <input
                        type="number"
                        min={0}
                        max={20}
                        value={settings.store.blur}
                        onChange={e => {
                            settings.store.blur = Number(e.target.value);
                        }}
                        style={{
                            padding: "8px 10px", borderRadius: 6, border: "1px solid #1e1f22",
                            background: "#1e1f22", color: "#dbdee1", fontSize: 13, outline: "none", width: 90
                        }}
                    />
                </label>
            </div>
            <div style={{ color: "#b5bac1", fontSize: 13 }}>
                {fileName ? `Файл: ${fileName} (важнее ссылки)` : "Файл не загружен — используется ссылка выше."}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <label
                    style={{
                        padding: "6px 14px", borderRadius: 6, background: "#5865f2",
                        color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer"
                    }}
                >
                    Выбрать mp4 / gif / png
                    <input
                        type="file"
                        accept="video/*,image/*"
                        style={{ display: "none" }}
                        onChange={e => {
                            void onPick(e.target.files?.[0]);
                            e.target.value = "";
                        }}
                    />
                </label>
                <button
                    onClick={() => void onClear()}
                    style={{
                        padding: "6px 14px", borderRadius: 6, border: "none",
                        background: "#4e5058", color: "#fff", fontSize: 13,
                        fontWeight: 600, cursor: "pointer"
                    }}
                >
                    Убрать файл
                </button>
            </div>
            <div style={{ color: "#72767d", fontSize: 12 }}>
                Видео играет без звука по кругу. Если клиент стал тяжёлым — подними затемнение или убери размытие.
            </div>
        </div>
    );
}

export function BackgroundSection() {
    return (
        <Card>
            <Forms.FormTitle tag="h5">Фон</Forms.FormTitle>
            <BackgroundControls />
        </Card>
    );
}

export default definePlugin({
    name: "CustomBackground",
    description: "Свой фон Discord: mp4, gif, png и другие картинки (ссылка или файл). Настройки — во вкладке Темы.",
    tags: ["SudoCord", "Appearance", "Customisation"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,
    hidden: true,

    settings,
    settingsAboutComponent: BackgroundControls,

    start() {
        addThemeSection({ key: "custom-background", component: BackgroundSection });
        void render();
    },

    stop() {
        removeThemeSection("custom-background");
        clearLayer();
    }
});
