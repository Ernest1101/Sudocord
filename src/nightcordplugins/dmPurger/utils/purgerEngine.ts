/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PackageChannel, PurgeQueueItem, PurgerState } from "@nightcordplugins/dmPurger/types";
import { RestAPI, UserStore } from "@webpack/common";

type Listener = (state: PurgerState) => void;

class PurgerEngine {
    private state: PurgerState = {
        status: "idle",
        totalMessages: 0,
        deletedMessages: 0,
        failedMessages: 0,
        skippedMessages: 0,
        queue: [],
        currentIndex: 0
    };

    private listeners = new Set<Listener>();
    private isPaused = false;
    private isStopped = false;
    private loopPromise: Promise<void> | null = null;
    private pendingLogs: string[] = [];
    private lastSaveTime = 0;

    constructor() {
        void this.loadSavedState();
    }

    public subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        listener(this.getState());
        return () => this.listeners.delete(listener);
    }

    public getState(): PurgerState {
        return { ...this.state, queue: [...this.state.queue] };
    }

    private emit() {
        const copy = this.getState();
        for (const l of this.listeners) {
            try {
                l(copy);
            } catch (err) {
                console.error("[PurgerEngine] Listener error:", err);
            }
        }
    }

    private async flushLogs() {
        if (this.pendingLogs.length === 0) return;
        const lines = [...this.pendingLogs];
        this.pendingLogs = [];
        try {
            const native = (window as any).VencordNative?.pluginHelpers?.DmPurger;
            if (native?.appendDeletedLogs) {
                await native.appendDeletedLogs(lines);
            }
        } catch (e) {
            console.error("[PurgerEngine] Failed to flush logs:", e);
        }
    }

    private async persistState(force = false) {
        const now = Date.now();
        if (!force && now - this.lastSaveTime < 3000) return;
        this.lastSaveTime = now;
        try {
            const native = (window as any).VencordNative?.pluginHelpers?.DmPurger;
            if (native?.savePurgerState) {
                await native.savePurgerState(this.state);
            }
        } catch (e) {
            console.error("[PurgerEngine] Failed to persist state:", e);
        }
    }

    public async loadSavedState() {
        try {
            const native = (window as any).VencordNative?.pluginHelpers?.DmPurger;
            if (native?.loadPurgerState) {
                const saved = await native.loadPurgerState();
                if (saved && saved.queue && saved.queue.length > 0) {
                    this.state = saved;
                    if (this.state.status === "running") {
                        this.state.status = "paused";
                    }
                    this.emit();
                }
            }
        } catch (e) {
            console.error("[PurgerEngine] Failed to load saved state:", e);
        }
    }

    public buildQueueFromChannels(
        channels: PackageChannel[],
        whitelistUsers: string[],
        whitelistGroups: string[],
        includeGroupDms: boolean
    ): PurgeQueueItem[] {
        const currentUserId = UserStore.getCurrentUser()?.id || "";
        const queue: PurgeQueueItem[] = [];

        const userWhitelistSet = new Set(whitelistUsers.map(s => s.trim()).filter(Boolean));
        const groupWhitelistSet = new Set(whitelistGroups.map(s => s.trim()).filter(Boolean));

        for (const channel of channels) {
            const isGroup = channel.type === "GROUP_DM" || channel.type === "3";
            const isDM = channel.type === "DM" || channel.type === "1" || !isGroup;

            if (isGroup && !includeGroupDms) continue;
            if (isGroup && groupWhitelistSet.has(channel.id)) continue;

            const otherRecipient = channel.recipients.find(id => id !== currentUserId) || "";
            if (isDM && otherRecipient && userWhitelistSet.has(otherRecipient)) continue;
            if (isDM && userWhitelistSet.has(channel.id)) continue;

            for (const msg of channel.messages) {
                queue.push({
                    channelId: channel.id,
                    channelName: channel.name,
                    recipientId: otherRecipient,
                    messageId: msg.id,
                    contents: msg.contents,
                    timestamp: msg.timestamp,
                    attachments: msg.attachments
                });
            }
        }

        return queue;
    }

    public startNewPurge(queue: PurgeQueueItem[], delayMs = 1500) {
        this.isStopped = true;
        this.isPaused = false;

        this.state = {
            status: "running",
            totalMessages: queue.length,
            deletedMessages: 0,
            failedMessages: 0,
            skippedMessages: 0,
            queue,
            currentIndex: 0,
            startedAt: Date.now()
        };

        this.isStopped = false;
        this.emit();
        void this.persistState(true);

        this.loopPromise = this.runLoop(delayMs);
    }

    public resumePurge(delayMs = 1500) {
        if (this.state.status !== "paused" && this.state.status !== "idle") return;
        if (this.state.currentIndex >= this.state.queue.length) return;

        this.isPaused = false;
        this.isStopped = false;
        this.state.status = "running";
        this.emit();
        void this.persistState(true);

        this.loopPromise = this.runLoop(delayMs);
    }

    public pausePurge() {
        if (this.state.status === "running") {
            this.isPaused = true;
            this.state.status = "paused";
            this.emit();
            void this.flushLogs();
            void this.persistState(true);
        }
    }

    public stopPurge() {
        this.isStopped = true;
        this.isPaused = false;
        this.state.status = "idle";
        this.state.currentChannelId = undefined;
        this.state.currentMessageId = undefined;
        this.emit();
        void this.flushLogs();
        void this.persistState(true);
    }

    private async deleteMessageRequest(channelId: string, messageId: string, retries = 0): Promise<"deleted" | "missing" | "forbidden" | "failed"> {
        try {
            await RestAPI.del({ url: `/channels/${channelId}/messages/${messageId}` });
            return "deleted";
        } catch (error: any) {
            const statusCode = error?.status || error?.statusCode;
            const code = error?.body?.code;

            if (statusCode === 429 && retries < 5) {
                const retryAfter = Number(error?.body?.retry_after ?? 2);
                const delay = retryAfter < 60 ? retryAfter * 1000 : retryAfter;
                await new Promise(r => setTimeout(r, delay + 150));
                return this.deleteMessageRequest(channelId, messageId, retries + 1);
            }

            if (statusCode === 404 || code === 10008) return "missing";
            if (statusCode === 403 || code === 50021 || code === 50013) return "forbidden";

            return "failed";
        }
    }

    private async runLoop(delayMs: number) {
        while (this.state.currentIndex < this.state.queue.length) {
            if (this.isStopped) break;
            if (this.isPaused) {
                this.state.status = "paused";
                this.emit();
                break;
            }

            const item = this.state.queue[this.state.currentIndex];
            this.state.currentChannelId = item.channelId;
            this.state.currentChannelName = item.channelName;
            this.state.currentMessageId = item.messageId;
            this.emit();

            const result = await this.deleteMessageRequest(item.channelId, item.messageId);

            const timestampStr = new Date().toISOString().replace("T", " ").replace(/\..+/, "");
            if (result === "deleted") {
                this.state.deletedMessages++;
                this.pendingLogs.push(
                    `[${timestampStr}] DELETED | Channel: ${item.channelId} (${item.channelName || "DM"}) | Recipient: ${item.recipientId || "N/A"} | MsgID: ${item.messageId} | Content: ${item.contents || "<no content>"} | Attachments: ${item.attachments || "none"}`
                );
            } else if (result === "missing") {
                this.state.skippedMessages++;
                this.pendingLogs.push(
                    `[${timestampStr}] ALREADY MISSING | Channel: ${item.channelId} | MsgID: ${item.messageId} | Content: ${item.contents || "<no content>"}`
                );
            } else if (result === "forbidden") {
                this.state.skippedMessages++;
                this.pendingLogs.push(
                    `[${timestampStr}] SYSTEM/FORBIDDEN | Channel: ${item.channelId} | MsgID: ${item.messageId} | Reason: Not deletable or system message`
                );
            } else {
                this.state.failedMessages++;
                this.pendingLogs.push(
                    `[${timestampStr}] FAILED | Channel: ${item.channelId} | MsgID: ${item.messageId}`
                );
            }

            this.state.currentIndex++;

            if (this.state.currentIndex % 5 === 0) {
                void this.flushLogs();
                void this.persistState();
            }

            this.emit();

            if (this.state.currentIndex < this.state.queue.length && !this.isStopped && !this.isPaused) {
                await new Promise(r => setTimeout(r, Math.max(300, delayMs)));
            }
        }

        void this.flushLogs();

        if (!this.isStopped && !this.isPaused && this.state.currentIndex >= this.state.queue.length) {
            this.state.status = "completed";
            this.state.currentChannelId = undefined;
            this.state.currentMessageId = undefined;
            this.emit();
            void this.persistState(true);
        }
    }
}

export const purgerEngine = new PurgerEngine();
