/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Safe mode: if Discord fails to finish loading twice in a row (endless "Starting", a broken patch crashing the
// client), the next launch starts with every plugin off except the core ones, so the user can still open the
// updater instead of having to reinstall. A launch counts as successful once the gateway connects (CONNECTION_OPEN).
// Safe mode sticks for the current build; it ends when the user exits it or when an update installs a new build.

import { Settings } from "@api/Settings";

import gitHash from "~git-hash";

const FAILURES_FOR_SAFE_MODE = 2;

/** plugins that still run in safe mode (plus whatever they depend on) */
export const SAFE_MODE_PLUGINS = new Set([
    "Settings",
    "NoTrack",
    "SupportHelper",
    "ConcatenatedModules",
    "ConcatenatedComponentExtractor"
]);

function evaluate() {
    if (IS_REPORTER) return false;

    const guard = Settings.startupGuard;
    // the previous launch set pending and never reached CONNECTION_OPEN
    const failures = guard.pending ? guard.failures + 1 : 0;
    const safe = guard.safeModeHash === gitHash || failures >= FAILURES_FOR_SAFE_MODE;

    Settings.startupGuard = { pending: true, failures, safeModeHash: safe ? gitHash : "" };
    return safe;
}

let safeMode: boolean | undefined;

/**
 * Whether this launch runs in safe mode. Evaluated on first call (plugin manager init), not at import time:
 * this module sits in an import cycle with Settings, which may not be initialised yet when it loads.
 */
export function isSafeMode() {
    return safeMode ??= evaluate();
}

/** Called once Discord has connected: this launch worked. */
export function markStartupOk() {
    if (IS_REPORTER) return;
    Settings.startupGuard = { pending: false, failures: 0, safeModeHash: Settings.startupGuard.safeModeHash };
}

/** Leave safe mode on the next launch. */
export function clearSafeMode() {
    Settings.startupGuard = { pending: false, failures: 0, safeModeHash: "" };
}
