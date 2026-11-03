/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import gitHash from "~git-hash";
import gitRemote from "~git-remote";

export { gitHash, gitRemote };

export const VENCORD_USER_AGENT = `SudoCord/${gitHash}${gitRemote ? ` (https://github.com/${gitRemote})` : ""}`;

// ---- ported from Equicord, used by Equicord plugins ----
export const gitHashShort = gitHash.slice(0, 9);
