/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { Card } from "@components/Card";
import { Flex, FlexAlign, FlexJustify } from "@components/Flex";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import {
    Button,
    ChannelStore,
    IconUtils,
    MessageStore,
    NavigationRouter,
    React,
    RelationshipStore,
    RestAPI,
    SelectedChannelStore,
    showToast,
    Text,
    Toasts,
    useEffect,
    UserStore,
    useState } from "@webpack/common";

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<]+|discord\.(?:gg|io|me|li)\/[^\s<]+|(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|xyz|ru|to|gg|top|gift|click|site|online|store|link|info|biz|club|live|shop|app|io|dev|me)(?:\/[^\s<]*)?/i;

const HISTORY_KEY = "AntiDMAll_blocked_history";

export interface BlockedDMEntry {
    userId: string;
    username: string;
    avatar: string | null;
    discriminator?: string;
    content: string;
    channelId: string;
    timestamp: number;
}

const settings = definePluginSettings({
    targetMode: {
        type: OptionType.SELECT,
        description: "Target accounts to filter for DM-all spam.",
        options: [
            { label: "Discord Bots Only", value: "bots_only", default: true },
            { label: "All Unknown Accounts (Bots & Strangers)", value: "all" },
            { label: "Strangers Only", value: "strangers_only" }
        ],
        restartNeeded: false
    },
    autoBlock: {
        type: OptionType.BOOLEAN,
        description: "Automatically block the sender of the DM-all spam.",
        default: true,
        restartNeeded: false
    },
    autoCloseDM: {
        type: OptionType.BOOLEAN,
        description: "Automatically close and remove the DM channel from your list.",
        default: true,
        restartNeeded: false
    },
    ignoreFriends: {
        type: OptionType.BOOLEAN,
        description: "Never block or close DMs from users on your friend list.",
        default: true,
        restartNeeded: false
    },
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Show a notification toast when a DM-all spammer is blocked.",
        default: false,
        restartNeeded: false
    }
});

const ChannelActions = findByPropsLazy("closePrivateChannel");
const ChannelActionCreators = findByPropsLazy("openPrivateChannel", "closePrivateChannel");
const RelationshipActions = findByPropsLazy("removeFriend", "addRelationship");

const historyListeners = new Set<() => void>();

function notifyHistoryListeners() {
    historyListeners.forEach(cb => {
        try { cb(); } catch {}
    });
}

function subscribeHistory(cb: () => void): () => void {
    historyListeners.add(cb);
    return () => historyListeners.delete(cb);
}

function containsLink(content?: string, embeds?: any[]): boolean {
    if (content && URL_REGEX.test(content)) return true;
    if (Array.isArray(embeds)) {
        for (const emb of embeds) {
            if (emb && typeof emb === "object") {
                if (emb.url && URL_REGEX.test(emb.url)) return true;
                if (emb.description && URL_REGEX.test(emb.description)) return true;
                if (emb.title && URL_REGEX.test(emb.title)) return true;
                if (Array.isArray(emb.fields)) {
                    for (const f of emb.fields) {
                        if (f && f.value && URL_REGEX.test(f.value)) return true;
                    }
                }
            }
        }
    }
    return false;
}

async function hasPriorMessages(channelId: string, currentMessageId: string): Promise<boolean> {
    try {
        // 1. Check local MessageStore cache
        const cache = MessageStore.getMessages(channelId) as any;
        const msgList: any[] = cache?._array || [];
        if (msgList.length > 0) {
            const hasOlder = msgList.some(m => {
                if (!m || !m.id || m.id === currentMessageId) return false;
                try {
                    return BigInt(m.id) < BigInt(currentMessageId);
                } catch {
                    return false;
                }
            });
            if (hasOlder) return true;
        }

        // 2. Fetch older message via REST API
        const res = await RestAPI.get({
            url: `/channels/${channelId}/messages`,
            query: {
                before: currentMessageId,
                limit: 1
            }
        });

        if (Array.isArray(res?.body) && res.body.length > 0) {
            return true;
        }

        return false;
    } catch {
        // In case REST fails, check if cache has any other message
        const cache = MessageStore.getMessages(channelId) as any;
        const msgList: any[] = cache?._array || [];
        return msgList.some(m => m && m.id && m.id !== currentMessageId);
    }
}

async function blockUser(userId: string): Promise<void> {
    try {
        if (RelationshipActions?.addRelationship) {
            RelationshipActions.addRelationship({
                userId,
                context: { location: "antiDMAll" },
                type: 2
            });
        }
    } catch {}
    try {
        if ((RelationshipActions as any)?.blockUser) {
            (RelationshipActions as any).blockUser(userId, { location: "antiDMAll" });
        }
    } catch {}
    try {
        await RestAPI.put({
            url: `/users/@me/relationships/${userId}`,
            body: { type: 2 }
        });
    } catch {}
}

async function unblockUser(userId: string): Promise<void> {
    try {
        if (RelationshipActions?.removeRelationship) {
            RelationshipActions.removeRelationship(userId, { location: "antiDMAll" });
        }
    } catch {}
    try {
        if ((RelationshipActions as any)?.unblockUser) {
            (RelationshipActions as any).unblockUser(userId, { location: "antiDMAll" });
        }
    } catch {}
    try {
        await RestAPI.del({
            url: `/users/@me/relationships/${userId}`
        });
    } catch {}
}

async function closeDM(channelId: string): Promise<void> {
    try {
        if (SelectedChannelStore.getChannelId() === channelId) {
            NavigationRouter.transitionTo?.("/channels/@me");
        }
    } catch {}
    try {
        if (ChannelActions?.closePrivateChannel) {
            ChannelActions.closePrivateChannel(channelId, false);
            return;
        }
    } catch {}
    try {
        if (ChannelActionCreators?.closePrivateChannel) {
            ChannelActionCreators.closePrivateChannel(channelId, false);
            return;
        }
    } catch {}
    try {
        await RestAPI.del({
            url: `/channels/${channelId}?silent=true`
        });
    } catch {}
}

async function logBlockedEntry(entry: BlockedDMEntry) {
    try {
        const history = (await DataStore.get<BlockedDMEntry[]>(HISTORY_KEY)) || [];
        const updated = [entry, ...history.filter(h => h.userId !== entry.userId)].slice(0, 50);
        await DataStore.set(HISTORY_KEY, updated);
        notifyHistoryListeners();
    } catch {}
}

const processingChannels = new Set<string>();

async function handleIncomingMessage(message: any, channelId?: string) {
    if (!message || !message.author) return;

    const targetChannelId = message.channel_id || channelId;
    if (!targetChannelId) return;

    if (processingChannels.has(targetChannelId)) return;

    // Check if channel is DM (type 1)
    const channel = ChannelStore.getChannel(targetChannelId);
    if (!channel || (typeof channel.isDM === "function" ? !channel.isDM() : channel.type !== 1)) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId || message.author.id === currentUserId) return;

    // Check if already blocked
    if (RelationshipStore.isBlocked(message.author.id)) return;

    // Check friend exclusion
    if (settings.store.ignoreFriends && RelationshipStore.isFriend(message.author.id)) return;

    // Check target filter
    const isBot = Boolean(message.author.bot);
    const isStranger = !RelationshipStore.isFriend(message.author.id);

    const mode = settings.store.targetMode;
    if (mode === "bots_only" && !isBot) return;
    if (mode === "strangers_only" && (!isStranger || isBot)) return;
    if (mode === "all" && !isBot && !isStranger) return;

    // Check if message or embeds contains a link
    if (!containsLink(message.content, message.embeds)) return;

    processingChannels.add(targetChannelId);

    try {
        // Check "sans aucun message avant" (no prior message)
        const priorExists = await hasPriorMessages(targetChannelId, message.id);
        if (priorExists) return;

        // Auto block & close MP
        const { author } = message;
        const authorTag = author.username
            ? `${author.username}${author.discriminator && author.discriminator !== "0" ? `#${author.discriminator}` : ""}`
            : author.id;

        if (settings.store.autoBlock) {
            await blockUser(author.id);
        }

        if (settings.store.autoCloseDM) {
            await closeDM(targetChannelId);
        }

        await logBlockedEntry({
            userId: author.id,
            username: authorTag,
            avatar: author.avatar || null,
            discriminator: author.discriminator,
            content: message.content || "",
            channelId: targetChannelId,
            timestamp: Date.now()
        });

        if (settings.store.showNotifications) {
            showToast(
                t("Blocked DM spammer {user} and closed DM.", { user: authorTag }),
                Toasts.Type.SUCCESS
            );
        }
    } finally {
        setTimeout(() => processingChannels.delete(targetChannelId), 4000);
    }
}

function AntiDMAllSettingsComponent() {
    const [history, setHistory] = useState<BlockedDMEntry[]>([]);

    const loadHistory = async () => {
        try {
            const list = await DataStore.get<BlockedDMEntry[]>(HISTORY_KEY);
            if (Array.isArray(list)) {
                setHistory(list);
            } else {
                setHistory([]);
            }
        } catch {
            setHistory([]);
        }
    };

    useEffect(() => {
        loadHistory();
        return subscribeHistory(loadHistory);
    }, []);

    const handleUnblock = async (entry: BlockedDMEntry) => {
        await unblockUser(entry.userId);
        const updated = history.filter(h => h.userId !== entry.userId);
        setHistory(updated);
        await DataStore.set(HISTORY_KEY, updated);
        showToast(t("Unblocked {user}.", { user: entry.username }), Toasts.Type.SUCCESS);
    };

    const handleClearHistory = async () => {
        setHistory([]);
        await DataStore.set(HISTORY_KEY, []);
    };

    return (
        <div style={{ marginTop: 16 }}>
            <Card style={{ padding: 16, backgroundColor: "var(--background-secondary)" }}>
                <Flex justify={FlexJustify.BETWEEN} align={FlexAlign.CENTER} style={{ marginBottom: 12 }}>
                    <div>
                        <Text variant="text-md/bold" style={{ color: "var(--header-primary)" }}>
                            {t("Blocked Spammers History")}
                        </Text>
                        <Text variant="text-sm/normal" style={{ color: "var(--text-muted)" }}>
                            {history.length > 0
                                ? `${history.length} / 50`
                                : t("No DM-all spammers blocked yet.")}
                        </Text>
                    </div>
                    {history.length > 0 && (
                        <Button
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.PRIMARY}
                            onClick={handleClearHistory}
                        >
                            {t("Clear History")}
                        </Button>
                    )}
                </Flex>

                {history.length === 0 ? (
                    <Text variant="text-sm/normal" style={{ color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "16px 0" }}>
                        {t("No DM-all spammers blocked yet.")}
                    </Text>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
                        {history.map(entry => {
                            const avatarUrl = entry.avatar
                                ? (IconUtils?.getUserAvatarURL?.({ id: entry.userId, avatar: entry.avatar } as any, false, 64) ?? "")
                                : (IconUtils?.getDefaultAvatarURL?.(entry.userId, entry.discriminator) ?? "");

                            const formattedDate = new Date(entry.timestamp).toLocaleString();

                            return (
                                <Card
                                    key={entry.userId}
                                    style={{
                                        padding: "10px 14px",
                                        backgroundColor: "var(--background-floating)",
                                        borderRadius: 6
                                    }}
                                >
                                    <Flex justify={FlexJustify.BETWEEN} align={FlexAlign.CENTER}>
                                        <Flex align={FlexAlign.CENTER} style={{ minWidth: 0, gap: 12, flex: 1 }}>
                                            {avatarUrl ? (
                                                <img
                                                    src={avatarUrl}
                                                    alt=""
                                                    style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }}
                                                />
                                            ) : (
                                                <div
                                                    style={{
                                                        width: 32,
                                                        height: 32,
                                                        borderRadius: "50%",
                                                        backgroundColor: "var(--background-secondary)",
                                                        flexShrink: 0
                                                    }}
                                                />
                                            )}
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <Flex align={FlexAlign.CENTER} style={{ gap: 8 }}>
                                                    <Text variant="text-sm/bold" style={{ color: "var(--header-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                        {entry.username}
                                                    </Text>
                                                    <Text variant="text-xs/normal" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                                                        {formattedDate}
                                                    </Text>
                                                </Flex>
                                                {entry.content && (
                                                    <Text
                                                        variant="text-xs/normal"
                                                        style={{
                                                            color: "var(--text-muted)",
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap",
                                                            marginTop: 2
                                                        }}
                                                    >
                                                        {entry.content}
                                                    </Text>
                                                )}
                                            </div>
                                        </Flex>
                                        <Button
                                            size={Button.Sizes.TINY}
                                            color={Button.Colors.RED}
                                            onClick={() => handleUnblock(entry)}
                                            style={{ marginLeft: 12, flexShrink: 0 }}
                                        >
                                            {t("Unblock")}
                                        </Button>
                                    </Flex>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
}

export default definePlugin({
    name: "AntiDMAll",
    description: "Automatically blocks DM-all spam bots and strangers sending links in brand new conversations, and immediately closes the direct message.",
    authors: [
        { name: "Nightcord", id: 0n }
    ],
    enabledByDefault: false,
    settings,
    settingsAboutComponent: AntiDMAllSettingsComponent,

    flux: {
        MESSAGE_CREATE(event: any) {
            if (event?.optimistic || event?.message?.state === "SENDING") return;
            const message = event?.message;
            if (!message) return;
            handleIncomingMessage(message, event.channelId);
        }
    }
});
