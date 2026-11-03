/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { Card } from "@components/Card";
import { Flex, FlexAlign, FlexJustify } from "@components/Flex";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import definePlugin, { OptionType } from "@utils/types";
import {
    Button,
    FluxDispatcher,
    MediaEngineStore,
    Menu,
    React,
    Text,
    useEffect,
    UserStore,
    useState } from "@webpack/common";

const settings = definePluginSettings({
    autoPersist: {
        description: "Remember Anti-Stereo state for users across Discord sessions.",
        type: OptionType.BOOLEAN,
        default: true,
        restartNeeded: false
    }
});

interface WebAudioDownmixBundle {
    source: MediaStreamAudioSourceNode;
    splitter: ChannelSplitterNode;
    gainL: GainNode;
    gainR: GainNode;
    merger: ChannelMergerNode;
    outputGain: GainNode;
}

class AntiStereoEngine {
    private antiStereoUsers = new Set<string>();
    private listeners = new Set<() => void>();
    private maintenanceInterval: ReturnType<typeof setInterval> | null = null;

    public async init() {
        if (!settings.store.autoPersist) return;
        try {
            const saved = await DataStore.get<string[]>("AntiStereo_users");
            if (Array.isArray(saved)) {
                this.antiStereoUsers.clear();
                for (const id of saved) {
                    if (id && typeof id === "string") {
                        this.antiStereoUsers.add(id);
                    }
                }
                this.notify();
                this.enforce();
            }
        } catch { }
    }

    private async save() {
        if (!settings.store.autoPersist) return;
        try {
            await DataStore.set("AntiStereo_users", Array.from(this.antiStereoUsers));
        } catch { }
    }

    public isUserAntiStereo(userId: string): boolean {
        return this.antiStereoUsers.has(userId);
    }

    public getAntiStereoUsers(): string[] {
        return Array.from(this.antiStereoUsers);
    }

    public subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify() {
        this.listeners.forEach(l => l());
    }

    public toggleUser(userId: string) {
        if (this.antiStereoUsers.has(userId)) {
            this.removeUser(userId);
        } else {
            this.addUser(userId);
        }
    }

    public addUser(userId: string) {
        if (this.antiStereoUsers.has(userId)) return;
        this.antiStereoUsers.add(userId);
        this.save();
        this.notify();
        this.applyMono(userId);
        this.startMaintenance();
    }

    public removeUser(userId: string) {
        if (!this.antiStereoUsers.has(userId)) return;
        this.antiStereoUsers.delete(userId);
        this.save();
        this.notify();
        this.restoreAudio(userId);
        if (this.antiStereoUsers.size === 0) {
            this.stopMaintenance();
        }
    }

    public removeAll() {
        const users = Array.from(this.antiStereoUsers);
        this.antiStereoUsers.clear();
        this.save();
        this.notify();
        for (const id of users) {
            this.restoreAudio(id);
        }
        this.stopMaintenance();
    }

    private startMaintenance() {
        if (this.maintenanceInterval) return;
        this.maintenanceInterval = setInterval(() => {
            if (this.antiStereoUsers.size === 0) {
                this.stopMaintenance();
                return;
            }
            this.enforce();
        }, 1500);
    }

    private stopMaintenance() {
        if (this.maintenanceInterval) {
            clearInterval(this.maintenanceInterval);
            this.maintenanceInterval = null;
        }
    }

    public enforce() {
        for (const userId of this.antiStereoUsers) {
            this.applyMono(userId);
        }
    }

    public applyMono(userId: string) {
        // 1. Dispatch Discord Flux pan action to center audio balance
        try {
            FluxDispatcher.dispatch({
                type: "AUDIO_SET_LOCAL_PAN",
                context: "default",
                userId,
                left: 1,
                right: 1
            });
        } catch { }

        // 2. Direct MediaEngine and native connection pan enforcement
        try {
            const mediaEngine = (MediaEngineStore as any)?.getMediaEngine?.();
            if (mediaEngine) {
                if (typeof mediaEngine.setLocalPan === "function") {
                    mediaEngine.setLocalPan(userId, 1, 1);
                }
                if (mediaEngine.connections) {
                    for (const conn of mediaEngine.connections) {
                        try {
                            if (typeof conn.setLocalPan === "function") {
                                conn.setLocalPan(userId, 1, 1);
                            }
                            if (conn.localPans) {
                                conn.localPans[userId] = { left: 1, right: 1 };
                            }
                            if (typeof conn.setUserPosition === "function") {
                                conn.setUserPosition(userId, [0, 0, 0]);
                            }
                        } catch { }
                    }
                }

                // 3. Web Audio downmixing for active WebRTC media streams
                const streams = Object.values((mediaEngine as any)._streams ?? (mediaEngine as any).streams ?? {}) as any[];
                for (const s of streams) {
                    if (s && (s.id === userId || s.userId === userId || s.streamUserId === userId)) {
                        this.hookWebAudioStream(s);
                    }
                }
            }
        } catch { }
    }

    public hookWebAudioStream(s: any) {
        if (!s || s.__ncAntiStereoHooked) return;
        try {
            const ctx = s.audioContext;
            if (!ctx || !s.stream) return;
            if (typeof s.stream.getAudioTracks !== "function" || s.stream.getAudioTracks().length === 0) return;

            const source = s.__ncAntiStereoSource ?? ctx.createMediaStreamSource(s.stream);
            s.__ncAntiStereoSource = source;

            const splitter = ctx.createChannelSplitter(2);
            const merger = ctx.createChannelMerger(2);

            const gainL = ctx.createGain();
            gainL.gain.value = 0.5;
            const gainR = ctx.createGain();
            gainR.gain.value = 0.5;

            const outputGain = ctx.createGain();
            outputGain.gain.value = s._mute ? 0 : (s._volume ?? 100) / 100;

            source.connect(splitter);
            splitter.connect(gainL, 0);
            splitter.connect(gainR, 1);

            gainL.connect(merger, 0, 0);
            gainL.connect(merger, 0, 1);
            gainR.connect(merger, 0, 0);
            gainR.connect(merger, 0, 1);

            merger.connect(outputGain);
            outputGain.connect(ctx.destination);

            if (s.gainNode) {
                s.__ncOrigGainVal = s.gainNode.gain.value;
                s.gainNode.gain.value = 0;
            }

            s.__ncAntiStereoHooked = true;
            s.__ncAntiStereoBundle = {
                source,
                splitter,
                gainL,
                gainR,
                merger,
                outputGain
            };

            const cleanup = () => {
                this.unhookWebAudioStream(s);
                s.stream?.removeEventListener("inactive", cleanup);
            };
            s.stream.addEventListener("inactive", cleanup);
        } catch (e) {
            console.error("[AntiStereo] Web Audio downmix hook failed:", e);
        }
    }

    public unhookWebAudioStream(s: any) {
        if (!s || !s.__ncAntiStereoHooked) return;
        try {
            if (s.__ncAntiStereoBundle) {
                const b: WebAudioDownmixBundle = s.__ncAntiStereoBundle;
                try { b.source.disconnect(); } catch { }
                try { b.splitter.disconnect(); } catch { }
                try { b.gainL.disconnect(); } catch { }
                try { b.gainR.disconnect(); } catch { }
                try { b.merger.disconnect(); } catch { }
                try { b.outputGain.disconnect(); } catch { }
                delete s.__ncAntiStereoBundle;
                delete s.__ncAntiStereoSource;
            }
            if (s.gainNode) {
                s.gainNode.gain.value = s._mute ? 0 : (s._volume ?? 100) / 100;
                delete s.__ncOrigGainVal;
            }
            delete s.__ncAntiStereoHooked;
        } catch { }
    }

    public onStreamVolumeChange(s: any) {
        if (!s || !s.id) return;
        if (this.antiStereoUsers.has(s.id)) {
            if (s.__ncAntiStereoBundle?.outputGain) {
                s.__ncAntiStereoBundle.outputGain.gain.value = s._mute ? 0 : (s._volume ?? 100) / 100;
                if (s.gainNode) s.gainNode.gain.value = 0;
            } else {
                this.hookWebAudioStream(s);
            }
        }
    }

    public restoreAudio(userId: string) {
        try {
            const mediaEngine = (MediaEngineStore as any)?.getMediaEngine?.();
            if (mediaEngine) {
                const streams = Object.values((mediaEngine as any)._streams ?? (mediaEngine as any).streams ?? {}) as any[];
                for (const s of streams) {
                    if (s && (s.id === userId || s.userId === userId || s.streamUserId === userId)) {
                        this.unhookWebAudioStream(s);
                    }
                }
            }
        } catch { }
    }

    public stop() {
        this.stopMaintenance();
        for (const userId of this.antiStereoUsers) {
            this.restoreAudio(userId);
        }
        this.listeners.clear();
    }
}

const antiStereoEngine = new AntiStereoEngine();

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user?: any; }) => {
    if (!user || user.bot) return;

    const myId = UserStore.getCurrentUser()?.id;
    if (user.id === myId) return;

    const isAntiStereoActive = antiStereoEngine.isUserAntiStereo(user.id);

    const menuItem = (
        <Menu.MenuCheckboxItem
            key="anti-stereo-toggle"
            id="anti-stereo-toggle"
            label={t("Anti-Stereo")}
            checked={isAntiStereoActive}
            action={() => {
                antiStereoEngine.toggleUser(user.id);
            }}
        />
    );

    const targetGroup = findGroupChildrenByChildId("user-volume", children)
        ?? findGroupChildrenByChildId("mute", children)
        ?? findGroupChildrenByChildId("user-mute", children)
        ?? findGroupChildrenByChildId("voice-settings", children);

    if (targetGroup && Array.isArray(targetGroup)) {
        targetGroup.push(menuItem);
    } else {
        children.push(<Menu.MenuGroup>{menuItem}</Menu.MenuGroup>);
    }
};

function AntiStereoSettingsComponent() {
    const [, setTick] = useState(0);

    useEffect(() => {
        const unsub = antiStereoEngine.subscribe(() => setTick(t => t + 1));
        return () => unsub();
    }, []);

    const users = antiStereoEngine.getAntiStereoUsers();

    return (
        <div style={{ width: "100%", marginTop: "10px" }}>
            <Card
                variant="primary"
                outline
                style={{
                    padding: "16px",
                    background: "var(--background-secondary, #2b2d31)",
                    borderRadius: "8px",
                    border: "1px solid var(--background-tertiary, #1e1f22)"
                }}
            >
                <Flex alignItems={FlexAlign.CENTER} justifyContent={FlexJustify.BETWEEN} style={{ width: "100%" }}>
                    <div>
                        <Text variant="text-md/bold" style={{ color: "#ffffff", fontWeight: 700 }}>
                            {t("Anti-Stereo Users")}
                        </Text>
                        <Text variant="text-sm/normal" style={{ color: "var(--text-muted, #949ba4)", marginTop: "4px" }}>
                            {t("Forces stereo microphones, soundpads, and panned voice from selected users into clean, balanced mono so you hear them equally in both ears.")}
                        </Text>
                    </div>
                </Flex>

                {users.length === 0 ? (
                    <Text
                        variant="text-sm/normal"
                        style={{
                            color: "var(--text-muted, #949ba4)",
                            marginTop: "14px",
                            fontStyle: "italic"
                        }}
                    >
                        {t("No users currently in anti-stereo mode.")}
                    </Text>
                ) : (
                    <div style={{ marginTop: "14px" }}>
                        {users.map(userId => {
                            const u = UserStore.getUser(userId);
                            const name = (u as any)?.globalName || (u as any)?.global_name || u?.username || userId;
                            const avatarUrl = u?.avatar
                                ? `https://cdn.discordapp.com/avatars/${userId}/${u.avatar}.webp?size=64`
                                : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(userId || "0") >> 22n) % 6}.png`;

                            return (
                                <div
                                    key={userId}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "8px 12px",
                                        background: "var(--background-secondary-alt, #1e1f22)",
                                        borderRadius: "6px",
                                        marginTop: "8px"
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <img
                                            src={avatarUrl}
                                            alt={name}
                                            style={{ width: "32px", height: "32px", borderRadius: "50%" }}
                                        />
                                        <div>
                                            <div style={{ color: "#ffffff", fontWeight: 600, fontSize: "14px" }}>
                                                {name}
                                            </div>
                                            <div style={{ color: "var(--text-muted, #949ba4)", fontSize: "12px" }}>
                                                {userId}
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        size="small"
                                        variant="secondary"
                                        onClick={() => antiStereoEngine.removeUser(userId)}
                                    >
                                        {t("Remove")}
                                    </Button>
                                </div>
                            );
                        })}

                        {users.length > 1 && (
                            <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end" }}>
                                <Button
                                    variant="dangerPrimary"
                                    onClick={() => antiStereoEngine.removeAll()}
                                >
                                    {t("Remove All")}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </Card>
        </div>
    );
}

export default definePlugin({
    name: "AntiStereo",
    description: "Forces stereo voice and panning from selected users into clean, balanced mono audio.",
    authors: [
        { name: "Nightcord", id: 0n }
    ],
    enabledByDefault: false,
    settings,
    settingsAboutComponent: AntiStereoSettingsComponent,

    contextMenus: {
        "user-context": UserContextMenuPatch
    },

    patches: [
        {
            find: "streamSourceNode",
            replacement: {
                match: /this\._volume\s*=\s*(\i);/,
                replace: "this._volume=$1;$self.onStreamVolumeChange(this);",
            },
        },
    ],

    onStreamVolumeChange(streamData: any) {
        antiStereoEngine.onStreamVolumeChange(streamData);
    },

    flux: {
        AUDIO_SET_LOCAL_PAN(action: any) {
            if (action?.userId && antiStereoEngine.isUserAntiStereo(action.userId)) {
                if (action.left !== 1 || action.right !== 1) {
                    action.left = 1;
                    action.right = 1;
                }
            }
        },
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: any[]; }) {
            if (Array.isArray(voiceStates)) {
                for (const st of voiceStates) {
                    const uid = st?.userId || st?.user_id;
                    if (uid && antiStereoEngine.isUserAntiStereo(uid)) {
                        antiStereoEngine.applyMono(uid);
                    }
                }
            }
        },
        VOICE_STATE_UPDATE(st: any) {
            const uid = st?.userId || st?.user_id;
            if (uid && antiStereoEngine.isUserAntiStereo(uid)) {
                antiStereoEngine.applyMono(uid);
            }
        },
        RTC_CONNECTION_STATE() {
            antiStereoEngine.enforce();
        }
    },

    start() {
        antiStereoEngine.init();
    },

    stop() {
        antiStereoEngine.stop();
    }
});
