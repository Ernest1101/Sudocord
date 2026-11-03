/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import { definePluginSettings } from "@api/Settings";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import { fetchUserProfile, openUserProfile } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import {
    ChannelActionCreators,
    ChannelStore,
    Constants,
    FluxDispatcher,
    GuildMemberStore,
    GuildStore,
    IconUtils,
    RelationshipStore,
    RestAPI,
    SelectedGuildStore,
    showToast,
    Toasts,
    UserProfileActions,
    UserStore,
    UserUtils,
} from "@webpack/common";

const RelationshipActions = findByPropsLazy("removeFriend", "sendFriendRequest") as any;

export const settings = definePluginSettings({
    searchById: {
        type: OptionType.BOOLEAN,
        description: "Search by User ID (Snowflake)",
        default: true,
    },
    includeBlocked: {
        type: OptionType.BOOLEAN,
        description: "Include blocked users in search results",
        default: true,
    },
    includeAllUsers: {
        type: OptionType.BOOLEAN,
        description: "Include all known and cached users in search results",
        default: true,
    },
    searchAllServers: {
        type: OptionType.BOOLEAN,
        description: "Search across all joined servers",
        default: true,
    },
    resolveStrangers: {
        type: OptionType.BOOLEAN,
        description: "Resolve stranger usernames without mutual servers",
        default: true,
    },
    fallbackToProfile: {
        type: OptionType.BOOLEAN,
        description: "Open profile modal if direct message cannot be opened",
        default: true,
    },
});

const fetchingIds = new Set<string>();
const failedIds = new Set<string>();
const resolvingUsernames = new Set<string>();
const failedUsernames = new Set<string>();
const pendingResolutions = new Map<string, Promise<any>>();
const extraUsersCache = new Map<string, any>();

let activeSwitcher: any = null;
let lastServerQuery = "";
let serverSearchTimer: any = null;
let strangerResolveTimer: any = null;
let lastStrangerResolveTime = 0;
let captchaCooldownUntil = 0;
let boundOnChunk: ((event: any) => void) | null = null;
let boundOnChunkBatch: ((event: any) => void) | null = null;
let switcherObserver: MutationObserver | null = null;

const USERNAME_REGEX = /^[a-zA-Z0-9_.]{2,32}$/;

async function openUserFallbackProfile(userId: string) {
    if (!userId || userId === "0" || userId === "100000000000000000") return;

    try {
        fetchUserProfile(userId, {}, false).catch(() => {});
    } catch {}

    if (!UserStore.getUser(userId)) {
        try {
            if (typeof UserUtils?.getUser === "function") {
                await UserUtils.getUser(userId);
            }
        } catch {}
    }

    try {
        if (typeof UserProfileActions?.openUserProfileModal === "function") {
            const guildId = SelectedGuildStore?.getGuildId?.();
            UserProfileActions.openUserProfileModal({
                userId,
                guildId,
                analyticsLocation: {
                    page: guildId ? "Guild Channel" : "Quick Switcher",
                    section: "Profile Popout",
                },
            });
            return;
        }
    } catch {}

    try {
        await openUserProfile(userId);
    } catch {}
}

async function fetchAndCacheUser(userId: string, switcher?: any): Promise<any> {
    if (fetchingIds.has(userId) || failedIds.has(userId)) return null;
    const existing = UserStore.getUser(userId) || extraUsersCache.get(userId);
    if (existing) return existing;

    fetchingIds.add(userId);
    try {
        let user: any = null;

        // 1. Try Discord UserUtils.getUser
        try {
            if (typeof UserUtils?.getUser === "function") {
                user = await UserUtils.getUser(userId);
            }
        } catch {}

        // 2. Try RestAPI GET USER endpoint
        if (!user) {
            try {
                const res = await RestAPI.get({
                    url: Constants.Endpoints.USER(userId),
                });
                if (res?.body) {
                    FluxDispatcher.dispatch({
                        type: "USER_UPDATE",
                        user: res.body,
                    });
                    user = UserStore.getUser(userId) || res.body;
                }
            } catch {}
        }

        // 3. Try fetchUserProfile fallback
        if (!user) {
            try {
                await fetchUserProfile(userId, {}, false);
                user = UserStore.getUser(userId);
            } catch {}
        }

        if (user) {
            extraUsersCache.set(userId, user);
            try {
                switcher?.forceUpdate?.();
            } catch {}
            return user;
        } else {
            failedIds.add(userId);
            return null;
        }
    } catch {
        failedIds.add(userId);
        return null;
    } finally {
        fetchingIds.delete(userId);
    }
}

function triggerGuildMembersSearch(cleanQuery: string, switcher?: any) {
    if (!settings.store.searchAllServers || cleanQuery.length < 2) return;
    if (lastServerQuery === cleanQuery) return;
    lastServerQuery = cleanQuery;

    clearTimeout(serverSearchTimer);
    serverSearchTimer = setTimeout(() => {
        try {
            const guilds = Object.keys(GuildStore.getGuilds?.() ?? {});
            if (guilds.length === 0) return;

            // Batch gateway requests in chunks of 25 guilds
            for (let i = 0; i < guilds.length; i += 25) {
                const batch = guilds.slice(i, i + 25);
                FluxDispatcher.dispatch({
                    type: "GUILD_MEMBERS_REQUEST",
                    guildIds: batch,
                    query: cleanQuery,
                    limit: 30,
                });
            }

            // Also search selected guild via REST if active
            const activeGuildId = SelectedGuildStore?.getGuildId?.();
            if (activeGuildId) {
                RestAPI.get({
                    url: `/guilds/${activeGuildId}/members/search`,
                    query: { query: cleanQuery, limit: 30 },
                }).then((res: any) => {
                    if (Array.isArray(res?.body)) {
                        let added = false;
                        for (const m of res.body) {
                            if (m?.user?.id) {
                                extraUsersCache.set(m.user.id, m.user);
                                FluxDispatcher.dispatch({ type: "USER_UPDATE", user: m.user });
                                added = true;
                            }
                        }
                        if (added) {
                            try { switcher?.forceUpdate?.(); } catch {}
                        }
                    }
                }).catch(() => {});
            }
        } catch {}
    }, 80);
}

async function resolveStranger(cleanQuery: string, switcher?: any, isManual = false): Promise<any> {
    if (!settings.store.resolveStrangers) return null;
    if (!USERNAME_REGEX.test(cleanQuery)) return null;

    // Check if user is already present in extraUsersCache
    for (const [_, u] of extraUsersCache.entries()) {
        if (u?.username?.toLowerCase() === cleanQuery) return u;
    }

    if (isManual) {
        failedUsernames.delete(cleanQuery);
        captchaCooldownUntil = 0;
    } else {
        if (failedUsernames.has(cleanQuery)) return null;
        if (Date.now() < captchaCooldownUntil) return null;
    }

    // Reuse in-flight resolution if already active
    const existingPromise = pendingResolutions.get(cleanQuery);
    if (existingPromise) return existingPromise;

    resolvingUsernames.add(cleanQuery);
    try { switcher?.forceUpdate?.(); } catch {}

    const promise = (async () => {
        let resolvedUser: any = null;
        let resolveUserPromise: ((user: any) => void) | null = null;

        const userPromise = new Promise<any>(resolve => {
            resolveUserPromise = resolve;
        });

        // 6-second timeout for stranger resolution
        const waitTimer = setTimeout(() => {
            if (resolveUserPromise) {
                resolveUserPromise(null);
                resolveUserPromise = null;
            }
        }, 6000);

        const onRelAdd = (event: any) => {
            const rel = event?.relationship || event;
            const u = rel?.user || event?.user;
            if (u?.id) {
                const uName = (u.username || "").toLowerCase();
                if (uName === cleanQuery || rel?.type === 4 || rel?.type === "4") {
                    resolvedUser = u;
                    clearTimeout(waitTimer);
                    if (resolveUserPromise) {
                        resolveUserPromise(u);
                        resolveUserPromise = null;
                    }
                }
            }
        };

        const onRelUpdate = (event: any) => {
            const rel = event?.relationship || event;
            const u = rel?.user || event?.user;
            if (u?.id) {
                const uName = (u.username || "").toLowerCase();
                if (uName === cleanQuery) {
                    resolvedUser = u;
                    clearTimeout(waitTimer);
                    if (resolveUserPromise) {
                        resolveUserPromise(u);
                        resolveUserPromise = null;
                    }
                }
            }
        };

        try {
            FluxDispatcher.subscribe("RELATIONSHIP_ADD", onRelAdd);
            FluxDispatcher.subscribe("RELATIONSHIP_UPDATE", onRelUpdate);

            let queryUsername = cleanQuery;
            let queryDiscrim: number | undefined = undefined;
            if (cleanQuery.includes("#")) {
                const parts = cleanQuery.split("#");
                queryUsername = parts[0];
                if (parts[1]) {
                    const parsed = parseInt(parts[1], 10);
                    if (!isNaN(parsed) && parsed > 0) {
                        queryDiscrim = parsed;
                    }
                }
            }

            lastStrangerResolveTime = Date.now();

            let requestDispatched = false;
            if (typeof RelationshipActions?.sendFriendRequest === "function") {
                try {
                    await RelationshipActions.sendFriendRequest({
                        username: queryUsername,
                        discriminator: queryDiscrim,
                    });
                    requestDispatched = true;
                } catch (e: any) {
                    const code = e?.body?.code || e?.status;
                    if (code === 80004) {
                        failedUsernames.add(cleanQuery);
                    }
                    if (e?.body?.captcha_key || e?.body?.captcha_sitekey || e?.status === 400 || e?.status === 429) {
                        captchaCooldownUntil = Date.now() + 25000;
                    }
                }
            }

            if (!requestDispatched && !failedUsernames.has(cleanQuery)) {
                try {
                    const body: Record<string, any> = { username: queryUsername };
                    if (queryDiscrim !== undefined) body.discriminator = queryDiscrim;
                    await RestAPI.post({
                        url: "/users/@me/relationships",
                        body,
                    });
                } catch (e: any) {
                    const code = e?.body?.code || e?.status;
                    if (code === 80004) {
                        failedUsernames.add(cleanQuery);
                    }
                    if (e?.body?.captcha_key || e?.body?.captcha_sitekey || e?.status === 400 || e?.status === 429) {
                        captchaCooldownUntil = Date.now() + 25000;
                    }
                }
            }

            const finalUser = await userPromise;
            const targetUser = finalUser || resolvedUser;

            if (targetUser?.id) {
                // Instantly cancel outgoing friend request so no trace remains
                try {
                    await RestAPI.del({ url: `/users/@me/relationships/${targetUser.id}` });
                } catch {
                    try {
                        if (typeof RelationshipActions?.cancelFriendRequest === "function") {
                            await RelationshipActions.cancelFriendRequest(targetUser.id);
                        } else if (typeof RelationshipActions?.removeFriend === "function") {
                            await RelationshipActions.removeFriend(targetUser.id);
                        }
                    } catch {}
                }

                extraUsersCache.set(targetUser.id, targetUser);
                FluxDispatcher.dispatch({
                    type: "USER_UPDATE",
                    user: targetUser,
                });
                return targetUser;
            }
            return null;
        } catch {
            return null;
        } finally {
            clearTimeout(waitTimer);
            FluxDispatcher.unsubscribe("RELATIONSHIP_ADD", onRelAdd);
            FluxDispatcher.unsubscribe("RELATIONSHIP_UPDATE", onRelUpdate);
            resolvingUsernames.delete(cleanQuery);
            pendingResolutions.delete(cleanQuery);
            try { switcher?.forceUpdate?.(); } catch {}
        }
    })();

    pendingResolutions.set(cleanQuery, promise);
    return promise;
}

function triggerStrangerResolution(cleanQuery: string, switcher?: any) {
    if (!settings.store.resolveStrangers) return;
    if (cleanQuery.length < 3 || !USERNAME_REGEX.test(cleanQuery)) return;
    if (resolvingUsernames.has(cleanQuery) || failedUsernames.has(cleanQuery)) return;
    if (pendingResolutions.has(cleanQuery)) return;

    // Check if user is already present in extraUsersCache or UserStore
    for (const [_, u] of extraUsersCache.entries()) {
        if (u?.username?.toLowerCase() === cleanQuery || u?.tag?.toLowerCase() === cleanQuery) return;
    }
    try {
        const users = (UserStore as any).getUsers?.() ?? (UserStore as any)._users;
        if (users instanceof Map) {
            for (const u of users.values()) {
                if (u?.username?.toLowerCase() === cleanQuery || u?.tag?.toLowerCase() === cleanQuery) return;
            }
        } else if (typeof users === "object" && users) {
            for (const id of Object.keys(users)) {
                const u = users[id];
                if (u?.username?.toLowerCase() === cleanQuery || u?.tag?.toLowerCase() === cleanQuery) return;
            }
        }
    } catch {}

    clearTimeout(strangerResolveTimer);
    strangerResolveTimer = setTimeout(async () => {
        if (resolvingUsernames.has(cleanQuery) || failedUsernames.has(cleanQuery)) return;
        if (Date.now() - lastStrangerResolveTime < 2500) {
            clearTimeout(strangerResolveTimer);
            strangerResolveTimer = setTimeout(() => {
                triggerStrangerResolution(cleanQuery, switcher);
            }, 1500);
            return;
        }

        if (Date.now() < captchaCooldownUntil) return;

        await resolveStranger(cleanQuery, switcher);
    }, 800);
}

async function handleStrangerSelect(username: string, switcher?: any) {
    if (!username) return;
    const clean = username.toLowerCase().trim();

    // Close switcher modal first so it doesn't conflict with the profile modal
    try { switcher?.props?.onClose?.(); } catch {}
    try { switcher?.props?.close?.(); } catch {}

    // Check cache first
    let user = extraUsersCache.get(clean);
    if (!user) {
        for (const [_, u] of extraUsersCache.entries()) {
            if (u?.username?.toLowerCase() === clean) {
                user = u;
                break;
            }
        }
    }

    if (user?.id) {
        await openUserFallbackProfile(user.id);
        return;
    }

    // Not cached: resolve on demand with toast feedback
    try {
        showToast(t("Resolving user profile..."), Toasts.Type.NORMAL);
    } catch {}

    try {
        const resolved = await resolveStranger(clean, switcher);
        if (resolved?.id) {
            await openUserFallbackProfile(resolved.id);
        } else {
            showToast(t("User not found or verification required."), Toasts.Type.FAILURE);
        }
    } catch {
        showToast(t("User not found or verification required."), Toasts.Type.FAILURE);
    }
}


async function performAdvancedSearch(switcher?: any) {
    const input = document.querySelector<HTMLInputElement>(".quickswitcher_ac6cb0 .input_ac6cb0");
    const rawQuery = (switcher?.state?.query ?? input?.value ?? "").trim();

    if (!rawQuery) {
        showToast(t("Please enter a username to search."), Toasts.Type.NORMAL);
        return;
    }

    const cleanQuery = rawQuery.toLowerCase().replace(/^@/, "").trim();
    if (cleanQuery.length < 2) {
        showToast(t("Username too short."), Toasts.Type.NORMAL);
        return;
    }

    const btn = document.querySelector<HTMLElement>("#nightcord-validsearch-btn");
    if (btn) btn.classList.add("loading");

    // 1. Check if user already exists in extraUsersCache or UserStore
    let targetUser = extraUsersCache.get(cleanQuery);
    if (!targetUser) {
        for (const u of extraUsersCache.values()) {
            if (u?.username?.toLowerCase() === cleanQuery || u?.tag?.toLowerCase() === cleanQuery) {
                targetUser = u;
                break;
            }
        }
    }
    if (!targetUser) {
        try {
            const users = (UserStore as any).getUsers?.() ?? (UserStore as any)._users;
            if (users instanceof Map) {
                for (const u of users.values()) {
                    if (u?.username?.toLowerCase() === cleanQuery || u?.tag?.toLowerCase() === cleanQuery) {
                        targetUser = u;
                        break;
                    }
                }
            } else if (typeof users === "object" && users) {
                for (const id of Object.keys(users)) {
                    const u = users[id];
                    if (u?.username?.toLowerCase() === cleanQuery || u?.tag?.toLowerCase() === cleanQuery) {
                        targetUser = u;
                        break;
                    }
                }
            }
        } catch {}
    }

    const applyFoundUser = (user: any) => {
        if (!user?.id) return;
        extraUsersCache.set(user.id, user);
        try {
            FluxDispatcher.dispatch({
                type: "USER_UPDATE",
                user,
            });
        } catch {}

        const sw = switcher || activeSwitcher;
        if (sw) {
            try {
                if (sw.props) {
                    sw.props.selectedIndex = 0;
                }
                if (typeof sw.forceUpdate === "function") {
                    sw.forceUpdate();
                } else if (typeof sw.setState === "function") {
                    sw.setState((s: any) => ({ ...s }));
                }
            } catch {}
        }
        input?.focus();
    };

    if (targetUser?.id) {
        if (btn) btn.classList.remove("loading");
        applyFoundUser(targetUser);
        return;
    }

    // 2. User not cached: resolve stranger on demand
    try {
        showToast(t("Resolving user profile..."), Toasts.Type.NORMAL);
        const resolved = await resolveStranger(cleanQuery, switcher || activeSwitcher, true);
        if (btn) btn.classList.remove("loading");

        if (resolved?.id) {
            applyFoundUser(resolved);
        } else {
            showToast(t("User not found or verification required."), Toasts.Type.FAILURE);
        }
    } catch {
        if (btn) btn.classList.remove("loading");
        showToast(t("User not found or verification required."), Toasts.Type.FAILURE);
    }
}

function updateButtonPosition(btn: HTMLElement, container: HTMLElement, input: HTMLInputElement) {
    const containerRect = container.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();

    if (inputRect.width > 0 && containerRect.width > 0) {
        const offsetRight = Math.max(0, containerRect.right - inputRect.right);
        const topOffset = (inputRect.top - containerRect.top) + inputRect.height / 2;
        btn.style.right = `${offsetRight + 12}px`;
        btn.style.top = `${topOffset}px`;
    } else {
        const containerWidth = container.offsetWidth;
        const inputRight = input.offsetLeft + input.offsetWidth;
        const offsetRight = Math.max(0, containerWidth - inputRight);
        const top = input.offsetTop + input.offsetHeight / 2;
        btn.style.right = `${offsetRight + 12}px`;
        btn.style.top = `${top}px`;
    }
    btn.style.transform = "translateY(-50%)";
}

function mountSearchButton(switcher?: any) {
    const container = document.querySelector<HTMLElement>(".quickswitcher_ac6cb0");
    if (!container) return;

    if (getComputedStyle(container).position === "static") {
        container.style.position = "relative";
    }

    const input = container.querySelector<HTMLInputElement>(".input_ac6cb0");
    if (input) {
        input.style.paddingRight = "54px";
    }

    let btn = container.querySelector<HTMLElement>("#nightcord-validsearch-btn");
    if (!btn) {
        btn = document.createElement("div");
        btn.id = "nightcord-validsearch-btn";
        btn.className = "nightcord-validsearch-btn";
        btn.setAttribute("role", "button");
        btn.setAttribute("tabindex", "0");
        btn.setAttribute("aria-label", t("Advanced User Search"));
        btn.setAttribute("title", t("Advanced User Search"));

        btn.innerHTML = '<svg class="vc-ic-save-icon" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M12 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM11.53 11A9.53 9.53 0 0 0 2 20.53c0 .81.66 1.47 1.47 1.47h.22c.24 0 .44-.17.5-.4.29-1.12.84-2.17 1.32-2.91.14-.21.43-.1.4.15l-.26 2.61c-.02.3.2.55.5.55h6.4a.5.5 0 0 0 .35-.85l-.02-.03a3 3 0 1 1 4.24-4.24l.53.52c.2.2.5.2.7 0l1.8-1.8c.17-.17.2-.43.06-.62A9.52 9.52 0 0 0 12.47 11h-.94Z"></path><path fill="currentColor" d="M23.7 17.7a1 1 0 1 0-1.4-1.4L18 20.58l-2.3-2.3a1 1 0 0 0-1.4 1.42l3 3a1 1 0 0 0 1.4 0l5-5Z"></path></svg>';

        // Prevent input from losing focus when clicking button
        btn.addEventListener("mousedown", e => {
            e.preventDefault();
        });

        btn.addEventListener("click", async e => {
            e.preventDefault();
            e.stopPropagation();
            await performAdvancedSearch(switcher || activeSwitcher);
        });

        btn.addEventListener("keydown", async e => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                await performAdvancedSearch(switcher || activeSwitcher);
            }
        });

        container.appendChild(btn);
    }

    if (input) {
        updateButtonPosition(btn, container, input);
        requestAnimationFrame(() => {
            if (btn && container && input && container.contains(btn)) {
                updateButtonPosition(btn, container, input);
            }
        });
    }
}

function getAllCachedUsersWithNicks(): Array<{ user: any; nicks: Set<string> }> {
    const map = new Map<string, { user: any; nicks: Set<string> }>();

    const getOrCreate = (id: string, fallbackUser?: any) => {
        let entry = map.get(id);
        if (!entry) {
            const u = UserStore.getUser(id) || fallbackUser || extraUsersCache.get(id);
            if (u?.id) {
                entry = { user: u, nicks: new Set<string>() };
                map.set(id, entry);
            }
        }
        return entry;
    };

    // 1. Session extra cache
    for (const [id, u] of extraUsersCache.entries()) {
        getOrCreate(id, u);
    }

    // 2. UserStore
    try {
        const users = (UserStore as any).getUsers?.() ?? (UserStore as any)._users;
        if (users) {
            if (users instanceof Map) {
                for (const [id, u] of users.entries()) {
                    if (u?.id) getOrCreate(id, u);
                }
            } else if (typeof users === "object") {
                for (const id of Object.keys(users)) {
                    const u = users[id];
                    if (u?.id) getOrCreate(id, u);
                }
            }
        }
    } catch {}

    // 3. Blocked users
    try {
        const blockedIds = RelationshipStore.getBlockedIDs?.() ?? [];
        for (const id of blockedIds) {
            getOrCreate(id);
        }
    } catch {}

    // 4. Friends & Relationships
    try {
        const friendIds = RelationshipStore.getFriendIDs?.() ?? [];
        for (const id of friendIds) {
            getOrCreate(id);
        }
        const rels = RelationshipStore.getRelationships?.();
        if (rels && typeof rels === "object") {
            for (const id of Object.keys(rels)) {
                getOrCreate(id);
            }
        }
    } catch {}

    // 5. ChannelStore DMs
    try {
        const dmIds = ChannelStore.getDMUserIds?.() ?? [];
        for (const id of dmIds) {
            getOrCreate(id);
        }
        const privateChannels = (ChannelStore as any).getSortedPrivateChannels?.() ?? [];
        for (const ch of privateChannels) {
            const recIds = ch?.recipientIDs ?? ch?.recipients ?? [];
            for (const id of recIds) {
                if (typeof id === "string") getOrCreate(id);
                else if (id?.id) getOrCreate(id.id, id);
            }
        }
    } catch {}

    // 6. Guild members
    try {
        const guilds = GuildStore.getGuilds?.();
        if (guilds && typeof guilds === "object") {
            for (const guildId of Object.keys(guilds)) {
                const members = GuildMemberStore.getMembers?.(guildId);
                if (Array.isArray(members)) {
                    for (const m of members) {
                        if (m?.userId) {
                            const entry = getOrCreate(m.userId);
                            if (entry && m.nick) {
                                entry.nicks.add(m.nick);
                            }
                        }
                    }
                }
            }
        }
    } catch {}

    return Array.from(map.values());
}

function matchesQuery(user: any, cleanQuery: string, nicks?: Set<string>): boolean {
    if (!user) return false;
    const username = (user.username || "").toLowerCase();
    const globalName = (user.globalName || user.global_name || "").toLowerCase();
    const displayName = (user.displayName || "").toLowerCase();
    const id = user.id || "";

    if (username.includes(cleanQuery)
        || globalName.includes(cleanQuery)
        || displayName.includes(cleanQuery)
        || id.includes(cleanQuery)) {
        return true;
    }

    if (nicks) {
        for (const n of nicks) {
            if (n.toLowerCase().includes(cleanQuery)) return true;
        }
    }

    return false;
}

function computeScore(user: any, cleanQuery: string, isBlocked?: boolean, nicks?: Set<string>): number {
    if (!user) return 0;
    const username = (user.username || "").toLowerCase();
    const globalName = (user.globalName || user.global_name || "").toLowerCase();
    const tag = (user.tag || "").toLowerCase();
    const id = user.id || "";

    // 1. Exact match by User ID
    if (id === cleanQuery) {
        return 1000000;
    }

    // 2. Exact match by handle / username (Pomelo handle is the true unique identifier)
    if (username === cleanQuery || tag === cleanQuery) {
        return globalName === cleanQuery ? 600000 : 500000;
    }

    // 3. Exact match by global name
    if (globalName === cleanQuery) {
        return 350000;
    }

    // 4. Exact match by nickname
    if (nicks) {
        for (const n of nicks) {
            if (n.toLowerCase() === cleanQuery) return 300000;
        }
    }

    // 5. Username starts with query (closer length = higher score)
    if (username.startsWith(cleanQuery)) {
        const penalty = Math.min((username.length - cleanQuery.length) * 100, 20000);
        return 200000 - penalty;
    }

    // 6. Global name starts with query
    if (globalName.startsWith(cleanQuery)) {
        const penalty = Math.min((globalName.length - cleanQuery.length) * 100, 20000);
        return 160000 - penalty;
    }

    // 7. Nickname starts with query
    if (nicks) {
        for (const n of nicks) {
            if (n.toLowerCase().startsWith(cleanQuery)) return 130000;
        }
    }

    // 8. Username contains query
    if (username.includes(cleanQuery)) {
        return 90000;
    }

    // 9. Global name contains query
    if (globalName.includes(cleanQuery)) {
        return 70000;
    }

    // 10. Nickname contains query
    if (nicks) {
        for (const n of nicks) {
            if (n.toLowerCase().includes(cleanQuery)) return 50000;
        }
    }

    let score = 20000;
    if (isBlocked) {
        score -= 5000;
    }

    return score;
}

function createDummyUserRecord(id: string, username: string, label: string): any {
    const safeId = /^\d{17,20}$/.test(id) ? id : "0";
    const URec: any = UserStore.getCurrentUser()?.constructor;
    if (URec && safeId !== "0") {
        try {
            return new URec({
                id: safeId,
                username,
                globalName: label,
                global_name: label,
                discriminator: "0",
                avatar: null,
                bot: false,
            });
        } catch {}
    }

    return {
        id: safeId,
        username,
        globalName: label,
        global_name: label,
        tag: username,
        discriminator: "0",
        avatar: null,
        getAvatarURL: () => (IconUtils as any)?.getDefaultAvatarURL?.("0") || "",
        isSystemUser: () => false,
        isStaff: () => false,
        hasFlag: () => false,
    };
}

function extractUserFromResult(r: any): any {
    if (!r) return null;
    const rec = r.record;
    if (rec) {
        if (rec.username) return rec;
        if (rec.user?.username) return rec.user;
        if (rec.recipientId) {
            const u = UserStore.getUser(rec.recipientId);
            if (u) return u;
        }
        if (Array.isArray(rec.recipients) && rec.recipients.length > 0) {
            const u = UserStore.getUser(rec.recipients[0]);
            if (u) return u;
        }
    }
    return null;
}

function hasMatchingUser(cleanQuery: string, results: any[], extraItems: any[]): boolean {
    if (!cleanQuery) return true;

    // 1. Check all results (native + extra)
    for (const r of [...results, ...extraItems]) {
        const u = extractUserFromResult(r);
        if (u) {
            const uName = (u.username || "").toLowerCase();
            const tag = (u.tag || "").toLowerCase();
            if (uName === cleanQuery || tag === cleanQuery) {
                return true;
            }
        }
        const comp = (r?.comparator || "").toLowerCase();
        const sort = (r?.sortable || "").toLowerCase();
        if (comp === cleanQuery || sort === cleanQuery || comp.endsWith(` ${cleanQuery}`) || comp.includes(cleanQuery)) {
            if (r?.type === "USER" || r?.record?.isDM?.() || r?.record?.recipientId) {
                return true;
            }
        }
    }

    // 2. Check extraUsersCache
    for (const u of extraUsersCache.values()) {
        if (u?.username?.toLowerCase() === cleanQuery || u?.tag?.toLowerCase() === cleanQuery) {
            return true;
        }
    }

    // 3. Check UserStore
    try {
        const users = (UserStore as any).getUsers?.() ?? (UserStore as any)._users;
        if (users instanceof Map) {
            for (const u of users.values()) {
                if (u?.username?.toLowerCase() === cleanQuery || u?.tag?.toLowerCase() === cleanQuery) {
                    return true;
                }
            }
        } else if (typeof users === "object" && users) {
            for (const id of Object.keys(users)) {
                const u = users[id];
                if (u?.username?.toLowerCase() === cleanQuery || u?.tag?.toLowerCase() === cleanQuery) {
                    return true;
                }
            }
        }
    } catch {}

    return false;
}

export default definePlugin({
    name: "ValidSearch",
    description: "Find any user in Quick Switcher by User ID or username, including blocked users and users without mutual servers.",
    authors: [{ name: "Nightcord", id: 0n }],
    settings,
    patches: [
        {
            find: "#{intl::QUICKSWITCHER_PLACEHOLDER}",
            replacement: {
                match: /let{selectedIndex:\i,results:\i}/,
                replace: "$self.prepareProps(this);$&",
            },
        },
    ],

    start() {
        const style = document.createElement("style");
        style.id = "nightcord-validsearch-css";
        style.textContent = `
.nightcord-validsearch-btn {
    position: absolute;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    cursor: pointer;
    z-index: 100;
    color: var(--header-secondary, #b5bac1);
    background-color: var(--background-modifier-hover, rgba(255, 255, 255, 0.08));
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: background-color 0.15s ease, color 0.15s ease, transform 0.15s ease, opacity 0.15s ease, border-color 0.15s ease;
    user-select: none;
    box-sizing: border-box;
}
.nightcord-validsearch-btn svg path {
    fill: currentColor !important;
}
.nightcord-validsearch-btn:hover {
    color: var(--interactive-hover, #ffffff);
    background-color: var(--background-modifier-selected, rgba(255, 255, 255, 0.18));
    border-color: rgba(255, 255, 255, 0.22);
    transform: translateY(-50%) scale(1.05);
}
.nightcord-validsearch-btn:active {
    color: var(--interactive-active, #ffffff);
    background-color: var(--background-modifier-active, rgba(255, 255, 255, 0.24));
    transform: translateY(-50%) scale(0.95);
}
.nightcord-validsearch-btn.loading {
    opacity: 0.6;
    pointer-events: none;
    animation: nightcord-spin 1s linear infinite;
}
@keyframes nightcord-spin {
    from { transform: translateY(-50%) rotate(0deg); }
    to { transform: translateY(-50%) rotate(360deg); }
}
`;
        document.head.appendChild(style);

        switcherObserver = new MutationObserver(() => {
            const qs = document.querySelector(".quickswitcher_ac6cb0");
            if (qs) {
                mountSearchButton(activeSwitcher);
            }
        });
        switcherObserver.observe(document.body, { childList: true, subtree: true });

        // 1. Subscribe to Gateway member chunks
        boundOnChunk = (event: any) => {
            const members = event?.members;
            if (!Array.isArray(members) || members.length === 0) return;

            let foundMatch = false;
            for (const m of members) {
                const u = m?.user;
                if (u?.id) {
                    extraUsersCache.set(u.id, u);
                    if (lastServerQuery && matchesQuery(u, lastServerQuery)) {
                        foundMatch = true;
                    }
                }
            }

            if (foundMatch && activeSwitcher) {
                try { activeSwitcher.forceUpdate?.(); } catch {}
            }
        };

        boundOnChunkBatch = (event: any) => {
            const chunks = Array.isArray(event?.chunks) ? event.chunks : [];
            let foundMatch = false;
            for (const chunk of chunks) {
                const members = chunk?.members;
                if (Array.isArray(members)) {
                    for (const m of members) {
                        const u = m?.user;
                        if (u?.id) {
                            extraUsersCache.set(u.id, u);
                            if (lastServerQuery && matchesQuery(u, lastServerQuery)) {
                                foundMatch = true;
                            }
                        }
                    }
                }
            }

            if (foundMatch && activeSwitcher) {
                try { activeSwitcher.forceUpdate?.(); } catch {}
            }
        };

        try {
            FluxDispatcher.subscribe("GUILD_MEMBERS_CHUNK", boundOnChunk);
            FluxDispatcher.subscribe("GUILD_MEMBERS_CHUNK_BATCH", boundOnChunkBatch);
        } catch {}
    },

    stop() {
        if (switcherObserver) {
            switcherObserver.disconnect();
            switcherObserver = null;
        }
        document.getElementById("nightcord-validsearch-css")?.remove();
        document.getElementById("nightcord-validsearch-btn")?.remove();

        if (boundOnChunk) {
            try { FluxDispatcher.unsubscribe("GUILD_MEMBERS_CHUNK", boundOnChunk); } catch {}
            boundOnChunk = null;
        }

        if (boundOnChunkBatch) {
            try { FluxDispatcher.unsubscribe("GUILD_MEMBERS_CHUNK_BATCH", boundOnChunkBatch); } catch {}
            boundOnChunkBatch = null;
        }

        clearTimeout(serverSearchTimer);
        clearTimeout(strangerResolveTimer);
        activeSwitcher = null;
        fetchingIds.clear();
        failedIds.clear();
        resolvingUsernames.clear();
        failedUsernames.clear();
    },

    prepareProps(switcher: any) {
        if (!switcher || !switcher.state) return;
        activeSwitcher = switcher;
        mountSearchButton(switcher);

        const query = (switcher.state.query ?? "").trim();
        if (!query) {
            failedUsernames.clear();
        }
        const currentResults = Array.isArray(switcher.props.results) ? switcher.props.results : [];

        switcher.props.results = this.enhanceResults(query, currentResults, switcher);

        if (switcher.props.results.length > 0 && (switcher.props.selectedIndex == null || switcher.props.selectedIndex < 0)) {
            switcher.props.selectedIndex = 0;
        }

        if (switcher.props.onSelect && !switcher.props.onSelect.__validSearchPatched) {
            const origOnSelect = switcher.props.onSelect;
            switcher.props.onSelect = async function(result: any) {
                if (result?.type === "USER" && result?.record) {
                    const userId = result.record.id;
                    const isStrangerPlaceholder = userId === "100000000000000000" || userId === "0" || result.__isStrangerPlaceholder;

                    if (isStrangerPlaceholder) {
                        const targetUsername = result.__targetUsername || result.record.username || query;
                        await handleStrangerSelect(targetUsername, switcher);
                        return;
                    }

                    const existingDm = ChannelStore.getDMFromUserId(userId);
                    if (existingDm) {
                        return origOnSelect.call(this, result);
                    }

                    // Close the Quick Switcher modal first so it doesn't conflict with the profile modal
                    try { switcher.props?.onClose?.(); } catch {}
                    try { switcher.props?.close?.(); } catch {}

                    if (settings.store.fallbackToProfile) {
                        setTimeout(async () => {
                            let opened = false;
                            try {
                                const ch = await ChannelActionCreators.openPrivateChannel(userId);
                                if (ch || ChannelStore.getDMFromUserId(userId)) {
                                    opened = true;
                                }
                            } catch {
                                opened = false;
                            }

                            if (!opened) {
                                await openUserFallbackProfile(userId);
                            }
                        }, 100);
                        return;
                    }
                }
                return origOnSelect.call(this, result);
            };
            switcher.props.onSelect.__validSearchPatched = true;
        }
    },

    enhanceResults(query: string, currentResults: any[], switcher: any): any[] {
        const trimmed = (query || "").trim();
        if (!trimmed) return currentResults;

        const results = [...currentResults];
        const existingIds = new Set<string>();

        for (const item of results) {
            if (item?.type === "USER" && item?.record?.id) {
                existingIds.add(item.record.id);
            }
        }

        // 1. Check if query is a Snowflake User ID
        const ID_REGEX = /^(?:<@!?)?(\d{17,20})>?$/;
        const PREFIXED_ID_REGEX = /^(?:id:|user:|@)\s*(\d{17,20})$/i;
        const idMatch = trimmed.match(ID_REGEX) || trimmed.match(PREFIXED_ID_REGEX);

        if (settings.store.searchById && idMatch) {
            const userId = idMatch[1];
            let user = UserStore.getUser(userId) || extraUsersCache.get(userId);

            if (!user) {
                fetchAndCacheUser(userId, switcher);
                user = createDummyUserRecord(userId, userId, t("Loading user..."));
            }

            const filtered = results.filter(r => !(r?.type === "USER" && r?.record?.id === userId));
            const idItem = {
                type: "USER",
                record: user,
                score: 100000,
                comparator: trimmed,
                sortable: trimmed,
            };

            filtered.unshift(idItem);
            return filtered;
        }

        // 2. Search by username / display name / nickname
        const cleanQuery = trimmed.toLowerCase().replace(/^@/, "").trim();
        if (!cleanQuery) return results;

        const extraItems: any[] = [];

        // Check blocked users
        if (settings.store.includeBlocked) {
            const blockedIds = RelationshipStore.getBlockedIDs?.() ?? [];
            for (const id of blockedIds) {
                if (existingIds.has(id)) continue;
                const user = UserStore.getUser(id) || extraUsersCache.get(id);
                if (!user) continue;

                if (matchesQuery(user, cleanQuery)) {
                    existingIds.add(id);
                    extraItems.push({
                        type: "USER",
                        record: user,
                        score: computeScore(user, cleanQuery, true),
                        comparator: user.globalName || user.username || user.id,
                        sortable: user.globalName || user.username || user.id,
                    });
                }
            }
        }

        // Check all cached users across UserStore, DMs, Guilds, and session
        if (settings.store.includeAllUsers) {
            const allCached = getAllCachedUsersWithNicks();
            for (const { user, nicks } of allCached) {
                if (!user?.id || existingIds.has(user.id)) continue;
                if (matchesQuery(user, cleanQuery, nicks)) {
                    existingIds.add(user.id);
                    const isBlocked = RelationshipStore.isBlocked?.(user.id);
                    extraItems.push({
                        type: "USER",
                        record: user,
                        score: computeScore(user, cleanQuery, isBlocked, nicks),
                        comparator: user.globalName || user.username || user.id,
                        sortable: user.globalName || user.username || user.id,
                    });
                }
            }
        }

        // Trigger background search across joined guilds
        triggerGuildMembersSearch(cleanQuery, switcher);

        // Stranger resolution is triggered exclusively on-demand via the advanced search button
        clearTimeout(strangerResolveTimer);

        // Re-score all user/DM items in native results so exact handle matches consistently rank highest
        for (const r of results) {
            const u = extractUserFromResult(r);
            if (u?.id) {
                const isBlocked = RelationshipStore.isBlocked?.(u.id);
                r.score = Math.max(r.score ?? 0, computeScore(u, cleanQuery, isBlocked));
            }
        }

        const combined = [...results, ...extraItems];
        combined.sort((a, b) => {
            const scoreA = a.score ?? 0;
            const scoreB = b.score ?? 0;
            if (scoreB !== scoreA) {
                return scoreB - scoreA;
            }
            // Secondary tie-breaker: exact username match first
            const userA = extractUserFromResult(a);
            const userB = extractUserFromResult(b);
            const isExactA = userA?.username?.toLowerCase() === cleanQuery ? 1 : 0;
            const isExactB = userB?.username?.toLowerCase() === cleanQuery ? 1 : 0;
            if (isExactB !== isExactA) {
                return isExactB - isExactA;
            }
            // Shorter username first
            const lenA = (userA?.username || a.record?.username || "").length;
            const lenB = (userB?.username || b.record?.username || "").length;
            if (lenA && lenB) {
                return lenA - lenB;
            }
            return 0;
        });
        return combined.slice(0, 100);
    },
});
