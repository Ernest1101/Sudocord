/*
 * SudoCord, a modification for Discord's desktop app
 * Copyright (c) 2026 dsd16
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import definePlugin from "@utils/types";

export default definePlugin({
    name: "CustomStream",
    description: "Разблокирует все разрешения и FPS для стрима на любом сервере: 1440p60, 1080p60, Source 60 — без бустов и нитро",
    tags: ["SudoCord", "Utility"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    patches: [
        {
            // снимает guildPremiumTier со всех пресетов качества стрима
            // (1440p60, 1080p60, 720p60, 480p60 и т.д. доступны всегда)
            find: "PRESET_MOBILE_HIGH_QUALITY",
            replacement: {
                match: /guildPremiumTier:\w+\.\w+\.\w+,?/g,
                replace: ""
            }
        }
    ],
});
