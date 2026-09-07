/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 dsd16
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addProfileBadge, BadgeUserArgs, ProfileBadge, removeProfileBadge } from "@api/Badges";
import * as DataStore from "@api/DataStore";
import definePlugin from "@utils/types";

const BADGES_URL = "https://sudocord.h4ck.me/api/badges.json";
const LOGO_URL = "https://sudocord.h4ck.me/assets/sudocord-badge-v2.png";
const SITE_URL = "https://sudocord.h4ck.me";
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
    description: "Лого SudoCord в профиле у тех, кто в реестре (sudocord.h4ck.me/api/badges.json).",
    tags: ["SudoCord", "Profile"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    start() {
        addProfileBadge(badge);
        void refresh();
        timer = setInterval(() => void refresh(), REFRESH_MS);
    },

    stop() {
        removeProfileBadge(badge);
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }
});
