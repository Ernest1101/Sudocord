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
import definePlugin from "@utils/types";
import { NavigationRouter, Toasts } from "@webpack/common";
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

// ---------- DOM overlay (no Discord modal internals - they differ per build) ----------

function el(tag: string, styles: Partial<CSSStyleDeclaration> = {}, text?: string): HTMLElement {
    const e = document.createElement(tag);
    Object.assign(e.style, styles);
    if (text !== undefined) e.textContent = text;
    return e;
}

function renderFavoritesInto(list: HTMLElement, overlay: HTMLElement) {
    list.innerHTML = "";
    getFavorites().then(favMap => {
        const favorites = Object.values(favMap).sort((a, b) => b.savedAt - a.savedAt);

        if (!favorites.length) {
            list.appendChild(el("div", { color: "var(--text-muted)", padding: "24px 0", textAlign: "center" },
                "Пока пусто. Открой любое сообщение → ⋯ → ⭐"));
            return;
        }

        for (const fav of favorites) {
            const card = el("div", {
                background: "var(--background-secondary)",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "12px"
            });

            const head = el("div", { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" });
            if (fav.avatarUrl) {
                const av = document.createElement("img");
                av.src = fav.avatarUrl;
                Object.assign(av.style, { width: "20px", height: "20px", borderRadius: "50%" });
                head.appendChild(av);
            }
            head.appendChild(el("span", { fontWeight: "600", fontSize: "14px" }, fav.author));
            head.appendChild(el("span", {
                color: "var(--text-muted)", fontSize: "12px", flex: "1", textAlign: "right"
            }, new Date(fav.savedAt).toLocaleString()));
            card.appendChild(head);

            if (fav.content) {
                const body = el("div", {
                    fontSize: "14px", whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: "8px"
                }, fav.content);
                card.appendChild(body);
            }

            for (const att of fav.attachments) {
                if (isImage(att)) {
                    const img = document.createElement("img");
                    img.src = att.url;
                    Object.assign(img.style, { maxWidth: "100%", maxHeight: "300px", borderRadius: "8px", marginBottom: "8px", display: "block" });
                    card.appendChild(img);
                } else {
                    const link = el("a", { color: "var(--text-link)", fontSize: "13px", display: "block", marginBottom: "4px" }, "📎 Вложение");
                    link.href = att.url;
                    link.target = "_blank";
                    card.appendChild(link);
                }
            }

            const actions = el("div", { display: "flex", gap: "8px", marginTop: "4px" });

            const jump = el("button", undefined, "Перейти");
            jump.className = "sc-fav-btn";
            jump.onclick = () => {
                overlay.remove();
                jumpTo(fav);
            };
            actions.appendChild(jump);

            const del = el("button", undefined, "Удалить");
            del.className = "sc-fav-btn sc-fav-btn-danger";
            del.onclick = async () => {
                const cur = await getFavorites();
                delete cur[fav.id];
                await set(STORE_KEY, cur);
                renderFavoritesInto(list, overlay);
            };
            actions.appendChild(del);

            card.appendChild(actions);
            list.appendChild(card);
        }
    });
}

function openFavoritesModal() {
    const existing = document.getElementById("sc-fav-overlay");
    if (existing) existing.remove();

    const overlay = el("div", {
        position: "fixed", inset: "0", background: "rgba(0,0,0,0.7)",
        zIndex: "10000", display: "flex", alignItems: "center", justifyContent: "center"
    });
    overlay.id = "sc-fav-overlay";

    const panel = el("div", {
        width: "580px", maxWidth: "92vw", maxHeight: "80vh",
        background: "var(--background-secondary)",
        borderRadius: "10px", display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
    });

    const header = el("div", {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px", fontWeight: "600", fontSize: "18px",
        borderBottom: "1px solid var(--background-modifier-accent)"
    }, "⭐ Избранное");

    const close = el("button", undefined, "✕");
    close.className = "sc-fav-btn";
    close.onclick = () => overlay.remove();
    header.appendChild(close);

    const list = el("div", { padding: "14px 16px", overflowY: "auto", flex: "1" });

    panel.appendChild(header);
    panel.appendChild(list);
    overlay.appendChild(panel);

    overlay.onclick = e => {
        if (e.target === overlay) overlay.remove();
    };

    document.body.appendChild(overlay);
    renderFavoritesInto(list, overlay);
}

// ---------- plugin ----------

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

    SidebarFavoritesItem() {
        return (
            <div className="sc-fav-sidebar-item" onClick={() => openFavoritesModal()}>
                <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>Избранное</span>
            </div>
        );
    },

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
        document.getElementById("sc-fav-overlay")?.remove();
    },
});

function StarIcon({ size = 16, ...props }: any) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
    );
}
