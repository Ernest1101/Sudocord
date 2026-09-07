/*
 * Vencord, a modification for Discord's desktop app
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
import { find, waitFor } from "@webpack";
import { MediaEngineStore, UserStore } from "@webpack/common";

// фильтры модуля с классом голосового/стримового соединения:
// строгий (оба метода) и широкий (только нужный нам метод)
function hasStrictConn(m: any): boolean {
    try {
        return typeof m?.prototype?.overwriteQualityForTesting === "function"
            && typeof m?.prototype?.setDesktopEncodingOptions === "function";
    } catch { return false; }
}

function hasLooseConn(m: any): boolean {
    try {
        return typeof m?.prototype?.overwriteQualityForTesting === "function";
    } catch { return false; }
}

function moduleHasConn(mod: any, check: (m: any) => boolean): boolean {
    if (!mod || typeof mod !== "object") return false;
    for (const k in mod) {
        try {
            if (check(mod[k])) return true;
        } catch { /* пропускаем нечитаемые экспорты */ }
    }
    return false;
}

function strictFilter(m: any): boolean {
    return moduleHasConn(m, hasStrictConn);
}

function looseFilter(m: any): boolean {
    return moduleHasConn(m, hasLooseConn);
}

// безопасный find без выброса (isIndirect глушит throw в дев-сборках)
function safeFind(filter: (m: any) => boolean): any {
    try {
        return find(filter, { isIndirect: true });
    } catch (e) {
        console.error("[StreamQuality] find failed", e);
        return null;
    }
}

function findConnectionModule(): any {
    return safeFind(strictFilter) ?? safeFind(looseFilter);
}

const FPS_CYCLE = [30, 60, 75, 120];
const HEIGHT_CYCLE = [720, 1080, 1440];

const settings = definePluginSettings({
    fps: {
        type: OptionType.NUMBER,
        description: "FPS стрима — любое число",
        default: 60,
        onChange: () => { applyNow(); syncPanelInputs(); }
    },
    width: {
        type: OptionType.NUMBER,
        description: "Ширина (px) — любое число. 0 = авто 16:9 от высоты",
        default: 1920,
        onChange: () => { applyNow(); syncPanelInputs(); }
    },
    height: {
        type: OptionType.NUMBER,
        description: "Высота (px) — любое число",
        default: 1080,
        onChange: () => { applyNow(); syncPanelInputs(); }
    },
    bitrate: {
        type: OptionType.NUMBER,
        description: "Битрейт (kbit/s). 0 = стандартный",
        default: 10000,
        onChange: () => applyNow()
    },
    fpsEnabled: {
        type: OptionType.BOOLEAN,
        description: "Перебивать FPS своим (выкл — FPS из меню Discord)",
        default: true,
        onChange: () => { applyNow(); syncPanelInputs(); }
    },
    resEnabled: {
        type: OptionType.BOOLEAN,
        description: "Перебивать разрешение своим (выкл — разрешение из меню Discord)",
        default: true,
        onChange: () => { applyNow(); syncPanelInputs(); }
    },
    bitrateEnabled: {
        type: OptionType.BOOLEAN,
        description: "Перебивать битрейт своим (выкл — битрейт Discord)",
        default: true,
        onChange: () => applyNow()
    },
    showPanel: {
        type: OptionType.BOOLEAN,
        description: "Показывать поля FPS/разрешения в меню «Качество передачи» активного стрима",
        default: true,
        onChange: v => {
            if (v) scanAndInject();
            else removePanelRows();
        }
    }
});

function nextIn(list: number[], current: number): number {
    const i = list.indexOf(current);
    return list[(i + 1) % list.length];
}

// ---------- применение через хук прототипа ----------

let lastConn: any = null;
let lastQuality: any = null;
let hooked = false;

// что реально ушло в энкодер последним (видит и стример в панели, и зрители)
let lastApplied: { fps?: number; width?: number; height?: number; bitrate?: number; at: number; } | null = null;

// выкидывает ключи с undefined, чтобы явно не затирать значения Discord
function clean<T extends object>(o: T): T {
    const r: any = {};
    for (const k in o) {
        if ((o as any)[k] !== undefined) r[k] = (o as any)[k];
    }
    return r;
}

function applyCustom(quality: any): any {
    const custom = getCustom();
    const br = settings.store.bitrateEnabled ? (Number(settings.store.bitrate) || 0) : 0;

    let out = quality;
    if (custom) {
        const fps = Number(custom.fps) || undefined;
        const width = Number(custom.width) || undefined;
        const height = Number(custom.height) || undefined;
        const forced = clean({ framerate: fps, width, height });
        out = {
            ...(quality ?? {}),
            encode: { ...(quality?.encode ?? {}), ...forced },
            capture: { ...(quality?.capture ?? {}), ...forced }
        };
    }
    if (br) {
        // минимум = половина таргета: просадки до 1000 kbit/s на 1080p60 дают кубики
        const min = Math.max(1000, Math.round(br / 2));
        out = {
            ...(out ?? {}),
            bitrate: { minimum: min, target: br, maximum: br * 2 }
        };
    }
    try {
        lastApplied = {
            fps: out?.encode?.framerate ?? out?.capture?.framerate,
            width: out?.encode?.width ?? out?.capture?.width,
            height: out?.encode?.height ?? out?.capture?.height,
            bitrate: out?.bitrate?.target ?? br ?? undefined,
            at: Date.now()
        };
    } catch { /* ignore */ }
    return out;
}

function getCustom(): { fps?: number; width?: number; height?: number } | null {
    const fps = settings.store.fpsEnabled ? (Number(settings.store.fps) || undefined) : undefined;
    const width = settings.store.resEnabled ? (Number(settings.store.width) || undefined) : undefined;
    const height = settings.store.resEnabled ? (Number(settings.store.height) || undefined) : undefined;
    if (!fps && !width && !height) return null;
    return { fps, width: width ?? (height ? Math.round(height * 16 / 9) : undefined), height };
}

function hookModule(mod: any) {
    if (hooked || !mod) return;
    for (const k in mod) {
        let cls: any;
        try {
            cls = mod[k];
        } catch { continue; }
        let proto: any;
        try {
            proto = cls?.prototype;
        } catch { continue; }
        if (!proto || proto.__scHooked) continue;
        if (typeof proto.overwriteQualityForTesting !== "function") continue;

        const orig = proto.overwriteQualityForTesting;
        proto.overwriteQualityForTesting = function (quality: any) {
            lastConn = this;
            lastQuality = quality;
            return orig.call(this, applyCustom(quality));
        };
        proto.__scHooked = true;
        hooked = true;
        console.info("[StreamQuality] hook ok, class:", (cls as any)?.name ?? k);
        return;
    }
    console.info("[StreamQuality] hookModule: модуль найден, но подходящий класс внутри не подошёл");
}

// безопасная попытка зацепить уже загруженный модуль
function tryHookNow() {
    if (hooked) return;
    try {
        hookModule(findConnectionModule());
    } catch (e) {
        console.error("[StreamQuality] hook attempt failed", e);
    }
}

function hookStatus(): string {
    if (lastConn && lastQuality) return "Всё ок: соединение поймано — можно применять";
    if (streamConn) return "Стрим найден, качество Discord ещё не трогал — жми Применить";
    if (hooked) return "Хук стоит, но стрим не найден — запусти трансляцию";
    return "Хук НЕ стоит — модуль соединения не найден (Discord обновился?)";
}

// ---------- прямой доступ к живому стрим-соединению ----------
// Хук перехватывает только вызовы overwriteQualityForTesting. Если Discord
// его не вызывал (меню просто открыли), lastConn пуст — тогда берём
// соединение из движка напрямую через событие "connection".

let streamConn: any = null;
let engineSubscribed = false;
let engineTimer: ReturnType<typeof setTimeout> | null = null;
let engineAttempts = 0;

function isOwnStreamConn(c: any): boolean {
    try {
        if (!c || c.context !== "stream") return false;
        const me = UserStore?.getCurrentUser?.()?.id;
        if (!me) return true;
        return c.streamUserId == null || c.streamUserId === me;
    } catch { return false; }
}

function onEngineConnection(c: any) {
    try {
        if (!isOwnStreamConn(c)) return;
        streamConn = c;
        console.info("[StreamQuality] stream connection captured");
    } catch (e) {
        console.error("[StreamQuality] onEngineConnection failed", e);
    }
}

function retryEngine() {
    if (engineTimer || engineSubscribed) return;
    if (engineAttempts >= 20) {
        console.info("[StreamQuality] engine subscribe gave up after 20 tries");
        return;
    }
    engineAttempts++;
    engineTimer = setTimeout(() => {
        engineTimer = null;
        subscribeEngine();
    }, 1500);
}

function subscribeEngine() {
    if (engineSubscribed) return;
    let engine: any = null;
    try {
        engine = MediaEngineStore?.getMediaEngine?.();
    } catch { engine = null; }
    if (!engine) {
        retryEngine();
        return;
    }
    try {
        const { emitter } = engine;
        if (emitter && typeof emitter.on === "function") {
            emitter.on("connection", onEngineConnection);
            engineSubscribed = true;
            console.info("[StreamQuality] subscribed to engine connections");
        } else {
            console.info("[StreamQuality] engine has no .on emitter, will retry");
            retryEngine();
        }
    } catch (e) {
        console.error("[StreamQuality] subscribeEngine failed", e);
        retryEngine();
    }
}

function unsubscribeEngine() {
    if (engineTimer) {
        clearTimeout(engineTimer);
        engineTimer = null;
    }
    try {
        const engine = MediaEngineStore?.getMediaEngine?.();
        const emitter = engine?.emitter;
        if (emitter && engineSubscribed) {
            if (typeof emitter.off === "function") emitter.off("connection", onEngineConnection);
            else if (typeof emitter.removeListener === "function") emitter.removeListener("connection", onEngineConnection);
        }
    } catch { /* ignore */ }
    engineSubscribed = false;
    streamConn = null;
}

// качество, собранное только из наших настроек — на случай,
// если Discord своё качество нам ни разу не показывал
function buildQualityFromCustom(): any {
    const custom = getCustom();
    const br = Number(settings.store.bitrate) || 0;
    const q: any = {};
    if (custom) {
        const forced = clean({ framerate: custom.fps, width: custom.width, height: custom.height });
        q.encode = { ...forced };
        q.capture = { ...forced };
    }
    if (br) q.bitrate = { minimum: 1000, target: br, maximum: br * 2 };
    return q;
}

// чистим мусор вроде 173x90 от прошлых экспериментов: такие значения убивают картинку.
// срабатывает один раз на старте; тосты от onChange в этот момент — норма.
function normalizeStoredQuality() {
    const s = settings.store;
    const num = (v: unknown) => Number(v);
    if (!Number.isFinite(num(s.fps)) || num(s.fps) < 1 || num(s.fps) > 120) s.fps = 60;
    if (num(s.width) !== 0 && (!Number.isFinite(num(s.width)) || num(s.width) < 320 || num(s.width) > 7680)) s.width = 1920;
    if (num(s.height) !== 0 && (!Number.isFinite(num(s.height)) || num(s.height) < 180 || num(s.height) > 4320)) s.height = 1080;
    if (num(s.bitrate) !== 0 && (!Number.isFinite(num(s.bitrate)) || num(s.bitrate) < 500 || num(s.bitrate) > 50000)) s.bitrate = 10000;
}

function resolveTarget(): { conn: any; quality: any } | null {
    tryHookNow();
    if (lastConn && typeof lastConn.overwriteQualityForTesting === "function" && lastQuality) {
        return { conn: lastConn, quality: lastQuality };
    }
    const direct = lastConn ?? streamConn;
    if (direct && typeof direct.overwriteQualityForTesting === "function") {
        return { conn: direct, quality: lastQuality ?? buildQualityFromCustom() };
    }
    return null;
}

function applyNow() {
    const target = resolveTarget();
    if (target) {
        try {
            target.conn.overwriteQualityForTesting(target.quality);
            toast("Качество применено", 2);
        } catch (e) {
            console.error("[StreamQuality] apply failed", e);
            toast("Не удалось применить", 3);
        }
    } else {
        toast("Начни трансляцию, затем примени", 3);
    }
}

// Понижение качества применяется наживую, а повышение требует новых слоёв
// в переговорах — т.е. рестарта демки (стоп/старт). Подсказываем об этом,
// если новые значения выше последних применённых.
function applyFromPanel() {
    const prevFps = lastApplied?.fps ?? Number(settings.store.fps) ?? 0;
    const prevH = lastApplied?.height ?? Number(settings.store.height) ?? 0;
    applyNow();
    const newFps = Number(settings.store.fps) || 0;
    const newH = Number(settings.store.height) || 0;
    if (newFps > prevFps || newH > prevH) {
        toast("Повышение вступит после перезапуска демки (стоп/старт)", 1);
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

// ---------- панель в меню «Качество передачи» активного стрима ----------

const ROW_ATTR = "data-sc-quality-row";
let observer: MutationObserver | null = null;
let scanTimer: ReturnType<typeof setInterval> | null = null;

const FPS_RE = /кадр(?:ов|а)? в секунду|frames? per second|frame rate/i;
const RES_RE = /разрешение|resolution|480p|720p|1080p|Источник/i;

function clampInt(v: number, min: number, max: number, fallback: number) {
    if (!Number.isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, Math.round(v)));
}

// ищет все открытые меню качества: радиогруппы с выбором FPS.
// возврат — контейнеры, куда добавляем свою строку (по одному на контейнер).
function findQualityPopouts(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const groups = document.querySelectorAll('[role="radiogroup"], [role="menu"], div[role="dialog"]');
    for (const g of Array.from(groups) as HTMLElement[]) {
        let text = "";
        try {
            text = g.textContent ?? "";
        } catch { continue; }
        if (!FPS_RE.test(text)) continue;

        // поднимаемся до smallest предка, содержащего и FPS, и разрешение —
        // это и есть контент меню (внизу там пункт «Источник»).
        // ВАЖНО: маркер проверяем именно на box, куда добавляем строку,
        // а не на g — иначе каждый скан добавлял бы копию и вешал клиент.
        let box: HTMLElement | null = g;
        for (let i = 0; i < 6 && box?.parentElement; i++) {
            const parent = box.parentElement;
            let ptext = "";
            try {
                ptext = parent.textContent ?? "";
            } catch { break; }
            if (!FPS_RE.test(ptext)) break;
            box = parent;
            if (RES_RE.test(ptext)) break;
        }
        if (!box || out.includes(box)) continue;
        try {
            if (box.querySelector(`[${ROW_ATTR}]`)) continue;
        } catch { continue; }
        out.push(box);
    }
    // оставляем только самые вложенные контейнеры: меню качества рендерится
    // внутри родительского меню стрима, и без этого строка дублировалась бы в оба
    return out.filter(b => !out.some(o => o !== b && b.contains(o)));
}

function buildPanelRow(): HTMLElement {
    const row = document.createElement("div");
    row.setAttribute(ROW_ATTR, "1");
    row.className = "sc-custom-row";
    // весь вид — в styles.css (тёмная тема Discord)

    const title = document.createElement("div");
    title.className = "sc-title";
    title.textContent = "SudoCord — FPS, разрешение, битрейт";
    row.appendChild(title);

    const fields = document.createElement("div");
    fields.className = "sc-fields";

    const mkField = (label: string, key: "fps" | "width" | "height" | "bitrate", min: number, max: number, placeholder: string) => {
        const wrap = document.createElement("div");
        wrap.className = "sc-field";
        const lab = document.createElement("label");
        lab.textContent = label;
        const input = document.createElement("input");
        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.placeholder = placeholder;
        input.setAttribute("data-sc", key);
        input.value = String(settings.store[key] ?? "");
        input.addEventListener("change", () => {
            const raw = Number(input.value);
            // 0 в ширине/высоте = авто/пропустить, в FPS ноль смысла не имеет
            const parsed = (raw === 0 && key !== "fps") ? 0 : clampInt(raw, min, max, Number(settings.store[key]) || min);
            (settings.store as any)[key] = parsed;
            input.value = String(parsed);
            applyFromPanel();
        });
        input.addEventListener("keydown", e => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            e.stopPropagation();
        });
        // клики внутри попаута не должны его закрывать/фонить наружу
        input.addEventListener("click", e => e.stopPropagation());
        wrap.appendChild(lab);
        wrap.appendChild(input);
        return wrap;
    };

    fields.appendChild(mkField("FPS", "fps", 1, 120, "60"));
    fields.appendChild(mkField("Ширина (0=авто)", "width", 320, 7680, "1920"));
    fields.appendChild(mkField("Высота", "height", 180, 4320, "1080"));
    fields.appendChild(mkField("Битрейт (0=станд.)", "bitrate", 500, 50000, "10000"));

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Применить";
    btn.className = "sc-fa-btn";
    btn.addEventListener("click", e => {
        e.stopPropagation();
        const fpsEl = row.querySelector('[data-sc="fps"]') as HTMLInputElement | null;
        const wEl = row.querySelector('[data-sc="width"]') as HTMLInputElement | null;
        const hEl = row.querySelector('[data-sc="height"]') as HTMLInputElement | null;
        const bEl = row.querySelector('[data-sc="bitrate"]') as HTMLInputElement | null;
        if (fpsEl) settings.store.fps = clampInt(Number(fpsEl.value), 1, 120, 60);
        if (wEl) settings.store.width = Number(wEl.value) === 0 ? 0 : clampInt(Number(wEl.value), 320, 7680, 1920);
        if (hEl) settings.store.height = Number(hEl.value) === 0 ? 0 : clampInt(Number(hEl.value), 180, 4320, 1080);
        if (bEl) settings.store.bitrate = Number(bEl.value) === 0 ? 0 : clampInt(Number(bEl.value), 500, 50000, 10000);
        syncPanelInputs();
        applyFromPanel();
    });
    fields.appendChild(btn);

    row.appendChild(fields);

    const hint = document.createElement("div");
    hint.className = "sc-hint";
    hint.textContent = "Перебивает выбор выше. Понижение — сразу, повышение — после рестарта демки. Пустая ширина = авто 16:9.";
    row.appendChild(hint);

    const status = document.createElement("div");
    status.className = "sc-status";
    const applied = document.createElement("div");
    applied.className = "sc-applied";
    const selfview = document.createElement("div");
    selfview.className = "sc-selfview";
    status.appendChild(applied);
    status.appendChild(selfview);
    row.appendChild(status);

    return row;
}

function formatApplied(): string {
    if (!lastApplied) return "Уходит зрителям: ещё не применялось";
    const p = lastApplied;
    const parts = [
        p.fps ? `${p.fps}fps` : null,
        p.width && p.height ? `${p.width}x${p.height}` : null,
        p.bitrate ? `${p.bitrate}kbit` : null
    ].filter(Boolean);
    return parts.length ? `Уходит зрителям: ${parts.join(" · ")}` : "Уходит зрителям: стандартно";
}

// что показывает превью у самого стримера: берём крупнейший <video> и читаем его трек
function getSelfViewInfo(): string {
    try {
        const vids = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
        if (!vids.length) return "Моё превью: видеоэлемент не найден";
        let best: HTMLVideoElement | null = null;
        let bestArea = 0;
        for (const v of vids) {
            const area = (v.videoWidth || 0) * (v.videoHeight || 0);
            if (area > bestArea) {
                bestArea = area;
                best = v;
            }
        }
        if (!best || !bestArea) return "Моё превью: не играет";
        let extra = "";
        try {
            const stream = (best as any).srcObject as MediaStream | null;
            const track = stream?.getVideoTracks?.()?.[0];
            if (track) {
                if (track.readyState === "ended") return "Моё превью: трек завершён";
                if (track.muted) extra += ", muted";
                const s = track.getSettings?.() as any;
                // трек иногда отдаёт мусор вроде 1410fps — показываем только sane-значения
                const tfps = Math.round(Number(s?.frameRate));
                if (Number.isFinite(tfps) && tfps >= 1 && tfps <= 240) extra += ` @ ${tfps}fps`;
            }
        } catch { /* ignore */ }
        return `Моё превью: ${best.videoWidth}x${best.videoHeight}${extra}`;
    } catch {
        return "Моё превью: ?";
    }
}

function refreshStatusRows() {
    // ВАЖНО: пишем textContent ТОЛЬКО если значение изменилось.
    // Безусловная запись сама порождает мутацию -> observer -> новый скан ->
    // бесконечный цикл, вешающий интерфейс ровно при открытии меню качества.
    try {
        const appliedText = formatApplied();
        const selfText = getSelfViewInfo();
        document.querySelectorAll(`[${ROW_ATTR}]`).forEach(row => {
            const a = row.querySelector(".sc-applied");
            if (a && a.textContent !== appliedText) a.textContent = appliedText;
            const s = row.querySelector(".sc-selfview");
            if (s && s.textContent !== selfText) s.textContent = selfText;
        });
    } catch { /* ignore */ }
}

// строку ставим сразу за последним радиопунктом (обычно «Источник»),
// а не в конец контейнера: конец часто оказывается вне скролла меню,
// и строка вылезала за интерфейс
function insertRow(box: HTMLElement, row: HTMLElement) {
    try {
        const radios = box.querySelectorAll('[role="radio"], [role="menuitemradio"]');
        const last = radios.length ? (radios[radios.length - 1] as HTMLElement) : null;
        const host = last?.parentElement;
        if (host && (host === box || box.contains(host))) {
            host.insertBefore(row, last!.nextSibling);
            return;
        }
    } catch (e) {
        console.error("[StreamQuality] insertRow fallback", e);
    }
    box.appendChild(row);
}

function scanAndInject() {
    try {
        if (!settings.store.showPanel) return;
        // страховка от размножения строк: больше 5 быть не должно никогда
        if (document.querySelectorAll(`[${ROW_ATTR}]`).length >= 5) return;
        for (const box of findQualityPopouts()) {
            try {
                insertRow(box, buildPanelRow());
            } catch (e) {
                console.error("[StreamQuality] inject failed", e);
            }
        }
        refreshStatusRows();
    } catch (e) {
        console.error("[StreamQuality] scan failed", e);
    }
}

function removePanelRows() {
    try {
        document.querySelectorAll(`[${ROW_ATTR}]`).forEach(n => n.remove());
    } catch { /* DOM ещё не готов — нечего чистить */ }
}

function syncPanelInputs() {
    try {
        document.querySelectorAll(`[${ROW_ATTR}]`).forEach(row => {
            (["fps", "width", "height", "bitrate"] as const).forEach(key => {
                const el = row.querySelector(`[data-sc="${key}"]`) as HTMLInputElement | null;
                if (el && document.activeElement !== el) el.value = String(settings.store[key] ?? "");
            });
        });
    } catch { /* ignore */ }
}

function startPanelObserver() {
    stopPanelObserver();
    scanAndInject();
    observer = new MutationObserver(muts => {
        for (const m of muts) {
            if (m.addedNodes.length) {
                scanAndInject();
                return;
            }
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scanTimer = setInterval(scanAndInject, 1000);
}

function stopPanelObserver() {
    try {
        observer?.disconnect();
    } catch { /* ignore */ }
    observer = null;
    if (scanTimer) {
        clearInterval(scanTimer);
        scanTimer = null;
    }
    removePanelRows();
}

export default definePlugin({
    name: "StreamQuality",
    description: "Кастомное FPS/разрешение/битрейт стрима. Свои поля FPS и разрешения внизу меню «Качество передачи» + тулбокс",
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
                    applyFromPanel();
                }
            },
            {
                text: `Высота: ${settings.store.height} (сменить)`,
                action: () => {
                    settings.store.height = nextIn(HEIGHT_CYCLE, settings.store.height);
                    applyFromPanel();
                }
            },
            {
                text: "Применить сейчас",
                action: applyNow
            },
            {
                text: "Статус хука",
                action: () => {
                    tryHookNow();
                    const s = hookStatus();
                    console.info("[StreamQuality] status:", s);
                    toast(s, hooked ? 2 : 3);
                }
            }
        ];
    },

    start() {
        // хук ставим через waitFor: модуль соединения подгружается позже (при входе в войс),
        // прямой find в этот момент бросает исключение в дев-сборке и роняет старт плагина
        console.info("[StreamQuality] started, waiting for connection module");
        normalizeStoredQuality();
        try {
            tryHookNow();
        } catch (e) {
            console.error("[StreamQuality] initial hook failed, will retry on apply", e);
        }
        try {
            waitFor(looseFilter, hookModule);
        } catch (e) {
            console.error("[StreamQuality] waitFor failed", e);
        }
        engineAttempts = 0;
        subscribeEngine();
        startPanelObserver();
    },

    stop() {
        stopPanelObserver();
        unsubscribeEngine();
    },
});
