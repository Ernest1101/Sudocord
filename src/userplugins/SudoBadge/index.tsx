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

import { addProfileBadge, BadgeUserArgs, ProfileBadge } from "@api/Badges";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { copyWithToast } from "@utils/discord";
import definePlugin from "@utils/types";
import { UserProfileStore } from "@webpack/common";
import { React } from "@webpack/common";

// invisible 3y3 encoding of "sudo"
const MARKER = Array.from("sudo")
    .map(c => String.fromCodePoint(c.codePointAt(0)! + 0xe0000))
    .join("");

function hasMarker(bio?: string | null) {
    return !!bio && bio.includes(MARKER);
}

function SudoBadgeComponent() {
    return (
        <div
            style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                background: "linear-gradient(135deg,#5865F2,#2b2d42)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "gg sans, sans-serif",
            }}
        >
            S
        </div>
    );
}

const badge: ProfileBadge = {
    id: "sudocord-user",
    key: "sudocord-user",
    description: "SudoCord User",
    component: SudoBadgeComponent,
    position: 1, // BadgePosition.END
    shouldShow: (args: BadgeUserArgs) =>
        hasMarker(UserProfileStore.getUserProfile(args.userId)?.bio),
};

const settings = definePluginSettings({});

function SettingsAbout() {
    return (
        <ErrorBoundary noop>
            <div style={{ padding: "8px 0" }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>SudoCord User badge</div>
                <div style={{ color: "var(--text-muted)", marginBottom: 8 }}>
                    Users of SudoCord get a badge on their profile. To get the badge yourself:
                    paste the invisible marker anywhere in your bio (Settings → Profile → About Me).
                    Only other SudoCord users will see it.
                </div>
                <button
                    onClick={() => copyWithToast(MARKER)}
                    style={{
                        background: "var(--button-secondary-background)",
                        color: "var(--text-normal)",
                        border: "none",
                        borderRadius: 4,
                        padding: "8px 12px",
                        cursor: "pointer"
                    }}
                >
                    Copy SudoCord marker (invisible 3y3)
                </button>
            </div>
        </ErrorBoundary>
    );
}

export default definePlugin({
    name: "SudoBadge",
    description: "Значок SudoCord User в профиле — видят только пользователи SudoCord. Маркер хранится в био невидимыми символами",
    tags: ["Appearance", "Utility"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,
    settingsAboutComponent: SettingsAbout,

    start() {
        addProfileBadge(badge);
    },

    stop() {
        // badge is removed automatically when plugin stops
    },
});
