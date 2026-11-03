/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import { openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, Menu, React } from "@webpack/common";

import { AlwaysRightModal } from "./AlwaysRightModal";
import { generateAndInsertReply, getIsGenerating, onGeneratingChange } from "./generator";
import { AlwaysRightIcon } from "./Icon";

export const settings = definePluginSettings({
    apiProvider: {
        type: OptionType.SELECT,
        description: "AI Provider & API Key to use",
        options: [
            { label: "Nightcord AI (Shared Groq Key)", value: "nightcord", default: true },
            { label: "Google Gemini AI (Direct Gemini Key)", value: "gemini" },
        ],
        default: "nightcord",
    },
    geminiApiKey: {
        type: OptionType.STRING,
        description: "Google Gemini API Key (get free at aistudio.google.com)",
        default: "",
    },
    geminiModel: {
        type: OptionType.SELECT,
        description: "Google Gemini Model",
        options: [
            { label: "Gemini Flash Latest (Fast & Modern)", value: "gemini-flash-latest", default: true },
            { label: "Gemini 3.8 Flash (Latest 2026)", value: "gemini-3.8-flash" },
            { label: "Gemini 2.0 Flash (Recommended)", value: "gemini-2.0-flash" },
            { label: "Gemini Pro Latest (Deep Reasoning)", value: "gemini-pro-latest" },
        ],
        default: "gemini-flash-latest",
    },
    tone: {
        type: OptionType.SELECT,
        description: "Tone and attitude for AI replies",
        options: [
            { label: "Friendly", value: "friendly", default: true },
            { label: "Cordial", value: "cordial" },
            { label: "Direct (No Politeness)", value: "direct" },
        ],
        default: "friendly",
    },
    responseFormat: {
        type: OptionType.SELECT,
        description: "Length and detail of the generated response",
        options: [
            { label: "Adaptive (Matches partner & context length)", value: "adaptive", default: true },
            { label: "Short (1-2 sentences)", value: "short" },
            { label: "Medium (1 paragraph)", value: "medium" },
            { label: "Detailed (Full argument)", value: "long" },
        ],
        default: "adaptive",
    },
    capitalization: {
        type: OptionType.SELECT,
        description: "Letter casing style for the response",
        options: [
            { label: "Normal capitalization", value: "normal", default: true },
            { label: "Lowercase only", value: "lowercase" },
        ],
        default: "normal",
    },
    emojiUsage: {
        type: OptionType.SELECT,
        description: "Include or disallow emojis in responses",
        options: [
            { label: "No emojis", value: "no_emojis", default: true },
            { label: "Allow emojis", value: "with_emojis" },
        ],
        default: "no_emojis",
    },
    language: {
        type: OptionType.SELECT,
        description: "Language used for generating replies",
        options: [
            { label: "Auto-detect from conversation", value: "auto", default: true },
            { label: "French", value: "French" },
            { label: "English", value: "English" },
            { label: "Spanish", value: "Spanish" },
            { label: "German", value: "German" },
            { label: "Arabic", value: "Arabic" },
            { label: "Russian", value: "Russian" },
            { label: "Chinese", value: "Chinese" },
            { label: "Portuguese", value: "Portuguese" },
            { label: "Italian", value: "Italian" },
            { label: "Japanese", value: "Japanese" },
        ],
        default: "auto",
    },
    customPrompt: {
        type: OptionType.STRING,
        description: "Custom instructions for how the AI should argue and reply (e.g. cite statistics, be witty, act like a lawyer)",
        default: "",
    },
    customApiKey: {
        type: OptionType.STRING,
        description: "Optional custom Groq API key override (leave empty to use Nightcord AI key)",
        default: "",
    },
    showChatBarButton: {
        type: OptionType.BOOLEAN,
        description: "Show the AlwaysRight quick button in the chat bar",
        default: true,
    },
});

const AlwaysRightChatBarButton: ChatBarButtonFactory = ({ channel, isMainChat }) => {
    if (!isMainChat) return null;
    if (!settings.store.showChatBarButton) return null;

    const [generating, setGeneratingState] = React.useState(getIsGenerating());

    React.useEffect(() => {
        return onGeneratingChange(setGeneratingState);
    }, []);

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        generateAndInsertReply(channel);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openModal(props => (
            <AlwaysRightModal rootProps={props} channel={channel} />
        ));
    };

    const tooltip = generating
        ? t("AlwaysRight is analyzing and composing reply...")
        : t("AlwaysRight - AI Reply (Right-click for prompt)");

    return (
        <ChatBarButton
            tooltip={tooltip}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            buttonProps={{ "aria-haspopup": "dialog" }}
        >
            <AlwaysRightIcon loading={generating} />
        </ChatBarButton>
    );
};

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    const { channel, message } = props ?? {};
    if (!channel || !message) return;

    children.push(
        <Menu.MenuGroup key="always-right-msg-group">
            <Menu.MenuItem
                id="always-right-reply-msg"
                key="always-right-reply-msg"
                label={t("AlwaysRight - Reply to this message")}
                icon={() => <AlwaysRightIcon width={16} height={16} />}
                action={() => {
                    try {
                        FluxDispatcher.dispatch({
                            type: "CREATE_PENDING_REPLY",
                            channel,
                            message,
                            shouldMention: true,
                            showMentionToggle: true
                        });
                    } catch {}
                    void generateAndInsertReply(channel, undefined, message);
                }}
            />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "AlwaysRight",
    description: "Generates smart, persuasive, and perfectly phrased AI responses based on conversation context.",
    authors: [{ name: "Nightcord", id: 0n }],
    enabledByDefault: false,
    dependencies: ["ChatInputButtonAPI"],
    settings,

    chatBarButton: {
        icon: () => <AlwaysRightIcon />,
        render: AlwaysRightChatBarButton,
    },

    contextMenus: {
        "message": messageContextMenuPatch,
    },
});
