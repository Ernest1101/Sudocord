/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps } from "@webpack";
import { Constants, RestAPI, SnowflakeUtils, UserStore } from "@webpack/common";

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable automatic message restoration",
        default: true,
    },
    dmProtection: {
        type: OptionType.BOOLEAN,
        description: "Also protect DMs (not just servers)",
        default: false,
    },
    maxCacheSize: {
        type: OptionType.NUMBER,
        description: "Maximum number of messages kept in cache",
        default: 500,
    },
    serverBlacklist: {
        type: OptionType.STRING,
        description: "Server IDs to ignore (comma-separated). Messages sent in these servers will NOT be resent.",
        default: "",
        placeholder: "e.g. 123456789, 987654321",
    }
});

const DB_KEY = "AntiDeleteMessage_cache";

interface CachedMessage {
    content: string;
    channelId: string;
    nonce: string;
    guildId?: string;
    messageReference?: {
        channel_id: string;
        message_id: string;
        guild_id?: string;
    };
    savedAt: number; // timestamp for cache cleanup
}

// messages you deleted yourself: those must stay deleted
const selfDeleted = new Set<string>();
// nonces of messages this plugin sent back: a restored message is restored only once, otherwise
// a bot/automod deleting it again starts an endless resend loop (one message turning into 5+)
const resentNonces = new Set<string>();

let messageActions: any = null;
let originalDeleteMessage: ((...args: any[]) => any) | null = null;

function rememberFor(set: Set<string>, id: string, ms: number) {
    set.add(id);
    setTimeout(() => set.delete(id), ms);
}

// In-memory cache — mirror of IndexedDB for fast access
let memCache: Record<string, CachedMessage> = {};
let dbLoaded = false;

// Load cache from IndexedDB on startup
async function loadCache() {
    try {
        const stored = await DataStore.get<Record<string, CachedMessage>>(DB_KEY);
        if (stored) {
            memCache = stored;
        }
        dbLoaded = true;
    } catch (e) {
        console.warn("[AntiDeleteMessage] Failed to load cache:", e);
        dbLoaded = true;
    }
}

// Persist cache to IndexedDB (debounced to avoid writing on every message)
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try {
            await DataStore.set(DB_KEY, memCache);
        } catch (e) {
            console.warn("[AntiDeleteMessage] Failed to save cache:", e);
        }
    }, 1000); // writes to disk 1s after the last received message
}

function getBlacklistedGuildIds(): Set<string> {
    const raw = settings.store.serverBlacklist ?? "";
    return new Set(
        raw.split(",")
            .map(s => s.trim())
            .filter(s => s.length > 0)
    );
}

function addToCache(messageId: string, data: CachedMessage) {
    const maxSize = settings.store.maxCacheSize ?? 500;

    // Evict oldest entries if cache exceeds the limit
    const ids = Object.keys(memCache);
    if (ids.length >= maxSize) {
        // Sort by savedAt and remove the oldest 10%
        const sorted = ids.sort((a, b) => (memCache[a].savedAt ?? 0) - (memCache[b].savedAt ?? 0));
        const toDelete = Math.max(1, Math.floor(maxSize * 0.1));
        for (let i = 0; i < toDelete; i++) delete memCache[sorted[i]];
    }

    memCache[messageId] = data;
    scheduleSave();
}

async function resendMessage(cached: CachedMessage) {
    try {
        const body: any = {
            content: cached.content,
            flags: 0,
            mobile_network_type: "unknown",
            nonce: SnowflakeUtils.fromTimestamp(Date.now()),
            tts: false,
        };
        rememberFor(resentNonces, body.nonce, 5 * 60 * 1000);

        if (cached.messageReference) {
            body.message_reference = cached.messageReference;
        }

        await RestAPI.post({
            url: Constants.Endpoints.MESSAGES(cached.channelId),
            body
        });
    } catch (err) {
        console.warn("[AntiDeleteMessage] Failed to resend message:", err);
    }
}

export default definePlugin({
    name: "AntiDeleteMessage",
    description: "Automatically resends your messages if someone deletes them. Cache persisted across restarts.",
    authors: [{ name: "Nightcord",
     id: 0n }],
    settings,

    flux: {
        MESSAGE_CREATE({ message, guildId, optimistic }: {
            optimistic?: boolean;
            message: {
                id: string;
                author: { id: string; };
                content: string;
                channel_id: string;
                nonce?: string;
                message_reference?: any;
                attachments?: { url: string; }[];
                state?: string;
            };
            guildId?: string;
        }) {
            if (!settings.store.enabled) return;
            if (!dbLoaded) return; // not ready yet

            // local echo of a message that is still sending (or failed): not on the server yet
            if (optimistic || (message.state && message.state !== "SENT")) return;

            // a message we restored ourselves: don't restore it a second time
            if (message.nonce && resentNonces.has(message.nonce)) return;

            const currentUser = UserStore.getCurrentUser();
            if (!currentUser || message.author.id !== currentUser.id) return;

            // Ignore messages with no text content (stickers, etc.)
            if (!message.content?.trim()) return;

            // Ignore DMs if the option is disabled
            if (!guildId && !settings.store.dmProtection) return;

            // Ignore servers in the blacklist
            if (guildId && getBlacklistedGuildIds().has(guildId)) return;

            addToCache(message.id, {
                content: message.content,
                channelId: message.channel_id,
                nonce: message.id,
                guildId,
                messageReference: message.message_reference,
                savedAt: Date.now(),
            });
        },

        MESSAGE_DELETE({ id, channelId }: { id: string; channelId: string; }) {
            if (!settings.store.enabled) return;

            const cached = memCache[id];
            if (!cached) return;

            // you deleted it yourself
            if (selfDeleted.has(id)) {
                selfDeleted.delete(id);
                delete memCache[id];
                scheduleSave();
                return;
            }

            // Check blacklist at delete-time too (in case the setting changed)
            if (cached.guildId && getBlacklistedGuildIds().has(cached.guildId)) {
                delete memCache[id];
                scheduleSave();
                return;
            }

            // Remove from cache to prevent infinite loops
            delete memCache[id];
            scheduleSave();

            setTimeout(() => resendMessage(cached), 400);
        },
    },

    async start() {
        // remember messages deleted from this client, so only deletions by others get restored
        try {
            messageActions = findByProps("deleteMessage", "editMessage", "sendMessage");
            originalDeleteMessage = messageActions.deleteMessage;
            if (typeof originalDeleteMessage !== "function") throw new Error("deleteMessage not found");
            const hooked = function (this: unknown, channelId: string, messageId: string, ...rest: any[]) {
                rememberFor(selfDeleted, messageId, 60 * 1000);
                return originalDeleteMessage!.call(this, channelId, messageId, ...rest);
            };
            try {
                messageActions.deleteMessage = hooked;
            } catch { /* getter-only export, handled below */ }
            if (messageActions.deleteMessage !== hooked)
                Object.defineProperty(messageActions, "deleteMessage", { configurable: true, enumerable: true, writable: true, value: hooked });
        } catch (e) {
            // without the hook your own deletions would be resent, so stay idle instead
            console.error("[AntiDeleteMessage] could not hook deleteMessage, plugin stays idle", e);
            messageActions = originalDeleteMessage = null;
            return;
        }
        await loadCache();
    },

    stop() {
        if (messageActions && originalDeleteMessage) messageActions.deleteMessage = originalDeleteMessage;
        messageActions = originalDeleteMessage = null;
        selfDeleted.clear();
        resentNonces.clear();
        if (saveTimer) {
            clearTimeout(saveTimer);
            // Final synchronous save
            DataStore.set(DB_KEY, memCache).catch(() => {});
        }
        memCache = {};
        dbLoaded = false;
    }
});
