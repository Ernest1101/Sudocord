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

import "./styles.css";

import { addMessagePopoverButton, removeMessagePopoverButton } from "@api/MessagePopover";
import { get, set } from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { Modal, NavigationRouter, React, Toasts, openModal, useState } from "@webpack/common";
import { Message } from "@vencord/discord-types";

const STORE_KEY = "sudocord-favorite-messages";

interface FavAttachment {
    url: string;
    contentType?: string;
    width?: number;
    height?: number;
}

interface FavoriteEntry {
    id: string;
    channelId: string;
    guildId: string | null;
    author: string;
    avatarUrl?: string;
    content: string;
    attachments: FavAttachment[];
    savedAt: number;
}

const settings = definePluginSettings({});

function getFavorites(): Promise<Record<string, FavoriteEntry>> {
    return get<Record<string, FavoriteEntry>>(STORE_KEY).then(fav => fav ?? {});
}

function toast(message: string, type: number) {
    Toasts.show({ message, type, id: Toasts.genId() });
}

function isImage(att: FavAttachment) {
    return (att.contentType ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(att.url);
}

function jumpTo(fav: FavoriteEntry) {
    const guild = fav.guildId ?? "@me";
    NavigationRouter.transitionTo(`/channels/${guild}/${fav.channelId}/${fav.id}`);
}

function FavoritesList({ favorites, onRemove }: { favorites: FavoriteEntry[]; onRemove: (id: string) => void; }) {
    if (!favorites.length) {
        return (
            <div style={{ color: "var(--text-muted)", padding: "24px 0", textAlign: "center" }}>
                Пока пусто. Открой любое сообщение → ⋯ → ⭐
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {favorites.map(fav => (
                <div
                    key={fav.id}
                    style={{
                        background: "var(--background-secondary)",
                        borderRadius: 8,
                        padding: 12
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        {fav.avatarUrl && (
                            <img src={fav.avatarUrl} style={{ width: 20, height: 20, borderRadius: "50%" }} />
                        )}
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{fav.author}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: 12, flex: 1, textAlign: "right" }}>
                            {new Date(fav.savedAt).toLocaleString()}
                        </span>
                    </div>

                    {fav.content && (
                        <div style={{ fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: fav.attachments.length ? 8 : 0 }}>
                            {fav.content}
                        </div>
                    )}

                    {fav.attachments.map((att, i) =>
                        isImage(att) ? (
                            <img
                                key={i}
                                src={att.url}
                                style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 8, marginBottom: 8, display: "block" }}
                            />
                        ) : (
                            <a
                                key={i}
                                href={att.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: "var(--text-link)", fontSize: 13, display: "block", marginBottom: 4 }}
                            >
                                📎 Вложение
                            </a>
                        )
                    )}

                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button className="sc-fav-btn" onClick={() => jumpTo(fav)}>Перейти</button>
                        <button className="sc-fav-btn sc-fav-btn-danger" onClick={() => onRemove(fav.id)}>Удалить</button>
                    </div>
                </div>
            ))}
        </div>
    );
}

function openFavoritesModal() {
    openModal(props => <FavoritesModalRoot props={props} />);
}


function FavoritesModalRoot({ props }: { props: any; }) {
    const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
    const [loaded, setLoaded] = useState(false);

    React.useEffect(() => {
        getFavorites().then(fav => {
            setFavorites(Object.values(fav).sort((a, b) => b.savedAt - a.savedAt));
            setLoaded(true);
        });
    }, []);

    async function remove(id: string) {
        const fav = await getFavorites();
        delete fav[id];
        await set(STORE_KEY, fav);
        setFavorites(Object.values(fav).sort((a, b) => b.savedAt - a.savedAt));
    }

    return (
        <Modal.ModalRoot {...props}>
            <Modal.ModalHeader>
                <div style={{ fontSize: 20, fontWeight: 600 }}>⭐ Избранное</div>
            </Modal.ModalHeader>
            <Modal.ModalContent>
                {loaded
                    ? <FavoritesList favorites={favorites} onRemove={remove} />
                    : <div style={{ color: "var(--text-muted)" }}>Загрузка...</div>}
            </Modal.ModalContent>
            <Modal.ModalFooter>
                <button className="sc-fav-btn" onClick={props.onClose}>Закрыть</button>
            </Modal.ModalFooter>
        </Modal.ModalRoot>
    );
}

function SidebarFavoritesItem() {
    return (
        <div
            className="sc-fav-sidebar-item"
            onClick={() => openFavoritesModal()}
        >
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>Избранное</span>
        </div>
    );
}

export default definePlugin({
    name: "FavoriteMessages",
    description: "Избранное: кнопка в сайдбаре внизу. Сохраняй сообщения, картинки и вложения — просмотр в одном месте",
    tags: ["Utility", "Messages"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,

    patches: [
        {
            // insert our item after the quests entry, before the bottom divider
            find: '"section-divider-top"',
            replacement: {
                match: /(},"quests"\),)(\(0,\w+\.\w+\)\(\w+,\{\},"section-divider-top"\))/,
                replace: "$1$self.SidebarFavoritesItem(),$2"
            }
        }
    ],

    SidebarFavoritesItem,

    start() {
        addMessagePopoverButton((msg: Message) => ({
            key: "sudocord-favorite",
            label: "В избранное",
            icon: StarIcon,
            message: msg,
            onClick: async () => {
                const fav = await getFavorites();
                if (fav[msg.id]) {
                    delete fav[msg.id];
                    await set(STORE_KEY, fav);
                    toast("Убрано из избранного", 1);
                } else {
                    const attachments: FavAttachment[] = ((msg as any).attachments ?? []).map((a: any) => ({
                        url: a.proxyUrl ?? a.url,
                        contentType: a.contentType,
                        width: a.width,
                        height: a.height
                    }));
                    fav[msg.id] = {
                        id: msg.id,
                        channelId: msg.channel_id,
                        guildId: (msg as any).guildId ?? null,
                        author: msg.author?.username ?? "unknown",
                        avatarUrl: (msg.author as any)?.getAvatarURL?.() ?? undefined,
                        content: msg.content ?? "",
                        attachments,
                        savedAt: Date.now()
                    };
                    await set(STORE_KEY, fav);
                    toast("Добавлено в избранное ⭐", 2);
                }
            }
        }));
    },

    stop() {
        removeMessagePopoverButton("sudocord-favorite");
    },
});

function StarIcon({ size = 16, ...props }: any) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
    );
}
