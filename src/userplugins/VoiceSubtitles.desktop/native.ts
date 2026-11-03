/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChildProcessWithoutNullStreams, execFile, spawn } from "child_process";
import { createHash } from "crypto";
import { app, BrowserWindow, desktopCapturer, IpcMainInvokeEvent, screen } from "electron";
import audioTapSource from "file://audioTap.cs";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const GROQ_BASE = "https://api.groq.com/openai/v1";

// ---------- Захват звука только процесса Discord ----------

// Буфер в main не должен расти бесконечно, если renderer перестал забирать данные
const MAX_BUFFERED_BYTES = 48000 * 2 * 2 * 10;

let tap: ChildProcessWithoutNullStreams | null = null;
let tapFormat: { rate: number; channels: number; } | null = null;
let tapChunks: Buffer[] = [];
let tapBuffered = 0;
let tapError: string | null = null;

function getCsc() {
    const windir = process.env.WINDIR ?? "C:\\Windows";
    for (const dir of ["Framework64", "Framework"]) {
        const csc = join(windir, "Microsoft.NET", dir, "v4.0.30319", "csc.exe");
        if (existsSync(csc)) return csc;
    }
    return null;
}

// Помощник собирается из исходника при первом запуске. Хэш в имени файла пересобирает его после обновления плагина
async function ensureAudioTap(): Promise<string> {
    const hash = createHash("sha1").update(audioTapSource).digest("hex").slice(0, 10);
    const dir = join(app.getPath("userData"), "VoiceSubtitles");
    const exe = join(dir, `audioTap-${hash}.exe`);
    if (existsSync(exe)) return exe;

    const csc = getCsc();
    if (!csc) throw new Error("не найден csc.exe (.NET Framework 4)");

    mkdirSync(dir, { recursive: true });
    const source = join(dir, `audioTap-${hash}.cs`);
    writeFileSync(source, audioTapSource);

    await new Promise<void>((resolve, reject) => {
        execFile(csc, ["-nologo", "-optimize+", "-target:exe", `-out:${exe}`, source], { windowsHide: true }, (err, stdout) => {
            if (err) reject(new Error(`сборка помощника не удалась: ${stdout || err.message}`));
            else resolve();
        });
    });

    return exe;
}

export async function startDiscordCapture(_: IpcMainInvokeEvent): Promise<{ ok: boolean; error?: string; }> {
    if (process.platform !== "win32") return { ok: false, error: "захват звука Discord работает только в Windows" };
    if (tap) return { ok: true };

    try {
        const exe = await ensureAudioTap();
        tapChunks = [];
        tapBuffered = 0;
        tapFormat = null;
        tapError = null;

        // process.pid — главный процесс Discord. Помощник захватывает всё его дерево, в том числе
        // renderer, где discord_voice проигрывает голоса участников
        const child = spawn(exe, [String(process.pid)], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
        tap = child;

        child.stdout.on("data", (chunk: Buffer) => {
            tapChunks.push(chunk);
            tapBuffered += chunk.length;
            while (tapBuffered > MAX_BUFFERED_BYTES && tapChunks.length > 1) tapBuffered -= tapChunks.shift()!.length;
        });

        let stderr = "";
        const formatReady = new Promise<void>((resolve, reject) => {
            child.stderr.on("data", (d: Buffer) => {
                stderr += d.toString();
                const format = /format (\d+) (\d+)/.exec(stderr);
                if (format && !tapFormat) {
                    tapFormat = { rate: Number(format[1]), channels: Number(format[2]) };
                    resolve();
                }
                const error = /error: (.+)/.exec(stderr);
                if (error) tapError = error[1].trim();
            });
            child.on("error", reject);
            child.on("exit", code => {
                if (tap === child) tap = null;
                tapError ??= `помощник завершился с кодом ${code}`;
                reject(new Error(tapError));
            });
            setTimeout(() => reject(new Error("помощник не ответил за 8 секунд")), 8000);
        });

        await formatReady;
        return { ok: true };
    } catch (e) {
        stopDiscordCapture(_);
        return { ok: false, error: (e as Error).message ?? String(e) };
    }
}

export function readDiscordAudio(_: IpcMainInvokeEvent) {
    const frameBytes = (tapFormat?.channels ?? 1) * 2;
    let data = Buffer.concat(tapChunks);

    // отдаём только целые кадры, остаток ждёт следующего чтения
    const whole = data.length - data.length % frameBytes;
    tapChunks = whole < data.length ? [data.subarray(whole)] : [];
    tapBuffered = data.length - whole;
    data = data.subarray(0, whole);

    return {
        data: new Uint8Array(data),
        rate: tapFormat?.rate ?? 16000,
        channels: tapFormat?.channels ?? 1,
        alive: tap != null,
        error: tapError
    };
}

export function stopDiscordCapture(_: IpcMainInvokeEvent) {
    const child = tap;
    tap = null;
    tapChunks = [];
    tapBuffered = 0;
    if (!child) return;

    // закрытый stdin — сигнал помощнику завершиться; kill на случай, если он завис
    child.stdin.end();
    setTimeout(() => child.kill(), 1000);
}

export interface OverlayLine {
    id: number;
    speakers: { name: string; color?: string; }[];
    text: string;
    original?: string;
}

const OVERLAY_WIDTH = 1000;
const OVERLAY_HEIGHT = 420;

// Страница оверлея. Текст вставляется только через textContent, поэтому разметка в репликах не исполняется
const OVERLAY_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html, body { margin: 0; background: transparent; overflow: hidden; user-select: none; }
#root { display: flex; flex-direction: column; align-items: center; gap: 6px; padding-top: 8px;
    font-family: "gg sans", "Segoe UI", "Noto Sans", sans-serif; }
.line { max-width: ${OVERLAY_WIDTH - 40}px; padding: 6px 14px; border-radius: 8px; background: rgb(0 0 0 / 72%);
    color: #fff; font-size: 19px; line-height: 1.35; text-align: center; text-shadow: 0 1px 2px rgb(0 0 0 / 80%);
    animation: in .15s ease-out; }
.name { font-weight: 700; }
.original { margin-top: 2px; font-size: 14px; color: rgb(255 255 255 / 65%); }
@keyframes in { from { opacity: 0; transform: translateY(-4px); } }
</style></head><body><div id="root"></div><script>
window.renderLines = lines => {
    const root = document.getElementById("root");
    root.replaceChildren(...lines.map(line => {
        const el = document.createElement("div");
        el.className = "line";
        const main = el.appendChild(document.createElement("div"));
        line.speakers.forEach((s, i) => {
            if (i > 0) main.append(", ");
            const name = main.appendChild(document.createElement("span"));
            name.className = "name";
            name.textContent = s.name;
            if (s.color) name.style.color = s.color;
        });
        main.append(": " + line.text);
        if (line.original) {
            const orig = el.appendChild(document.createElement("div"));
            orig.className = "original";
            orig.textContent = line.original;
        }
        return el;
    }));
};
</script></body></html>`;

let overlay: BrowserWindow | null = null;
let overlayReady = false;
let overlayLines: OverlayLine[] = [];

function createOverlay() {
    const { workArea } = screen.getPrimaryDisplay();
    const width = Math.min(OVERLAY_WIDTH, workArea.width);

    const win = new BrowserWindow({
        x: workArea.x + Math.round((workArea.width - width) / 2),
        y: workArea.y + 24,
        width,
        height: OVERLAY_HEIGHT,
        show: false,
        transparent: true,
        backgroundColor: "#00000000",
        frame: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        focusable: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        hasShadow: false,
        webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false
        }
    });

    // "screen-saver" — самый высокий уровень, чтобы быть над играми в оконном/безрамочном режиме
    win.setAlwaysOnTop(true, "screen-saver");
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", e => e.preventDefault());
    win.on("closed", () => {
        if (overlay === win) {
            overlay = null;
            overlayReady = false;
        }
    });
    win.webContents.once("did-finish-load", () => {
        overlayReady = true;
        renderOverlay();
    });

    void win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(OVERLAY_HTML));
    overlay = win;
}

function renderOverlay() {
    if (!overlay || overlay.isDestroyed() || !overlayReady) return;

    overlay.webContents.executeJavaScript(`window.renderLines(${JSON.stringify(overlayLines)})`).catch(() => { });

    if (overlayLines.length) {
        overlay.showInactive();
        // некоторые игры сами встают поверх всех, поэтому поднимаем окно при каждой новой строке
        overlay.setAlwaysOnTop(true, "screen-saver");
        overlay.moveTop();
    } else {
        overlay.hide();
    }
}

export function overlayUpdate(_: IpcMainInvokeEvent, lines: OverlayLine[]) {
    overlayLines = lines;
    if (!overlay || overlay.isDestroyed()) {
        if (!lines.length) return;
        createOverlay();
    }
    renderOverlay();
}

export function overlayDestroy(_: IpcMainInvokeEvent) {
    overlayLines = [];
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
    overlay = null;
    overlayReady = false;
}

export interface TranscribeResult {
    ok: boolean;
    status?: number;
    error?: string;
    retryAfter?: number;
    text?: string;
    language?: string;
    noSpeech?: boolean;
}

export interface TranslateResult {
    ok: boolean;
    error?: string;
    text?: string;
    sourceLanguage?: string;
}

// Чтобы захватить системный звук (loopback), Chromium требует id экрана, даже если видео сразу выкидывается
export async function getScreenSourceId(_: IpcMainInvokeEvent): Promise<string | null> {
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } });
    return sources[0]?.id ?? null;
}

async function readError(res: Response) {
    const body = await res.text().catch(() => "");
    try {
        return JSON.parse(body)?.error?.message ?? body;
    } catch {
        return body || res.statusText;
    }
}

export async function transcribe(_: IpcMainInvokeEvent, apiKey: string, wav: Uint8Array, model: string, language: string): Promise<TranscribeResult> {
    const form = new FormData();
    form.append("file", new Blob([wav as BlobPart], { type: "audio/wav" }), "audio.wav");
    form.append("model", model);
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    if (language && language !== "auto") form.append("language", language);

    try {
        const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form
        });

        if (!res.ok) {
            return {
                ok: false,
                status: res.status,
                error: await readError(res),
                retryAfter: Number(res.headers.get("retry-after")) || undefined
            };
        }

        const data = await res.json();
        const segments: any[] = Array.isArray(data.segments) ? data.segments : [];
        if (!segments.length) return { ok: true, text: String(data.text ?? "").trim(), language: data.language };

        // Whisper на тишине и шуме выдумывает фразы или зацикливается. Отбрасываем такие сегменты по порогам
        // из эталонной реализации Whisper: вероятная не-речь, низкая уверенность, сильно сжимаемый (повторяющийся) текст
        const kept = segments.filter(s =>
            !(s.no_speech_prob > 0.6 && s.avg_logprob < -0.5)
            && !(s.avg_logprob < -1)
            && !(s.compression_ratio > 2.4)
        );

        return {
            ok: true,
            text: kept.map(s => String(s.text ?? "").trim()).join(" ").trim(),
            language: data.language,
            noSpeech: !kept.length
        };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

export async function translateGoogle(_: IpcMainInvokeEvent, text: string, target: string): Promise<TranslateResult> {
    // Тот же публичный endpoint, что использует встроенный плагин Translate
    const url = "https://translate-pa.googleapis.com/v1/translate?" + new URLSearchParams({
        "params.client": "gtx",
        "dataTypes": "TRANSLATION",
        "key": "AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA",
        "query.sourceLanguage": "auto",
        "query.targetLanguage": target,
        "query.text": text,
    });

    try {
        const res = await fetch(url);
        if (!res.ok) return { ok: false, error: `${res.status} ${await readError(res)}` };

        const { sourceLanguage, translation } = await res.json();
        return { ok: true, text: translation, sourceLanguage };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

export async function translateGroq(_: IpcMainInvokeEvent, apiKey: string, model: string, text: string, targetName: string): Promise<TranslateResult> {
    try {
        const res = await fetch(`${GROQ_BASE}/chat/completions`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                temperature: 0.2,
                messages: [
                    {
                        role: "system",
                        content: `You translate voice chat subtitles into ${targetName}. Reply with the translation only, no quotes or comments. If the text is already in ${targetName}, return it unchanged.`
                    },
                    { role: "user", content: text }
                ]
            })
        });

        if (!res.ok) return { ok: false, error: `${res.status} ${await readError(res)}` };

        const data = await res.json();
        return { ok: true, text: String(data.choices?.[0]?.message?.content ?? "").trim() };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}
