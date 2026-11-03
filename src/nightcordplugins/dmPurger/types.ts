/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface PackageMessage {
    id: string;
    timestamp: string;
    contents: string;
    attachments?: string;
}

export interface PackageChannel {
    id: string;
    type: "DM" | "GROUP_DM" | "GUILD_TEXT" | string;
    recipients: string[];
    name?: string;
    messages: PackageMessage[];
}

export interface PurgeQueueItem {
    channelId: string;
    channelName?: string;
    recipientId?: string;
    messageId: string;
    contents: string;
    timestamp: string;
    attachments?: string;
}

export type PurgeStatus = "idle" | "running" | "paused" | "completed" | "error";

export interface PurgerState {
    status: PurgeStatus;
    totalMessages: number;
    deletedMessages: number;
    failedMessages: number;
    skippedMessages: number;
    currentChannelId?: string;
    currentChannelName?: string;
    currentMessageId?: string;
    lastError?: string;
    queue: PurgeQueueItem[];
    currentIndex: number;
    startedAt?: number;
}

export interface EmailCredentials {
    provider: "outlook" | "gmail" | "yahoo" | "custom";
    email: string;
    password: string;
    customHost?: string;
    customPort?: number;
}
