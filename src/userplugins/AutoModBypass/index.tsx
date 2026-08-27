/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, registerCommand, sendBotMessage, unregisterCommand } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import { sendMessage } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { MessageActions } from "@webpack/common";

const cyrillicMap: Record<string, string> = {
    "a": "а", "b": "Ь", "c": "с", "e": "е", "h": "н", "i": "і", "j": "ј",
    "k": "к", "m": "м", "n": "п", "o": "о", "p": "р", "s": "ѕ", "t": "т",
    "u": "ц", "x": "х", "y": "у", "z": "ᴢ",
    "A": "А", "B": "В", "C": "С", "E": "Е", "H": "Н", "I": "І", "J": "Ј",
    "K": "К", "M": "М", "N": "П", "O": "О", "P": "Р", "S": "Ѕ", "T": "Т",
    "U": "Ц", "X": "Х", "Y": "У", "Z": "Ζ"
};

const unicodeMap: Record<string, string> = {
    "a": "𝖆", "e": "𝖊", "i": "𝖎", "o": "𝖔", "u": "𝖚", "s": "𝖘",
    "A": "𝕬", "E": "𝕰", "I": "𝕴", "O": "𝕺", "U": "𝖀", "S": "𝕾"
};

type BypassMethod = "unicode" | "emoji" | "dot" | "rot13" | "reverse" | "cyrillic" | "strikethrough" | "base64" | "combo" | "invisible";

const ZERO_WIDTH = "\u2060";
const INVISIBLE_METHODS: BypassMethod[] = ["combo", "invisible"];

const settings = definePluginSettings({
    defaultMethod: {
        type: OptionType.SELECT,
        description: "Универсальный метод Auto-Mod bypass (по умолчанию)",
        options: [
            { label: "Combo (кириллица + невидимые)", value: "combo" },
            { label: "Invisible (невидимые символы)", value: "invisible" },
            { label: "Cyrillic (похожая кириллица)", value: "cyrillic" },
            { label: "Unicode (математические)", value: "unicode" },
            { label: "Emoji (▪️ между буквами)", value: "emoji" },
            { label: "Dot (точки между буквами)", value: "dot" },
            { label: "Strikethrough (зачёркнутый)", value: "strikethrough" },
            { label: "Reverse (реверс)", value: "reverse" },
            { label: "ROT13", value: "rot13" },
            { label: "Base64", value: "base64" }
        ],
        default: "combo"
    },
    copyToClipboardOnly: {
        type: OptionType.BOOLEAN,
        description: "Не отправлять сообщение, а только копировать результат в буфер обмена",
        default: false
    }
});

export function bypass(input: string, method: BypassMethod): string {
    let transformedInput = "";

    switch (method) {
        case "unicode":
            transformedInput = input.split("").map(char => unicodeMap[char] || char).join("");
            break;
        case "emoji":
            transformedInput = input.split("").join("▪️");
            break;
        case "dot":
            transformedInput = input.split("").join(".");
            break;
        case "rot13":
            transformedInput = input.replace(/[a-zA-Z]/g, c => {
                const code = c.charCodeAt(0);
                const isUpper = code <= 90;
                const base = isUpper ? 65 : 97;
                return String.fromCharCode(((code - base + 13) % 26) + base);
            });
            break;
        case "reverse":
            transformedInput = input.split("").reverse().join("");
            break;
        case "cyrillic":
            transformedInput = input.split("").map(char => cyrillicMap[char] || char).join("");
            break;
        case "strikethrough":
            transformedInput = input.split("").join("\u0336");
            break;
        case "base64":
            try {
                transformedInput = btoa(unescape(encodeURIComponent(input)));
            } catch (e) {
                transformedInput = "Error: Invalid character for Base64 encoding.";
            }
            break;
        case "combo":
            transformedInput = input.split("").map(char => (cyrillicMap[char] || char) + ZERO_WIDTH).join("");
            break;
        case "invisible":
        default:
            transformedInput = input.split("").join(ZERO_WIDTH);
            break;
    }

    return transformedInput;
}

export default definePlugin({
    name: "AutoModBypass",
    description: "Auto-Mod bypass: преобразует текст методами (combo/invisible/cyrillic/unicode/...) и отправляет как сообщение",
    tags: ["SudoCord", "Utility"],
    authors: [{ name: "mrernestyt", id: 0n }],
    enabledByDefault: true,

    settings,

    start() {
        registerCommand({
            name: "bypass",
            description: "Преобразует текст выбранным методом и отправляет как сообщение (Auto-Mod bypass)",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "text",
                    description: "Текст для обработки",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                },
                {
                    name: "method",
                    description: "Метод bypass (по умолчанию — из настроек)",
                    type: ApplicationCommandOptionType.STRING,
                    required: false,
                    choices: [
                        { name: "combo (кириллица + невидимые)", value: "combo" },
                        { name: "invisible (невидимые)", value: "invisible" },
                        { name: "cyrillic (кириллица)", value: "cyrillic" },
                        { name: "unicode", value: "unicode" },
                        { name: "emoji", value: "emoji" },
                        { name: "dot", value: "dot" },
                        { name: "strikethrough", value: "strikethrough" },
                        { name: "reverse", value: "reverse" },
                        { name: "rot13", value: "rot13" },
                        { name: "base64", value: "base64" }
                    ]
                },
                {
                    name: "ephemeral",
                    description: "Ответ виден только тебе",
                    type: ApplicationCommandOptionType.BOOLEAN,
                    required: false
                }
            ],

            execute: async (args, { channel }) => {
                const text = findOption(args, "text", "");
                const methodArg = findOption(args, "method", null) as BypassMethod | null;
                const method = methodArg ?? settings.store.defaultMethod;
                const ephemeral = findOption(args, "ephemeral", false);

                if (!text) {
                    sendBotMessage(channel.id, { content: "Не указан текст для bypass" });
                    return;
                }

                const result = bypass(text, method);

                if (settings.store.copyToClipboardOnly) {
                    if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(result);
                    }
                    return;
                }

                if (ephemeral) {
                    sendBotMessage(channel.id, { content: `**${method}**\n${result}` });
                    return;
                }

                sendMessage(channel.id, { content: result }, false, MessageActions.getSendMessageOptionsForReply());
            }
        }, "AutoModBypass");
    },

    stop() {
        unregisterCommand("bypass");
    }
});
