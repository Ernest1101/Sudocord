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
import definePlugin, { OptionType, makeRange } from "@utils/types";

interface StreamData {
    audioContext: AudioContext;
    audioElement: HTMLAudioElement;
    emitter: any;
    gainNode?: GainNode;
    analyserNode?: AnalyserNode;
    limiterInterval?: ReturnType<typeof setInterval>;
    isLimited?: boolean;
    limitedSince?: number;
    id: string;
    levelNode: AudioWorkletNode;
    sinkId: string | "default";
    stream: MediaStream;
    streamSourceNode?: MediaStreamAudioSourceNode;
    videoStreamId: string;
    _mute: boolean;
    _speakingFlags: number;
    _volume: number;
}

const settings = definePluginSettings({
    threshold: {
        type: OptionType.SLIDER,
        description: "Порог громкости (0-100). Выше = сработает на более громких",
        markers: makeRange(10, 100, 5),
        default: 60,
        stickToMarkers: true
    },
    cooldown: {
        type: OptionType.SLIDER,
        description: "Секунд тишины до разблокировки",
        markers: makeRange(1, 30, 1),
        default: 5,
        stickToMarkers: true
    }
});

// хранилище анализаторов по id юзера
const analysers = new Map<string, {
    analyser: AnalyserNode;
    gain: GainNode;
    data: Uint8Array;
    isLimited: boolean;
    limitedAt: number;
    originalVolume: number;
}>();

function checkLevels(id: string, analyser: AnalyserNode, data: Uint8Array, gain: GainNode) {
    const current = analysers.get(id);
    if (!current) return;

    analyser.getByteFrequencyData(data);

    // RMS из частотных данных → 0-100
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i];
    }
    const rms = Math.sqrt(sum / data.length);
    const level = Math.round((rms / 255) * 100);

    const threshold = settings.store.threshold;
    const cooldown = settings.store.cooldown * 1000;
    const now = Date.now();

    if (!current.isLimited && level > threshold) {
        // слишком громко — мутим
        current.isLimited = true;
        current.limitedAt = now;
        gain.gain.value = 0;
    } else if (current.isLimited && level <= threshold && (now - current.limitedAt) > cooldown) {
        // стих и кулдаун прошёл — отпускаем
        current.isLimited = false;
        gain.gain.value = 1;
    }
}

export default definePlugin({
    name: "DecibelLimiter",
    description: "Авто-мут тех, кто орёт в микрофон. Если громкость превышает порог — юзер глушится локально, пока не стихнет",
    tags: ["Voice", "Utility"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,

    patches: [
        {
            // тот же патч что и VolumeBooster — точка входа в аудиопоток юзера
            find: "streamSourceNode",
            group: true,
            replacement: [
                {
                    match: /Math\.max.{0,30}\)\)/,
                    replace: "arguments[0]"
                },
                {
                    match: /\}return"video"/,
                    replace: "this.updateAudioElement();$&"
                },
                {
                    match: /\.volume=this\._volume\/100;/,
                    replace: ".volume=0.00;$self.patchAudio(this);"
                }
            ]
        }
    ],

    patchAudio(data: StreamData) {
        if (data.stream.getAudioTracks().length === 0) return;

        data.streamSourceNode ??= data.audioContext.createMediaStreamSource(data.stream);

        if (!data.gainNode) {
            const gain = data.audioContext.createGain();
            data.streamSourceNode.connect(gain);
            gain.connect(data.audioContext.destination);
        }

        // анализатор для отслеживания уровня
        if (!data.analyserNode) {
            const analyser = data.audioContext.createAnalyser();
            analyser.fftSize = 256;
            data.streamSourceNode.connect(analyser);

            const buffer = new Uint8Array(analyser.frequencyBinCount);
            const id = data.id;

            analysers.set(id, {
                analyser,
                gain: data.gainNode,
                data: buffer,
                isLimited: false,
                limitedAt: 0,
                originalVolume: data._volume
            });

            const interval = setInterval(() => {
                const cur = analysers.get(id);
                if (!cur || !cur.analyser) {
                    clearInterval(interval);
                    analysers.delete(id);
                    return;
                }
                checkLevels(id, cur.analyser, cur.data, cur.gain);
            }, 200);

            data.analyserNode = analyser;
        }

        data.gainNode.gain.value = data._mute
            ? 0
            : data._volume / 100;
    },

    stop() {
        analysers.clear();
    },
});
