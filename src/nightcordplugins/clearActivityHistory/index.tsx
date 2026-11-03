/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import type { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import definePlugin, { OptionType } from "@utils/types";
import { findStore } from "@webpack";
import {
    FluxDispatcher,
    Menu,
    React,
    RestAPI,
    showToast,
    Text,
    Toasts,
    UserStore,
    useState } from "@webpack/common";

export const settings = definePluginSettings({
    autoPurge: {
        type: OptionType.BOOLEAN,
        description: "Automatically delete activity history entries from Discord servers whenever games or activities end",
        default: true
    },
    blockSpotifyTracking: {
        type: OptionType.BOOLEAN,
        description: "Prevent Spotify playback from being uploaded to Discord's content inventory feed",
        default: true
    },
    hideInLocalProfile: {
        type: OptionType.BOOLEAN,
        description: "Hide the recent activity section immediately on your own profile",
        default: true
    },
    wipeOnStartup: {
        type: OptionType.BOOLEAN,
        description: "Wipe all activity history when Discord launches",
        default: true
    },
    showToasts: {
        type: OptionType.BOOLEAN,
        description: "Show a toast notification when activity history is purged",
        default: false
    }
});

function TrashIcon() {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
        >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
    );
}

export async function fetchMyOutbox(): Promise<any[]> {
    const user = UserStore.getCurrentUser();
    if (!user?.id) return [];

    try {
        const res = await RestAPI.get({
            url: `/content-inventory/users/${user.id}/outbox`
        });
        if (res?.body?.entries && Array.isArray(res.body.entries)) {
            return res.body.entries;
        }
    } catch {}

    try {
        const res = await RestAPI.get({
            url: "/content-inventory/users/@me/outbox"
        });
        if (res?.body?.entries && Array.isArray(res.body.entries)) {
            return res.body.entries;
        }
    } catch {}

    return [];
}

export async function deleteOutboxEntry(entryId: string): Promise<boolean> {
    if (!entryId) return false;
    try {
        await RestAPI.del({
            url: `/content-inventory/users/@me/outbox/entries/id/${entryId}/history`
        });
        return true;
    } catch {
        return false;
    }
}

let isWiping = false;

export async function wipeAllActivityHistory(notifyUser = false): Promise<number> {
    if (isWiping) return 0;
    isWiping = true;

    try {
        const entries = await fetchMyOutbox();
        if (!entries || entries.length === 0) {
            if (notifyUser) {
                showToast(t("No activity history found."), Toasts.Type.SUCCESS);
            }
            return 0;
        }

        let deletedCount = 0;
        const currentUserId = UserStore.getCurrentUser()?.id;

        for (const entry of entries) {
            if (!entry?.id) continue;
            const ok = await deleteOutboxEntry(entry.id);
            if (ok) {
                deletedCount++;
                try {
                    FluxDispatcher.dispatch({
                        type: "CONTENT_INVENTORY_DELETE_OUTBOX_ENTRY_SUCCESS",
                        userId: currentUserId,
                        entry
                    });
                } catch {}
            }
        }

        if (notifyUser || (settings.store.showToasts && deletedCount > 0)) {
            showToast(
                deletedCount > 0
                    ? `${t("History wiped successfully.")} (${deletedCount})`
                    : t("No activity history found."),
                Toasts.Type.SUCCESS
            );
        }

        return deletedCount;
    } catch {
        if (notifyUser) {
            showToast(t("Failed to clear activity history."), Toasts.Type.FAILURE);
        }
        return 0;
    } finally {
        isWiping = false;
    }
}

let wipeTimeout: ReturnType<typeof setTimeout> | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;

function scheduleWipe(delayMs = 2000) {
    if (!settings.store.autoPurge) return;
    if (wipeTimeout) clearTimeout(wipeTimeout);
    wipeTimeout = setTimeout(() => {
        wipeTimeout = null;
        void wipeAllActivityHistory(false);
    }, delayMs);
}

function handleRunningGamesChange() {
    scheduleWipe(2500);
}

function handleOutboxFetchSuccess(event: any) {
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (event?.userId === currentUserId && event?.outbox?.entries?.length > 0) {
        scheduleWipe(800);
    }
}

function handleSpotifyPlayerState() {
    scheduleWipe(3000);
}

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user, userId }: { user?: any; userId?: string; }) => {
    const targetUser = user ?? (userId ? UserStore.getUser(userId) : null);
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!targetUser || !currentUserId || targetUser.id !== currentUserId) return;

    children.push(
        <Menu.MenuGroup key="nc-clear-activity-history-group">
            <Menu.MenuItem
                id="nc-clear-activity-history-item"
                label={t("Clear All Activity History")}
                icon={TrashIcon}
                iconLeft={TrashIcon}
                leadingAccessory={{
                    type: "icon",
                    icon: TrashIcon
                }}
                action={() => {
                    void wipeAllActivityHistory(true);
                }}
            />
        </Menu.MenuGroup>
    );
};

function ClearActivityHistorySettingsPanel() {
    const [wiping, setWiping] = useState(false);
    const [lastResult, setLastResult] = useState<string | null>(null);

    const onManualWipe = async () => {
        setWiping(true);
        setLastResult(null);
        try {
            const count = await wipeAllActivityHistory(true);
            setLastResult(
                count > 0
                    ? `${t("History wiped successfully.")} (${count})`
                    : t("No activity history found.")
            );
        } finally {
            setWiping(false);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
                style={{
                    backgroundColor: "var(--background-secondary-alt, #1e1f22)",
                    borderRadius: "8px",
                    border: "1px solid var(--background-modifier-accent, rgba(255, 255, 255, 0.08))",
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ color: "#ffffff", display: "flex", alignItems: "center" }}>
                        <TrashIcon />
                    </div>
                    <div>
                        <Text variant="heading-md/bold" style={{ color: "#ffffff", margin: 0 }}>
                            {t("Clear All Activity History")}
                        </Text>
                        <Text variant="text-sm/normal" style={{ color: "var(--text-muted, #949ba4)", marginTop: 2 }}>
                            {t("Immediately purge all recent games, Spotify listening history, and launched activities from Discord servers.")}
                        </Text>
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                    <Button
                        color={Button.Colors.BRAND}
                        size={Button.Sizes.SMALL}
                        onClick={onManualWipe}
                        disabled={wiping}
                        submitting={wiping}
                    >
                        {wiping ? t("Wiping history...") : t("Wipe History Now")}
                    </Button>
                    {lastResult && (
                        <Text variant="text-sm/medium" style={{ color: "var(--text-normal, #f2f3f5)" }}>
                            {lastResult}
                        </Text>
                    )}
                </div>
            </div>
        </div>
    );
}

let origRestPost: typeof RestAPI.post | null = null;
let origGetUserOutbox: any = null;
let origGetMatchingOutboxEntry: any = null;

export default definePlugin({
    name: "ClearActivityHistory",
    description: "Automatically clear and suppress your Discord activity history (played games, listened music, launched activities).",
    authors: [{
        name: "Nightcord",
        id: 0n
    }],
    enabledByDefault: false,
    settings,
    settingsAboutComponent: ClearActivityHistorySettingsPanel,
    contextMenus: {
        "user-context": UserContextMenuPatch
    },

    start() {
        // 1. Intercept Spotify tracking POST requests so Spotify history is never uploaded
        if (RestAPI && RestAPI.post && !origRestPost) {
            origRestPost = RestAPI.post;
            RestAPI.post = function (options: any, ...rest: any[]) {
                const url = typeof options === "string" ? options : options?.url;
                if (settings.store.blockSpotifyTracking && typeof url === "string" && url.includes("/content-inventory/users/@me/spotify")) {
                    return Promise.resolve({ ok: true, status: 200, body: {} } as any);
                }
                return origRestPost!.call(this, options, ...rest);
            };
        }

        // 2. Patch local ContentInventoryOutboxStore to immediately hide recent activity from own profile
        const ContentInventoryOutboxStore = findStore("ContentInventoryOutboxStore");
        if (ContentInventoryOutboxStore) {
            if (ContentInventoryOutboxStore.getUserOutbox && !origGetUserOutbox) {
                origGetUserOutbox = ContentInventoryOutboxStore.getUserOutbox;
                ContentInventoryOutboxStore.getUserOutbox = function (userId: string, ...rest: any[]) {
                    const res = origGetUserOutbox.call(this, userId, ...rest);
                    if (settings.store.hideInLocalProfile && userId === UserStore.getCurrentUser()?.id) {
                        return { entries: [], lastFetched: Date.now() };
                    }
                    return res;
                };
            }

            if (ContentInventoryOutboxStore.getMatchingOutboxEntry && !origGetMatchingOutboxEntry) {
                origGetMatchingOutboxEntry = ContentInventoryOutboxStore.getMatchingOutboxEntry;
                ContentInventoryOutboxStore.getMatchingOutboxEntry = function (props: any, ...rest: any[]) {
                    if (settings.store.hideInLocalProfile && props?.userId === UserStore.getCurrentUser()?.id) {
                        return undefined;
                    }
                    return origGetMatchingOutboxEntry.call(this, props, ...rest);
                };
            }
        }

        // 3. Register FluxDispatcher listeners
        FluxDispatcher.subscribe("RUNNING_GAMES_CHANGE", handleRunningGamesChange);
        FluxDispatcher.subscribe("CONTENT_INVENTORY_FETCH_OUTBOX_SUCCESS", handleOutboxFetchSuccess);
        FluxDispatcher.subscribe("SPOTIFY_PLAYER_STATE", handleSpotifyPlayerState);

        // 4. Initial purge if configured
        if (settings.store.wipeOnStartup) {
            scheduleWipe(1500);
        }

        // 5. Periodic background sweep (every 45s)
        intervalId = setInterval(() => {
            if (settings.store.autoPurge) {
                void wipeAllActivityHistory(false);
            }
        }, 45000);
    },

    stop() {
        if (origRestPost) {
            RestAPI.post = origRestPost;
            origRestPost = null;
        }

        const ContentInventoryOutboxStore = findStore("ContentInventoryOutboxStore");
        if (ContentInventoryOutboxStore) {
            if (origGetUserOutbox) {
                ContentInventoryOutboxStore.getUserOutbox = origGetUserOutbox;
                origGetUserOutbox = null;
            }
            if (origGetMatchingOutboxEntry) {
                ContentInventoryOutboxStore.getMatchingOutboxEntry = origGetMatchingOutboxEntry;
                origGetMatchingOutboxEntry = null;
            }
        }

        if (wipeTimeout) {
            clearTimeout(wipeTimeout);
            wipeTimeout = null;
        }

        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }

        FluxDispatcher.unsubscribe("RUNNING_GAMES_CHANGE", handleRunningGamesChange);
        FluxDispatcher.unsubscribe("CONTENT_INVENTORY_FETCH_OUTBOX_SUCCESS", handleOutboxFetchSuccess);
        FluxDispatcher.unsubscribe("SPOTIFY_PLAYER_STATE", handleSpotifyPlayerState);
    }
});
