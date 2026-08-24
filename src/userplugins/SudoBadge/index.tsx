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
import { copyWithToast } from "@utils/discord";
import definePlugin from "@utils/types";
import { RestAPI, UserProfileStore, UserStore } from "@webpack/common";

// invisible 3y3 encoding of "sudo"
const MARKER = Array.from("sudo")
    .map(c => String.fromCodePoint(c.codePointAt(0)! + 0xe0000))
    .join("");

function hasMarker(bio?: string | null) {
    return !!bio && bio.includes(MARKER);
}

function BadgeComponent() {
    return (
        <div
            title="SudoCord User"
            style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                background: "linear-gradient(135deg,#5865f2,#2b2d42)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.1)"
            }}
        >
            <svg viewBox="0 0 24 24" width={12} height={12} fill="#fff">
                <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2zm0 3.1L6 8.4v7.2l6 3.3 6-3.3V8.4l-6-3.3z" />
            </svg>
        </div>
    );
}

const badge: ProfileBadge = {
    id: "sudocord-user",
    key: "sudocord-user",
    description: "SudoCord User",
    position: 1, // BadgePosition.END
    component: BadgeComponent,
    shouldShow: (args: BadgeUserArgs) =>
        hasMarker(UserProfileStore.getUserProfile(args.userId)?.bio),
};

const settings = definePluginSettings({});

// automatically add the invisible marker to the user's bio so every
// SudoCord user gets the badge without any manual steps
async function ensureBioMarker() {
    try {
        const meId = UserStore.getCurrentUser()?.id;
        if (!meId) return;

        // NOTE: GET /users/@me/profile is rejected (400, needs snowflake) - use real id
        const res: any = await RestAPI.get({ url: `/users/${meId}/profile` });
        const bio: string = res.body?.user?.bio ?? res.body?.bio ?? "";
        if (hasMarker(bio) || bio.length > 250) return;

        await RestAPI.patch({
            url: "/users/@me/profile",
            body: { bio: (bio ? bio + "\n" : "") + MARKER }
        });
        console.info("[SudoBadge] marker added to bio");
    } catch (err: any) {
        console.error("[SudoBadge] failed to add marker:", err?.status, err?.body ?? err);
    }
}

function SettingsAbout() {
    return (
        <div style={{ padding: "8px 0" }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Значок SudoCord User</div>
            <div style={{ color: "var(--text-muted)", marginBottom: 8 }}>
                Добавляется автоматически: плагин сам прописывает невидимую метку в твоё био.
                Значок видят только пользователи SudoCord.
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
                Скопировать маркер вручную (если авто не сработал)
            </button>
        </div>
    );
}

export default definePlugin({
    name: "SudoBadge",
    description: "Логотип SudoCord в профиле — автоматически у всех пользователей клиента. Видят только пользователи SudoCord",
    tags: ["Appearance", "Utility"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,
    settingsAboutComponent: SettingsAbout,

    start() {
        addProfileBadge(badge);
        setTimeout(ensureBioMarker, 8000);
    },

    stop() {
        // badge is removed automatically when plugin stops
    },
});
