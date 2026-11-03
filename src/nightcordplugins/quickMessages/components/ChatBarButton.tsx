/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import { settings } from "@nightcordplugins/quickMessages/index";
import { openModal } from "@utils/modal";

import { QuickMessagesIcon } from "./Icons";
import { QuickMessagesModal } from "./QuickMessagesModal";

export const QuickMessagesChatBarButton: ChatBarButtonFactory = ({ isMainChat, channel }) => {
    if (!isMainChat) return null;
    if (!settings.store.showInChatBar) return null;

    function handleOpen(e?: any) {
        if (e) {
            e.preventDefault?.();
            e.stopPropagation?.();
        }
        openModal(props => (
            <QuickMessagesModal
                rootProps={props}
                channel={channel}
                autoCloseOnSend={settings.store.autoCloseOnSend}
            />
        ));
    }

    return (
        <ChatBarButton
            tooltip={t("Quick Messages")}
            onClick={handleOpen}
            onContextMenu={handleOpen}
            buttonProps={{ "aria-haspopup": "dialog" }}
        >
            <QuickMessagesIcon width={20} height={20} />
        </ChatBarButton>
    );
};
