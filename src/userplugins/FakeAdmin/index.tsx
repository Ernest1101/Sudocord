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

import { addContextMenuPatch, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, Toasts } from "@webpack/common";
import { React } from "@webpack/common";

const settings = definePluginSettings({
    showMute: {
        type: OptionType.BOOLEAN,
        description: "Тайм-аут в меню пользователя",
        default: true
    },
    showKickBan: {
        type: OptionType.BOOLEAN,
        description: "Кик и бан в меню пользователя",
        default: true
    },
    showCreateChannel: {
        type: OptionType.BOOLEAN,
        description: "Создать канал в меню канала/категории",
        default: true
    }
});

// ---------- fake dialog framework (looks exactly like discord modals) ----------

const D = {
    modalBg: "#313338",
    inputBg: "#1e1f22",
    pillBg: "#111214",
    text: "#dbdee1",
    textDim: "#b5bac1",
    textBright: "#f2f3f5",
    primary: "#5865f2",
    danger: "#da373c",
    secondary: "#4e5058",
    divider: "#3f4147"
};

function el(tag: string, styles: Partial<CSSStyleDeclaration> = {}, text?: string): HTMLElement {
    const e = document.createElement(tag);
    Object.assign(e.style, styles);
    if (text !== undefined) e.textContent = text;
    return e;
}

interface FakeDialogOptions {
    title: string;
    width?: number;
    buildBody: (body: HTMLElement) => void;
    confirmLabel: string;
    confirmColor?: "primary" | "danger";
    onConfirm?: () => void;
}

function openFakeDialog(opts: FakeDialogOptions) {
    const backdrop = el("div", {
        position: "fixed", inset: "0", background: "rgba(0,0,0,0.75)",
        zIndex: "10001", display: "flex", alignItems: "center", justifyContent: "center"
    });
    backdrop.id = "sc-fakeadmin-backdrop";

    const modal = el("div", {
        width: `${opts.width ?? 470}px`, maxWidth: "92vw",
        maxHeight: "85vh", overflowY: "auto",
        background: D.modalBg, borderRadius: "4px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        padding: "16px"
    });

    // header row: title + X
    const head = el("div", { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "8px" });
    head.appendChild(el("div", { fontSize: "20px", fontWeight: "600", color: D.textBright, lineHeight: "1.25" }, opts.title));
    const x = el("button", undefined, "✕");
    x.className = "sc-fa-modal-x";
    x.onclick = () => backdrop.remove();
    head.appendChild(x);
    modal.appendChild(head);

    // body
    const body = el("div", {});
    opts.buildBody(body);
    modal.appendChild(body);

    // footer: cancel + confirm
    const footer = el("div", { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" });
    const cancel = el("button", undefined, "Отмена");
    cancel.className = "sc-fa-btn sc-fa-btn-secondary";
    cancel.onclick = () => backdrop.remove();
    footer.appendChild(cancel);

    const confirm = el("button", undefined, opts.confirmLabel);
    confirm.className = `sc-fa-btn ${opts.confirmColor === "danger" ? "sc-fa-btn-danger" : "sc-fa-btn-primary"}`;
    confirm.onclick = () => {
        backdrop.remove();
        opts.onConfirm?.();
    };
    footer.appendChild(confirm);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    backdrop.onclick = e => {
        if (e.target === backdrop) backdrop.remove();
    };
    document.body.appendChild(backdrop);
}

function label(text: string): HTMLElement {
    return el("div", {
        fontSize: "11px", fontWeight: "700", letterSpacing: "0.02em",
        textTransform: "uppercase", color: D.textDim, marginBottom: "8px", marginTop: "16px"
    }, text);
}

function fakeTextarea(placeholder?: string): HTMLTextAreaElement {
    const ta = document.createElement("textarea");
    ta.className = "sc-fa-input";
    ta.rows = 3;
    ta.placeholder = placeholder;
    return ta;
}

function fakeToast(message: string) {
    Toasts.show({ message, type: Toasts.Type.SUCCESS, id: Toasts.genId() });
}

// ---------- dialogs ----------

function openTimeoutDialog(username: string) {
    let selected = "60 сек.";
    const durations = ["60 сек.", "5 мин.", "10 мин.", "1 час", "1 день", "1 неделя"];

    openFakeDialog({
        title: `Отправить ${username} в тайм-аут`,
        width: 470,
        confirmLabel: "Тайм-аут",
        confirmColor: "primary",
        onConfirm: () => fakeToast(`Тайм-аут выдан: ${username}, ${selected}`),
        buildBody(body) {
            body.appendChild(el("div", {
                fontSize: "14px", color: D.textDim, lineHeight: "1.4", marginBottom: "4px"
            }, `Тe, кого отправили думать о своём поведении, временно не могут отправлять сообщения в чат и отвечать в текстовых каналах. Также у них нет возможности подключаться к голосовым каналам или трибунам. `));

            const learn = el("span", { color: "#00a8fc", cursor: "pointer" }, "Узнать больше.");
            body.appendChild(learn);

            body.appendChild(label("Срок"));
            const pills = el("div", { display: "flex", flexWrap: "wrap", gap: "8px" });
            for (const d of durations) {
                const pill = el("button", undefined, d);
                pill.className = "sc-fa-pill" + (d === selected ? " sc-fa-pill-active" : "");
                pill.onclick = () => {
                    selected = d;
                    pills.querySelectorAll(".sc-fa-pill").forEach(p => p.classList.remove("sc-fa-pill-active"));
                    pill.classList.add("sc-fa-pill-active");
                };
                pills.appendChild(pill);
            }
            body.appendChild(pills);

            body.appendChild(label("Причина"));
            body.appendChild(fakeTextarea("Укажите причину. Участник не увидит это сообщение — оно будет доступно только в журнале аудита."));
        }
    });
}

function openBanDialog(username: string) {
    const reasons = [
        "Подозрительная или спамерская учётная запись",
        "Взломанная учётная запись",
        "Нарушение правил сервера",
        "Другое"
    ];

    openFakeDialog({
        title: `Заблокировать @${username}?`,
        width: 440,
        confirmLabel: "Забанить",
        confirmColor: "danger",
        onConfirm: () => fakeToast(`${username} забанен навсегда`),
        buildBody(body) {
            body.appendChild(label("Причина бана *"));
            const radios = el("div", { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "4px" });
            reasons.forEach((r, i) => {
                const row = el("div", { display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" });
                const circle = el("div", { width: "20px", height: "20px", borderRadius: "50%", border: `2px solid #80848e`, boxSizing: "border-box", flexShrink: "0", position: "relative" });
                if (i === 0) select();
                function select() {
                    radios.querySelectorAll(".sc-fa-radio").forEach(rr => {
                        (rr as HTMLElement).style.borderColor = "#80848e";
                        rr.innerHTML = "";
                    });
                    circle.style.borderColor = D.primary;
                    const dot = el("div", { width: "10px", height: "10px", borderRadius: "50%", background: D.primary, margin: "3px" });
                    circle.appendChild(dot);
                }
                row.onclick = select;
                circle.className = "sc-fa-radio";
                row.appendChild(circle);
                row.appendChild(el("span", { fontSize: "14px", color: D.text }, r));
                radios.appendChild(row);
            });
            body.appendChild(radios);

            body.appendChild(label("Удалить историю сообщений"));
            const sel = el("div", {
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: D.inputBg, borderRadius: "3px", padding: "10px 12px",
                fontSize: "14px", color: D.text, cursor: "pointer"
            }, "За последний час");
            sel.appendChild(el("span", { color: D.textDim, fontSize: "12px" }, "▼"));
            body.appendChild(sel);
        }
    });
}

function openKickDialog(username: string) {
    openFakeDialog({
        title: `Выгнать ${username} с сервера`,
        width: 440,
        confirmLabel: "Выгнать",
        confirmColor: "danger",
        onConfirm: () => fakeToast(`${username} выгнан с сервера`),
        buildBody(body) {
            body.appendChild(el("div", {
                fontSize: "14px", color: D.textDim, lineHeight: "1.4", marginBottom: "4px"
            }, `Вы уверены, что хотите выгнать @${username} с сервера? Он(а) сможет снова присоединиться к серверу, используя новое приглашение.`));

            body.appendChild(label("Причина удаления"));
            body.appendChild(fakeTextarea());
        }
    });
}

function openCreateChannelDialog(categoryName?: string) {
    let selectedType = "Текстовый";
    const types = ["Текстовый", "Голосовой", "Объявления", "Форум"];

    openFakeDialog({
        title: "Создать канал",
        width: 460,
        confirmLabel: "Создать канал",
        confirmColor: "primary",
        onConfirm: () => fakeToast("Канал создан"),
        buildBody(body) {
            body.appendChild(label("Тип канала"));
            const pills = el("div", { display: "flex", flexWrap: "wrap", gap: "8px" });
            for (const t of types) {
                const pill = el("button", undefined, (t === "Голосовой" ? "🔊 " : t === "Форум" ? "💬 " : "# ") + t);
                pill.className = "sc-fa-pill" + (t === selectedType ? " sc-fa-pill-active" : "");
                pill.onclick = () => {
                    selectedType = t;
                    pills.querySelectorAll(".sc-fa-pill").forEach(p => p.classList.remove("sc-fa-pill-active"));
                    pill.classList.add("sc-fa-pill-active");
                };
                pills.appendChild(pill);
            }
            body.appendChild(pills);

            body.appendChild(label("Название канала"));
            const nameWrap = el("div", { display: "flex", alignItems: "center", background: D.inputBg, borderRadius: "3px", padding: "0 10px" });
            nameWrap.appendChild(el("span", { color: D.textDim, fontSize: "18px", marginRight: "4px" }, "#"));
            const input = document.createElement("input");
            input.className = "sc-fa-input";
            input.placeholder = "новый-канал";
            input.style.padding = "10px 0";
            nameWrap.appendChild(input);
            body.appendChild(nameWrap);

            if (categoryName) {
                body.appendChild(el("div", { fontSize: "12px", color: D.textDim, marginTop: "10px" }, `Канал появится в категории: ${categoryName}`));
            }
        }
    });
}

// ---------- context menu patches ----------

const UserPatch: NavContextMenuPatchCallback = (children, props) => {
    const user = props?.user;
    if (!user) return;

    const items: React.ReactNode[] = [];

    if (settings.store.showMute) {
        items.push(
            <Menu.MenuItem
                key="fake-admin-mute"
                id="fake-admin-mute"
                label="Тайм-аут"
                action={() => openTimeoutDialog(user.username)}
            />
        );
    }

    if (settings.store.showKickBan) {
        items.push(
            <Menu.MenuItem
                key="fake-admin-kick"
                id="fake-admin-kick"
                label="Выгнать с сервера"
                action={() => openKickDialog(user.username)}
            />,
            <Menu.MenuItem
                key="fake-admin-ban"
                id="fake-admin-ban"
                label="Забанить"
                action={() => openBanDialog(user.username)}
            />
        );
    }

    if (!items.length) return;

    children.push(
        <Menu.MenuGroup key="fake-admin-group" id="fake-admin-group">
            {items}
        </Menu.MenuGroup>
    );
};

const ChannelPatch: NavContextMenuPatchCallback = (children, props) => {
    const channel = props?.channel;
    const categoryName = props?.channel?.name;

    children.push(
        <Menu.MenuGroup key="fake-admin-channel-group" id="fake-admin-channel-group">
            <Menu.MenuItem
                key="fake-admin-create-channel"
                id="fake-admin-create-channel"
                label="Создать канал"
                action={() => openCreateChannelDialog(categoryName)}
            />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "FakeAdmin",
    description: "Визуальные права модератора: тайм-аут, кик, бан с настоящими диалогами Discord и создание каналов. Ничего реального не происходит",
    tags: ["SudoCord", "Trolling", "Utility"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,

    start() {
        addContextMenuPatch("user-context", UserPatch);
        addContextMenuPatch("channel-context", ChannelPatch);
        addContextMenuPatch("category-context", ChannelPatch);
    },

    stop() {
        removeContextMenuPatch("user-context", UserPatch);
        removeContextMenuPatch("channel-context", ChannelPatch);
        removeContextMenuPatch("category-context", ChannelPatch);
        document.getElementById("sc-fakeadmin-backdrop")?.remove();
    },
});
