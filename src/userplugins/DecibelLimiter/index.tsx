import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType, makeRange } from "@utils/types";
import { React } from "@webpack/common";

interface StreamData {
    audioContext: AudioContext;
    audioElement: HTMLAudioElement;
    emitter: any;
    gainNode?: GainNode;
    analyserNode?: AnalyserNode;
    limiterInterval?: ReturnType<typeof setInterval>;
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
    maxDb: {
        type: OptionType.SLIDER,
        description: "Макс. уровень (dB) — выше понижает",
        markers: makeRange(0, 60, 5),
        default: 20,
        stickToMarkers: true
    },
    reduceTo: {
        type: OptionType.SLIDER,
        description: "Понижать громкость до (%)",
        markers: makeRange(0, 100, 5),
        default: 20,
        stickToMarkers: true
    },
    smooth: {
        type: OptionType.SLIDER,
        description: "Плавность (0 = резко, 10 = плавно)",
        markers: makeRange(0, 10, 1),
        default: 5,
        stickToMarkers: true
    }
});

const monitors = new Map<string, {
    analyser: AnalyserNode;
    gain: GainNode;
    data: Uint8Array;
    currentDb: number;
    originalVolume: number;
    isReduced: boolean;
    interval: ReturnType<typeof setInterval>;
}>();

function checkLevels(id: string) {
    const mon = monitors.get(id);
    if (!mon) return;

    mon.analyser.getByteFrequencyData(mon.data);

    let sum = 0;
    for (let i = 0; i < mon.data.length; i++) {
        sum += mon.data[i] * mon.data[i];
    }
    const rms = Math.sqrt(sum / mon.data.length) / 255;
    const db = rms > 0.001 ? Math.min(60, Math.round(Math.abs(20 * Math.log10(rms)))) : 0;
    mon.currentDb = db;

    const maxDb = settings.store.maxDb;
    const reduceTo = settings.store.reduceTo / 100;
    const smooth = settings.store.smooth;
    const target = mon.originalVolume / 100;

    if (db > maxDb) {
        const t = target * reduceTo;
        mon.gain.gain.value = smooth === 0 ? t : mon.gain.gain.value + (t - mon.gain.gain.value) / (smooth + 1);
        mon.isReduced = true;
    } else {
        mon.isReduced = false;
        mon.gain.gain.value = smooth === 0 ? target : mon.gain.gain.value + (target - mon.gain.gain.value) / (smooth + 1);
    }
}

function DbMeterComponent() {
    const [tick, setTick] = React.useState(0);
    React.useEffect(() => {
        const i = setInterval(() => setTick(t => t + 1), 300);
        return () => clearInterval(i);
    }, []);

    let maxDb = 0;
    let limited = 0;
    for (const [, mon] of monitors) {
        if (mon.currentDb > maxDb) maxDb = mon.currentDb;
        if (mon.isReduced) limited++;
    }

    const db = Math.round(maxDb);
    const bar = Math.max(0, Math.min(100, Math.round((db / 60) * 100)));
    const color = db > settings.store.maxDb ? "#ed4245" : db > settings.store.maxDb - 15 ? "#faa61a" : "#23a55a";

    return (
        <div style={{ padding: "12px 0", fontFamily: "monospace" }}>
            <div style={{ fontWeight: 700, fontSize: "16px", marginBottom: 8, color: "#f2f3f5" }}>
                🎙️ Decibel Monitor
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: "28px", fontWeight: "700", color, minWidth: 70, textAlign: "right" }}>
                    {db} dB
                </span>
                <div style={{ flex: 1, height: 12, background: "#1e1f22", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{
                        width: `${bar}%`, height: "100%",
                        background: color, borderRadius: 6,
                        transition: "width 0.2s, background 0.2s"
                    }} />
                </div>
            </div>
            <div style={{ color: "#b5bac1", fontSize: 13 }}>
                Порог: {settings.store.maxDb} dB | Юзеров: {monitors.size} | Понижено: {limited}
            </div>
        </div>
    );
}

export default definePlugin({
    name: "DecibelLimiter",
    description: "Счётчик dB + авто-понижение громкости орущих. Требуется VolumeBooster (включён по умолчанию)",
    tags: ["SudoCord", "Voice"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,
    settingsAboutComponent: DbMeterComponent,

    // патчим ВЫВОД VolumeBooster — после того как он создал аудиопуть
    patches: [
        {
            find: "$self.patchVolume(this);",
            replacement: {
                match: /\$self\.patchVolume\(this\);/,
                replace: "$self.patchVolume(this);$self.patchDecibel(this);"
            }
        }
    ],

    patchDecibel(data: StreamData) {
        if (!data.streamSourceNode || !data.gainNode) return;
        if (data.analyserNode) return;

        const analyser = data.audioContext.createAnalyser();
        analyser.fftSize = 256;
        data.streamSourceNode.connect(analyser);

        const buffer = new Uint8Array(analyser.frequencyBinCount);
        const id = data.id;

        monitors.set(id, {
            analyser,
            gain: data.gainNode,
            data: buffer,
            currentDb: 0,
            originalVolume: data._volume || 100,
            isReduced: false
        });

        data.analyserNode = analyser;

        const interval = setInterval(() => {
            const mon = monitors.get(id);
            if (!mon || !mon.analyser) {
                clearInterval(interval);
                monitors.delete(id);
                return;
            }
            checkLevels(id);
        }, 100);

        data.limiterInterval = interval;
    },

    stop() {
        for (const [, mon] of monitors) {
            if (mon.interval) clearInterval(mon.interval);
        }
        monitors.clear();
    },
});