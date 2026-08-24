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

import { addMessagePopoverButton, removeMessagePopoverButton } from "@api/MessagePopover";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { get, set } from "@api/DataStore";
import definePlugin from "@utils/types";
import { NavigationRouter, React, Toasts, useState } from "@webpack/common";
import { Message } from "@vencord/discord-types";


const STORE_KEY = "sudocord-favorite-messages";

interface FavoriteEntry {
    id: string;
    channelId: string;
    guildId: string | null;
    author: string;
    content: string;
    savedAt: number;
}

const settings = definePluginSettings({});

function getFavorites(): Promise<Record<string, FavoriteEntry>> {
    return get<Record<string, FavoriteEntry>>(STORE_KEY).then(fav => fav ?? {});
}

function toast(message: string, type: number) {
    Toasts.show({ message, type, id: Toasts.genId() });
}

function jumpTo(fav: FavoriteEntry) {
    const guild = fav.guildId ?? "@me";
    NavigationRouter.transitionTo(`/channels/${guild}/${fav.channelId}/${fav.id}`);
}

function SettingsAbout() {
    const [favorites, setFavorites] = useState<Record<string, FavoriteEntry>>({});
    const [loaded, setLoaded] = useState(false);

    useState(() => {
        getFavorites().then(fav => {
            setFavorites(fav);
            setLoaded(true);
        });
    });

    async function remove(id: string) {
        const fav = await getFavorites();
        delete fav[id];
        await set(STORE_KEY, fav);
        setFavorites({ ...fav });
    }

    if (!loaded) return <div style={{ color: "var(--text-muted)" }}>Loading...</div>;

    const list = Object.values(favorites).sort((a, b) => b.savedAt - a.savedAt);

    return (
        <ErrorBoundary noop>
            <div style={{ padding: "8px 0" }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    ⭐ Favorite messages ({list.length})
                </div>
                {!list.length && (
                    <div style={{ color: "var(--text-muted)" }}>
                        No favorites yet. Open any message → three dots menu → star icon.
                    </div>
                )}
                {list.map(fav => (
                    <div
                        key={fav.id}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px",
                            marginBottom: 4,
                            background: "var(--background-secondary)",
                            borderRadius: 6
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{fav.author}</div>
                            <div
                                style={{
                                    color: "var(--text-muted)",
                                    fontSize: 12,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis"
                                }}
                            >
                                {fav.content || "(attachment/embed)"}
                            </div>
                        </div>
                        <button
                            onClick={() => jumpTo(fav)}
                            style={{
                                background: "var(--button-secondary-background)",
                                color: "var(--text-normal)",
                                border: "none",
                                borderRadius: 4,
                                padding: "4px 10px",
                                cursor: "pointer"
                            }}
                        >
                            Jump
                        </button>
                        <button
                            onClick={() => remove(fav.id)}
                            style={{
                                background: "var(--button-danger-background)",
                                color: "#fff",
                                border: "none",
                                borderRadius: 4,
                                padding: "4px 8px",
                                cursor: "pointer"
                            }}
                        >
                            <TrashIcon size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ErrorBoundary>
    );
}


function StarIcon({ size = 16, ...props }: any) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
    );
}

function TrashIcon({ size = 16, ...props }: any) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
    );
}

export default definePlugin({
    name: "FavoriteMessages",
    description: "Избранное: звёздочка в меню сообщения (три точки). Просмотр — Настройки → SudoCord → FavoriteMessages",
    tags: ["Utility", "Messages"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,
    settingsAboutComponent: SettingsAbout,

    async start() {
        addMessagePopoverButton((msg: Message) => ({
            key: "sudocord-favorite",
            label: "Favorite",
            icon: StarIcon,
            message: msg,
            onClick: async () => {
                const fav = await getFavorites();
                if (fav[msg.id]) {
                    delete fav[msg.id];
                    await set(STORE_KEY, fav);
                    toast("Removed from favorites", 1);
                } else {
                    fav[msg.id] = {
                        id: msg.id,
                        channelId: msg.channel_id,
                        guildId: (msg as any).guildId ?? null,
                        author: msg.author?.username ?? "unknown",
                        content: msg.content ?? "",
                        savedAt: Date.now()
                    };
                    await set(STORE_KEY, fav);
                    toast("Added to favorites ⭐", 2);
                }
            }
        }));
    },

    stop() {
        removeMessagePopoverButton("sudocord-favorite");
    },
});

