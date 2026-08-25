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

// webpack-модуль с классом голосового/стримового соединения
const ConnectionModule = findLazy((m: any) => {
    if (!m || typeof m !== "object") return false;
    for (const k in m) {
        if (m[k]?.prototype?.overwriteQualityForTesting && m[k]?.prototype?.setDesktopEncodingOptions) return true;
    }
    return false;
});

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Применять кастомное качество",
        default: true
    },
    width: {
        type: OptionType.NUMBER,
        description: "Ширина (px). 1920 = 1080p, 2560 = 1440p",
        default: 1920
    },
    height: {
        type: OptionType.NUMBER,
        description: "Высота (px). 1080 = 1080p, 1440 = 1440p",
        default: 1080
    },
    framerate: {
        type: OptionType.NUMBER,
        description: "FPS",
        default: 60
    },
    bitrate: {
        type: OptionType.NUMBER,
        description: "Битрейт (kbit/s). Стандарт ~2500-5000",
        default: 10000
    }
});

function hookConnection() {
    const mod: any = ConnectionModule;
    if (!mod) {
        setTimeout(hookConnection, 3000);
        return;
    }
    for (const k in mod) {
        const cls = mod[k];
        if (cls?.prototype?.overwriteQualityForTesting && !cls.prototype.__scHooked) {
            const orig = cls.prototype.overwriteQualityForTesting;
            cls.prototype.overwriteQualityForTesting = function (quality: any) {
                if (!settings.store.enabled) return orig.call(this, quality);

                const w = Number(settings.store.width) || 1920;
                const h = Number(settings.store.height) || 1080;
                const fps = Number(settings.store.framerate) || 60;
                const br = Number(settings.store.bitrate) || 10000;

                const custom = {
                    encode: { framerate: fps, width: w, height: h },
                    capture: { framerate: fps, width: w, height: h },
                    bitrate: { minimum: 1000, target: br, maximum: br * 2 }
                };
                return orig.call(this, custom);
            };
            cls.prototype.__scHooked = true;
            console.info("[StreamQuality] hook установлен");
            return;
        }
    }
    // голосовые модули ещё не загружены — пробуем позже
    setTimeout(hookConnection, 3000);
}

export default definePlugin({
    name: "StreamQuality",
    description: "Кастомное разрешение, FPS и битрейт для стрима вместо пресетов Discord. Применяется автоматически при начале трансляции",
    tags: ["SudoCord", "Utility"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,

    start() {
        hookConnection();
    },

    stop() {
        // хук снимется сам при перезапуске клиента; прототип патчим минимально
    },
});
