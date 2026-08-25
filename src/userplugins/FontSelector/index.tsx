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

import { definePluginSettings, Settings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { React } from "@webpack/common";

let styleEl: HTMLStyleElement | null = null;

function applyFont(font: string, size: number) {
    styleEl?.remove();
    styleEl = null;
    if (!font && !size) return;

    styleEl = document.createElement("style");
    styleEl.id = "sc-font-selector";
    const fontCss = font
        ? `--font-primary: "${font}", "gg sans", "Noto Sans", sans-serif !important;
           --font-display: "${font}", "gg sans", "Noto Sans", sans-serif !important;
           --font-code: "gg mono", monospace !important;`
        : "";
    const sizeCss = size ? `font-size: ${size}px !important;` : "";
    styleEl.textContent = `
        :root { ${fontCss} }
        body, .sc-font-override { ${sizeCss} }
    `;
    document.head.appendChild(styleEl);
}

const settings = definePluginSettings({
    font: {
        type: OptionType.SELECT,
        description: "Шрифт клиента",
        options: [
            { label: "Стандартный (gg sans)", value: "", default: true },
            { label: "Segoe UI", value: "Segoe UI" },
            { label: "Arial", value: "Arial" },
            { label: "Calibri", value: "Calibri" },
            { label: "Verdana", value: "Verdana" },
            { label: "Tahoma", value: "Tahoma" },
            { label: "Georgia", value: "Georgia" },
            { label: "Times New Roman", value: "Times New Roman" },
            { label: "Trebuchet MS", value: "Trebuchet MS" },
            { label: "Impact", value: "Impact" },
            { label: "Comic Sans MS", value: "Comic Sans MS" },
            { label: "Consolas (моно)", value: "Consolas" },
            { label: "Courier New (моно)", value: "Courier New" },
            { label: "JetBrains Mono (моно)", value: "JetBrains Mono" },
            { label: "Fira Code (моно)", value: "Fira Code" },
            { label: "Roboto", value: "Roboto" },
            { label: "Inter", value: "Inter" }
        ],
        onChange: () => applyFont(Settings.plugins.FontSelector.font, Settings.plugins.FontSelector.size)
    },
    size: {
        type: OptionType.SLIDER,
        description: "Размер текста (px, 13–20). 14 = стандарт",
        default: 14,
        markers: [12, 13, 14, 15, 16, 17, 18, 20],
        stickToMarkers: true,
        onChange: () => applyFont(Settings.plugins.FontSelector.font, Settings.plugins.FontSelector.size)
    }
});

export default definePlugin({
    name: "FontSelector",
    description: "Выбор шрифта и размера текста для всего клиента без CSS",
    tags: ["SudoCord", "Appearance"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,

    start() {
        applyFont(settings.store.font, settings.store.size);
    },

    stop() {
        styleEl?.remove();
        styleEl = null;
    },
});

void React;
