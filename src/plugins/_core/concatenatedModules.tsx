/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IconsDef } from "@nightcordplugins/iconViewer/types";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { cache, wreq } from "@webpack";

// Discord used to ship every icon in one concatenated module that we grabbed with a patch. Since November 2026 each
// icon is its own module behind a lazy map ("./AIcon.web.tsx": [moduleId, [chunks]]), so the icons are collected
// from the module cache instead: icons already loaded, plus those in the map whose chunk is already there.
const icons: IconsDef = {};
let lastScan = 0;
let mapLoaded = false;

function isComponent(value: unknown) {
    return typeof value === "function" || (value != null && typeof value === "object" && "$$typeof" in value);
}

function loadIconsFromLazyMap() {
    mapLoaded = true;
    const mapId = Object.keys(wreq.m).find(id => {
        const src = String(wreq.m[id]);
        return src.includes('Icon.web.tsx":["') && src.includes('"./AIcon.web.tsx"');
    });
    if (!mapId) return;

    for (const [, moduleId, chunks] of String(wreq.m[mapId]).matchAll(/"\.\/\w+Icon\.web\.tsx":\["(\d+)",\[([^\]]*)\]\]/g)) {
        // modules needing an unloaded chunk would require a network fetch, skip those
        if (chunks.trim() || cache[moduleId]) continue;
        try {
            wreq(moduleId);
        } catch { }
    }
}

function scanIcons() {
    const now = Date.now();
    if (now - lastScan < 5000 || !wreq) return;
    lastScan = now;

    if (!mapLoaded) loadIconsFromLazyMap();

    for (const id in cache) {
        const exports = cache[id]?.exports;
        if (exports == null || typeof exports !== "object") continue;
        let keys: string[];
        try {
            keys = Object.keys(exports);
        } catch {
            continue;
        }
        for (const key of keys) {
            if (!key.endsWith("Icon") || key in icons) continue;
            try {
                const value = exports[key];
                if (isComponent(value)) icons[key] = value;
            } catch { }
        }
    }
}

/** All Discord icon components by name (e.g. iconsModule.ImageIcon). Filled on first use and refreshed lazily. */
export const iconsModule: IconsDef = new Proxy(icons, {
    get(target, key) {
        if (typeof key === "string" && !(key in target)) scanIcons();
        return target[key as string];
    },
    has(target, key) {
        if (!(key in target)) scanIcons();
        return key in target;
    },
    ownKeys(target) {
        scanIcons();
        return Reflect.ownKeys(target);
    }
});

export default definePlugin({
    name: "ConcatenatedModules",
    description: "Extract modules that have been concatenated by the bundler",
    authors: [Devs.Ven],

    required: true,
});
