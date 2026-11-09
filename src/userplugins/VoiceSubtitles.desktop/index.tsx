/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import definePlugin, { makeRange, OptionType, PluginNative } from "@utils/types";
import { ChannelStore, createRoot, GuildMemberStore, React, SelectedChannelStore, showToast, Toasts, UserStore } from "@webpack/common";
import type { Root } from "react-dom/client";

const Native = VencordNative.pluginHelpers.VoiceSubtitles as PluginNative<typeof import("./native")>;
const logger = new Logger("VoiceSubtitles");
const cl = classNameFactory("vc-voice-subtitles-");

// code — для переводчика, whisper — код языка для Whisper, name — как язык называет Whisper в ответе
const LANGUAGES = [
    { code: "ru", whisper: "ru", name: "Russian", label: "Русский" },
    { code: "en", whisper: "en", name: "English", label: "Английский" },
    { code: "uk", whisper: "uk", name: "Ukrainian", label: "Украинский" },
    { code: "be", whisper: "be", name: "Belarusian", label: "Белорусский" },
    { code: "kk", whisper: "kk", name: "Kazakh", label: "Казахский" },
    { code: "es", whisper: "es", name: "Spanish", label: "Испанский" },
    { code: "de", whisper: "de", name: "German", label: "Немецкий" },
    { code: "fr", whisper: "fr", name: "French", label: "Французский" },
    { code: "it", whisper: "it", name: "Italian", label: "Итальянский" },
    { code: "pt", whisper: "pt", name: "Portuguese", label: "Португальский" },
    { code: "pl", whisper: "pl", name: "Polish", label: "Польский" },
    { code: "cs", whisper: "cs", name: "Czech", label: "Чешский" },
    { code: "nl", whisper: "nl", name: "Dutch", label: "Нидерландский" },
    { code: "sv", whisper: "sv", name: "Swedish", label: "Шведский" },
    { code: "no", whisper: "no", name: "Norwegian", label: "Норвежский" },
    { code: "da", whisper: "da", name: "Danish", label: "Датский" },
    { code: "fi", whisper: "fi", name: "Finnish", label: "Финский" },
    { code: "el", whisper: "el", name: "Greek", label: "Греческий" },
    { code: "ro", whisper: "ro", name: "Romanian", label: "Румынский" },
    { code: "hu", whisper: "hu", name: "Hungarian", label: "Венгерский" },
    { code: "tr", whisper: "tr", name: "Turkish", label: "Турецкий" },
    { code: "ar", whisper: "ar", name: "Arabic", label: "Арабский" },
    { code: "he", whisper: "he", name: "Hebrew", label: "Иврит" },
    { code: "hi", whisper: "hi", name: "Hindi", label: "Хинди" },
    { code: "ja", whisper: "ja", name: "Japanese", label: "Японский" },
    { code: "ko", whisper: "ko", name: "Korean", label: "Корейский" },
    { code: "zh-CN", whisper: "zh", name: "Chinese", label: "Китайский" },
    { code: "vi", whisper: "vi", name: "Vietnamese", label: "Вьетнамский" },
    { code: "th", whisper: "th", name: "Thai", label: "Тайский" },
    { code: "id", whisper: "id", name: "Indonesian", label: "Индонезийский" },
] as const;

const settings = definePluginSettings({
    apiKey: {
        type: OptionType.STRING,
        description: "API-ключ Groq (console.groq.com → API Keys)",
        placeholder: "gsk_...",
        default: ""
    },
    audioSource: {
        type: OptionType.SELECT,
        description: "Откуда брать звук",
        options: [
            { label: "Только Discord (музыка, игры и браузер не попадают)", value: "discord", default: true },
            { label: "Весь звук системы (старый режим)", value: "system" }
        ],
        onChange() {
            if (!capturing && !starting) return;
            stopCapture();
            void startCapture();
        }
    },
    targetLanguage: {
        type: OptionType.SELECT,
        description: "Язык перевода субтитров",
        options: LANGUAGES.map(l => ({ label: l.label, value: l.code, default: l.code === "ru" }))
    },
    spokenLanguage: {
        type: OptionType.SELECT,
        description: "Язык речи в канале (подсказка для распознавания)",
        options: [
            { label: "Определять автоматически", value: "auto", default: true },
            ...LANGUAGES.map(l => ({ label: l.label, value: l.whisper }))
        ]
    },
    translator: {
        type: OptionType.SELECT,
        description: "Чем переводить",
        options: [
            { label: "Google Translate (без ключа, быстрее)", value: "google", default: true },
            { label: "Groq LLM (тот же ключ, естественнее)", value: "groq" }
        ]
    },
    groqChatModel: {
        type: OptionType.STRING,
        description: "Модель Groq для перевода",
        default: "llama-3.3-70b-versatile"
    },
    whisperModel: {
        type: OptionType.SELECT,
        description: "Модель распознавания",
        options: [
            { label: "whisper-large-v3-turbo (быстрее)", value: "whisper-large-v3-turbo", default: true },
            { label: "whisper-large-v3 (точнее)", value: "whisper-large-v3" }
        ]
    },
    ignoreRussian: {
        type: OptionType.BOOLEAN,
        description: "Не показывать фразу, если в распознанном тексте есть хотя бы одна кириллическая буква",
        default: true
    },
    onlyEnglish: {
        type: OptionType.BOOLEAN,
        description: "Показывать только английскую речь. Отсекает русскую речь, которую Whisper сам записал латиницей (например, «Я не знаю» → польское «Nie znam»), но может пропустить английскую фразу, если Whisper ошибся с языком",
        default: true
    },
    showOriginal: {
        type: OptionType.BOOLEAN,
        description: "Показывать оригинал под переводом",
        default: true
    },
    maxLines: {
        type: OptionType.SLIDER,
        description: "Сколько строк субтитров держать на экране",
        markers: makeRange(1, 5, 1),
        default: 3,
        stickToMarkers: true
    },
    displaySeconds: {
        type: OptionType.SLIDER,
        description: "Сколько секунд показывать строку",
        markers: makeRange(3, 20, 1),
        default: 8,
        stickToMarkers: true
    },
    maxSegmentSeconds: {
        type: OptionType.SLIDER,
        description: "Максимальная длина фрагмента речи (сек). Меньше — субтитры быстрее, но больше запросов к Groq",
        markers: makeRange(4, 20, 2),
        default: 10,
        stickToMarkers: true
    },
    silenceThresholdDb: {
        type: OptionType.SLIDER,
        description: "Порог тишины (dBFS). Звук тише порога не считается речью и не отправляется в Groq. Выше (ближе к 0) — строже",
        markers: makeRange(-60, -20, 5),
        default: -40,
        stickToMarkers: true
    },
    desktopOverlay: {
        type: OptionType.BOOLEAN,
        description: "Desktop Overlay: показывать субтитры поверх всех окон (игры, браузер), а не только внутри Discord",
        default: false,
        onChange(enabled: boolean) {
            if (enabled) syncOverlay();
            else void Native.overlayDestroy();
        }
    }
}, {
    groqChatModel: { hidden() { return this.store.translator !== "groq"; } }
});

// ---------- Захват звука ----------

const SAMPLE_RATE = 16000;
const PRE_ROLL_SAMPLES = SAMPLE_RATE / 2;
const HANGOVER_MS = 700;
const MIN_SEGMENT_SEC = 0.6;
// VAD: фрагмент режется на окна по 30 мс, речью считается окно громче порога. Нужно хотя бы 0,35 с такой речи
const VAD_FRAME = SAMPLE_RATE * 0.03;
const MIN_VOICED_SEC = 0.35;
const SPEAKING_VOICE = 1 << 0;
const SPEAKING_PRIORITY = 1 << 2;

let capturing = false;
let starting: Promise<void> | null = null;
// растёт при каждой остановке, чтобы запуск, завершившийся после stopCapture, не включил захват обратно
let captureGeneration = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// только для режима "весь звук системы"
let stream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let processor: ScriptProcessorNode | null = null;

let preRoll: Float32Array[] = [];
let preRollLength = 0;
let recording: Float32Array[] | null = null;
let recordingLength = 0;

// кто говорит прямо сейчас (userId → когда начал) и сколько мс наговорил каждый в текущем фрагменте
const speakingNow = new Map<string, number>();
let segmentSpeakers = new Map<string, number>();
let silentSince = 0;

function resample(input: Float32Array, fromRate: number): Float32Array {
    if (fromRate === SAMPLE_RATE) return input.slice();

    const ratio = fromRate / SAMPLE_RATE;
    const out = new Float32Array(Math.floor(input.length / ratio));
    for (let i = 0; i < out.length; i++) {
        const pos = i * ratio;
        const idx = Math.floor(pos);
        const next = input[Math.min(idx + 1, input.length - 1)];
        out[i] = input[idx] + (next - input[idx]) * (pos - idx);
    }
    return out;
}

function pcm16ToMono(bytes: Uint8Array, channels: number): Float32Array {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const frames = Math.floor(bytes.byteLength / (2 * channels));
    const out = new Float32Array(frames);

    for (let f = 0; f < frames; f++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += view.getInt16((f * channels + c) * 2, true);
        out[f] = sum / channels / 32768;
    }
    return out;
}

// Звук только процесса Discord: голоса участников без музыки, игр и браузера.
// В десктопном Discord голоса проигрывает нативный discord_voice, MediaStream участников в JS нет,
// поэтому звук снимается через WASAPI process loopback помощником из audioTap.cs
async function startDiscordSource(generation: number) {
    const res = await Native.startDiscordCapture();
    if (!res.ok) throw new Error(res.error ?? "неизвестная ошибка");
    if (generation !== captureGeneration) return void Native.stopDiscordCapture();

    let polling = false;
    pollTimer = setInterval(async () => {
        if (polling) return;
        polling = true;
        try {
            const { data, rate, channels, alive, error } = await Native.readDiscordAudio();
            if (generation !== captureGeneration) return;

            if (data.byteLength) onAudioChunk(resample(pcm16ToMono(data, channels), rate));
            checkSegment();

            if (!alive) {
                stopCapture();
                showToast(`Субтитры: захват звука Discord остановился (${error ?? "помощник завершился"})`, Toasts.Type.FAILURE);
            }
        } finally {
            polling = false;
        }
    }, 100);
}

// Старый режим: chromeMediaSource "desktop" даёт loopback всего системного вывода
async function startSystemSource(generation: number) {
    const sourceId = await Native.getScreenSourceId();
    if (!sourceId) throw new Error("не найден источник экрана");

    const captured = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: "desktop" } },
        video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceId, maxWidth: 1, maxHeight: 1, maxFrameRate: 1 } }
    } as any);
    captured.getVideoTracks().forEach(t => t.stop());

    if (generation !== captureGeneration) {
        captured.getTracks().forEach(t => t.stop());
        return;
    }

    if (!captured.getAudioTracks().length) {
        captured.getTracks().forEach(t => t.stop());
        throw new Error("система не отдала аудиодорожку");
    }

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(captured);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;

    node.onaudioprocess = e => onAudioChunk(resample(e.inputBuffer.getChannelData(0), ctx.sampleRate));
    source.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);

    stream = captured;
    audioCtx = ctx;
    processor = node;
    pollTimer = setInterval(checkSegment, 100);
}

async function startCapture() {
    if (capturing || starting) return starting ?? undefined;

    const generation = captureGeneration;
    const source = settings.store.audioSource ?? "discord";

    starting = (async () => {
        try {
            if (source === "discord") await startDiscordSource(generation);
            else await startSystemSource(generation);

            if (generation !== captureGeneration) return;
            capturing = true;
            logger.info("Захват звука запущен, источник:", source);
        } catch (e) {
            logger.error("Не удалось захватить звук", e);
            showToast(`Субтитры: не удалось захватить звук (${(e as Error).message ?? e})`, Toasts.Type.FAILURE);
        } finally {
            // после stopCapture здесь может уже лежать новый запуск, его не трогаем
            if (generation === captureGeneration) starting = null;
        }
    })();

    return starting;
}

function stopCapture() {
    captureGeneration++;
    capturing = false;
    starting = null;

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    void Native.stopDiscordCapture();

    if (processor) processor.onaudioprocess = null;
    processor?.disconnect();
    audioCtx?.close().catch(() => { });
    stream?.getTracks().forEach(t => t.stop());
    stream = audioCtx = processor = null;

    preRoll = [];
    preRollLength = 0;
    recording = null;
    recordingLength = 0;
    speakingNow.clear();
    segmentSpeakers = new Map();
}

function onAudioChunk(chunk: Float32Array) {
    if (!chunk.length) return;

    if (recording) {
        recording.push(chunk);
        recordingLength += chunk.length;
    }

    preRoll.push(chunk);
    preRollLength += chunk.length;
    while (preRollLength - preRoll[0].length >= PRE_ROLL_SAMPLES) {
        preRollLength -= preRoll.shift()!.length;
    }
}

// Вызывается по таймеру, а не только при приходе звука: если Discord молчит, данных может не быть,
// а фрагмент всё равно надо закрыть
function checkSegment() {
    if (!recording) return;

    if (speakingNow.size === 0 && Date.now() - silentSince >= HANGOVER_MS) {
        finishSegment();
    } else if (recordingLength >= settings.store.maxSegmentSeconds * SAMPLE_RATE) {
        finishSegment();
        // человек всё ещё говорит — сразу начинаем следующий фрагмент без паузы
        if (speakingNow.size) beginSegment(false);
    }
}

function beginSegment(withPreRoll: boolean) {
    recording = withPreRoll ? [...preRoll] : [];
    recordingLength = withPreRoll ? preRollLength : 0;
    segmentSpeakers = new Map();

    const now = Date.now();
    for (const id of speakingNow.keys()) speakingNow.set(id, now);
}

function addSpeakingTime(userId: string, since: number, now: number) {
    segmentSpeakers.set(userId, (segmentSpeakers.get(userId) ?? 0) + Math.max(1, now - since));
}

function finishSegment() {
    if (!recording) return;

    const now = Date.now();
    for (const [id, since] of speakingNow) addSpeakingTime(id, since, now);

    const samples = new Float32Array(recordingLength);
    let offset = 0;
    for (const c of recording) {
        samples.set(c, offset);
        offset += c.length;
    }

    const speakers = [...segmentSpeakers.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    recording = null;
    recordingLength = 0;

    if (samples.length < MIN_SEGMENT_SEC * SAMPLE_RATE || !speakers.length) return;
    if (voicedSeconds(samples) < MIN_VOICED_SEC) return;

    enqueue({ wav: encodeWav(samples), speakers });
}

function voicedSeconds(samples: Float32Array) {
    const threshold = 10 ** (settings.store.silenceThresholdDb / 20);
    let voicedFrames = 0;

    for (let start = 0; start + VAD_FRAME <= samples.length; start += VAD_FRAME) {
        let sum = 0;
        for (let i = start; i < start + VAD_FRAME; i++) sum += samples[i] * samples[i];
        if (Math.sqrt(sum / VAD_FRAME) >= threshold) voicedFrames++;
    }

    return voicedFrames * VAD_FRAME / SAMPLE_RATE;
}

// Участник вышел из канала, не отправив SPEAKING с нулевыми флагами: засчитываем ему время до выхода и забываем
function dropSpeaker(userId: string) {
    const since = speakingNow.get(userId);
    if (since == null) return;

    speakingNow.delete(userId);
    if (recording) addSpeakingTime(userId, since, Date.now());
    if (!speakingNow.size) silentSince = Date.now();
}

function onVoiceStateUpdates({ voiceStates }: { voiceStates: { userId: string; channelId?: string | null; }[]; }) {
    const myChannel = SelectedChannelStore.getVoiceChannelId();
    for (const { userId, channelId } of voiceStates) {
        if (channelId !== myChannel) dropSpeaker(userId);
    }
}

function onVoiceChannelSelect() {
    // при переходе в другой канал все «говорящие» остались в старом
    for (const id of [...speakingNow.keys()]) dropSpeaker(id);
}

function encodeWav(samples: Float32Array): Uint8Array {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeStr = (pos: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(pos + i, s.charCodeAt(i)); };

    writeStr(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, samples.length * 2, true);

    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Uint8Array(buffer);
}

function onSpeaking({ userId, speakingFlags, context }: { userId: string; speakingFlags: number; context?: string; }) {
    if (context && context !== "default") return;
    if (!capturing || userId === UserStore.getCurrentUser()?.id) return;

    const now = Date.now();
    if (speakingFlags & (SPEAKING_VOICE | SPEAKING_PRIORITY)) {
        if (speakingNow.has(userId)) return;
        speakingNow.set(userId, now);
        if (!recording) beginSegment(true);
    } else {
        const since = speakingNow.get(userId);
        if (since == null) return;
        speakingNow.delete(userId);
        if (recording) addSpeakingTime(userId, since, now);
        if (!speakingNow.size) silentSince = now;
    }
}

// ---------- Распознавание и перевод ----------

interface Job {
    wav: Uint8Array;
    speakers: string[];
}

const MAX_QUEUE = 4;
const queue: Job[] = [];
let processing = false;
let pausedUntil = 0;
const lastToast: Record<string, number> = {};

function toastOnce(key: string, text: string, type = Toasts.Type.FAILURE) {
    const now = Date.now();
    if (now - (lastToast[key] ?? 0) < 60_000) return;
    lastToast[key] = now;
    showToast(text, type);
}

// Типичные фразы, которые Whisper выдумывает на шуме и тишине
const HALLUCINATIONS = [
    "субтитр", "dimatorzok", "продолжение следует", "спасибо за просмотр", "thanks for watching",
    "thank you for watching", "подписывайтесь на канал", "amara.org"
];
const HALLUCINATIONS_EXACT = new Set(["thank you", "you", "спасибо", "bye", "пока"]);

function isHallucination(text: string) {
    const norm = text.toLowerCase().replace(/[^\p{L}\p{N}\s.]/gu, "").replace(/\s+/g, " ").trim().replace(/\.+$/, "");
    return !norm || HALLUCINATIONS_EXACT.has(norm) || HALLUCINATIONS.some(h => norm.includes(h));
}

const MAX_NGRAM = 16;
const normalizeWord = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// Схлопывает зацикливание Whisper: "You can eat some food. You can eat some food. ..." → одна фраза.
// Фраза от 3 слов схлопывается уже при двух повторах подряд, короткие (1–2 слова) — от трёх, чтобы не ломать "нет, нет"
function collapseRepeats(text: string) {
    const words = text.split(/\s+/).filter(Boolean);
    const norm = words.map(normalizeWord);

    const sameNgram = (a: number, b: number, n: number) => {
        for (let k = 0; k < n; k++) if (norm[a + k] !== norm[b + k]) return false;
        return true;
    };

    let changed = true;
    while (changed) {
        changed = false;
        for (let n = 1; n <= Math.min(MAX_NGRAM, Math.floor(norm.length / 2)); n++) {
            for (let i = 0; i + 2 * n <= norm.length; i++) {
                let reps = 1;
                while (i + (reps + 1) * n <= norm.length && sameNgram(i, i + reps * n, n)) reps++;

                if (reps >= (n >= 3 ? 2 : 3)) {
                    words.splice(i + n, (reps - 1) * n);
                    norm.splice(i + n, (reps - 1) * n);
                    changed = true;
                }
            }
        }
    }

    return words.join(" ");
}

// Зацикливание бывает и между фрагментами: каждый новый кусок шума даёт ту же фразу
const RECENT_WINDOW_MS = 20_000;
const recentTexts: { norm: string; at: number; }[] = [];

function isRecentRepeat(text: string) {
    const words = text.split(/\s+/).map(normalizeWord).filter(Boolean);
    if (words.length < 3) return false;

    const norm = words.join(" ");
    const now = Date.now();
    while (recentTexts.length && now - recentTexts[0].at > RECENT_WINDOW_MS) recentTexts.shift();

    if (recentTexts.some(r => r.norm === norm)) return true;
    recentTexts.push({ norm, at: now });
    return false;
}

function enqueue(job: Job) {
    queue.push(job);
    // если Groq не успевает, лучше потерять старые фразы, чем показывать субтитры с опозданием на минуту
    while (queue.length > MAX_QUEUE) queue.shift();
    void processQueue();
}

async function processQueue() {
    if (processing) return;
    processing = true;

    try {
        while (queue.length) {
            const wait = pausedUntil - Date.now();
            if (wait > 0) await new Promise(r => setTimeout(r, wait));

            const job = queue.shift()!;
            try {
                await processJob(job);
            } catch (e) {
                logger.error("Ошибка обработки фрагмента", e);
            }
        }
    } finally {
        processing = false;
    }
}

// Тегу языка от Whisper на коротких фразах верить нельзя, поэтому смотрим на сам текст: одной буквы хватает
const CYRILLIC = /\p{Script=Cyrillic}/u;

// Whisper отдаёт язык то кодом ("en"), то названием ("english"/"English")
function isEnglishTag(language: string | undefined) {
    const tag = language?.trim().toLowerCase();
    return tag === "en" || tag === "english";
}

async function processJob({ wav, speakers }: Job) {
    const { apiKey, whisperModel, spokenLanguage, targetLanguage, translator, groqChatModel, showOriginal, ignoreRussian, onlyEnglish } = settings.store;
    const key = apiKey.trim();
    if (!key) {
        toastOnce("nokey", "Субтитры: укажи API-ключ Groq в настройках плагина VoiceSubtitles");
        return;
    }

    const res = await Native.transcribe(key, wav, whisperModel, spokenLanguage ?? "auto");
    if (!res.ok) {
        if (res.status === 401) toastOnce("auth", "Субтитры: Groq отклонил API-ключ");
        else if (res.status === 429) {
            pausedUntil = Date.now() + (res.retryAfter ?? 10) * 1000;
            toastOnce("ratelimit", "Субтитры: лимит запросов Groq исчерпан, жду");
        } else toastOnce("transcribe", `Субтитры: ошибка распознавания (${res.status ?? ""} ${res.error ?? ""})`);
        logger.warn("Groq transcription failed", res);
        return;
    }

    if (res.noSpeech) return;
    const original = collapseRepeats(res.text ?? "");
    if (isHallucination(original) || isRecentRepeat(original)) return;

    // проверяем до перевода, чтобы не тратить на русскую речь запрос к переводчику
    if (ignoreRussian && CYRILLIC.test(original)) return;
    // русская речь, которую Whisper принял за польский или другой язык, приходит уже латиницей,
    // и по тексту её не отличить. Тут остаётся только пропускать то, что Whisper назвал английским
    if (onlyEnglish && !isEnglishTag(res.language)) return;

    const target = LANGUAGES.find(l => l.code === targetLanguage) ?? LANGUAGES[0];
    const detected = res.language?.toLowerCase();
    let translated = original;

    if (detected !== target.name.toLowerCase() && detected !== target.whisper) {
        const tr = translator === "groq"
            ? await Native.translateGroq(key, groqChatModel, original, target.name)
            : await Native.translateGoogle(original, target.code);

        if (tr.ok && tr.text) translated = tr.text;
        else {
            toastOnce("translate", `Субтитры: ошибка перевода (${tr.error ?? "пустой ответ"})`);
            logger.warn("Translation failed", tr);
        }
    }

    pushLine({
        speakers,
        text: translated,
        original: showOriginal && translated !== original ? original : undefined
    });
}

// ---------- HUD ----------

interface Line {
    id: number;
    speakers: string[];
    text: string;
    original?: string;
}

let lines: Line[] = [];
let nextLineId = 0;
const lineListeners = new Set<() => void>();
const lineTimers = new Set<ReturnType<typeof setTimeout>>();
let hudRoot: Root | null = null;
let hudContainer: HTMLDivElement | null = null;

function setLines(next: Line[]) {
    lines = next;
    lineListeners.forEach(l => l());
    syncOverlay();
}

function syncOverlay() {
    if (!settings.store.desktopOverlay) return;

    void Native.overlayUpdate(lines.map(line => ({
        id: line.id,
        speakers: line.speakers.slice(0, 2).map(getSpeakerInfo),
        text: line.text,
        original: line.original
    })));
}

function pushLine(line: Omit<Line, "id">) {
    const id = nextLineId++;
    setLines([...lines, { ...line, id }].slice(-settings.store.maxLines));

    const timer = setTimeout(() => {
        lineTimers.delete(timer);
        setLines(lines.filter(l => l.id !== id));
    }, settings.store.displaySeconds * 1000);
    lineTimers.add(timer);
}

function getSpeakerInfo(userId: string) {
    const guildId = ChannelStore.getChannel(SelectedChannelStore.getVoiceChannelId()!)?.guild_id;
    const user = UserStore.getUser(userId);
    const member = guildId ? GuildMemberStore.getMember(guildId, userId) : null;

    return {
        name: member?.nick ?? (user as any)?.globalName ?? user?.username ?? userId,
        color: member?.colorString
    };
}

function Hud() {
    const [current, setCurrent] = React.useState(lines);
    // с Desktop Overlay субтитры рисует отдельное окно, внутри Discord их не дублируем
    const { desktopOverlay } = settings.use(["desktopOverlay"]);

    React.useEffect(() => {
        const listener = () => setCurrent(lines);
        lineListeners.add(listener);
        return () => void lineListeners.delete(listener);
    }, []);

    if (desktopOverlay || !current.length) return null;

    return (
        <div className={cl("hud")}>
            {current.map(line => (
                <div key={line.id} className={cl("line")}>
                    <div>
                        {line.speakers.slice(0, 2).map((id, i) => {
                            const { name, color } = getSpeakerInfo(id);
                            return (
                                <React.Fragment key={id}>
                                    {i > 0 && <span className={cl("name")}>, </span>}
                                    <span className={cl("name")} style={color ? { color } : undefined}>{name}</span>
                                </React.Fragment>
                            );
                        })}
                        <span className={cl("name")}>: </span>
                        <span className={cl("text")}>{line.text}</span>
                    </div>
                    {line.original && <div className={cl("original")}>{line.original}</div>}
                </div>
            ))}
        </div>
    );
}

function mountHud() {
    if (hudRoot) return;
    hudContainer = document.createElement("div");
    hudContainer.id = "vc-voice-subtitles-root";
    document.body.appendChild(hudContainer);
    hudRoot = createRoot(hudContainer);
    hudRoot.render(<Hud />);
}

function unmountHud() {
    hudRoot?.unmount();
    hudContainer?.remove();
    hudRoot = hudContainer = null;
    lineTimers.forEach(clearTimeout);
    lineTimers.clear();
    lines = [];
}

export default definePlugin({
    name: "VoiceSubtitles",
    description: "Recognizes the speech of voice channel members with Groq Whisper, translates it and shows subtitles at the top of the window",
    descriptionLocales: { ru: "Распознаёт речь участников голосового канала через Groq Whisper, переводит и показывает субтитры вверху окна" },
    authors: [{ name: "dsd16", id: 0n }],
    tags: ["SudoCord", "Voice", "Accessibility"],
    settings,

    flux: {
        SPEAKING: onSpeaking,
        VOICE_STATE_UPDATES: onVoiceStateUpdates,
        VOICE_CHANNEL_SELECT: onVoiceChannelSelect,
        RTC_CONNECTION_STATE({ state, context }: { state: string; context?: string; }) {
            if (context && context !== "default") return;
            if (state === "RTC_CONNECTED") void startCapture();
            else if (state === "DISCONNECTED") stopCapture();
        }
    },

    start() {
        mountHud();
        if (SelectedChannelStore.getVoiceChannelId()) void startCapture();
    },

    stop() {
        stopCapture();
        queue.length = 0;
        recentTexts.length = 0;
        unmountHud();
        void Native.overlayDestroy();
    }
});
