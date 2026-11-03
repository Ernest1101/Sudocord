/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import { EquicordDevs } from "@utils/constants";
import { openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { findStoreLazy } from "@webpack";
import { Menu } from "@webpack/common";

import { QuickMessagesChatBarButton } from "./components/ChatBarButton";
import { QuickMessagesIcon } from "./components/Icons";
import { QuickMessagesModal } from "./components/QuickMessagesModal";
import { loadQuickMessages } from "./store";

const ChannelStore = findStoreLazy("ChannelStore");
const SelectedChannelStore = findStoreLazy("SelectedChannelStore");

export const settings = definePluginSettings({
    showInAttachMenu: {
        type: OptionType.BOOLEAN,
        description: "Display Quick Messages in the attach (+) button menu.",
        default: true
    },
    showInChatBar: {
        type: OptionType.BOOLEAN,
        description: "Display the Quick Messages button in the chat action bar on the right.",
        default: false
    },
    autoCloseOnSend: {
        type: OptionType.BOOLEAN,
        description: "Automatically close the preset modal after sending a message.",
        default: true
    }
});

function cleanupInjectedButtons() {
    const injected = document.querySelectorAll(".nc-quick-messages-attach-wrapper, .nc-quick-messages-attach-btn");
    for (const el of injected) {
        el.remove();
    }
}

const channelAttachMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (settings.store.showInAttachMenu === false) return;
    if (!props?.channel) return;
    if (!Menu?.MenuItem) return;

    children.push(
        <Menu.MenuItem
            id="nc-quick-messages-attach-menu"
            key="nc-quick-messages-attach-menu"
            label={t("Quick Messages")}
            iconLeft={QuickMessagesIcon}
            icon={QuickMessagesIcon}
            leadingAccessory={{
                type: "icon",
                icon: QuickMessagesIcon
            }}
            action={() => {
                openModal(modalProps => (
                    <QuickMessagesModal
                        rootProps={modalProps}
                        channel={props.channel}
                        autoCloseOnSend={settings.store.autoCloseOnSend}
                    />
                ));
            }}
        />
    );
};

export default definePlugin({
    name: "QuickMessages",
    enabledByDefault: false,
    description: "Save custom preset messages and send or paste them instantly into any channel or DM with a single click.",
    authors: [EquicordDevs.nobody],
    settings,
    contextMenus: {
        "channel-attach": channelAttachMenuPatch
    },

    chatBarButton: {
        icon: QuickMessagesIcon,
        render: QuickMessagesChatBarButton
    },

    start() {
        loadQuickMessages();
        cleanupInjectedButtons();
    },

    stop() {
        cleanupInjectedButtons();
    }
});
