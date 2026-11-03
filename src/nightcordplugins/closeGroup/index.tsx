/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, Menu, RestAPI, showToast, Toasts, UserStore } from "@webpack/common";
import { Channel } from "discord-types/general";

const settings = definePluginSettings({
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Show notifications on action",
        default: true
    },
    clearMessages: {
        type: OptionType.BOOLEAN,
        description: "Clear all your messages in the group before closing",
        default: false
    }
});

const CloseGroupIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        <path d="M19.7 3.3a1 1 0 0 0-1.4 0L17 4.6l-1.3-1.3a1 1 0 1 0-1.4 1.4L15.6 6l-1.3 1.3a1 1 0 0 0 1.4 1.4L17 7.4l1.3 1.3a1 1 0 0 0 1.4-1.4L18.4 6l1.3-1.3a1 1 0 0 0 0-1.4z" />
    </svg>
);

async function clearUserMessagesInGroup(channelId: string, currentUserId: string): Promise<number> {
    let deletedCount = 0;
    let lastMessageId: string | undefined;
    let hasMore = true;

    while (hasMore) {
        let messages: any[] = [];
        try {
            const url = lastMessageId
                ? `/channels/${channelId}/messages?limit=100&before=${lastMessageId}`
                : `/channels/${channelId}/messages?limit=100`;
            const res = await RestAPI.get({ url });
            messages = Array.isArray(res?.body) ? res.body : [];
        } catch {
            break;
        }

        if (!messages.length) break;

        const myMessages = messages.filter((m: any) => m?.author?.id === currentUserId);

        for (const msg of myMessages) {
            let attempts = 0;
            let success = false;
            while (attempts < 3 && !success) {
                attempts++;
                try {
                    const res = await RestAPI.del({ url: `/channels/${channelId}/messages/${msg.id}` });
                    if (res?.ok || res?.status === 204 || res?.status === 200 || res?.status === 404) {
                        success = true;
                        if (res?.status !== 404) deletedCount++;
                    } else if (res?.status === 429) {
                        const retryAfter = Number(res?.body?.retry_after || 1);
                        await new Promise(r => setTimeout(r, retryAfter * 1000 + 150));
                    } else {
                        success = true;
                    }
                } catch (err: any) {
                    const status = err?.status || err?.statusCode;
                    if (status === 429 || err?.body?.retry_after) {
                        const retryAfter = Number(err?.body?.retry_after || 1);
                        await new Promise(r => setTimeout(r, retryAfter * 1000 + 150));
                    } else {
                        success = true;
                    }
                }
            }
            await new Promise(r => setTimeout(r, 120));
        }

        lastMessageId = messages[messages.length - 1]?.id;
        if (messages.length < 100) {
            hasMore = false;
        }
    }

    return deletedCount;
}

async function kickAllMembersFromGroup(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    const currentUserId = UserStore.getCurrentUser()?.id;

    if (!channel || channel.type !== 3 || !currentUserId) return;

    if (channel.ownerId !== currentUserId) {
        if (settings.store.showNotifications) {
            showNotification({
                title: t("CloseGroup"),
                body: t("Only the group owner can close the group"),
                icon: undefined
            });
        }
        try { showToast(t("Only the group owner can close the group"), Toasts.Type.FAILURE); } catch {}
        return;
    }

    const channelName = channel.name || t("Unnamed Group");
    const rawRecipients: any[] = (channel as any).rawRecipients || channel.recipients || [];
    const targetUserIds: string[] = rawRecipients
        .map(u => (typeof u === "string" ? u : (u?.id || u?.userId)))
        .filter(id => Boolean(id) && String(id) !== String(currentUserId));

    if (targetUserIds.length === 0 && !settings.store.clearMessages) {
        try { showToast(t("No members to kick"), Toasts.Type.MESSAGE); } catch {}
        return;
    }

    const startToast = settings.store.clearMessages
        ? (targetUserIds.length > 0
            ? t("Closing group, kicking members and deleting your messages...")
            : t("Closing group and deleting your messages..."))
        : t("Closing group and removing members...");

    try { showToast(startToast, Toasts.Type.MESSAGE); } catch {}

    // 1. Kick members first so they cannot read or save anything while messages are cleared
    if (targetUserIds.length > 0) {
        for (const userId of targetUserIds) {
            let attempts = 0;
            let success = false;
            while (attempts < 3 && !success) {
                attempts++;
                try {
                    const res = await RestAPI.del({ url: `/channels/${channelId}/recipients/${userId}` });
                    if (res?.ok || res?.status === 204 || res?.status === 200) {
                        success = true;
                    } else if (res?.status === 429) {
                        const retryAfter = Number(res?.body?.retry_after || 0.5);
                        await new Promise(r => setTimeout(r, retryAfter * 1000 + 150));
                    } else {
                        success = true;
                    }
                } catch (err: any) {
                    if (err?.status === 429 || err?.body?.retry_after) {
                        const retryAfter = Number(err?.body?.retry_after || 0.5);
                        await new Promise(r => setTimeout(r, retryAfter * 1000 + 150));
                    } else {
                        success = true;
                    }
                }
            }
            await new Promise(r => setTimeout(r, 120));
        }
    }

    // 2. Clear all messages authored by current user if setting is enabled
    if (settings.store.clearMessages) {
        await clearUserMessagesInGroup(channelId, currentUserId);
    }

    // 3. Finally, close/leave the group
    try {
        await RestAPI.del({ url: `/channels/${channelId}` });
    } catch {}

    // 4. Notifications & Toasts
    if (settings.store.showNotifications) {
        const notifBody = settings.store.clearMessages
            ? (targetUserIds.length > 0
                ? t("Group \"{name}\" closed, members removed and your messages deleted").replace("{name}", channelName)
                : t("Group \"{name}\" closed and your messages deleted").replace("{name}", channelName))
            : t("Group \"{name}\" closed and members removed").replace("{name}", channelName);

        showNotification({
            title: t("CloseGroup"),
            body: notifBody,
            icon: undefined
        });
    }

    try {
        const endToast = settings.store.clearMessages
            ? (targetUserIds.length > 0
                ? t("Group closed, members removed and your messages deleted")
                : t("Group closed and your messages deleted"))
            : t("Group closed and all members removed");

        showToast(endToast, Toasts.Type.SUCCESS);
    } catch {}
}

const GroupContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }: { channel: Channel; }) => {
    if (!channel || channel.type !== 3) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (channel.ownerId !== currentUserId) return;

    const group = findGroupChildrenByChildId("leave-channel", children);

    if (group) {
        group.push(
            <Menu.MenuItem
                key="close-group"
                id="vc-close-group"
                label={t("Close Group")}
                color="danger"
                action={() => kickAllMembersFromGroup(channel.id)}
                icon={CloseGroupIcon}
                leadingAccessory={CloseGroupIcon}
            />
        );
    }
};

export default definePlugin({
    name: "CloseGroup",
    description: "Close a group DM by instantly kicking all other members (owner only)",
    authors: [{
        name: "Bash",
        id: 1327483363518582784n
    }],
    dependencies: ["ContextMenuAPI"],
    settings,

    contextMenus: {
        "gdm-context": GroupContextMenuPatch,
        "channel-context": GroupContextMenuPatch
    }
});
