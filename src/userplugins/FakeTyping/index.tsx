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

import { addContextMenuPatch, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, RestAPI, Toasts } from "@webpack/common";
import { findByPropsLazy } from "@webpack";
import { React } from "@webpack/common";
import { React } from "@webpack/common";

const ChannelStore = findByPropsLazy("getDMFromUserId", "getChannel");

const settings = definePluginSettings({
    channels: {
        type: OptionType.STRING,
        description: "ID каналов через запятую (добавляются из меню канала)",
        default: ""
    },
    interval: {
        type: OptionType.SLIDER,
        description: "Интервал (сек). Discord держит статус ~8 сек",
        default: 7,
        markers: [5, 6, 7, 8, 9, 10],
        stickToMarkers: true
    }
});

let timers = new Map<string, ReturnType<typeof setInterval>>();

function getChannels(): string[] {
    return settings.store.channels.split(",").map(s => s.trim()).filter(Boolean);
}

function saveChannels(list: string[]) {
    settings.store.channels = [...new Set(list)].join(",");
}

function startTyping(channelId: string) {
    if (timers.has(channelId)) return;
    const fire = () => RestAPI.post({ url: `/channels/${channelId}/typing` }).catch(() => { });
    fire();
    timers.set(channelId, setInterval(fire, settings.store.interval * 1000));
}

function stopTyping(channelId: string) {
    const t = timers.get(channelId);
    if (t) clearInterval(t);
    timers.delete(channelId);
}

function restartAll() {
    for (const [, t] of timers) clearInterval(t);
    timers = new Map();
    for (const ch of getChannels()) startTyping(ch);
}

function toggle(channelId: string) {
    const list = getChannels();
    if (list.includes(channelId)) {
        saveChannels(list.filter(c => c !== channelId));
        stopTyping(channelId);
        fakeToast(`FakeTyping выключен для канала`);
    } else {
        saveChannels([...list, channelId]);
        startTyping(channelId);
        fakeToast(`FakeTyping включён — ты вечно «печатаешь»`);
    }
}

function fakeToast(message: string) {
    Toasts.show({ message, type: Toasts.Type.SUCCESS, id: Toasts.genId() });
}

// FakeTyping в ЛС с пользователем (пкм по юзеру)
const UserPatch: NavContextMenuPatchCallback = (children, props) => {
    const user = props?.user;
    if (!user) return;
    const dmId = ChannelStore.getDMFromUserId?.(user.id);
    if (!dmId) return;
    const active = getChannels().includes(dmId);

    children.push(
        <Menu.MenuGroup key="fake-typing-dm-group" id="fake-typing-dm-group">
            <Menu.MenuItem
                key="fake-typing-dm"
                id="fake-typing-dm"
                label={active ? "FakeTyping: ВЫКЛ (ЛС)" : "FakeTyping: вечное печатание в ЛС"}
                color={active ? "danger" : undefined}
                action={() => toggle(dmId)}
            />
        </Menu.MenuGroup>
    );
};

const ChannelPatch: NavContextMenuPatchCallback = (children, props) => {
    const channel = props?.channel;
    if (!channel || channel.type !== 0) return; // только текстовые

    const active = getChannels().includes(channel.id);

    children.push(
        <Menu.MenuGroup key="fake-typing-group" id="fake-typing-group">
            <Menu.MenuItem
                key="fake-typing-toggle"
                id="fake-typing-toggle"
                label={active ? "FakeTyping: ВЫКЛ" : "FakeTyping: печатать вечно"}
                color={active ? "danger" : undefined}
                action={() => toggle(channel.id)}
            />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "FakeTyping",
    description: "Вечное «печатает...» в выбранных каналах: ПКМ по текстовому каналу → FakeTyping. Жертвы ждут сообщения, которое не придёт",
    tags: ["SudoCord", "Trolling", "Utility"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,

    start() {
        addContextMenuPatch("channel-context", ChannelPatch);
        addContextMenuPatch("user-context", UserPatch);
        restartAll();
    },

    stop() {
        removeContextMenuPatch("channel-context", ChannelPatch);
        removeContextMenuPatch("user-context", UserPatch);
        for (const [, t] of timers) clearInterval(t);
        timers = new Map();
    },
});
