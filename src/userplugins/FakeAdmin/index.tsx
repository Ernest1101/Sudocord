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

import { addContextMenuPatch, removeContextMenuPatch, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, Toasts } from "@webpack/common";
import { React } from "@webpack/common";

const settings = definePluginSettings({
    showMute: {
        type: OptionType.BOOLEAN,
        description: "Fake Mute in user context menu",
        default: true
    },
    showKickBan: {
        type: OptionType.BOOLEAN,
        description: "Fake Kick / Fake Ban in user context menu",
        default: true
    },
    showCreateChannel: {
        type: OptionType.BOOLEAN,
        description: "Fake Create Channel in channel context menu",
        default: true
    }
});

function fakeToast(message: string) {
    Toasts.show({
        message: `${message} (fake)`,
        type: Toasts.Type.SUCCESS,
        id: Toasts.genId()
    });
}

const UserPatch: NavContextMenuPatchCallback = (children, props) => {
    const user = props?.user;
    if (!user) return;

    const items: React.ReactNode[] = [];

    if (settings.store.showMute) {
        items.push(
            <Menu.MenuItem
                key="fake-admin-mute"
                id="fake-admin-mute"
                label="Fake Mute (10m)"
                action={() => fakeToast(`Muted ${user.username} for 10 minutes`)}
            />
        );
    }

    if (settings.store.showKickBan) {
        items.push(
            <Menu.MenuItem
                key="fake-admin-kick"
                id="fake-admin-kick"
                label="Fake Kick"
                action={() => fakeToast(`Kicked ${user.username}`)}
            />,
            <Menu.MenuItem
                key="fake-admin-ban"
                id="fake-admin-ban"
                label="Fake Ban"
                action={() => fakeToast(`Banned ${user.username}`)}
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
    if (!channel) return;

    children.push(
        <Menu.MenuGroup key="fake-admin-channel-group" id="fake-admin-channel-group">
            <Menu.MenuItem
                key="fake-admin-create-channel"
                id="fake-admin-create-channel"
                label="Fake Create Channel"
                action={() => fakeToast(`Channel created (visually, of course)`)}
            />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "FakeAdmin",
    description: "Троллинг: в контекстном меню появляются Fake Mute / Kick / Ban / Create Channel. Чисто визуал — ничего реального не происходит",
    tags: ["Trolling", "Utility"],
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
    },
});
