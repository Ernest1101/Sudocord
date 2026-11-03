/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function copyToClipboard(text: string): Promise<void> {
    return IS_DISCORD_DESKTOP ? DiscordNative.clipboard.copy(text) : navigator.clipboard.writeText(text);
}

// ---- ported from Equicord, used by Equicord plugins ----
export function readClipboard(): Promise<string> {
    return IS_DISCORD_DESKTOP ? DiscordNative.clipboard.read() : navigator.clipboard.readText();
}
