/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 dsd16
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addProfileBadge, BadgeUserArgs, ProfileBadge, removeProfileBadge } from "@api/Badges";
import * as DataStore from "@api/DataStore";
import definePlugin from "@utils/types";
import { UserStore } from "@webpack/common";

const BADGES_URL = "https://sudocord.mooo.com/api/badges.json";
// adds the logged-in user to the registry, so everyone running SudoCord gets the badge (sudocord-badges.service on the VDS);
// the server removes ids that have not checked in for 3 days, so the badge goes away when SudoCord is uninstalled
const REGISTER_URL = "https://sudocord.mooo.com/api/badges/register";
const REGISTERED_KEY = "SudoBadges_registered";
const REGISTER_EVERY_MS = 24 * 60 * 60 * 1000;
const LOGO_URL = "https://sudocord.mooo.com/assets/sudocord-badge-v2.png";
const SITE_URL = "https://sudocord.mooo.com";
const CACHE_KEY = "SudoBadges_ids";
const REFRESH_MS = 30 * 60 * 1000;
const DEFAULT_TOOLTIP = "SudoCord User";

// userId -> tooltip
let tooltips = new Map<string, string>();
let timer: ReturnType<typeof setInterval> | null = null;

function parseRegistry(data: unknown): Map<string, string> {
    const out = new Map<string, string>();
    if (!data || typeof data !== "object") return out;
    for (const [id, value] of Object.entries(data as Record<string, unknown>)) {
        if (!/^\d{10,25}$/.test(id)) continue;
        if (typeof value === "string" && value.trim()) out.set(id, value.trim().slice(0, 100));
        else if (value && typeof value === "object" && typeof (value as any).tooltip === "string" && (value as any).tooltip.trim()) {
            out.set(id, (value as any).tooltip.trim().slice(0, 100));
        } else {
            out.set(id, DEFAULT_TOOLTIP);
        }
    }
    return out;
}

async function refresh() {
    try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 10000);
        try {
            const res = await fetch(BADGES_URL, { signal: ctrl.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            tooltips = parseRegistry(await res.json());
            try {
                await DataStore.set(CACHE_KEY, [...tooltips.entries()]);
            } catch { /* кэш необязателен */ }
            console.info(`[SudoBadges] loaded ${tooltips.size} badges`);
        } finally {
            clearTimeout(to);
        }
    } catch (e) {
        console.error("[SudoBadges] refresh failed, using cache", e);
        try {
            const cached = await DataStore.get(CACHE_KEY) as Array<[string, string]> | undefined;
            if (Array.isArray(cached)) tooltips = new Map(cached.filter(([id]) => /^\d{10,25}$/.test(id)));
        } catch { /* ignore */ }
    }
}

async function registerSelf() {
    const id = UserStore.getCurrentUser()?.id;
    if (!id) return;
    try {
        const last = await DataStore.get(REGISTERED_KEY) as { id: string; at: number; } | undefined;
        if (tooltips.has(id) && last?.id === id && Date.now() - last.at < REGISTER_EVERY_MS) return;

        // text/plain keeps it a simple request (no CORS preflight)
        const res = await fetch(REGISTER_URL, { method: "POST", body: id, signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await DataStore.set(REGISTERED_KEY, { id, at: Date.now() });
        if (!tooltips.has(id)) await refresh();
    } catch (e) {
        console.warn("[SudoBadges] could not register this account", e);
    }
}

const badge: ProfileBadge = {
    id: "sudocord-user",
    getBadges({ userId }: BadgeUserArgs): ProfileBadge[] {
        const tooltip = tooltips.get(userId);
        if (!tooltip) return [];
        return [{
            id: "sudocord-user",
            description: tooltip,
            iconSrc: LOGO_URL,
            link: SITE_URL
        }];
    }
};

export default definePlugin({
    name: "SudoBadges",
    description: "SudoCord logo on the profiles of everyone who uses SudoCord.",
    descriptionLocales: { ru: "Лого SudoCord в профиле у всех, кто пользуется SudoCord." },
    tags: ["SudoCord", "Appearance"],
    authors: [{ name: "dsd16", id: 0n }],
    // always on and not listed: everyone running SudoCord sees the badges, it can't be switched off
    required: true,
    hidden: true,

    flux: {
        // fires after login and on account switch
        CONNECTION_OPEN() {
            void registerSelf();
        }
    },

    start() {
        addProfileBadge(badge);
        void refresh().then(registerSelf);
        // keep checking in while Discord stays open for days: the server drops badges of clients that stop (SudoCord removed)
        timer = setInterval(() => void refresh().then(registerSelf), REFRESH_MS);
    },

    stop() {
        removeProfileBadge(badge);
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }
});
