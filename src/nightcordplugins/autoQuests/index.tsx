/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { find, findByCodeLazy, findStore } from "@webpack";
import {
    ChannelStore,
    createRoot,
    FluxDispatcher,
    GuildChannelStore,
    QuestStore,
    React,
    RestAPI,
    SelectedChannelStore,
    showToast,
    Text,
    Toasts,
    useEffect,
    UserStore,
    useState } from "@webpack/common";

const SUPPORTED_TASKS = [
    "WATCH_VIDEO",
    "WATCH_VIDEO_ON_MOBILE",
    "PLAY_ON_DESKTOP_V2",
    "PLAY_ON_DESKTOP",
    "PLAY_ACTIVITY",
    "PLAY_ON_XBOX",
    "PLAY_ON_PLAYSTATION",
    "STREAM_ON_DESKTOP"
] as const;

type SupportedTask = typeof SUPPORTED_TASKS[number];

export interface QuestItemState {
    id: string;
    questName: string;
    taskType: SupportedTask;
    secondsNeeded: number;
    currentProgress: number;
    completed: boolean;
    quest: any;
}

let activeQuestStates: QuestItemState[] = [];
let isRunnerActive = false;
let currentRunningQuestId: string | null = null;
let lastActiveQuestId: string | null = null;
let activeStreamKey: string | null = null;
let currentQuestBeingHeartbeated: any = null;
let runnerAbortController: AbortController | null = null;

const questProgressCache = new Map<string, number>();
const stateListeners = new Set<() => void>();

function notifyStateChanged() {
    for (const listener of stateListeners) {
        try { listener(); } catch {}
    }
}

function interruptibleSleep(ms: number, signal?: AbortSignal): Promise<boolean> {
    return new Promise(resolve => {
        if (signal?.aborted) {
            resolve(false);
            return;
        }
        let timer: any = null;
        const abortHandler = () => {
            if (timer) clearTimeout(timer);
            resolve(false);
        };
        timer = setTimeout(() => {
            signal?.removeEventListener("abort", abortHandler);
            resolve(true);
        }, ms);
        signal?.addEventListener("abort", abortHandler, { once: true });
    });
}

export const settings = definePluginSettings({
    autoStart: {
        type: OptionType.BOOLEAN,
        description: "Automatically run active quests in the background when Discord opens",
        default: false
    },
    autoResume: {
        type: OptionType.BOOLEAN,
        description: "Automatically resume in-progress quests on Discord startup",
        default: true
    },
    autoEnroll: {
        type: OptionType.BOOLEAN,
        description: "Automatically accept and enroll in available quests",
        default: true
    },
    showToasts: {
        type: OptionType.BOOLEAN,
        description: "Show notifications on quest progress and completion",
        default: true
    }
});

const reportVideoProgressNative = findByCodeLazy(".QUESTS_VIDEO_PROGRESS(") as ((questId: string, progress: number) => Promise<void>) | undefined;
const sendHeartbeatNative = findByCodeLazy(".QUESTS_HEARTBEAT(") as ((options: {
    questId: string;
    streamKey?: string;
    applicationId?: string;
    terminal?: boolean;
}) => Promise<void>) | undefined;
const enrollInQuestNative = findByCodeLazy('type:"QUESTS_ENROLL_BEGIN",') as ((questId: string, options?: any) => Promise<any>) | undefined;
const fetchAndDispatchQuests = findByCodeLazy("QUESTS_FETCH_CURRENT_QUESTS_BEGIN") as (() => Promise<void>) | undefined;

function QuestCompassIcon({ size = 18 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" fillOpacity="0.25" />
        </svg>
    );
}

function PlayIcon({ size = 14 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
            <polygon points="6 4 20 12 6 20 6 4" />
        </svg>
    );
}

function StopSquareIcon({ size = 14 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
            <rect x="5" y="5" width="14" height="14" rx="2" />
        </svg>
    );
}

function ChevronIcon({ size = 12, expanded = false }: { size?: number; expanded?: boolean; }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
                transition: "transform 0.25s ease",
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                flexShrink: 0
            }}
        >
            <polyline points="6 9 12 15 18 9" />
        </svg>
    );
}

function CheckmarkIcon({ size = 14 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--status-positive, #23a55a)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

function ExternalIcon({ size = 14 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
    );
}

function getResolvedQuestsStore(): any {
    return (
        QuestStore ||
        (findStore("QuestStore") as any) ||
        (findStore("QuestsStore") as any) ||
        find(m => m?.quests && (m?.getQuest || m?.getQuests))
    );
}

function getAllQuestsFromStore(): any[] {
    const store = getResolvedQuestsStore();
    if (!store) return [];
    if (store.quests instanceof Map) {
        return Array.from(store.quests.values());
    }
    if (store.quests && typeof store.quests === "object") {
        return Object.values(store.quests);
    }
    if (typeof store.getQuests === "function") {
        const q = store.getQuests();
        if (q instanceof Map) return Array.from(q.values());
        if (Array.isArray(q)) return q;
        if (q && typeof q === "object") return Object.values(q);
    }
    return [];
}

export function snakeToCamel(obj: any): any {
    if (Array.isArray(obj)) return obj.map(snakeToCamel);
    if (obj && typeof obj === "object") {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [
                key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
                snakeToCamel(value)
            ])
        );
    }
    return obj;
}

export function clearStuckEnrollments() {
    try {
        const all = getAllQuestsFromStore();
        for (const q of all) {
            if (!q.userStatus?.enrolledAt) {
                FluxDispatcher.dispatch({
                    type: "QUESTS_ENROLL_FAILURE",
                    questId: q.id
                });
            }
        }
    } catch {}
}

async function enrollQuest(quest: any): Promise<boolean> {
    const questId = typeof quest === "string" ? quest : quest?.id;
    if (!questId) return false;

    const freshQuest = getResolvedQuestsStore()?.getQuest?.(questId) || (typeof quest === "object" ? quest : null);
    if (freshQuest?.userStatus?.enrolledAt) {
        return true;
    }

    FluxDispatcher.dispatch({
        type: "QUESTS_ENROLL_BEGIN",
        questId
    });

    try {
        const response = await RestAPI.post({
            url: `/quests/${questId}/enroll`,
            body: { location: 11 }
        });

        if (response?.body) {
            FluxDispatcher.dispatch({
                type: "QUESTS_ENROLL_SUCCESS",
                enrolledQuestUserStatus: snakeToCamel(response.body)
            });

            if (freshQuest) {
                if (!freshQuest.userStatus) freshQuest.userStatus = {};
                freshQuest.userStatus.enrolledAt = new Date().toISOString();
            }
            return true;
        }
    } catch (err) {
        console.warn(`[AutoQuests] Enrollment failed for ${questId}:`, err);
    }

    FluxDispatcher.dispatch({
        type: "QUESTS_ENROLL_FAILURE",
        questId
    });
    return false;
}

interface HeartbeatDispatchResult {
    type: "success" | "failure" | "timeout";
    userStatus?: any;
    error?: unknown;
}

function waitForHeartbeatDispatchResult(questId: string, timeoutMs: number = 8000): { promise: Promise<HeartbeatDispatchResult>; cancel: () => void; } {
    let settled = false;
    let cleanup = () => { };
    const promise = new Promise<HeartbeatDispatchResult>(resolve => {
        const successEvent = "QUESTS_SEND_HEARTBEAT_SUCCESS";
        const failureEvent = "QUESTS_SEND_HEARTBEAT_FAILURE";
        const timeoutId = setTimeout(() => {
            cleanup();
            resolve({ type: "timeout" });
        }, timeoutMs);

        cleanup = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            FluxDispatcher.unsubscribe(successEvent, onSuccess);
            FluxDispatcher.unsubscribe(failureEvent, onFailure);
        };

        function onSuccess(data: { questId?: string; userStatus?: any; }) {
            if (data?.questId !== questId) return;
            cleanup();
            resolve({ type: "success", userStatus: data.userStatus ?? null });
        }

        function onFailure(data: { questId?: string; error?: unknown; }) {
            if (data?.questId !== questId) return;
            cleanup();
            resolve({ type: "failure", error: data?.error });
        }

        FluxDispatcher.subscribe(successEvent, onSuccess);
        FluxDispatcher.subscribe(failureEvent, onFailure);
    });

    return { promise, cancel: cleanup };
}

function getVoiceOrDMChannelInfo(): { channelId: string; isVoice: boolean; guildId?: string; } | null {
    try {
        const voiceChannelId = SelectedChannelStore?.getVoiceChannelId?.();
        if (voiceChannelId) {
            const channel = ChannelStore?.getChannel?.(voiceChannelId);
            return {
                channelId: voiceChannelId,
                isVoice: true,
                guildId: channel?.guild_id
            };
        }
        const sortedDMs = (ChannelStore as any)?.getSortedPrivateChannels?.();
        if (sortedDMs && sortedDMs.length > 0 && sortedDMs[0]?.id) {
            return { channelId: sortedDMs[0].id, isVoice: false };
        }
        const dmIds = (ChannelStore as any)?.getDMChannelIds?.() || (ChannelStore as any)?.getPrivateChannelIds?.();
        if (dmIds && dmIds.length > 0) {
            return { channelId: dmIds[0], isVoice: false };
        }
        if (GuildChannelStore && typeof (GuildChannelStore as any).getAllGuilds === "function") {
            const guilds = Object.values((GuildChannelStore as any).getAllGuilds());
            const voice = guilds.find((g: any) => g?.VOCAL && g.VOCAL.length > 0);
            if (voice) return { channelId: voice.VOCAL[0].channel.id, isVoice: true };
        }
    } catch {}
    return null;
}

function getStreamKey(questId: string): string {
    const info = getVoiceOrDMChannelInfo();
    const currentUserId = UserStore?.getCurrentUser?.()?.id || "1";
    if (info) {
        if (info.isVoice && info.guildId) {
            return `guild:${info.guildId}:${info.channelId}:${currentUserId}`;
        }
        return `call:${info.channelId}:${currentUserId}`;
    }
    return `call:${questId}:1`;
}

function getStoredProgressForQuest(quest: any, taskType: SupportedTask): number {
    if (quest?.userStatus?.completedAt) {
        return Infinity;
    }
    const progressMap = quest?.userStatus?.progress;
    if (progressMap && typeof progressMap === "object") {
        const directVal = progressMap[taskType]?.value;
        if (typeof directVal === "number") {
            return directVal;
        }

        if (taskType.startsWith("PLAY")) {
            for (const key of ["PLAY_ON_DESKTOP_V2", "PLAY_ON_DESKTOP", "PLAY_ACTIVITY", "PLAY_ON_XBOX", "PLAY_ON_PLAYSTATION"]) {
                const val = progressMap[key]?.value;
                if (typeof val === "number") return val;
            }
        } else if (taskType.startsWith("WATCH")) {
            for (const key of ["WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE"]) {
                const val = progressMap[key]?.value;
                if (typeof val === "number") return val;
            }
        }

        for (const entry of Object.values(progressMap) as any[]) {
            if (typeof entry?.value === "number") {
                return entry.value;
            }
        }
    }

    if (typeof quest?.userStatus?.streamProgressSeconds === "number") {
        return quest.userStatus.streamProgressSeconds;
    }

    return 0;
}

async function syncQuestsFromServer(): Promise<void> {
    try {
        if (typeof fetchAndDispatchQuests === "function") {
            await fetchAndDispatchQuests();
            return;
        }
    } catch {}

    try {
        const res = await RestAPI.get({ url: "/quests/@me" });
        if (res?.body?.quests) {
            FluxDispatcher.dispatch({
                type: "QUESTS_FETCH_CURRENT_QUESTS_SUCCESS",
                quests: res.body.quests
            });
        }
    } catch {}
}

export function refreshActiveQuests(): QuestItemState[] {
    const allQuests = getAllQuestsFromStore();
    const result: QuestItemState[] = [];

    for (const quest of allQuests) {
        if (!quest?.config) continue;
        const expiresAt = quest.config.expiresAt ? new Date(quest.config.expiresAt).getTime() : Infinity;
        if (expiresAt <= Date.now()) continue;

        const isCompleted = Boolean(quest.userStatus?.completedAt);
        const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
        if (!taskConfig?.tasks) continue;

        const taskType = SUPPORTED_TASKS.find(type => taskConfig.tasks[type] != null);
        if (!taskType) continue;

        const taskData = taskConfig.tasks[taskType];
        const secondsNeeded = taskData?.target ?? 0;
        const storeProgress = getStoredProgressForQuest(quest, taskType);

        // If quest is not completed on server, clean up any erroneous cached completion
        if (!isCompleted) {
            const cachedVal = questProgressCache.get(quest.id);
            if (cachedVal != null && cachedVal >= secondsNeeded) {
                questProgressCache.delete(quest.id);
            }
        }

        const cachedProgress = questProgressCache.get(quest.id) ?? 0;
        let currentProgress = isCompleted ? secondsNeeded : Math.max(storeProgress, cachedProgress);
        if (!isCompleted) {
            // Uncompleted quests can never exceed secondsNeeded - 1 (or 99%) locally
            currentProgress = Math.min(secondsNeeded > 0 ? secondsNeeded - 1 : 0, currentProgress);
        } else {
            currentProgress = secondsNeeded;
        }

        const questName = quest.config.messages?.questName || quest.config.questName || quest.config.messages?.gameTitle || quest.id;

        result.push({
            id: quest.id,
            questName,
            taskType,
            secondsNeeded,
            currentProgress,
            completed: isCompleted,
            quest
        });
    }

    // Sort quests:
    // 1. Enrolled & in-progress (highest completion % first so nearly completed quests finish right away)
    // 2. Enrolled with 0 progress
    // 3. Unenrolled
    // 4. Completed
    result.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const aEnrolled = Boolean(a.quest?.userStatus?.enrolledAt);
        const bEnrolled = Boolean(b.quest?.userStatus?.enrolledAt);
        if (aEnrolled && !bEnrolled) return -1;
        if (!aEnrolled && bEnrolled) return 1;
        if (aEnrolled && bEnrolled) {
            const aRatio = a.secondsNeeded > 0 ? (a.currentProgress || 0) / a.secondsNeeded : 0;
            const bRatio = b.secondsNeeded > 0 ? (b.currentProgress || 0) / b.secondsNeeded : 0;
            return bRatio - aRatio;
        }
        return 0;
    });

    activeQuestStates = result;
    notifyStateChanged();
    return result;
}

async function processVideoStep(state: QuestItemState): Promise<boolean> {
    const { quest, secondsNeeded } = state;
    const nextTime = Math.min(secondsNeeded, Math.round((state.currentProgress + 1.0 + Math.random() * 0.2) * 10) / 10);

    let reported = false;
    let isCompletedOnServer = false;

    try {
        const res = await RestAPI.post({
            url: `/quests/${quest.id}/video-progress`,
            body: { timestamp: nextTime }
        });
        reported = true;
        if (res?.body?.completed_at || res?.body?.user_status?.completed_at || res?.body?.enrolled_quest_user_status?.completed_at) {
            isCompletedOnServer = true;
        }
    } catch (err) {
        console.warn(`[AutoQuests] REST video progress failed for ${quest.id}, trying native:`, err);
        if (typeof reportVideoProgressNative === "function") {
            try {
                await reportVideoProgressNative(quest.id, nextTime);
                reported = true;
            } catch (nativeErr) {
                console.warn(`[AutoQuests] Video progress failed for ${quest.id}:`, nativeErr);
            }
        }
    }

    if (reported) {
        state.currentProgress = nextTime;
        questProgressCache.set(quest.id, nextTime);

        const freshQuest = getResolvedQuestsStore()?.getQuest?.(quest.id) || quest;
        if (freshQuest?.userStatus?.completedAt || isCompletedOnServer || nextTime >= secondsNeeded) {
            try {
                const finalRes = await RestAPI.post({
                    url: `/quests/${quest.id}/video-progress`,
                    body: { timestamp: secondsNeeded }
                });
                if (finalRes?.body?.completed_at || finalRes?.body?.user_status?.completed_at || finalRes?.body?.enrolled_quest_user_status?.completed_at) {
                    isCompletedOnServer = true;
                }
            } catch {}

            await syncQuestsFromServer();

            const updated = getResolvedQuestsStore()?.getQuest?.(quest.id);
            if (updated?.userStatus?.completedAt || isCompletedOnServer) {
                state.completed = true;
                state.currentProgress = secondsNeeded;
                questProgressCache.set(quest.id, secondsNeeded);
            } else {
                // Not confirmed by server yet: prevent false 100%
                state.completed = false;
                state.currentProgress = Math.min(secondsNeeded - 1, nextTime);
                questProgressCache.set(quest.id, state.currentProgress);
            }
        }

        notifyStateChanged();
        return true;
    }

    return false;
}

async function processHeartbeatStep(state: QuestItemState): Promise<boolean> {
    const { quest, taskType, secondsNeeded } = state;
    const isPlayQuest = taskType.startsWith("PLAY");
    const isStreamQuest = taskType === "STREAM_ON_DESKTOP";

    const appId = state.quest?.config?.taskConfig?.tasks?.[taskType]?.applications?.[0]?.id
        ?? state.quest?.config?.taskConfigV2?.tasks?.[taskType]?.applications?.[0]?.id
        ?? state.quest?.config?.taskConfig?.tasks?.PLAY_ON_DESKTOP_V2?.applications?.[0]?.id
        ?? state.quest?.config?.taskConfig?.tasks?.PLAY_ON_DESKTOP?.applications?.[0]?.id
        ?? state.quest?.config?.taskConfigV2?.tasks?.PLAY_ON_DESKTOP_V2?.applications?.[0]?.id
        ?? state.quest?.config?.taskConfigV2?.tasks?.PLAY_ON_DESKTOP?.applications?.[0]?.id
        ?? state.quest?.config?.application?.id
        ?? state.quest?.config?.applicationId;

    const streamKey = isStreamQuest ? getStreamKey(quest.id) : undefined;
    activeStreamKey = streamKey || null;
    currentQuestBeingHeartbeated = quest;

    let reported = false;
    let isCompletedOnServer = false;
    let newProgressValue: number | null = null;

    if (typeof sendHeartbeatNative === "function") {
        try {
            const dispatchWaiter = waitForHeartbeatDispatchResult(quest.id, 8000);
            try {
                await sendHeartbeatNative({
                    questId: quest.id,
                    streamKey: isStreamQuest ? streamKey : undefined,
                    applicationId: isPlayQuest ? appId : undefined,
                    terminal: false
                });
                reported = true;
            } catch (err) {
                dispatchWaiter.cancel();
                throw err;
            }

            const dispatchRes = await dispatchWaiter.promise;
            if (dispatchRes.type === "success" && dispatchRes.userStatus) {
                const srv = getStoredProgressForQuest({ userStatus: dispatchRes.userStatus }, taskType);
                if (Number.isFinite(srv)) newProgressValue = srv;
                if (dispatchRes.userStatus.completedAt) isCompletedOnServer = true;
            }
        } catch (nativeErr) {
            console.warn(`[AutoQuests] Native heartbeat failed for ${quest.id}, falling back to REST:`, nativeErr);
        }
    }

    if (!reported) {
        try {
            const body: any = { terminal: false };
            if (isStreamQuest && streamKey) body.stream_key = streamKey;
            if (isPlayQuest && appId) body.application_id = appId;

            const response = await RestAPI.post({
                url: `/quests/${quest.id}/heartbeat`,
                body
            });
            reported = true;
            const srv = response?.body?.progress?.[taskType]?.value
                ?? response?.body?.user_status?.progress?.[taskType]?.value
                ?? response?.body?.enrolled_quest_user_status?.progress?.[taskType]?.value;
            if (typeof srv === "number") newProgressValue = srv;
            if (response?.body?.completed_at || response?.body?.user_status?.completed_at || response?.body?.enrolled_quest_user_status?.completed_at) {
                isCompletedOnServer = true;
            }
        } catch (err) {
            console.warn(`[AutoQuests] REST heartbeat failed for ${quest.id}:`, err);
        }
    }

    if (reported) {
        const freshQuest = getResolvedQuestsStore()?.getQuest?.(quest.id) || quest;
        const freshProgress = getStoredProgressForQuest(freshQuest, taskType);

        if (newProgressValue !== null && newProgressValue > state.currentProgress) {
            state.currentProgress = Math.min(secondsNeeded, newProgressValue);
        } else if (Number.isFinite(freshProgress) && freshProgress > state.currentProgress) {
            state.currentProgress = Math.min(secondsNeeded, freshProgress);
        } else if (state.currentProgress < secondsNeeded) {
            state.currentProgress = Math.min(secondsNeeded - 1, state.currentProgress + 20);
        }

        if (freshQuest?.userStatus?.completedAt) {
            isCompletedOnServer = true;
        }

        // When approaching the finish line, sync fresh status from server to verify actual completion
        if (isCompletedOnServer || state.currentProgress >= secondsNeeded - 1) {
            await syncQuestsFromServer();
            const updated = getResolvedQuestsStore()?.getQuest?.(quest.id);
            if (updated?.userStatus?.completedAt) {
                isCompletedOnServer = true;
            }
        }

        // Only send terminal: true and mark as completed IF the server actually confirmed completion!
        if (isCompletedOnServer) {
            try {
                if (typeof sendHeartbeatNative === "function") {
                    await sendHeartbeatNative({
                        questId: quest.id,
                        streamKey: isStreamQuest ? streamKey : undefined,
                        applicationId: isPlayQuest ? appId : undefined,
                        terminal: true
                    });
                } else {
                    const termBody: any = { terminal: true };
                    if (isStreamQuest && streamKey) termBody.stream_key = streamKey;
                    if (isPlayQuest && appId) termBody.application_id = appId;
                    await RestAPI.post({
                        url: `/quests/${quest.id}/heartbeat`,
                        body: termBody
                    });
                }
            } catch {}

            state.completed = true;
            state.currentProgress = secondsNeeded;
            questProgressCache.set(quest.id, secondsNeeded);
            activeStreamKey = null;
            currentQuestBeingHeartbeated = null;
        } else {
            state.completed = false;
            state.currentProgress = Math.min(secondsNeeded - 1, state.currentProgress);
            questProgressCache.set(quest.id, state.currentProgress);
        }

        notifyStateChanged();
        return true;
    }

    return false;
}

export async function stopQuestRunner() {
    if (!isRunnerActive) return;
    isRunnerActive = false;

    if (runnerAbortController) {
        runnerAbortController.abort();
        runnerAbortController = null;
    }

    if (currentQuestBeingHeartbeated) {
        try {
            const isPlayQuest = currentQuestBeingHeartbeated.taskType?.startsWith("PLAY");
            const appId = currentQuestBeingHeartbeated.quest?.config?.taskConfig?.tasks?.[currentQuestBeingHeartbeated.taskType]?.applications?.[0]?.id
                ?? currentQuestBeingHeartbeated.quest?.config?.taskConfigV2?.tasks?.[currentQuestBeingHeartbeated.taskType]?.applications?.[0]?.id
                ?? currentQuestBeingHeartbeated.quest?.config?.application?.id;

            if (typeof sendHeartbeatNative === "function") {
                await sendHeartbeatNative({
                    questId: currentQuestBeingHeartbeated.id,
                    streamKey: activeStreamKey || undefined,
                    applicationId: isPlayQuest ? appId : undefined,
                    terminal: true
                });
            } else {
                const termBody: any = { terminal: true };
                if (activeStreamKey) termBody.stream_key = activeStreamKey;
                if (isPlayQuest && appId) termBody.application_id = appId;
                await RestAPI.post({
                    url: `/quests/${currentQuestBeingHeartbeated.id}/heartbeat`,
                    body: termBody
                });
            }
        } catch {}
        activeStreamKey = null;
        currentQuestBeingHeartbeated = null;
    }

    currentRunningQuestId = null;
    notifyStateChanged();

    if (settings.store.showToasts) {
        showToast(t("Quests runner stopped"), Toasts.Type.NORMAL);
    }
}

export async function startQuestRunner(preferredQuestId?: string) {
    if (isRunnerActive) return;

    isRunnerActive = true;
    notifyStateChanged();

    if (settings.store.showToasts) {
        showToast(t("Quests runner started"), Toasts.Type.NORMAL);
    }

    refreshActiveQuests();

    const targetId = preferredQuestId || lastActiveQuestId;
    let eligibleQuests = activeQuestStates.filter(q => !q.completed);

    if (targetId) {
        const targetIdx = eligibleQuests.findIndex(q => q.id === targetId);
        if (targetIdx > 0) {
            const [targetQuest] = eligibleQuests.splice(targetIdx, 1);
            eligibleQuests = [targetQuest, ...eligibleQuests];
        }
    }

    if (eligibleQuests.length === 0) {
        isRunnerActive = false;
        notifyStateChanged();
        if (settings.store.showToasts) {
            showToast(t("You don't have any uncompleted active quests!"), Toasts.Type.NORMAL);
        }
        return;
    }

    runnerAbortController = new AbortController();
    const { signal } = runnerAbortController;

    try {
        for (const state of eligibleQuests) {
            if (!isRunnerActive || signal.aborted) break;
            if (state.completed) continue;

            currentRunningQuestId = state.id;
            lastActiveQuestId = state.id;
            notifyStateChanged();

            const liveQuest = getResolvedQuestsStore()?.getQuest?.(state.id) || state.quest;
            if (liveQuest?.userStatus?.completedAt) {
                state.completed = true;
                notifyStateChanged();
                continue;
            }

            if (!liveQuest?.userStatus?.enrolledAt) {
                const enrolled = await enrollQuest(liveQuest || state.id);
                const okSleep = await interruptibleSleep(1500, signal);
                if (!okSleep || !isRunnerActive) break;
                if (!enrolled) {
                    console.warn("[AutoQuests] Could not enroll in quest, skipping to next:", state.questName);
                    continue;
                }
            }

            // Resync progress with the server-side value so resumes continue where Discord left off
            const syncedQuest = getResolvedQuestsStore()?.getQuest?.(state.id) || liveQuest;
            const serverProgress = getStoredProgressForQuest(syncedQuest, state.taskType);
            if (Number.isFinite(serverProgress) && serverProgress > state.currentProgress) {
                state.currentProgress = syncedQuest?.userStatus?.completedAt
                    ? state.secondsNeeded
                    : Math.min(state.secondsNeeded - 1, serverProgress);
            }
            if (syncedQuest) state.quest = syncedQuest;

            const isVideo = state.taskType.startsWith("WATCH_VIDEO");
            let failCount = 0;

            while (!state.completed && isRunnerActive && !signal.aborted) {
                let ok = false;
                if (isVideo) {
                    ok = await processVideoStep(state);
                    if (!state.completed && isRunnerActive && !signal.aborted) {
                        const slept = await interruptibleSleep(1000 + Math.random() * 400, signal);
                        if (!slept) break;
                    }
                } else {
                    ok = await processHeartbeatStep(state);
                    if (!state.completed && isRunnerActive && !signal.aborted) {
                        const remaining = Math.max(0, state.secondsNeeded - state.currentProgress);
                        // Heartbeats on Discord require an ~18-20s interval so the backend properly credits elapsed time
                        const waitTime = (remaining > 0 && remaining <= 5)
                            ? (18000 + Math.random() * 2000)
                            : (19000 + Math.random() * 3000);
                        const slept = await interruptibleSleep(waitTime, signal);
                        if (!slept) break;
                    }
                }

                if (!ok) {
                    failCount++;
                    if (failCount >= 8) {
                        console.warn("[AutoQuests] Quest step failed 8 times, proceeding to next quest:", state.questName);
                        break;
                    }
                    const slept = await interruptibleSleep(3000, signal);
                    if (!slept) break;
                } else {
                    failCount = 0;
                }
            }

            if (state.completed) {
                questProgressCache.set(state.id, state.secondsNeeded);
                if (lastActiveQuestId === state.id) {
                    lastActiveQuestId = null;
                }
                if (settings.store.showToasts) {
                    showToast(`${t("Quest completed")}: ${state.questName}`, Toasts.Type.SUCCESS);
                }
            }
        }

        const allFinished = activeQuestStates.length > 0 && activeQuestStates.every(q => q.completed);
        if (allFinished && settings.store.showToasts) {
            showToast(t("All active quests completed!"), Toasts.Type.SUCCESS);
        }
    } finally {
        isRunnerActive = false;
        currentRunningQuestId = null;
        activeStreamKey = null;
        currentQuestBeingHeartbeated = null;
        runnerAbortController = null;
        notifyStateChanged();
    }
}

function useAutoQuests() {
    const [, setTick] = useState(0);

    useEffect(() => {
        const update = () => setTick(t => t + 1);
        stateListeners.add(update);
        refreshActiveQuests();
        return () => {
            stateListeners.delete(update);
        };
    }, []);

    return {
        quests: activeQuestStates,
        isRunning: isRunnerActive,
        currentQuestId: currentRunningQuestId
    };
}

function formatTaskBadge(taskType: SupportedTask): string {
    if (taskType.startsWith("WATCH_VIDEO")) return t("Video Quest");
    if (taskType === "PLAY_ACTIVITY") return t("Activity Quest");
    return t("Desktop Game / Stream Quest");
}

function QuestProgressBar({ progress, target, completed, isCurrent }: { progress: number; target: number; completed: boolean; isCurrent: boolean; }) {
    const pct = completed ? 100 : (target > 0 ? Math.min(99, Math.floor((progress / target) * 100)) : 0);
    return (
        <div style={{ width: "100%", height: 5, borderRadius: 3, backgroundColor: "rgba(0, 0, 0, 0.4)", overflow: "hidden", marginTop: 7 }}>
            <div
                style={{
                    height: "100%",
                    width: `${pct}%`,
                    backgroundColor: completed
                        ? "var(--status-positive, #23a55a)"
                        : isCurrent
                        ? "var(--brand-500, #5865f2)"
                        : "var(--text-muted, #72767d)",
                    borderRadius: 3,
                    transition: "width 0.3s ease"
                }}
            />
        </div>
    );
}

function QuestListItem({ item, isCurrent }: { item: QuestItemState; isCurrent: boolean; }) {
    const displayProgress = Math.floor(item.currentProgress);
    const displayTarget = Math.floor(item.secondsNeeded);

    const handleActionClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isCurrent && isRunnerActive) {
            void stopQuestRunner();
        } else {
            void startQuestRunner(item.id);
        }
    };

    return (
        <div
            style={{
                padding: "10px 12px",
                marginBottom: 8,
                borderRadius: 8,
                backgroundColor: item.completed
                    ? "rgba(35, 165, 90, 0.08)"
                    : isCurrent
                    ? "rgba(88, 101, 242, 0.14)"
                    : "var(--background-secondary, #2b2d31)",
                border: item.completed
                    ? "1px solid rgba(35, 165, 90, 0.25)"
                    : isCurrent
                    ? "1px solid var(--brand-500, #5865f2)"
                    : "1px solid rgba(255, 255, 255, 0.05)",
                boxShadow: isCurrent ? "0 2px 10px rgba(0, 0, 0, 0.25)" : "none",
                transition: "all 0.2s ease"
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                    {isCurrent && (
                        <div
                            style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                backgroundColor: "var(--brand-500, #5865f2)",
                                boxShadow: "0 0 6px var(--brand-500, #5865f2)",
                                flexShrink: 0
                            }}
                        />
                    )}
                    <Text
                        variant="text-sm/semibold"
                        style={{
                            color: "#ffffff",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                        }}
                        title={item.questName}
                    >
                        {item.questName}
                    </Text>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {item.completed ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <CheckmarkIcon size={13} />
                            <Text variant="text-xs/bold" style={{ color: "var(--status-positive, #23a55a)", textTransform: "uppercase" }}>
                                {t("Completed")}
                            </Text>
                        </div>
                    ) : (
                        <>
                            <Text variant="text-xs/medium" style={{ color: "var(--text-muted, #949ba4)", fontFamily: "monospace" }}>
                                {displayProgress} / {displayTarget}s
                            </Text>
                            <button
                                onClick={handleActionClick}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 22,
                                    height: 22,
                                    borderRadius: "50%",
                                    border: "none",
                                    backgroundColor: isCurrent ? "var(--status-danger, #f23f43)" : "rgba(255, 255, 255, 0.1)",
                                    color: "#ffffff",
                                    cursor: "pointer",
                                    padding: 0,
                                    transition: "background-color 0.2s ease"
                                }}
                                title={isCurrent ? t("Stop Quests") : t("Run Quests")}
                            >
                                {isCurrent ? <StopSquareIcon size={10} /> : <PlayIcon size={10} />}
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <span
                    style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "var(--text-muted, #949ba4)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px"
                    }}
                >
                    {formatTaskBadge(item.taskType)}
                </span>
                {!item.completed && displayTarget > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: isCurrent ? "var(--brand-500, #5865f2)" : "var(--text-muted, #949ba4)" }}>
                        {Math.min(99, Math.floor((displayProgress / displayTarget) * 100))}%
                    </span>
                )}
            </div>

            <QuestProgressBar progress={displayProgress} target={displayTarget} completed={item.completed} isCurrent={isCurrent} />
        </div>
    );
}

let originalPushState: typeof history.pushState | null = null;
let originalReplaceState: typeof history.replaceState | null = null;

function setupHistoryListener() {
    if (originalPushState || typeof window === "undefined" || !window.history) return;
    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
        const result = originalPushState!.apply(this, args);
        try {
            window.dispatchEvent(new Event("nightcord:locationchange"));
        } catch {}
        return result;
    };

    history.replaceState = function (...args) {
        const result = originalReplaceState!.apply(this, args);
        try {
            window.dispatchEvent(new Event("nightcord:locationchange"));
        } catch {}
        return result;
    };
}

function teardownHistoryListener() {
    if (originalPushState && typeof window !== "undefined" && window.history) {
        history.pushState = originalPushState;
        originalPushState = null;
    }
    if (originalReplaceState && typeof window !== "undefined" && window.history) {
        history.replaceState = originalReplaceState;
        originalReplaceState = null;
    }
}

function isCurrentlyOnQuestPage(): boolean {
    if (typeof window === "undefined" || !window.location) return false;
    const pathname = window.location.pathname || "";
    if (pathname.includes("quest-home")) {
        return true;
    }
    if (typeof document !== "undefined") {
        const selectedQuestTab = document.querySelector(
            'a[href*="/quest-home"][aria-selected="true"], [data-list-item-id*="quest-home"][aria-selected="true"], [data-list-item-id*="quest-home"].selected_f5f62a, [data-list-item-id*="quest-home"][class*="selected"]'
        );
        if (selectedQuestTab) return true;

        const questHomeContainer = document.querySelector('[class*="questHome"], [data-quest-home]');
        if (questHomeContainer) return true;
    }
    return false;
}

function FloatingQuestWidget() {
    const { quests, isRunning, currentQuestId } = useAutoQuests();
    const [expanded, setExpanded] = useState(false);
    const [isOnQuestTab, setIsOnQuestTab] = useState(isCurrentlyOnQuestPage);

    useEffect(() => {
        const checkLocation = () => {
            const onQuest = isCurrentlyOnQuestPage();
            setIsOnQuestTab(prev => (prev !== onQuest ? onQuest : prev));
        };

        checkLocation();

        const handleLocationChange = () => {
            checkLocation();
            setTimeout(checkLocation, 50);
            setTimeout(checkLocation, 200);
        };

        window.addEventListener("nightcord:locationchange", handleLocationChange);
        window.addEventListener("popstate", handleLocationChange);
        window.addEventListener("hashchange", handleLocationChange);

        const handleFlux = () => {
            handleLocationChange();
        };

        FluxDispatcher?.subscribe?.("CHANNEL_SELECT", handleFlux);
        FluxDispatcher?.subscribe?.("NAVIGATE", handleFlux);

        const interval = setInterval(checkLocation, 250);

        return () => {
            window.removeEventListener("nightcord:locationchange", handleLocationChange);
            window.removeEventListener("popstate", handleLocationChange);
            window.removeEventListener("hashchange", handleLocationChange);
            FluxDispatcher?.unsubscribe?.("CHANNEL_SELECT", handleFlux);
            FluxDispatcher?.unsubscribe?.("NAVIGATE", handleFlux);
            clearInterval(interval);
        };
    }, []);

    if (!isOnQuestTab) return null;

    const uncompletedCount = quests.filter(q => !q.completed).length;

    return (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 10000, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            {expanded && (
                <div
                    style={{
                        width: 340,
                        maxHeight: 460,
                        backgroundColor: "var(--background-floating, #18191c)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: 12,
                        padding: 16,
                        boxShadow: "0 16px 40px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05)",
                        marginBottom: 12,
                        display: "flex",
                        flexDirection: "column"
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#ffffff" }}>
                            <QuestCompassIcon size={18} />
                            <Text variant="heading-sm/bold" style={{ color: "#ffffff", fontWeight: 700, margin: 0 }}>
                                {t("Auto Quests")}
                            </Text>
                        </div>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "3px 10px",
                                borderRadius: 12,
                                backgroundColor: isRunning ? "rgba(88, 101, 242, 0.2)" : "rgba(255, 255, 255, 0.06)",
                                color: isRunning ? "var(--brand-500, #5865f2)" : "var(--text-muted, #949ba4)",
                                fontSize: 11,
                                fontWeight: 700,
                                textTransform: "uppercase"
                            }}
                        >
                            {isRunning && (
                                <div
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: "50%",
                                        backgroundColor: "var(--brand-500, #5865f2)",
                                        boxShadow: "0 0 6px var(--brand-500, #5865f2)"
                                    }}
                                />
                            )}
                            {isRunning ? t("Running") : t("Idle")}
                        </div>
                    </div>

                    <div className="nightcord-autoquests-scroller" style={{ overflowY: "auto", maxHeight: 280, paddingRight: 6, marginBottom: 14 }}>
                        {quests.length === 0 ? (
                            <div style={{ padding: "28px 12px", textAlign: "center" }}>
                                <Text variant="text-sm/normal" style={{ color: "var(--text-muted, #949ba4)" }}>
                                    {t("No active quests found")}
                                </Text>
                            </div>
                        ) : (
                            quests.map(q => (
                                <QuestListItem key={q.id} item={q} isCurrent={q.id === currentQuestId} />
                            ))
                        )}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                        <Button
                            color={isRunning ? Button.Colors.RED : Button.Colors.BRAND}
                            size={Button.Sizes.SMALL}
                            onClick={isRunning ? stopQuestRunner : () => startQuestRunner()}
                            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 600 }}
                        >
                            {isRunning ? <StopSquareIcon size={14} /> : <PlayIcon size={14} />}
                            {isRunning ? t("Stop Quests") : (uncompletedCount > 0 ? `${t("Run Quests")} (${uncompletedCount})` : t("Run Quests"))}
                        </Button>
                        <Button
                            color={Button.Colors.PRIMARY}
                            size={Button.Sizes.SMALL}
                            onClick={() => {
                                refreshActiveQuests();
                                openAutoQuestsModal();
                            }}
                            style={{ padding: "0 10px", display: "flex", alignItems: "center", justifyContent: "center" }}
                            title={t("Auto Quests Manager")}
                        >
                            <ExternalIcon size={14} />
                        </Button>
                    </div>
                </div>
            )}

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    backgroundColor: isRunning ? "var(--brand-500, #5865f2)" : "var(--background-secondary, #2b2d31)",
                    border: isRunning ? "1px solid var(--brand-500, #5865f2)" : "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: 10,
                    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.4)",
                    overflow: "hidden",
                    transition: "all 0.25s ease"
                }}
            >
                <button
                    onClick={isRunning ? stopQuestRunner : () => startQuestRunner()}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "9px 15px",
                        background: "transparent",
                        border: "none",
                        color: "#ffffff",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: 13
                    }}
                >
                    <QuestCompassIcon size={16} />
                    <span>
                        {isRunning
                            ? `${t("Running Quests")}...`
                            : (uncompletedCount > 0 ? `${t("Run Quests")} (${uncompletedCount})` : t("Run Quests"))}
                    </span>
                </button>
                <div style={{ width: 1, height: 22, backgroundColor: "rgba(255, 255, 255, 0.15)" }} />
                <button
                    onClick={() => setExpanded(e => !e)}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "9px 12px",
                        background: "transparent",
                        border: "none",
                        color: "#ffffff",
                        cursor: "pointer"
                    }}
                    title={t("Auto Quests")}
                >
                    <ChevronIcon size={12} expanded={expanded} />
                </button>
            </div>
        </div>
    );
}

function AutoQuestsModal({ modalProps }: { modalProps: ModalProps; }) {
    const { quests, isRunning, currentQuestId } = useAutoQuests();
    const uncompletedCount = quests.filter(q => !q.completed).length;

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader separator={false} style={{ padding: "20px 24px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#ffffff" }}>
                    <QuestCompassIcon size={22} />
                    <Text variant="heading-lg/bold" style={{ color: "#ffffff", fontWeight: 700, margin: 0 }}>
                        {t("Auto Quests Manager")}
                    </Text>
                </div>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>

            <ModalContent style={{ padding: "0 24px 20px" }}>
                <Text variant="text-sm/normal" style={{ color: "var(--text-muted, #949ba4)", marginBottom: 16 }}>
                    {t("Automate completion of Discord video, game, and streaming quests.")}
                </Text>

                <div className="nightcord-autoquests-scroller" style={{ maxHeight: 380, overflowY: "auto", paddingRight: 6 }}>
                    {quests.length === 0 ? (
                        <div style={{ padding: "36px 16px", textAlign: "center", backgroundColor: "var(--background-secondary, #2b2d31)", borderRadius: 8 }}>
                            <Text variant="text-md/normal" style={{ color: "var(--text-muted, #949ba4)" }}>
                                {t("No active quests found")}
                            </Text>
                        </div>
                    ) : (
                        quests.map(q => (
                            <QuestListItem key={q.id} item={q} isCurrent={q.id === currentQuestId} />
                        ))
                    )}
                </div>
            </ModalContent>

            <ModalFooter style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Button
                    color={Button.Colors.PRIMARY}
                    look={Button.Looks.LINK}
                    size={Button.Sizes.SMALL}
                    onClick={() => {
                        window.location.href = "https://discord.com/quest-home";
                    }}
                >
                    {t("Open Quests Page")}
                </Button>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Button
                        color={Button.Colors.PRIMARY}
                        look={Button.Looks.LINK}
                        size={Button.Sizes.SMALL}
                        onClick={modalProps.onClose}
                    >
                        {t("Cancel")}
                    </Button>
                    <Button
                        color={isRunning ? Button.Colors.RED : Button.Colors.BRAND}
                        size={Button.Sizes.SMALL}
                        onClick={isRunning ? stopQuestRunner : () => startQuestRunner()}
                        style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}
                    >
                        {isRunning ? <StopSquareIcon size={14} /> : <PlayIcon size={14} />}
                        {isRunning ? t("Stop Quests") : (uncompletedCount > 0 ? `${t("Run Quests")} (${uncompletedCount})` : t("Run Quests"))}
                    </Button>
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

export function openAutoQuestsModal() {
    openModal(modalProps => (
        <AutoQuestsModal modalProps={modalProps} />
    ));
}

function AutoQuestsSettingsPanel() {
    const { quests, isRunning, currentQuestId } = useAutoQuests();
    const [autoStartVal, setAutoStartVal] = useState(settings.store.autoStart);
    const [autoResumeVal, setAutoResumeVal] = useState(settings.store.autoResume);
    const [autoEnrollVal, setAutoEnrollVal] = useState(settings.store.autoEnroll);
    const [showToastsVal, setShowToastsVal] = useState(settings.store.showToasts);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", backgroundColor: "var(--background-secondary, #2b2d31)", borderRadius: 8 }}>
                <div>
                    <Text variant="heading-sm/bold" style={{ color: "#ffffff" }}>
                        {t("Auto Quests")}
                    </Text>
                    <Text variant="text-xs/normal" style={{ color: "var(--text-muted, #949ba4)", marginTop: 2 }}>
                        {quests.length} {t("Auto Quests")} ({quests.filter(q => q.completed).length} {t("Completed")})
                    </Text>
                </div>
                <Button
                    color={isRunning ? Button.Colors.RED : Button.Colors.BRAND}
                    size={Button.Sizes.SMALL}
                    onClick={isRunning ? stopQuestRunner : () => startQuestRunner()}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                    {isRunning ? <StopSquareIcon size={14} /> : <PlayIcon size={14} />}
                    {isRunning ? t("Stop Quests") : t("Run Quests")}
                </Button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <FormSwitch
                    value={autoResumeVal}
                    onChange={(val: boolean) => {
                        setAutoResumeVal(val);
                        settings.store.autoResume = val;
                    }}
                    note={t("Automatically resume in-progress quests on Discord startup")}
                >
                    {t("Auto-Resume In-Progress Quests")}
                </FormSwitch>

                <FormSwitch
                    value={autoStartVal}
                    onChange={(val: boolean) => {
                        setAutoStartVal(val);
                        settings.store.autoStart = val;
                    }}
                    note={t("Automatically run active quests in the background when Discord opens")}
                >
                    {t("Auto Start")}
                </FormSwitch>

                <FormSwitch
                    value={autoEnrollVal}
                    onChange={(val: boolean) => {
                        setAutoEnrollVal(val);
                        settings.store.autoEnroll = val;
                    }}
                    note={t("Automatically accept and enroll in available quests")}
                >
                    {t("Auto Enroll")}
                </FormSwitch>

                <FormSwitch
                    value={showToastsVal}
                    onChange={(val: boolean) => {
                        setShowToastsVal(val);
                        settings.store.showToasts = val;
                    }}
                    note={t("Show notifications on quest progress and completion")}
                >
                    {t("Show Notifications")}
                </FormSwitch>
            </div>

            {quests.length > 0 && (
                <div style={{ marginTop: 8 }}>
                    <Text variant="text-sm/bold" style={{ color: "#ffffff", marginBottom: 10 }}>
                        {t("Auto Quests")} ({quests.length})
                    </Text>
                    <div className="nightcord-autoquests-scroller" style={{ maxHeight: 280, overflowY: "auto", paddingRight: 6 }}>
                        {quests.map(q => (
                            <QuestListItem key={q.id} item={q} isCurrent={q.id === currentQuestId} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

let widgetRootNode: HTMLDivElement | null = null;
let widgetRoot: ReturnType<typeof createRoot> | null = null;
let styleElement: HTMLStyleElement | null = null;

const SCROLLER_CSS = `
.nightcord-autoquests-scroller::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
.nightcord-autoquests-scroller::-webkit-scrollbar-track {
    background: transparent;
}
.nightcord-autoquests-scroller::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.18);
    border-radius: 3px;
}
.nightcord-autoquests-scroller::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.32);
}
.nightcord-autoquests-scroller {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
}
`;

function injectStyles() {
    if (document.getElementById("nightcord-autoquests-styles")) return;
    styleElement = document.createElement("style");
    styleElement.id = "nightcord-autoquests-styles";
    styleElement.textContent = SCROLLER_CSS;
    document.head.appendChild(styleElement);
}

function removeStyles() {
    const el = document.getElementById("nightcord-autoquests-styles");
    if (el) el.remove();
    styleElement = null;
}

function mountFloatingWidget() {
    if (widgetRootNode) return;
    injectStyles();
    widgetRootNode = document.createElement("div");
    widgetRootNode.id = "nightcord-autoquests-floating-container";
    document.body.appendChild(widgetRootNode);
    widgetRoot = createRoot(widgetRootNode);
    widgetRoot.render(<FloatingQuestWidget />);
}

function unmountFloatingWidget() {
    if (widgetRoot) {
        widgetRoot.unmount();
        widgetRoot = null;
    }
    if (widgetRootNode) {
        widgetRootNode.remove();
        widgetRootNode = null;
    }
    removeStyles();
}

let hasTriggeredAutoResume = false;

function onQuestsFluxEvent() {
    refreshActiveQuests();

    if (isRunnerActive) return;

    const inProgress = activeQuestStates.filter(q => !q.completed && Boolean(q.quest?.userStatus?.enrolledAt) && (q.currentProgress > 0 || (q.secondsNeeded > 0 && q.currentProgress / q.secondsNeeded > 0)));
    const hasUncompleted = activeQuestStates.filter(q => !q.completed);

    if (settings.store.autoStart && hasUncompleted.length > 0) {
        void startQuestRunner();
    } else if (settings.store.autoResume && inProgress.length > 0 && !hasTriggeredAutoResume) {
        hasTriggeredAutoResume = true;
        void startQuestRunner(inProgress[0].id);
    }
}

export default definePlugin({
    name: "AutoQuests",
    description: "Automate completion of Discord video, game, and streaming quests.",
    authors: [{ name: "Nightcord", id: 0n }],
    settings,
    settingsPanel: AutoQuestsSettingsPanel,

    start() {
        hasTriggeredAutoResume = false;
        setupHistoryListener();
        mountFloatingWidget();
        clearStuckEnrollments();

        FluxDispatcher.subscribe("QUESTS_FETCH_SUCCESS", onQuestsFluxEvent);
        FluxDispatcher.subscribe("QUESTS_FETCH_CURRENT_QUESTS_SUCCESS", onQuestsFluxEvent);
        FluxDispatcher.subscribe("QUESTS_USER_STATUS_UPDATE", onQuestsFluxEvent);
        FluxDispatcher.subscribe("QUESTS_ENROLL_SUCCESS", onQuestsFluxEvent);

        [1200, 3000, 6000, 10000].forEach(delay => {
            setTimeout(() => {
                clearStuckEnrollments();
                onQuestsFluxEvent();
            }, delay);
        });
    },

    stop() {
        void stopQuestRunner();
        unmountFloatingWidget();
        teardownHistoryListener();

        FluxDispatcher.unsubscribe("QUESTS_FETCH_SUCCESS", onQuestsFluxEvent);
        FluxDispatcher.unsubscribe("QUESTS_FETCH_CURRENT_QUESTS_SUCCESS", onQuestsFluxEvent);
        FluxDispatcher.unsubscribe("QUESTS_USER_STATUS_UPDATE", onQuestsFluxEvent);
        FluxDispatcher.unsubscribe("QUESTS_ENROLL_SUCCESS", onQuestsFluxEvent);
    }
});
