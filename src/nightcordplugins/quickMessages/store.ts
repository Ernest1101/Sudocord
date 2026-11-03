/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

export interface QuickMessage {
    id: string;
    title: string;
    content: string;
    createdAt: number;
    updatedAt: number;
}

const STORAGE_KEY = "nightcord_quick_messages";

const DEFAULT_PRESETS: QuickMessage[] = [
    {
        id: "default-welcome",
        title: "Welcome Greeting",
        content: "Welcome to the server! Please make sure to check the rules and enjoy your stay.",
        createdAt: 1700000000000,
        updatedAt: 1700000000000
    },
    {
        id: "default-brb",
        title: "Be Right Back",
        content: "I'll be right back, stepping away for a few minutes.",
        createdAt: 1700000001000,
        updatedAt: 1700000001000
    },
    {
        id: "default-thanks",
        title: "Thank You",
        content: "Thank you so much for your help, I really appreciate it!",
        createdAt: 1700000002000,
        updatedAt: 1700000002000
    }
];

let cachedMessages: QuickMessage[] = [];
let isLoaded = false;
const listeners = new Set<() => void>();

function notify() {
    for (const listener of listeners) {
        try {
            listener();
        } catch (e) {
            console.error("[QuickMessages] Listener error:", e);
        }
    }
}

export function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getQuickMessages(): QuickMessage[] {
    return [...cachedMessages];
}

export async function loadQuickMessages(): Promise<QuickMessage[]> {
    if (isLoaded) return [...cachedMessages];
    try {
        const stored = await DataStore.get<QuickMessage[]>(STORAGE_KEY);
        if (Array.isArray(stored) && stored.length > 0) {
            cachedMessages = stored;
        } else {
            cachedMessages = [...DEFAULT_PRESETS];
            await DataStore.set(STORAGE_KEY, cachedMessages);
        }
    } catch (e) {
        console.error("[QuickMessages] Failed to load messages from DataStore:", e);
        cachedMessages = [...DEFAULT_PRESETS];
    }
    isLoaded = true;
    notify();
    return [...cachedMessages];
}

export async function saveQuickMessage(data: { id?: string; title: string; content: string }): Promise<QuickMessage> {
    await loadQuickMessages();
    const now = Date.now();
    let updatedItem: QuickMessage;

    if (data.id) {
        const index = cachedMessages.findIndex(m => m.id === data.id);
        if (index !== -1) {
            updatedItem = {
                ...cachedMessages[index],
                title: data.title.trim(),
                content: data.content,
                updatedAt: now
            };
            cachedMessages[index] = updatedItem;
        } else {
            updatedItem = {
                id: data.id,
                title: data.title.trim(),
                content: data.content,
                createdAt: now,
                updatedAt: now
            };
            cachedMessages.unshift(updatedItem);
        }
    } else {
        updatedItem = {
            id: `qm_${now}_${Math.random().toString(36).substring(2, 9)}`,
            title: data.title.trim(),
            content: data.content,
            createdAt: now,
            updatedAt: now
        };
        cachedMessages.unshift(updatedItem);
    }

    try {
        await DataStore.set(STORAGE_KEY, cachedMessages);
    } catch (e) {
        console.error("[QuickMessages] Failed to save messages to DataStore:", e);
    }

    notify();
    return updatedItem;
}

export async function deleteQuickMessage(id: string): Promise<void> {
    await loadQuickMessages();
    cachedMessages = cachedMessages.filter(m => m.id !== id);
    try {
        await DataStore.set(STORAGE_KEY, cachedMessages);
    } catch (e) {
        console.error("[QuickMessages] Failed to persist delete in DataStore:", e);
    }
    notify();
}
