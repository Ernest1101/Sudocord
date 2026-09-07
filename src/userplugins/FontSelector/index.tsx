/*
 * Vencord, a modification for Discord's desktop app
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
import { addThemeSection, removeThemeSection } from "@api/ThemeSections";
import { Card } from "@components/Card";
import definePlugin, { OptionType } from "@utils/types";
import { Forms, React } from "@webpack/common";

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

const FONT_OPTIONS = [
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
];

const settings = definePluginSettings({
    font: {
        type: OptionType.SELECT,
        description: "Шрифт клиента",
        options: FONT_OPTIONS,
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

export function FontControls() {
    const [, setTick] = React.useState(0);
    const refresh = () => setTick(t => t + 1);
    const field: React.CSSProperties = {
        padding: "8px 10px", borderRadius: 6, border: "1px solid #1e1f22",
        background: "#1e1f22", color: "#dbdee1", fontSize: 13, outline: "none"
    };
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ color: "#b5bac1", fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                Шрифт
                <select
                    value={settings.store.font}
                    onChange={e => {
                        settings.store.font = e.target.value;
                        refresh();
                    }}
                    style={field}
                >
                    {FONT_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            </label>
            <label style={{ color: "#b5bac1", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                Размер: {settings.store.size}px
                <input
                    type="range"
                    min={12}
                    max={20}
                    step={1}
                    value={settings.store.size}
                    onChange={e => {
                        settings.store.size = Number(e.target.value);
                        refresh();
                    }}
                    style={{ width: 140 }}
                />
            </label>
        </div>
    );
}

export function FontSection() {
    return (
        <Card>
            <Forms.FormTitle tag="h5">Шрифт</Forms.FormTitle>
            <FontControls />
        </Card>
    );
}

export default definePlugin({
    name: "FontSelector",
    description: "Выбор шрифта и размера текста для всего клиента без CSS",
    tags: ["SudoCord", "Appearance"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,
    hidden: true,

    settings,

    start() {
        addThemeSection({ key: "font-selector", component: FontSection });
        applyFont(settings.store.font, settings.store.size);
    },

    stop() {
        removeThemeSection("font-selector");
        styleEl?.remove();
        styleEl = null;
    },
});
