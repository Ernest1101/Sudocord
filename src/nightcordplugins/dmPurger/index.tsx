/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import { definePluginSettings } from "@api/Settings";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import definePlugin, { OptionType } from "@utils/types";
import { RestAPI, showToast, Toasts } from "@webpack/common";

import DmPurgerSettingsModalPanel from "./components/DmPurgerSettingsModalPanel";
import { purgerEngine } from "./utils/purgerEngine";

export const settings = definePluginSettings({
    autoRequestEvery30Days: {
        type: OptionType.BOOLEAN,
        description: "Automatically send a Discord Data Request every 30 days",
        default: true
    },
    lastRequestTimestamp: {
        type: OptionType.NUMBER,
        description: "Timestamp of the last Discord data request",
        default: 0,
        hidden: true
    },
    requestMessagesOnly: {
        type: OptionType.BOOLEAN,
        description: "Request messages data only in Discord data requests",
        default: true
    },
    deleteDelay: {
        type: OptionType.SLIDER,
        description: "Deletion delay per message (ms) to avoid rate limits",
        markers: [500, 1000, 1500, 2000, 3000, 5000],
        default: 1500,
        stickToMarkers: false
    },
    emailProvider: {
        type: OptionType.SELECT,
        description: "Email provider for automatic data package retrieval",
        options: [
            { label: "Outlook / Hotmail / Office365", value: "outlook", default: true },
            { label: "Gmail", value: "gmail" },
            { label: "Yahoo Mail", value: "yahoo" },
            { label: "Custom IMAP", value: "custom" }
        ]
    },
    emailAddress: {
        type: OptionType.STRING,
        description: "Email address associated with your Discord account",
        default: ""
    },
    emailPassword: {
        type: OptionType.STRING,
        description: "Email password or App Password",
        default: ""
    },
    customImapHost: {
        type: OptionType.STRING,
        description: "Custom IMAP Host address",
        default: ""
    },
    customImapPort: {
        type: OptionType.NUMBER,
        description: "Custom IMAP Port (SSL default: 993)",
        default: 993
    },
    autoDeleteZipAfterExtract: {
        type: OptionType.BOOLEAN,
        description: "Automatically delete the package.zip archive after extraction",
        default: true
    },
    includeGroupDms: {
        type: OptionType.BOOLEAN,
        description: "Include Group DMs in the purge (1-on-1 DMs only by default)",
        default: false
    },
    whitelistUsers: {
        type: OptionType.STRING,
        description: "Comma-separated list of User IDs to whitelist from deletion",
        default: ""
    },
    whitelistGroups: {
        type: OptionType.STRING,
        description: "Comma-separated list of Group Channel IDs to whitelist",
        default: ""
    },
    autoResumeOnStartup: {
        type: OptionType.BOOLEAN,
        description: "Automatically resume interrupted purge when Discord launches",
        default: true
    }
});

let intervalTimer: any = null;

export async function requestDiscordData(types: string[] = ["messages"]): Promise<{ success: boolean; message: string }> {
    try {
        await RestAPI.post({
            url: "/users/@me/harvest",
            body: { types }
        });
        settings.store.lastRequestTimestamp = Date.now();
        return { success: true, message: t("Discord data requested successfully.") };
    } catch (e: any) {
        const errorMsg = e?.body?.message || e?.message || t("Failed to request data from Discord.");
        return { success: false, message: errorMsg };
    }
}

export async function checkDiscordHarvestStatus(): Promise<any> {
    try {
        const res = await RestAPI.get({ url: "/users/@me/harvest" });
        return res?.body || res;
    } catch {
        return null;
    }
}

function checkPeriodicHarvest() {
    if (!settings.store.autoRequestEvery30Days) return;
    const last = settings.store.lastRequestTimestamp || 0;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - last >= thirtyDaysMs) {
        const types = settings.store.requestMessagesOnly ? ["messages"] : ["all"];
        void requestDiscordData(types).then(res => {
            if (res.success) {
                showToast(t("Discord data requested successfully."), Toasts.Type.SUCCESS);
            }
        });
    }
}

export default definePlugin({
    name: "DmPurger",
    description: "Purge direct messages and group chats from your Discord account data package with automated request, email fetching, resume, whitelists, and logs.",
    authors: [{ name: "Nightcord", id: 0n }],
    enabledByDefault: false,
    settings,
    settingsAboutComponent: DmPurgerSettingsModalPanel,

    start() {
        checkPeriodicHarvest();
        // Check every 6 hours
        intervalTimer = setInterval(checkPeriodicHarvest, 6 * 60 * 60 * 1000);

        // Auto-resume if enabled and previously unfinished
        if (settings.store.autoResumeOnStartup) {
            setTimeout(() => {
                const state = purgerEngine.getState();
                if ((state.status === "paused" || state.status === "running") && state.queue.length > 0 && state.currentIndex < state.queue.length) {
                    showToast(t("Auto-resuming DM Purge..."), Toasts.Type.INFO);
                    purgerEngine.resumePurge(settings.store.deleteDelay);
                }
            }, 3000);
        }
    },

    stop() {
        if (intervalTimer) {
            clearInterval(intervalTimer);
            intervalTimer = null;
        }
        purgerEngine.pausePurge();
    }
});
