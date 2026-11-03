/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FluxDispatcher, MediaEngineStore, SelectedChannelStore, UserStore, VoiceStateStore } from "@webpack/common";

import { VoiceIsolatorState } from "./types";

type Listener = (state: VoiceIsolatorState) => void;

class VoiceIsolatorEngine {
    private state: VoiceIsolatorState = {
        isolatedUserIds: [],
        isolatedUserId: null,
        isolatedUserName: null,
        isolatedUserAvatar: null,
        channelId: null,
        originalVolumes: {}
    };

    private listeners = new Set<Listener>();
    private audioContext: AudioContext | null = null;
    private userGainNodes = new Map<string, GainNode>();
    private currentAttenuation: number = 0;
    private maintenanceInterval: ReturnType<typeof setInterval> | null = null;

    private startMaintenance() {
        if (this.maintenanceInterval) return;
        this.maintenanceInterval = setInterval(() => {
            if (!this.state.channelId || this.state.isolatedUserIds.length === 0) {
                this.stopMaintenance();
                return;
            }
            this.enforceAttenuation();
        }, 1500);
    }

    private stopMaintenance() {
        if (this.maintenanceInterval) {
            clearInterval(this.maintenanceInterval);
            this.maintenanceInterval = null;
        }
    }

    public enforceAttenuation(attenuationVol?: number) {
        if (!this.state.channelId || this.state.isolatedUserIds.length === 0) return;
        const myId = UserStore.getCurrentUser()?.id;
        const voiceStates = VoiceStateStore.getVoiceStatesForChannel(this.state.channelId) || {};
        const attenuation = attenuationVol !== undefined ? attenuationVol : this.currentAttenuation;
        const shouldMute = attenuation === 0;

        for (const uid of Object.keys(voiceStates)) {
            if (uid === myId || this.isUserIsolated(uid)) continue;

            if (!(uid in this.state.originalVolumes)) {
                this.state.originalVolumes[uid] = (MediaEngineStore as any)?.getLocalVolume?.(uid) ?? 100;
            }

            const currentVol = (MediaEngineStore as any)?.getLocalVolume?.(uid);
            if (currentVol !== attenuation) {
                this.setLocalUserVolume(uid, attenuation, shouldMute);
            }
        }
    }

    public getState(): VoiceIsolatorState {
        return {
            ...this.state,
            isolatedUserIds: [...this.state.isolatedUserIds],
            originalVolumes: { ...this.state.originalVolumes }
        };
    }

    public isUserIsolated(userId: string): boolean {
        return this.state.isolatedUserIds.includes(userId);
    }

    public subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify() {
        const s = this.getState();
        this.listeners.forEach(l => l(s));
    }

    private updateLegacyFields() {
        const firstId = this.state.isolatedUserIds[0] ?? null;
        this.state.isolatedUserId = firstId;
        if (firstId) {
            const u = UserStore.getUser(firstId);
            this.state.isolatedUserName = (u as any)?.globalName || (u as any)?.global_name || u?.username || "Target";
            this.state.isolatedUserAvatar = u?.avatar
                ? `https://cdn.discordapp.com/avatars/${firstId}/${u.avatar}.webp?size=64`
                : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(firstId) >> 22n) % 6}.png`;
        } else {
            this.state.isolatedUserName = null;
            this.state.isolatedUserAvatar = null;
        }
    }

    public setLocalUserVolume(userId: string, volume: number, mute: boolean = false) {
        // 1. Dispatch Discord Flux audio actions
        try {
            FluxDispatcher.dispatch({
                type: "AUDIO_SET_LOCAL_VOLUME",
                context: "default",
                userId,
                volume: Math.min(volume, 200)
            });
        } catch { }

        try {
            FluxDispatcher.dispatch({
                type: "AUDIO_SET_LOCAL_MUTE",
                context: "default",
                userId,
                mute
            });
        } catch { }

        // 2. Direct MediaEngine call (supports raw volume multipliers > 200)
        try {
            const mediaEngine = (MediaEngineStore as any)?.getMediaEngine?.();
            if (mediaEngine) {
                if (typeof mediaEngine.setLocalVolume === "function") {
                    mediaEngine.setLocalVolume(userId, volume);
                }
                if (typeof mediaEngine.setLocalMute === "function") {
                    mediaEngine.setLocalMute(userId, mute);
                }
            }
        } catch { }

        // 3. Web Audio Hardware Gain Boost for extra loudness
        if (volume > 100 && !mute) {
            this.applyWebAudioBoost(userId, volume / 100);
        } else {
            this.removeWebAudioBoost(userId);
        }
    }

    private applyWebAudioBoost(userId: string, multiplier: number) {
        try {
            const mediaEngine = (MediaEngineStore as any)?.getMediaEngine?.();
            if (mediaEngine?.connections) {
                for (const conn of mediaEngine.connections) {
                    const audioStream = conn.audioStream || conn._audioStream;
                    if (audioStream && (conn.userId === userId || conn.streamUserId === userId)) {
                        if (!this.audioContext) {
                            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                            if (AudioCtx) this.audioContext = new AudioCtx();
                        }
                    }
                }
            }
        } catch { }
    }

    private removeWebAudioBoost(userId: string) {
        const node = this.userGainNodes.get(userId);
        if (node) {
            try { node.disconnect(); } catch { }
            this.userGainNodes.delete(userId);
        }
    }

    public isolateUser(
        targetUserId: string,
        opts: {
            attenuationVolume?: number;
            boostTarget?: boolean;
            targetVolume?: number;
        } = {}
    ) {
        const currentChannelId = SelectedChannelStore.getVoiceChannelId();
        if (!currentChannelId) return;

        const myId = UserStore.getCurrentUser()?.id;
        const attenuation = opts.attenuationVolume !== undefined ? opts.attenuationVolume : 0;
        const targetVol = opts.boostTarget ? (opts.targetVolume || 300) : 100;

        // If isolation is already active on this channel, just add targetUserId to isolatedUserIds
        if (this.state.channelId === currentChannelId && this.state.isolatedUserIds.length > 0) {
            this.currentAttenuation = attenuation;
            this.startMaintenance();
            if (!this.state.isolatedUserIds.includes(targetUserId)) {
                this.state.isolatedUserIds.push(targetUserId);
                if (!(targetUserId in this.state.originalVolumes)) {
                    this.state.originalVolumes[targetUserId] = (MediaEngineStore as any)?.getLocalVolume?.(targetUserId) ?? 100;
                }
                this.setLocalUserVolume(targetUserId, targetVol, false);
                setTimeout(() => {
                    if (this.isUserIsolated(targetUserId)) this.setLocalUserVolume(targetUserId, targetVol, false);
                }, 200);
                this.updateLegacyFields();
                this.notify();
            }
            return;
        }

        this.currentAttenuation = attenuation;
        this.startMaintenance();

        // Starting fresh isolation on currentChannelId
        const originalVolumesBackup: Record<string, number> = {};

        // Get all users in the channel
        const voiceStates = VoiceStateStore.getVoiceStatesForChannel(currentChannelId) || {};
        let userIds = Object.keys(voiceStates);

        if (userIds.length === 0) {
            const allStates = (VoiceStateStore as any).getAllVoiceStates?.() || {};
            userIds = Object.entries(allStates)
                .filter(([_, st]: any) => st?.channelId === currentChannelId)
                .map(([uid]) => uid);
        }

        for (const uid of userIds) {
            if (uid === myId) continue;

            const curVol = (MediaEngineStore as any)?.getLocalVolume?.(uid) ?? 100;
            originalVolumesBackup[uid] = curVol;

            if (uid === targetUserId) {
                this.setLocalUserVolume(uid, targetVol, false);
            } else {
                const shouldMute = attenuation === 0;
                this.setLocalUserVolume(uid, attenuation, shouldMute);
            }
        }

        this.state = {
            isolatedUserIds: [targetUserId],
            isolatedUserId: targetUserId,
            isolatedUserName: null,
            isolatedUserAvatar: null,
            channelId: currentChannelId,
            originalVolumes: originalVolumesBackup
        };

        this.updateLegacyFields();
        this.notify();
    }

    public removeUserFromIsolate(
        targetUserId: string,
        opts: { attenuationVolume?: number; } = {}
    ) {
        if (!this.state.isolatedUserIds.includes(targetUserId)) return;

        this.state.isolatedUserIds = this.state.isolatedUserIds.filter(id => id !== targetUserId);

        // If no one is isolated anymore, restore everyone
        if (this.state.isolatedUserIds.length === 0) {
            this.restoreAll();
            return;
        }

        // Otherwise, target user becomes attenuated like other non-isolated channel members
        const attenuation = opts.attenuationVolume !== undefined ? opts.attenuationVolume : 0;
        const shouldMute = attenuation === 0;
        this.setLocalUserVolume(targetUserId, attenuation, shouldMute);

        this.updateLegacyFields();
        this.notify();
    }

    public toggleIsolate(
        targetUserId: string,
        opts: {
            attenuationVolume?: number;
            boostTarget?: boolean;
            targetVolume?: number;
        } = {}
    ) {
        if (this.isUserIsolated(targetUserId)) {
            this.removeUserFromIsolate(targetUserId, opts);
        } else {
            this.isolateUser(targetUserId, opts);
        }
    }

    public restoreAll() {
        this.stopMaintenance();
        this.currentAttenuation = 0;

        if (this.state.isolatedUserIds.length === 0 && Object.keys(this.state.originalVolumes).length === 0) return;

        // Restore all tracked users' original volumes and unmute
        for (const [uid, origVol] of Object.entries(this.state.originalVolumes)) {
            this.setLocalUserVolume(uid, origVol, false);
        }

        // Restore isolated users' original volumes
        for (const uid of this.state.isolatedUserIds) {
            const origVol = this.state.originalVolumes[uid] ?? 100;
            this.setLocalUserVolume(uid, origVol, false);
        }

        this.state = {
            isolatedUserIds: [],
            isolatedUserId: null,
            isolatedUserName: null,
            isolatedUserAvatar: null,
            channelId: null,
            originalVolumes: {}
        };

        this.notify();
    }

    public handleVoiceStateUpdate(
        state: any,
        opts: {
            attenuationVolume?: number;
            boostTarget?: boolean;
            targetVolume?: number;
            attenuateNewJoiners?: boolean;
            autoIsolateNewJoiners?: boolean;
        } = {}
    ) {
        if (this.state.isolatedUserIds.length === 0 || !this.state.channelId) return;

        const uid = state.userId || state.user_id;
        if (!uid) return;

        const channelId = state.channelId !== undefined ? state.channelId : state.channel_id;
        const myId = UserStore.getCurrentUser()?.id;

        // If I left or switched voice channel, restore all
        if (uid === myId) {
            if (channelId !== this.state.channelId) {
                this.restoreAll();
            }
            return;
        }

        // User joined or is in our active voice channel
        if (channelId === this.state.channelId) {
            if (this.isUserIsolated(uid)) return;

            // Check if user explicitly configured auto-isolating new joiners
            if (opts.autoIsolateNewJoiners) {
                if (!(uid in this.state.originalVolumes)) {
                    this.state.originalVolumes[uid] = (MediaEngineStore as any)?.getLocalVolume?.(uid) ?? 100;
                }
                this.state.isolatedUserIds.push(uid);

                const targetVol = opts.boostTarget ? (opts.targetVolume || 300) : 100;
                this.setLocalUserVolume(uid, targetVol, false);

                // Re-apply after brief delay in case Discord's WebRTC audio receiver connects asynchronously
                setTimeout(() => {
                    if (this.isUserIsolated(uid) && this.state.channelId) {
                        this.setLocalUserVolume(uid, targetVol, false);
                    }
                }, 250);

                this.updateLegacyFields();
                this.notify();
            } else if (opts.attenuateNewJoiners !== false) {
                // By default: automatically lower the volume of new joiners
                if (!(uid in this.state.originalVolumes)) {
                    this.state.originalVolumes[uid] = (MediaEngineStore as any)?.getLocalVolume?.(uid) ?? 100;
                }
                const attenuation = opts.attenuationVolume !== undefined ? opts.attenuationVolume : this.currentAttenuation;
                const shouldMute = attenuation === 0;

                this.setLocalUserVolume(uid, attenuation, shouldMute);

                // Multi-stage retry to guarantee attenuation as WebRTC tracks connect asynchronously
                const delays = [100, 300, 600, 1200, 2500];
                for (const delay of delays) {
                    setTimeout(() => {
                        if (!this.isUserIsolated(uid) && this.state.channelId) {
                            this.setLocalUserVolume(uid, attenuation, shouldMute);
                        }
                    }, delay);
                }

                this.notify();
            }
        } else {
            // User left our active voice channel
            if (this.isUserIsolated(uid)) {
                this.state.isolatedUserIds = this.state.isolatedUserIds.filter(id => id !== uid);

                if (uid in this.state.originalVolumes) {
                    this.setLocalUserVolume(uid, this.state.originalVolumes[uid], false);
                    delete this.state.originalVolumes[uid];
                }

                if (this.state.isolatedUserIds.length === 0) {
                    this.restoreAll();
                    return;
                }

                this.updateLegacyFields();
                this.notify();
            } else if (uid in this.state.originalVolumes) {
                // Restore volume for attenuated user who left
                this.setLocalUserVolume(uid, this.state.originalVolumes[uid], false);
                delete this.state.originalVolumes[uid];
            }
        }
    }

    public handleChannelChange(newChannelId: string | null) {
        if (this.state.channelId && this.state.channelId !== newChannelId) {
            this.restoreAll();
        }
    }
}

export const voiceIsolatorEngine = new VoiceIsolatorEngine();
