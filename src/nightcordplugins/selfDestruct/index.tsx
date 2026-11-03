/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { addMessagePreSendListener, removeMessagePreSendListener } from "@api/MessageEvents";
import { updateMessage } from "@api/MessageUpdater";
import { definePluginSettings } from "@api/Settings";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps } from "@webpack";
import { MessageStore, React, RestAPI, UserStore } from "@webpack/common";

import plugins from "~plugins";

// ── Settings ───────────────────────────────────────────────────────────────────

const settings = definePluginSettings({
    active: {
        type: OptionType.BOOLEAN,
        description: "SelfDestruct active (toggle in chat bar)",
        default: false,
        restartNeeded: false,
    },
    delay: {
        type: OptionType.SLIDER,
        description: "Delay before deletion (up to 3 hours)",
        markers: [5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600, 7200, 10800],
        default: 30,
        stickToMarkers: false,
        restartNeeded: false,
    },
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDelayReadable(sec: number): string {
    if (sec >= 3600) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    if (sec >= 60) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return s > 0 ? `${m}m ${s}s` : `${m}m`;
    }
    return `${sec}s`;
}

function formatCountdown(remainingSec: number): string {
    if (remainingSec <= 0) return "0s";
    const h = Math.floor(remainingSec / 3600);
    const m = Math.floor((remainingSec % 3600) / 60);
    const s = remainingSec % 60;
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    if (m > 0) {
        return `${m}:${s.toString().padStart(2, "0")}`;
    }
    return `${s}s`;
}

// ── Timer tracking & Persistence ───────────────────────────────────────────────

interface TimerEntry {
    channelId: string;
    messageId: string;
    expiresAt: number;
    timerId: ReturnType<typeof setTimeout>;
}

interface PersistedTimer {
    channelId: string;
    messageId: string;
    expiresAt: number;
}

const STORAGE_KEY = "nc_selfdestruct_active_timers";

const activeTimers = new Map<string, TimerEntry>();
const nonceToRealId = new Map<string, string>();
const timerListeners = new Set<() => void>();

// Maps nonce -> { channelId, delaySec, sentAt } for pre-send tracking
const sentNonces = new Map<string, { channelId: string; delaySec: number; sentAt: number; }>();

let unlistenPreSend: any = null;

function notifyListeners() {
    for (const fn of timerListeners) {
        try { fn(); } catch { }
    }
}

function saveTimersToStorage() {
    try {
        const data: PersistedTimer[] = [];
        const now = Date.now();
        for (const [, entry] of activeTimers.entries()) {
            if (entry.expiresAt > now) {
                data.push({
                    channelId: entry.channelId,
                    messageId: entry.messageId,
                    expiresAt: entry.expiresAt,
                });
            }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { }
}

function getTimer(id?: string): TimerEntry | undefined {
    if (!id) return undefined;
    const strId = String(id);
    if (activeTimers.has(strId)) return activeTimers.get(strId);
    const realId = nonceToRealId.get(strId);
    if (realId && activeTimers.has(realId)) return activeTimers.get(realId);
    // Reverse check
    for (const [nonce, real] of nonceToRealId.entries()) {
        if (real === strId && activeTimers.has(nonce)) {
            return activeTimers.get(nonce);
        }
    }
    return undefined;
}

function transferTimer(oldId: any, newId: any) {
    if (!oldId || !newId) return;
    const strOld = String(oldId);
    const strNew = String(newId);
    if (strOld === strNew) return;

    nonceToRealId.set(strOld, strNew);
    const existing = activeTimers.get(strOld);
    if (existing) {
        existing.messageId = strNew;
        activeTimers.delete(strOld);
        activeTimers.set(strNew, existing);
        saveTimersToStorage();
        notifyListeners();
    }
}

async function doDeleteMessage(channelId: string, messageId: string) {
    let realId = nonceToRealId.get(String(messageId)) ?? String(messageId);

    // If realId might still be a nonce, resolve against MessageStore
    try {
        const msgs = (MessageStore as any)?.getMessages?.(channelId);
        if (msgs) {
            const arr = typeof msgs.toArray === "function" ? msgs.toArray() : Array.isArray(msgs) ? msgs : [];
            for (const m of arr) {
                if (String(m.nonce) === String(messageId) || String(m.id) === realId) {
                    realId = String(m.id);
                    break;
                }
            }
        }
    } catch { }

    // 1. Authoritative Discord REST API deletion
    try {
        const res = await RestAPI.del({ url: `/channels/${channelId}/messages/${realId}` });
        if (res?.ok || res?.status === 204 || res?.status === 200 || res?.status === 404) {
            // Deleted successfully
        }
    } catch (err: any) {
        const status = err?.status || err?.statusCode;
        if (status === 404 || err?.body?.code === 10008) {
            // Already deleted
        } else if (status === 429) {
            const retryAfter = (err?.body?.retry_after ?? 1) * 1000;
            setTimeout(() => {
                RestAPI.del({ url: `/channels/${channelId}/messages/${realId}` }).catch(() => { });
            }, retryAfter);
        } else {
            console.warn("[SelfDestruct] RestAPI.del error:", err);
        }
    }

    // 2. Local optimistic deletion in client
    try {
        const actions = (findByProps("deleteMessage", "sendMessage") || findByProps("deleteMessage")) as any;
        if (typeof actions?.deleteMessage === "function") {
            actions.deleteMessage(channelId, realId);
        }
    } catch { }
}

function scheduleDelete(channelId: string, messageId: string, delaySec: number, targetExpiresAt?: number) {
    const strId = String(messageId);
    if (getTimer(strId)) return;

    const expiresAt = targetExpiresAt ?? (Date.now() + delaySec * 1000);
    const actualDelayMs = Math.max(0, expiresAt - Date.now());

    const timerId = setTimeout(async () => {
        const realId = nonceToRealId.get(strId) ?? strId;
        activeTimers.delete(strId);
        activeTimers.delete(realId);
        saveTimersToStorage();
        notifyListeners();

        try {
            await doDeleteMessage(channelId, realId);
        } catch (e) {
            console.error("[SelfDestruct] Delete failed:", e);
        }

        try {
            updateMessage(channelId, realId);
        } catch { }
        try {
            MessageStore.emitChange();
        } catch { }
    }, actualDelayMs);

    activeTimers.set(strId, { channelId, messageId: strId, expiresAt, timerId });
    saveTimersToStorage();
    notifyListeners();

    // Trigger re-render of message so TimerBadge appears immediately
    try {
        updateMessage(channelId, strId);
    } catch { }
    try {
        MessageStore.emitChange();
    } catch { }

    setTimeout(() => {
        try {
            const realId = nonceToRealId.get(strId) ?? strId;
            updateMessage(channelId, realId);
            MessageStore.emitChange();
        } catch { }
    }, 150);
}

function cancelTimer(id: string) {
    const strId = String(id);
    const realId = nonceToRealId.get(strId) ?? strId;
    const entry = activeTimers.get(strId) || activeTimers.get(realId);
    if (entry) {
        clearTimeout(entry.timerId);
        activeTimers.delete(entry.messageId);
        activeTimers.delete(strId);
        activeTimers.delete(realId);
        saveTimersToStorage();
        notifyListeners();
        try {
            updateMessage(entry.channelId, entry.messageId);
            MessageStore.emitChange();
        } catch { }
    }
}

function cleanup() {
    for (const [, entry] of activeTimers) {
        clearTimeout(entry.timerId);
    }
    activeTimers.clear();
    nonceToRealId.clear();
    sentNonces.clear();
    timerListeners.clear();
}

function restorePersistedTimers() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const list: PersistedTimer[] = JSON.parse(raw);
        if (!Array.isArray(list)) return;

        const now = Date.now();
        for (const item of list) {
            if (!item.channelId || !item.messageId || !item.expiresAt) continue;
            const remainingSec = Math.ceil((item.expiresAt - now) / 1000);
            if (remainingSec <= 0) {
                // Expired while client was closed -> delete immediately
                doDeleteMessage(item.channelId, item.messageId);
            } else {
                scheduleDelete(item.channelId, item.messageId, remainingSec, item.expiresAt);
            }
        }
    } catch (e) {
        console.warn("[SelfDestruct] Failed to restore persisted timers:", e);
    }
}

// ── Timer Badge Component (rendered directly under message content) ─────────────

function TimerBadge({ messageId }: { messageId: string; }) {
    const [remaining, setRemaining] = React.useState<number | null>(() => {
        const entry = getTimer(messageId);
        if (!entry) return null;
        return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
    });

    React.useEffect(() => {
        function update() {
            const entry = getTimer(messageId);
            if (!entry) {
                setRemaining(null);
                return;
            }
            const left = Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
            setRemaining(left);
        }

        update();
        const interval = setInterval(update, 500);

        const listener = () => update();
        timerListeners.add(listener);

        return () => {
            clearInterval(interval);
            timerListeners.delete(listener);
        };
    }, [messageId]);

    if (remaining === null) return null;

    const timeStr = formatCountdown(remaining);

    return (
        <div style={{ display: "flex", width: "100%", marginTop: "4px" }}>
            <div
                className="nc-selfdestruct-timer"
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(237, 66, 69, 0.15)",
                    color: "#ed4245",
                    fontSize: "12px",
                    fontWeight: 600,
                    fontFamily: "var(--font-primary)",
                    lineHeight: "18px",
                    userSelect: "none",
                    cursor: "pointer",
                    width: "fit-content",
                }}
                onClick={e => {
                    e.stopPropagation();
                    cancelTimer(messageId);
                }}
                title={t("SelfDestruct — this message will be deleted automatically") + " (" + t("click to cancel") + ")"}
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" stroke="#ed4245" strokeWidth="2.5" fill="none" />
                    <path d="M12 6v6l4 2" stroke="#ed4245" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <span>{timeStr}</span>
            </div>
        </div>
    );
}

// ── Chat Bar Icon ──────────────────────────────────────────────────────────────

function SelfDestructIcon({ active, width = 20, height = 20 }: { active?: boolean; width?: number; height?: number; }) {
    return (
        <svg
            aria-hidden="true"
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            width={width}
            height={height}
            fill="none"
            viewBox="0 0 24 24"
            style={{ color: active ? "#ed4245" : "currentColor" }}
        >
            <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
            <path d="M12 9v4l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 5V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M10 3h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            {!active && (
                <path
                    fill="var(--status-danger)"
                    d="M21.178 1.707 22.592 3.12 4.12 21.593l-1.414-1.415L21.178 1.707Z"
                />
            )}
        </svg>
    );
}

// ── Chat Bar Button ────────────────────────────────────────────────────────────

const SelfDestructButton: ChatBarButtonFactory = ({ isMainChat }) => {
    const [active, setActive] = React.useState(settings.store.active);

    if (!isMainChat) return null;

    function toggle() {
        settings.store.active = !settings.store.active;
        setActive(settings.store.active);
    }

    const delaySec = settings.store.delay ?? 30;
    const delayStr = formatDelayReadable(delaySec);

    const tooltip = active
        ? t("SelfDestruct: ON") + ` (${delayStr}) — ` + t("click to disable")
        : t("SelfDestruct: OFF — click to enable");

    return (
        <ChatBarButton
            tooltip={tooltip}
            onClick={toggle}
            onContextMenu={e => {
                e.preventDefault();
                openPluginModal(plugins.SelfDestruct ?? plugins.selfDestruct);
            }}
        >
            <SelfDestructIcon active={active} />
        </ChatBarButton>
    );
};

// ── Message Handlers ───────────────────────────────────────────────────────────

function handleIncomingMessage(event: any) {
    if (!settings.store.active && sentNonces.size === 0) return;

    const message = event?.message;
    if (!message) return;

    const channelId = event?.channelId || message?.channel_id || message?.channelId;
    if (!channelId) return;

    const currentUserId = UserStore?.getCurrentUser?.()?.id;
    const authorId = message?.author?.id ?? message?.authorId;

    // Check if this message matches a nonce captured during pre-send
    const msgNonce = message.nonce ? String(message.nonce) : undefined;
    const preSent = msgNonce ? sentNonces.get(msgNonce) : undefined;

    const isOurMessage = (authorId && currentUserId && authorId === currentUserId) || !!preSent;
    if (!isOurMessage) return;

    if (!settings.store.active && !preSent) return;

    const delaySec = preSent?.delaySec ?? settings.store.delay ?? 30;
    const targetChannelId = channelId || preSent?.channelId;
    const rawId = String(message.id);

    // If message has a nonce and real ID, transfer timer immediately
    if (msgNonce && rawId && msgNonce !== rawId) {
        transferTimer(msgNonce, rawId);
    }

    // Schedule deletion if not yet tracked
    if (!getTimer(rawId) && (!msgNonce || !getTimer(msgNonce))) {
        scheduleDelete(targetChannelId, rawId, delaySec);
        if (msgNonce) {
            nonceToRealId.set(msgNonce, rawId);
        }
    }
}

// ── Plugin ─────────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "SelfDestruct",
    description: "Sends messages that are automatically deleted after a configurable delay. Red timer visible on each message.",
    authors: [{
        name: "Nightcord",
        id: 0n
    }],
    dependencies: ["ChatInputButtonAPI", "MessageEventsAPI", "MessageUpdaterAPI"],
    settings,

    chatBarButton: {
        icon: () => <SelfDestructIcon active={settings.store.active} />,
        render: SelfDestructButton,
    },

    patches: [
        {
            find: '.CUSTOM_GIFT?""',
            replacement: [
                {
                    match: /childrenMessageContent:(\i),/g,
                    replace: "childrenMessageContent:$self.wrapContent($1,arguments[0]?.message?.id),",
                },
            ],
        },
    ],

    wrapContent(content: any, messageId: string) {
        if (!messageId || !getTimer(messageId)) return content;
        return (
            <>
                {content}
                <TimerBadge messageId={messageId} />
            </>
        );
    },

    flux: {
        MESSAGE_CREATE(event: any) {
            handleIncomingMessage(event);
        },
        MESSAGE_UPDATE(event: any) {
            handleIncomingMessage(event);
        },
        MESSAGE_DELETE(event: any) {
            const id = event?.id || event?.message?.id;
            if (id) cancelTimer(String(id));
        }
    },

    start() {
        restorePersistedTimers();

        unlistenPreSend = addMessagePreSendListener((channelId, _messageObj, options) => {
            if (!settings.store.active) return;
            const delaySec = settings.store.delay ?? 30;
            const nonce = (options as any)?.nonce;
            if (nonce) {
                sentNonces.set(String(nonce), {
                    channelId,
                    delaySec,
                    sentAt: Date.now(),
                });
                // Prune old entries after 5 minutes
                if (sentNonces.size > 50) {
                    const threshold = Date.now() - 300000;
                    for (const [k, v] of sentNonces.entries()) {
                        if (v.sentAt < threshold) sentNonces.delete(k);
                    }
                }
            }
        });
    },

    stop() {
        if (unlistenPreSend) {
            removeMessagePreSendListener(unlistenPreSend);
            unlistenPreSend = null;
        }
        cleanup();
    },
});
