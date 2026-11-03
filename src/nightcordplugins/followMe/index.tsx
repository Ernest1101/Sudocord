/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import { addContextMenuPatch, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { HeaderBarButton } from "@api/HeaderBar";
import { DataStore } from "@api/index";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import {
    ChannelStore,
    Constants,
    GuildStore,
    Menu,
    PermissionsBits,
    PermissionStore,
    React,
    RestAPI,
    SelectedChannelStore,
    Toasts,
    useEffect,
    UserStore,
    useState,
    VoiceStateStore
} from "@webpack/common";

const GuildVoiceActions = findByPropsLazy("setServerMute", "setChannel") ?? findByPropsLazy("setChannel", "setServerMute");

const DS_KEY = "followme-target-v1";

// ── Global State ─────────────────────────────────────────────────────────────
let targetId: string | null = null;
let targetName: string = "";
let watchdogInterval: ReturnType<typeof setInterval> | null = null;
let moveInProgress = false;
let lastMoveTimestamp = 0;

const listeners = new Set<() => void>();
function notifyAll() {
    listeners.forEach(fn => fn());
}

function useFollowMeId(): string | null {
    const [, tick] = useState(0);
    useEffect(() => {
        const fn = () => tick(n => n + 1);
        listeners.add(fn);
        return () => {
            listeners.delete(fn);
        };
    }, []);
    return targetId;
}

async function persist() {
    await DataStore.set(DS_KEY, targetId ? { id: targetId, name: targetName } : null);
}

function getTargetVoiceState(userId: string, guildId?: string): { channelId: string; guildId: string; } | null {
    try {
        if (guildId && VoiceStateStore?.getVoiceState) {
            const vs = VoiceStateStore.getVoiceState(guildId, userId);
            if (vs?.channelId) return { channelId: vs.channelId, guildId: vs.guildId || guildId };
        }

        if (guildId && VoiceStateStore?.getUserVoiceChannelId) {
            const chId = VoiceStateStore.getUserVoiceChannelId(guildId, userId);
            if (chId) return { channelId: chId, guildId };
        }

        if (VoiceStateStore?.getVoiceStateForUser) {
            const uvs = VoiceStateStore.getVoiceStateForUser(userId);
            if (uvs?.channelId) return { channelId: uvs.channelId, guildId: uvs.guildId || guildId || "" };
        }

        if (guildId && VoiceStateStore?.getVoiceStates) {
            const gStates = VoiceStateStore.getVoiceStates(guildId);
            if (gStates?.[userId]?.channelId) {
                return { channelId: gStates[userId].channelId, guildId };
            }
        }

        if (VoiceStateStore?.getAllVoiceStates) {
            const all = VoiceStateStore.getAllVoiceStates() as Record<string, Record<string, any>>;
            if (all) {
                for (const [gId, members] of Object.entries(all)) {
                    if (members?.[userId]?.channelId) {
                        return { channelId: members[userId].channelId, guildId: gId };
                    }
                }
            }
        }
    } catch { }
    return null;
}

function hasMovePermission(guildId: string, channelId?: string): boolean {
    try {
        const guild = GuildStore?.getGuild?.(guildId);
        if (guild) {
            if (PermissionStore.can(PermissionsBits.ADMINISTRATOR, guild)) return true;
            if (PermissionStore.can(PermissionsBits.MOVE_MEMBERS, guild)) return true;
        }

        if (channelId) {
            const channel = ChannelStore?.getChannel?.(channelId);
            if (channel && PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel)) {
                return true;
            }
        }
    } catch { }
    return true;
}

async function moveTargetTo(guildId: string, channelId: string) {
    if (!targetId || !guildId || !channelId) return;

    const targetState = getTargetVoiceState(targetId, guildId);
    if (!targetState?.channelId) return;

    if (targetState.channelId === channelId) return;

    if (!hasMovePermission(guildId, channelId)) {
        console.warn("[FollowMe] Missing MOVE_MEMBERS permission for:", guildId, channelId);
    }

    const now = Date.now();
    if (moveInProgress && now - lastMoveTimestamp < 200) return;
    moveInProgress = true;
    lastMoveTimestamp = now;

    let moved = false;

    // 1. Instant native Discord voice action
    if (typeof GuildVoiceActions?.setChannel === "function") {
        try {
            await GuildVoiceActions.setChannel(guildId, targetId, channelId);
            moved = true;
        } catch (e) {
            console.warn("[FollowMe] GuildVoiceActions.setChannel failed, falling back to REST:", e);
        }
    }

    // 2. Dual-layer REST API patch
    try {
        await RestAPI.patch({
            url: `/guilds/${guildId}/members/${targetId}`,
            body: { channel_id: channelId }
        });
        moved = true;
    } catch (e: any) {
        if (!moved) {
            if (Constants?.Endpoints?.GUILD_MEMBER) {
                try {
                    await RestAPI.patch({
                        url: Constants.Endpoints.GUILD_MEMBER(guildId, targetId),
                        body: { channel_id: channelId }
                    });
                    moved = true;
                } catch { }
            }
        }
        if (!moved) {
            console.error("[FollowMe] Failed to move user:", e);
        }
    } finally {
        setTimeout(() => {
            moveInProgress = false;
        }, 250);
    }
}

function onChannelChange(channelId: string, guildId?: string) {
    if (!targetId || !channelId) return;
    const finalGuildId = guildId ?? ChannelStore?.getChannel?.(channelId)?.guild_id;
    if (!finalGuildId) return;

    // Immediate attempt
    setTimeout(() => {
        moveTargetTo(finalGuildId, channelId);
    }, 60);

    // Follow-up verification and retry
    setTimeout(() => {
        const state = getTargetVoiceState(targetId, finalGuildId);
        if (state?.channelId && state.channelId !== channelId) {
            moveTargetTo(finalGuildId, channelId);
        }
    }, 350);

    setTimeout(() => {
        const state = getTargetVoiceState(targetId, finalGuildId);
        if (state?.channelId && state.channelId !== channelId) {
            moveTargetTo(finalGuildId, channelId);
        }
    }, 850);
}

function checkAndMoveTarget() {
    if (!targetId) return;
    const myId = UserStore.getCurrentUser()?.id;
    if (!myId) return;

    const myChannelId = SelectedChannelStore.getVoiceChannelId()
        ?? VoiceStateStore?.getVoiceStateForUser?.(myId)?.channelId;
    if (!myChannelId) return;

    const myChannel = ChannelStore.getChannel(myChannelId);
    if (!myChannel?.guild_id) return;

    onChannelChange(myChannelId, myChannel.guild_id);
}

function startWatchdog() {
    if (watchdogInterval) clearInterval(watchdogInterval);
    watchdogInterval = setInterval(() => {
        if (!targetId) return;
        const myId = UserStore.getCurrentUser()?.id;
        if (!myId) return;

        const myChannelId = SelectedChannelStore.getVoiceChannelId()
            ?? VoiceStateStore?.getVoiceStateForUser?.(myId)?.channelId;
        if (!myChannelId) return;

        const myChannel = ChannelStore.getChannel(myChannelId);
        if (!myChannel?.guild_id) return;

        const targetState = getTargetVoiceState(targetId, myChannel.guild_id);
        if (targetState?.channelId && targetState.channelId !== myChannelId) {
            moveTargetTo(myChannel.guild_id, myChannelId);
        }
    }, 1500);
}

function stopWatchdog() {
    if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
    }
}

function followMe(userId: string) {
    if (targetId === userId) return;
    const user = UserStore?.getUser?.(userId);
    targetId = userId;
    targetName = user?.globalName ?? user?.username ?? userId;

    startWatchdog();
    checkAndMoveTarget();

    notifyAll();
    persist().catch(() => { });
    Toasts.show({
        message: t("Following Me: {name}").replace("{name}", targetName),
        type: Toasts.Type.SUCCESS,
        id: Toasts.genId()
    });
}

function unfollowMe() {
    const name = targetName;
    targetId = null;
    targetName = "";
    stopWatchdog();
    notifyAll();
    persist().catch(() => { });
    Toasts.show({
        message: t("Stopped forcing {name} to follow").replace("{name}", name),
        type: Toasts.Type.MESSAGE,
        id: Toasts.genId()
    });
}

// ── Icon ──
function FollowMeIcon({ color = "currentColor" }: { color?: string; }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                fill={color}
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2 4a2 2 0 1 1 4 0 2 2 0 0 1-4 0Zm-6.5 11c0-2.5 3.5-4 6.5-4 1.45 0 3.03.35 4.3 1.05a1 1 0 1 1-.9 1.78C12.18 15.44 11 15 10 15c-2.37 0-4.5 1.09-4.5 2v1h9a1 1 0 1 1 0 2h-10a1 1 0 0 1-1-1v-2Zm13.2-1.7a1 1 0 0 1 1.42 0l3 3a1 1 0 0 1 0 1.4l-3 3a1 1 0 0 1-1.42-1.4l1.3-1.3H15a1 1 0 1 1 0-2h3.08l-1.3-1.3a1 1 0 0 1 0-1.4Z"
            />
        </svg>
    );
}

// ── HeaderBar Button ──
function FollowMeHeaderButton() {
    const tid = useFollowMeId();
    if (!tid) return null;

    return (
        <HeaderBarButton
            icon={() => (
                <FollowMeIcon color="#b5bac1" />
            )}
            tooltip={t("Stop Follow Me: {name}").replace("{name}", targetName)}
            onClick={() => unfollowMe()}
        />
    );
}

// ── Context Menu ──
const ctxPatch: NavContextMenuPatchCallback = (children, props: any) => {
    if (!children || !Array.isArray(children)) return;
    try {
        const userId: string | undefined = props?.user?.id ?? props?.userId;
        if (!userId || userId === UserStore.getCurrentUser()?.id) return;

        const isFollowed = targetId === userId;

        children.push(
            <Menu.MenuCheckboxItem
                id="follow-me-ctx"
                label={isFollowed ? t("Stop Follow Me") : t("Follow Me")}
                checked={isFollowed}
                action={() => {
                    if (isFollowed) unfollowMe();
                    else followMe(userId);
                }}
            />
        );
    } catch (e) {
        console.error("[FollowMe] Context menu patch error:", e);
    }
};

// ── Plugin ───────────────────────────────────────────────────────────────────
export default definePlugin({
    name: "FollowMe",
    enabledByDefault: false,
    description: "Forces a user to follow you in voice channels (if you have permissions). Right-click a user -> Follow Me.",
    authors: [{ name: "Nightcord", id: 0n }],

    headerBarButton: {
        icon: () => <FollowMeIcon color="#949ba4" />,
        render: FollowMeHeaderButton,
        priority: 6,
    },

    flux: {
        VOICE_CHANNEL_SELECT(action: { channelId?: string | null; guildId?: string | null; }) {
            if (!targetId) return;
            const channelId = action?.channelId;
            if (channelId) {
                const guildId = action?.guildId ?? ChannelStore.getChannel(channelId)?.guild_id;
                if (guildId) {
                    onChannelChange(channelId, guildId);
                }
            }
        },

        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates?: any[]; }) {
            if (!targetId || !Array.isArray(voiceStates)) return;
            const myId = UserStore.getCurrentUser()?.id;
            if (!myId) return;

            for (const s of voiceStates) {
                const uId = s.userId || s.user_id;
                const cId = s.channelId !== undefined ? s.channelId : s.channel_id;
                const gId = s.guildId || s.guild_id;

                if (uId === myId) {
                    if (cId && gId) {
                        onChannelChange(cId, gId);
                    }
                } else if (uId === targetId) {
                    const myChannelId = SelectedChannelStore.getVoiceChannelId()
                        ?? VoiceStateStore?.getVoiceStateForUser?.(myId)?.channelId;
                    if (myChannelId) {
                        const myChannel = ChannelStore.getChannel(myChannelId);
                        const myGuildId = myChannel?.guild_id;
                        if (myGuildId && cId && cId !== myChannelId && (!gId || gId === myGuildId)) {
                            setTimeout(() => {
                                moveTargetTo(myGuildId, myChannelId);
                            }, 100);
                        }
                    }
                }
            }
        },

        RTC_CONNECTION_STATE(action: { state?: string; }) {
            if (!targetId) return;
            if (action?.state === "RTC_CONNECTED") {
                checkAndMoveTarget();
            }
        }
    },

    async start() {
        const saved = await DataStore.get(DS_KEY) as { id: string; name: string; } | null;
        if (saved?.id) {
            targetId = saved.id;
            targetName = saved.name ?? saved.id;
            startWatchdog();
        }
        addContextMenuPatch("user-context", ctxPatch);
        addContextMenuPatch("user-profile-actions", ctxPatch);
        addContextMenuPatch("gdm-context", ctxPatch);
    },

    stop() {
        targetId = null;
        targetName = "";
        stopWatchdog();
        removeContextMenuPatch("user-context", ctxPatch);
        removeContextMenuPatch("user-profile-actions", ctxPatch);
        removeContextMenuPatch("gdm-context", ctxPatch);
    },
});
