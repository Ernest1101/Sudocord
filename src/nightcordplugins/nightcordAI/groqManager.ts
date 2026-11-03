/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { Logger } from "@utils/Logger";

const logger = new Logger("GroqManager");

const DS_API_KEY = "groq-shared-api-key";

const DEFAULT_GROQ_MODELS = [
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "qwen/qwen3.8-27b",
    "allam-2-7b",
] as const;

let knownValidModels: string[] = [...DEFAULT_GROQ_MODELS];
let lastModelFetch = 0;
const permanentlyUnavailableModels = new Set<string>();
const modelCooldown: Record<string, number> = {};
let currentModelIdx = 0;

async function refreshGroqModels(apiKey: string): Promise<string[]> {
    const now = Date.now();
    if (now - lastModelFetch < 300_000 && knownValidModels.length > 0) {
        return knownValidModels.filter(m => !permanentlyUnavailableModels.has(m));
    }
    try {
        const res = await fetch("https://api.groq.com/openai/v1/models", {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data?.data)) {
                const apiModels: string[] = data.data
                    .map((m: any) => m?.id)
                    .filter((id: string) =>
                        typeof id === "string" &&
                        !id.includes("whisper") &&
                        !id.includes("prompt-guard") &&
                        !id.includes("safeguard") &&
                        !id.includes("orpheus") &&
                        !id.includes("embed") &&
                        !id.includes("tts")
                    );
                if (apiModels.length > 0) {
                    const preferredOrder = [
                        "openai/gpt-oss-20b",
                        "openai/gpt-oss-120b",
                        "qwen/qwen3.8-27b",
                        "allam-2-7b",
                    ];
                    apiModels.sort((a, b) => {
                        const idxA = preferredOrder.indexOf(a);
                        const idxB = preferredOrder.indexOf(b);
                        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                        if (idxA !== -1) return -1;
                        if (idxB !== -1) return 1;
                        return a.localeCompare(b);
                    });
                    knownValidModels = apiModels;
                    lastModelFetch = now;
                }
            }
        }
    } catch (e) {
        logger.warn("Could not query Groq models list:", e);
    }
    return knownValidModels.filter(m => !permanentlyUnavailableModels.has(m));
}

let _settingsFallback: (() => string) | null = null;

export function registerSettingsFallback(fn: () => string) {
    _settingsFallback = fn;
}

export async function getGroqKey(): Promise<string> {
    const key = await DataStore.get(DS_API_KEY);
    if (typeof key === "string" && key.trim()) {
        return key.trim();
    }
    if (_settingsFallback) {
        try {
            const fallback = _settingsFallback();
            if (typeof fallback === "string" && fallback.trim()) {
                return fallback.trim();
            }
        } catch (err) {
            logger.error("Failed to run settings fallback function", err);
        }
    }
    return "";
}

export async function setGroqKey(key: string): Promise<void> {
    if (typeof key !== "string") {
        throw new Error("API key must be a string");
    }
    await DataStore.set(DS_API_KEY, key.trim());
}

function getAvailableModel(candidatePool?: string[]): string {
    const pool = (candidatePool && candidatePool.length > 0 ? candidatePool : knownValidModels)
        .filter(m => !permanentlyUnavailableModels.has(m));

    if (pool.length === 0) {
        return DEFAULT_GROQ_MODELS[0];
    }

    const now = Date.now();
    for (let i = 0; i < pool.length; i++) {
        const idx = (currentModelIdx + i) % pool.length;
        const model = pool[idx];
        const cooldownUntil = modelCooldown[model] ?? 0;
        if (now >= cooldownUntil) {
            currentModelIdx = idx;
            return model;
        }
    }

    let minCooldown = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < pool.length; i++) {
        const cd = modelCooldown[pool[i]] ?? 0;
        if (cd < minCooldown) {
            minCooldown = cd;
            bestIdx = i;
        }
    }
    currentModelIdx = bestIdx;
    return pool[bestIdx];
}

function markModelRateLimited(model: string, retryAfterMs = 60_000): void {
    modelCooldown[model] = Date.now() + retryAfterMs;
    logger.warn(`Model ${model} in cooldown for ${retryAfterMs / 1000}s`);
    currentModelIdx = (currentModelIdx + 1) % knownValidModels.length;
}

function markModelPermanentlyUnavailable(model: string): void {
    permanentlyUnavailableModels.add(model);
    modelCooldown[model] = Date.now() + 86400_000;
    logger.warn(`Model ${model} marked permanently unavailable for this session`);
    currentModelIdx = (currentModelIdx + 1) % knownValidModels.length;
}

let queue = Promise.resolve();
const MIN_DELAY_MS = 200;

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = queue.then(() => fn());
    queue = result.then(
        () => new Promise(r => setTimeout(r, MIN_DELAY_MS)),
        () => new Promise(r => setTimeout(r, MIN_DELAY_MS)),
    );
    return result;
}

export interface GroqChatMessage {
    role: "system" | "user" | "assistant";
    content: string | any[];
}

export interface GroqCallOptions {
    messages: GroqChatMessage[];
    temperature?: number;
    maxTokens?: number;
    forceModel?: string;
    maxRetries?: number;
    timeoutMs?: number;
    immediate?: boolean;
    triedModels?: Set<string>;
}

export async function groqChat(opts: GroqCallOptions): Promise<string> {
    if (!opts || typeof opts !== "object") {
        throw new Error("Invalid options object");
    }
    if (!Array.isArray(opts.messages)) {
        throw new Error("Messages must be an array");
    }
    for (const msg of opts.messages) {
        if (!msg || typeof msg !== "object") {
            throw new Error("Invalid message object");
        }
        if (msg.role !== "system" && msg.role !== "user" && msg.role !== "assistant") {
            throw new Error(`Invalid message role: ${msg.role}`);
        }
        if (typeof msg.content !== "string" && !Array.isArray(msg.content)) {
            throw new Error("Message content must be a string or array");
        }
    }
    if (opts.immediate) {
        return _groqChat(opts);
    }
    return enqueue(() => _groqChat(opts));
}

async function _groqChat(opts: GroqCallOptions, attempt = 0): Promise<string> {
    const { messages, temperature = 0.7, maxTokens = 1000, forceModel, maxRetries = 6, timeoutMs = 30_000 } = opts;

    const apiKey = await getGroqKey();
    if (!apiKey) {
        throw new Error("Groq API key missing — configure it in Settings → NightcordAI");
    }

    const availablePool = await refreshGroqModels(apiKey);
    const tried = opts.triedModels ?? new Set<string>();

    let model = forceModel;
    if (!model || tried.has(model)) {
        const untried = availablePool.filter(m => !tried.has(m));
        model = getAvailableModel(untried.length > 0 ? untried : availablePool);
    }
    tried.add(model);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                temperature,
                max_tokens: maxTokens,
                messages,
            }),
            signal: controller.signal,
        });

        if (res.status === 429) {
            if (attempt >= maxRetries) {
                throw new Error("Groq rate limit — try again in a moment");
            }

            const retryAfterHeader = res.headers.get("retry-after");
            let retryAfterMs = 60_000;
            if (retryAfterHeader) {
                const parsed = parseInt(retryAfterHeader, 10);
                if (!isNaN(parsed) && parsed > 0) {
                    retryAfterMs = Math.min(300_000, parsed * 1000);
                }
            }

            markModelRateLimited(model, retryAfterMs);
            return _groqChat({ ...opts, forceModel: undefined, triedModels: tried }, attempt + 1);
        }

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            // Handle model decommissioned or model not found / no access error
            if (
                res.status === 400 ||
                res.status === 404 ||
                body.includes("model_not_found") ||
                body.includes("model_decommissioned") ||
                body.includes("does not exist or you do not have access")
            ) {
                logger.warn(`Model ${model} is not available on Groq (${res.status}). Switching to next model...`);
                markModelPermanentlyUnavailable(model);
                if (attempt < maxRetries) {
                    return _groqChat({ ...opts, forceModel: undefined, triedModels: tried }, attempt + 1);
                }
            }
            throw new Error(`Groq API ${res.status}: ${body.slice(0, 200)}`);
        }

        const data = await res.json().catch(() => null);
        if (!data || typeof data !== "object") {
            throw new Error("Invalid response JSON from Groq");
        }

        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== "string") {
            throw new Error("Groq response did not return a valid content string");
        }

        return content.trim();
    } catch (err: any) {
        if (err.name === "AbortError") {
            throw new Error("Groq API request timed out after 30 seconds");
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}

export function getCurrentModel(): string {
    return knownValidModels.find(m => !permanentlyUnavailableModels.has(m)) ?? DEFAULT_GROQ_MODELS[0];
}
