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

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findLazy } from "@webpack";

// webpack-модуль с классом голосового/стримового соединения (для битрейта)
const ConnectionModule = findLazy((m: any) => {
    if (!m || typeof m !== "object") return false;
    for (const k in m) {
        if (m[k]?.prototype?.overwriteQualityForTesting && m[k]?.prototype?.setDesktopEncodingOptions) return true;
    }
    return false;
});

const settings = definePluginSettings({
    bitrate: {
        type: OptionType.NUMBER,
        description: "Битрейт стрима (kbit/s). 0 = стандартный. Стандарт Discord ~2500-5000",
        default: 10000
    }
});

// применяем только битрейт; разрешение и FPS берутся из панели качества
function hookConnection() {
    const mod: any = ConnectionModule;
    if (!mod) {
        setTimeout(hookConnection, 3000);
        return;
    }
    for (const k in mod) {
        const cls = mod[k];
        if (cls?.prototype?.overwriteQualityForTesting && !cls.prototype.__scBitrateHooked) {
            const orig = cls.prototype.overwriteQualityForTesting;
            cls.prototype.overwriteQualityForTesting = function (quality: any) {
                const br = Number(settings.store.bitrate) || 0;
                if (!quality || !br) return orig.call(this, quality);
                return orig.call(this, {
                    ...quality,
                    bitrate: { minimum: 1000, target: br, maximum: br * 2 }
                });
            };
            cls.prototype.__scBitrateHooked = true;
            console.info("[StreamQuality] bitrate hook установлен");
            return;
        }
    }
    setTimeout(hookConnection, 3000);
}

export default definePlugin({
    name: "StreamQuality",
    description: "В панели качества стрима: 75 и 120 FPS, все разрешения без бустов и нитро + кастомный битрейт",
    tags: ["SudoCord", "Utility"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,

    patches: [
        {
            find: "PRESET_MOBILE_HIGH_QUALITY",
            replacement: [
                {
                    // все пресеты доступны без бустов/нитро
                    match: /guildPremiumTier:\w+\.\w+\.\w+,?/g,
                    replace: ""
                },
                {
                    // FPS-энум: пропускать неизвестные значения вместо throw
                    match: /default:throw Error\(`Unknown frame rate: \$\{e\}`\)/,
                    replace: "default:return e"
                },
                {
                    // энум разрешений: пропускать неизвестные значения
                    match: /default:throw Error\(`Unknown resolution: \$\{e\}`\)/,
                    replace: "default:return e"
                },
                {
                    // 75 и 120 FPS в списке опций
                    match: /\{value:60\}\)\)\]/,
                    replace: "{value:60})),h(75,()=>o.intl.formatToPlainString(o.t[\"bW+JCW\"],{value:75})),h(120,()=>o.intl.formatToPlainString(o.t[\"bW+JCW\"],{value:120}))]"
                },
                {
                    // пресеты для 75/120 FPS со всеми разрешениями
                    match: /\{resolution:480,fps:5}\];function h\(/,
                    replace: "{resolution:480,fps:5},{resolution:0,fps:75},{resolution:480,fps:75},{resolution:720,fps:75},{resolution:1080,fps:75},{resolution:1440,fps:75},{resolution:0,fps:120},{resolution:480,fps:120},{resolution:720,fps:120},{resolution:1080,fps:120},{resolution:1440,fps:120}];function h("
                }
            ]
        }
    ],

    start() {
        hookConnection();
    },

    stop() {
        // хук снимется при перезапуске клиента
    },
});
