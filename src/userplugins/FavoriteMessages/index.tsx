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

const STORE_KEY = "sudocord-favorite-chat";
const MAX_FILE_BYTES = 8 * 1024 * 1024;

interface FavImage {
    dataUrl: string;
    width?: number;
    height?: number;
}

interface ChatEntry {
    id: string;
    ts: number;
    text?: string;
    images?: FavImage[];
    // for messages saved from Discord via the star menu
    saved?: {
        messageId: string;
        channelId: string;
        guildId: string | null;
        author: string;
        avatarUrl?: string;
    };
}

const settings = definePluginSettings({});

function loadChat(): Promise<ChatEntry[]> {
    return get<ChatEntry[]>(STORE_KEY).then(c => (Array.isArray(c) ? c : []));
}

function saveChat(entries: ChatEntry[]) {
    return set(STORE_KEY, entries);
}

function toast(message: string, type: number) {
    Toasts.show({ message, type, id: Toasts.genId() });
}

function jumpToSaved(e: ChatEntry) {
    if (!e.saved) return;
    const guild = e.saved.guildId ?? "@me";
    NavigationRouter.transitionTo(`/channels/${guild}/${e.saved.channelId}/${e.saved.messageId}`);
}

// ---------- overlay ----------

let overlayEl: HTMLElement | null = null;
let listEl: HTMLElement | null = null;
let pendingImages: FavImage[] = [];

function fmtTime(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildBubble(e: ChatEntry, onRemove: () => void): HTMLElement {
    const own = !e.saved;

    const wrap = document.createElement("div");
    wrap.className = own ? "sc-msg sc-msg-own" : "sc-msg sc-msg-saved";
    wrap.dataset.id = e.id;

    const bubble = el("div", own
        ? { background: "linear-gradient(135deg,#5865f2,#4752c4)", color: "#fff", borderRadius: "12px 12px 4px 12px" }
        : { background: "var(--background-secondary)", color: "var(--text-normal)", borderRadius: "12px 12px 12px 4px" },
    );
    bubble.className += " sc-msg-bubble";

    if (e.saved) {
        const author = el("div", { fontWeight: "600", fontSize: "13px", marginBottom: "4px", color: "#c9cdfb" }, e.saved.author);
        bubble.appendChild(author);
    }

    for (const img of e.images ?? []) {
        const im = document.createElement("img");
        im.src = img.dataUrl;
        Object.assign(im.style, { maxWidth: "100%", maxHeight: "320px", borderRadius: "8px", marginBottom: e.text ? "6px" : "0", display: "block", cursor: "pointer" });
        im.onclick = () => window.open(img.dataUrl, "_blank");
        bubble.appendChild(im);
    }

    if (e.text) {
        bubble.appendChild(el("div", { fontSize: "14px", whiteSpace: "pre-wrap", wordBreak: "break-word" }, e.text));
    }

    const meta = el("div", {
        fontSize: "10px", opacity: "0.7", textAlign: "right", marginTop: "4px"
    }, fmtTime(e.ts));
    bubble.appendChild(meta);

    const del = el("button", undefined, "✕");
    del.className = "sc-msg-del";
    del.title = "Удалить";
    del.onclick = onRemove;

    wrap.appendChild(bubble);
    wrap.appendChild(del);
    return wrap;
}

function el(tag: string, styles: Partial<CSSStyleDeclaration> = {}, text?: string): HTMLElement {
    const e = document.createElement(tag);
    Object.assign(e.style, styles);
    if (text !== undefined) e.textContent = text;
    return e;
}

function refreshList() {
    if (!listEl || !overlayEl) return;
    const list = listEl;
    const overlay = overlayEl;
    list.innerHTML = "";
    loadChat().then(entries => {
        if (!entries.length) {
            list.appendChild(el("div", { color: "var(--text-muted)", padding: "32px 0", textAlign: "center", fontSize: "14px" },
                "Твоё личное хранилище.\nПиши сообщения, кидай фотки — всё хранится локально."));
            return;
        }
        for (const entry of entries) {
            list.appendChild(buildBubble(entry, async () => {
                const cur = await loadChat();
                await saveChat(cur.filter(c => c.id !== entry.id));
                refreshList();
            }));
        }
        list.scrollTop = list.scrollHeight;
    });
    void overlay;
}

function sendMessage(text: string) {
    text = text.trim();
    if (!text && !pendingImages.length) return;

    const entry: ChatEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        text: text || undefined,
        images: pendingImages.length ? [...pendingImages] : undefined
    };
    pendingImages = [];

    loadChat().then(cur => {
        cur.push(entry);
        saveChat(cur).then(() => {
            refreshList();
            const input = overlayEl?.querySelector<HTMLInputElement>(".sc-chat-input");
            if (input) input.value = "";
            const preview = overlayEl?.querySelector(".sc-chat-attach-preview");
            if (preview) preview.innerHTML = "";
        });
    });
}

function handleFiles(files: FileList) {
    for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
            toast("Только картинки можно кинуть", 3);
            continue;
        }
        if (file.size > MAX_FILE_BYTES) {
            toast(`${file.name}: больше 8 МБ`, 3);
            continue;
        }
        const reader = new FileReader();
        reader.onload = () => {
            pendingImages.push({ dataUrl: String(reader.result) });
            const preview = overlayEl?.querySelector(".sc-chat-attach-preview");
            if (preview) {
                preview.innerHTML = "";
                for (const img of pendingImages) {
                    const thumb = document.createElement("img");
                    thumb.src = img.dataUrl;
                    Object.assign(thumb.style, { width: "48px", height: "48px", objectFit: "cover", borderRadius: "6px" });
                    preview.appendChild(thumb);
                }
            }
        };
        reader.readAsDataURL(file);
    }
}

function openChat() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }

    const overlay = el("div", {
        position: "fixed", inset: "0", background: "rgba(0,0,0,0.75)",
        zIndex: "10000", display: "flex", alignItems: "center", justifyContent: "center"
    });
    overlay.id = "sc-fav-overlay";

    const panel = el("div", {
        width: "680px", maxWidth: "94vw", height: "82vh",
        background: "var(--background-secondary)",
        borderRadius: "10px", display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
    });

    // header
    const header = el("div", {
        display: "flex", alignItems: "center", gap: "10px",
        padding: "12px 16px", borderBottom: "1px solid var(--background-modifier-accent)",
        background: "var(--background-secondary-alt)"
    });
    header.appendChild(el("div", { fontWeight: "700", fontSize: "17px", flex: "1" }, "⭐ Избранное"));
    const clearBtn = el("button", undefined, "Очистить всё");
    clearBtn.className = "sc-fav-btn";
    clearBtn.onclick = async () => {
        if (!confirm("Удалить всё из избранного?")) return;
        await saveChat([]);
        refreshList();
    };
    header.appendChild(clearBtn);
    const closeBtn = el("button", undefined, "✕");
    closeBtn.className = "sc-fav-btn";
    closeBtn.onclick = () => { overlay.remove(); overlayEl = null; };
    header.appendChild(closeBtn);

    // messages
    const list = el("div", { flex: "1", overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" });
    listEl = list;
    overlayEl = overlay;

    // attachment preview
    const preview = el("div", { display: "flex", gap: "6px", padding: "0 14px" });
    preview.className = "sc-chat-attach-preview";

    // input row
    const inputRow = el("div", {
        display: "flex", alignItems: "flex-end", gap: "8px",
        padding: "10px 14px 14px", borderTop: "1px solid var(--background-modifier-accent)"
    });

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.multiple = true;
    fileInput.style.display = "none";
    fileInput.onchange = () => { if (fileInput.files) handleFiles(fileInput.files); fileInput.value = ""; };

    const attach = el("button", undefined, "📎");
    attach.className = "sc-fav-btn";
    attach.title = "Прикрепить фото";
    attach.onclick = () => fileInput.click();

    const input = document.createElement("textarea");
    input.className = "sc-chat-input";
    input.placeholder = "Написать в избранное... (Enter — отправить)";
    Object.assign(input.style, {
        flex: "1", background: "var(--background-secondary-alt)", color: "var(--text-normal)",
        border: "none", borderRadius: "10px", padding: "10px 12px", fontSize: "14px",
        resize: "none", height: "42px", outline: "none", fontFamily: "inherit"
    });
    input.onkeydown = ev => {
        if (ev.key === "Enter" && !ev.shiftKey) {
            ev.preventDefault();
            sendMessage(input.value);
        }
    };

    const send = el("button", undefined, "➤");
    send.className = "sc-fav-btn sc-fav-send";
    send.title = "Отправить";
    send.onclick = () => sendMessage(input.value);

    inputRow.appendChild(fileInput);
    inputRow.appendChild(attach);
    inputRow.appendChild(input);
    inputRow.appendChild(send);

    panel.appendChild(header);
    panel.appendChild(list);
    panel.appendChild(preview);
    panel.appendChild(inputRow);
    overlay.appendChild(panel);

    overlay.onclick = e => {
        if (e.target === overlay) { overlay.remove(); overlayEl = null; }
    };

    document.body.appendChild(overlay);
    refreshList();
    setTimeout(() => input.focus(), 100);
}

// ---------- plugin ----------

export default definePlugin({
    name: "FavoriteMessages",
    description: "Избранное как в Telegram: личный чат внизу сайдбара — пиши сообщения, кидай фотки, сохраняй чужие сообщения через ⋯ → ⭐. Всё локально",
    tags: ["Utility", "Messages"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,

    patches: [
        {
            find: '"section-divider-top"',
            replacement: {
                match: /(},"quests"\),)(\(0,\w+\.\w+\)\(\w+,\{\},"section-divider-top"\))/,
                replace: "$1$self.SidebarFavoritesItem(),$2"
            }
        }
    ],

    SidebarFavoritesItem() {
        return (
            <div className="sc-fav-sidebar-item" onClick={() => openChat()}>
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
                const entries = await loadChat();
                const attachments = ((msg as any).attachments ?? [])
                    .filter((a: any) => (a.contentType ?? "").startsWith("image/"))
                    .map((a: any) => ({ dataUrl: a.proxyUrl ?? a.url, width: a.width, height: a.height }));

                entries.push({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    ts: Date.now(),
                    text: msg.content || undefined,
                    images: attachments.length ? attachments : undefined,
                    saved: {
                        messageId: msg.id,
                        channelId: msg.channel_id,
                        guildId: (msg as any).guildId ?? null,
                        author: msg.author?.username ?? "unknown",
                        avatarUrl: (msg.author as any)?.getAvatarURL?.() ?? undefined
                    }
                });
                await saveChat(entries);
                toast("Сохранено в Избранное ⭐", 2);
            }
        }));
    },

    stop() {
        removeMessagePopoverButton("sudocord-favorite");
        overlayEl?.remove();
        overlayEl = null;
    },
});

function StarIcon({ size = 16, ...props }: any) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
    );
}
