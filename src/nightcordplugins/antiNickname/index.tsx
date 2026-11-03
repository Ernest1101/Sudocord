/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import definePlugin from "@utils/types";
import { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import {
    FluxDispatcher,
    GuildMemberStore,
    Menu,
    RestAPI,
    SelectedGuildStore,
    showToast,
    Toasts,
    UserStore
} from "@webpack/common";

const GuildMemberActions: any = findByPropsLazy("setCommunicationDisabledUntil", "kickUser", "banUser", "setNickname");

const settings = definePluginSettings({
    showToast: {
        type: OptionType.BOOLEAN,
        description: "Show a notification when a forced nickname is removed",
        default: true,
    },
    clientMask: {
        type: OptionType.BOOLEAN,
        description: "Mask forced nicknames locally even if server permissions block reset",
        default: true,
    }
});

// Guilds currently being reset to avoid duplicate API calls or loops
const resettingGuilds = new Set<string>();

// Store original methods for clean unpatching
let origGetNick: typeof GuildMemberStore.getNick | null = null;
let origGetMember: typeof GuildMemberStore.getMember | null = null;

function getRealServerNick(guildId: string, userId: string): string | null {
    if (origGetMember && GuildMemberStore) {
        try {
            const member = origGetMember(guildId, userId);
            if (member && member.nick) return member.nick;
        } catch {}
    }
    if (origGetNick && GuildMemberStore) {
        try {
            const nick = origGetNick(guildId, userId);
            if (nick) return nick;
        } catch {}
    }
    try {
        return GuildMemberStore?.getNick?.(guildId, userId) ?? null;
    } catch {
        return null;
    }
}

function applyClientMask(guildId: string, currentUser: any) {
    if (!guildId || !currentUser || !FluxDispatcher) return;
    try {
        const currentMember = origGetMember ? origGetMember(guildId, currentUser.id) : GuildMemberStore?.getMember?.(guildId, currentUser.id);
        FluxDispatcher.dispatch({
            type: "GUILD_MEMBER_UPDATE",
            guildId,
            user: currentUser,
            roles: currentMember?.roles ?? [],
            nick: null
        });
    } catch {}
}

async function resetNick(guildId: string, forcedNick: string, currentUserId: string) {
    if (!guildId || resettingGuilds.has(guildId)) return;
    resettingGuilds.add(guildId);

    const currentUser = UserStore.getCurrentUser();

    // Immediately mask client-side so the user never sees the forced nickname
    if (settings.store.clientMask && currentUser) {
        applyClientMask(guildId, currentUser);
    }

    let success = false;
    let permissionDenied = false;

    try {
        // Method 1: Discord REST API PATCH /guilds/{guildId}/members/@me with nick: null
        try {
            await RestAPI.patch({
                url: `/guilds/${guildId}/members/@me`,
                body: { nick: null }
            });
            success = true;
        } catch (e1: any) {
            const status = e1?.status || e1?.statusCode;
            if (status === 403 || e1?.body?.code === 50013) {
                permissionDenied = true;
            } else if (status === 400) {
                // In case API expects empty string fallback
                try {
                    await RestAPI.patch({
                        url: `/guilds/${guildId}/members/@me`,
                        body: { nick: "" }
                    });
                    success = true;
                } catch (e2: any) {
                    const status2 = e2?.status || e2?.statusCode;
                    if (status2 === 403 || e2?.body?.code === 50013) {
                        permissionDenied = true;
                    }
                }
            }
        }

        // Method 2: Discord internal GuildMemberActions fallback
        if (!success && !permissionDenied && typeof GuildMemberActions?.setNickname === "function") {
            try {
                await GuildMemberActions.setNickname(guildId, "@me", null);
                success = true;
            } catch (e3: any) {
                const status3 = e3?.status || e3?.statusCode;
                if (status3 === 403 || e3?.body?.code === 50013) {
                    permissionDenied = true;
                }
            }
        }

        if (success) {
            if (currentUser) applyClientMask(guildId, currentUser);
            if (settings.store.showToast) {
                showToast(
                    `${t("AntiNickname")}: ${t("Nickname reset on server")} (${forcedNick})`,
                    Toasts.Type.SUCCESS
                );
            }
        } else if (permissionDenied) {
            if (currentUser) applyClientMask(guildId, currentUser);
            if (settings.store.showToast) {
                showToast(
                    `${t("AntiNickname")}: ${t("Nickname reset blocked by server permissions (masked locally)")}`,
                    Toasts.Type.WARNING
                );
            }
        } else {
            if (settings.store.showToast) {
                showToast(
                    `${t("AntiNickname")}: ${t("Failed to reset nickname")}`,
                    Toasts.Type.FAILURE
                );
            }
        }
    } catch (err: any) {
        console.warn(`[AntiNickname] Failed to reset nickname on ${guildId}:`, err);
    } finally {
        setTimeout(() => resettingGuilds.delete(guildId), 2500);
    }
}

function checkAndResetGuild(guildId?: string | null) {
    if (!guildId) return;
    const currentUser = UserStore.getCurrentUser();
    if (!currentUser) return;

    const nick = getRealServerNick(guildId, currentUser.id);
    if (nick) {
        void resetNick(guildId, nick, currentUser.id);
    }
}

function patchMemberStore() {
    if (GuildMemberStore && !origGetNick && typeof GuildMemberStore.getNick === "function") {
        origGetNick = GuildMemberStore.getNick.bind(GuildMemberStore);
        GuildMemberStore.getNick = (guildId: string, userId: string) => {
            const currentUser = UserStore.getCurrentUser();
            if (currentUser && userId === currentUser.id && settings.store.clientMask) {
                return null;
            }
            return origGetNick!(guildId, userId);
        };
    }

    if (GuildMemberStore && !origGetMember && typeof GuildMemberStore.getMember === "function") {
        origGetMember = GuildMemberStore.getMember.bind(GuildMemberStore);
        GuildMemberStore.getMember = (guildId: string, userId: string) => {
            const member = origGetMember!(guildId, userId);
            const currentUser = UserStore.getCurrentUser();
            if (member && currentUser && userId === currentUser.id && settings.store.clientMask) {
                if (member.nick) {
                    return { ...member, nick: null };
                }
            }
            return member;
        };
    }
}

function unpatchMemberStore() {
    if (origGetNick && GuildMemberStore) {
        GuildMemberStore.getNick = origGetNick;
        origGetNick = null;
    }
    if (origGetMember && GuildMemberStore) {
        GuildMemberStore.getMember = origGetMember;
        origGetMember = null;
    }
}

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user, guildId }: { user?: any; guildId?: string; }) => {
    const currentUser = UserStore.getCurrentUser();
    if (!user || !currentUser || user.id !== currentUser.id) return;

    const targetGuildId = guildId || SelectedGuildStore?.getGuildId?.();
    if (!targetGuildId) return;

    const currentNick = getRealServerNick(targetGuildId, currentUser.id);

    children.push(
        <Menu.MenuGroup key="vc-antinickname-group">
            <Menu.MenuItem
                id="vc-antinickname-reset"
                label={t("Reset Nickname")}
                action={() => {
                    void resetNick(targetGuildId, currentNick || "Forced", currentUser.id);
                }}
            />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "AntiNickname",
    description: "Automatically resets any nickname forcefully assigned to you in a server. Works even without admin permissions.",
    authors: [{ name: "Nightcord", id: 0n }],
    settings,
    contextMenus: {
        "user-context": UserContextMenuPatch
    },

    flux: {
        GUILD_MEMBER_UPDATE(event: any) {
            const currentUser = UserStore.getCurrentUser();
            if (!currentUser) return;

            const guildId = event?.guildId ?? event?.guild_id ?? event?.member?.guildId;
            const userId = event?.user?.id ?? event?.userId ?? event?.member?.user?.id ?? event?.member?.userId;

            if (!guildId || !userId || userId !== currentUser.id) return;

            const eventNick = event?.nick !== undefined ? event?.nick : event?.member?.nick;
            const forcedNick = eventNick || getRealServerNick(guildId, currentUser.id);

            // Nick is null or empty = already reset, nothing to do
            if (!forcedNick) return;

            // Someone forced a nick on us - mask locally & reset immediately
            if (settings.store.clientMask) {
                applyClientMask(guildId, currentUser);
            }
            setTimeout(() => resetNick(guildId, forcedNick, currentUser.id), 100);
        },

        CHANNEL_SELECT(event: { guildId?: string; }) {
            if (event?.guildId) {
                setTimeout(() => checkAndResetGuild(event.guildId), 150);
            }
        },

        GUILD_SELECT(event: { guildId?: string; }) {
            if (event?.guildId) {
                setTimeout(() => checkAndResetGuild(event.guildId), 150);
            }
        }
    },

    start() {
        patchMemberStore();
        setTimeout(() => {
            const activeGuildId = SelectedGuildStore?.getGuildId?.();
            checkAndResetGuild(activeGuildId);
        }, 500);
    },

    stop() {
        unpatchMemberStore();
        resettingGuilds.clear();
    }
});
