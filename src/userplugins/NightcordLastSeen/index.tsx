/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import { BaseText } from "@components/BaseText";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy, findComponentByCodeLazy } from "@webpack";
import { FluxDispatcher, React, useStateFromStores } from "@webpack/common";

const Section = findComponentByCodeLazy("headingVariant:", '"section"', "headingIcon:");
const PresenceStore = findByPropsLazy("getStatus", "getActivities");

const settings = definePluginSettings({
    language: {
        type: OptionType.SELECT,
        description: "Язык даты и времени",
        options: [
            { label: "Русский", value: "ru" },
            { label: "English", value: "en" }
        ],
        default: "ru"
    }
});

const STORAGE_PREFIX = "nightcord_lastseen_";
const lastWrittenCache = new Map<string, number>();

function setLastSeen(userId: string, ts: number) {
    try {
        const lastWritten = lastWrittenCache.get(userId) || 0;
        if (ts - lastWritten > 60000) {
            lastWrittenCache.set(userId, ts);
            void DataStore.set(STORAGE_PREFIX + userId, ts).catch(() => undefined);
        }
    } catch (e) {
        console.error("[LastSeen] save failed for " + userId, e);
    }
}

function formatDate(ts: number): string {
    const now = new Date();
    const date = new Date(ts);
    const ru = settings.store.language !== "en";
    const locale = ru ? "ru-RU" : "en-US";
    const timeStr = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    if (isToday) return (ru ? "Сегодня в " : "Today at ") + timeStr;
    if (isYesterday) return (ru ? "Вчера в " : "Yesterday at ") + timeStr;
    const dateStr = date.toLocaleDateString(locale, { day: "numeric", month: "short" });
    return dateStr + (ru ? " в " : " at ") + timeStr;
}

function handlePresenceEntry(entry: any) {
    if (!entry) return;
    const userId: string | undefined = entry?.user?.id ?? entry?.userId ?? entry?.user_id;
    if (!userId) return;
    setLastSeen(userId, Date.now());
}

function onPresenceUpdate(data: any) {
    if (Array.isArray(data?.updates)) {
        for (const entry of data.updates) handlePresenceEntry(entry);
    } else {
        handlePresenceEntry(data);
    }
}

function onPresenceUpdates(data: any) {
    if (Array.isArray(data?.updates)) {
        for (const entry of data.updates) handlePresenceEntry(entry);
    } else if (Array.isArray(data)) {
        for (const entry of data) handlePresenceEntry(entry);
    } else {
        handlePresenceEntry(data);
    }
}

function onMessageCreate(data: any) {
    const userId: string | undefined = data?.message?.author?.id ?? data?.message?.author_id ?? data?.author?.id;
    if (userId) setLastSeen(userId, Date.now());
}

function onVoiceStateUpdates(data: any) {
    for (const state of data?.voiceStates ?? []) {
        const userId: string | undefined = state?.userId ?? state?.user_id;
        if (userId) setLastSeen(userId, Date.now());
    }
}

function onTypingStart(data: any) {
    const userId: string | undefined = data?.userId ?? data?.user_id;
    if (userId) setLastSeen(userId, Date.now());
}

function onReactionAdd(data: any) {
    const userId: string | undefined = data?.userId ?? data?.user_id;
    if (userId) setLastSeen(userId, Date.now());
}

function LastSeenText({ userId }: { userId: string; }) {
    const status = useStateFromStores([PresenceStore], () => PresenceStore.getStatus(userId));
    const [lastSeen, setLastSeenState] = React.useState<number | null>(null);
    const ru = settings.store.language !== "en";

    React.useEffect(() => {
        void DataStore.get(STORAGE_PREFIX + userId).then((val: any) => {
            if (val) setLastSeenState(Number(val));
        }).catch(() => undefined);
    }, [status, userId]);

    const isOnline = status && status !== "offline" && status !== "invisible";

    let content: string;
    if (isOnline) {
        if (status === "idle") content = ru ? "Неактивен" : "Idle";
        else if (status === "dnd") content = ru ? "Не беспокоить" : "Do Not Disturb";
        else if (status === "streaming") content = ru ? "Стримит" : "Streaming";
        else content = ru ? "В сети" : "Online";
    } else if (lastSeen) {
        content = formatDate(lastSeen);
    } else {
        content = ru ? "Пока не отслежен" : "Not tracked yet";
    }

    return (
        <BaseText size="sm" color="text-normal" style={{ userSelect: "text" }}>
            {content}
        </BaseText>
    );
}

const LastSeenSection = ErrorBoundary.wrap(
    ({ userId }: { userId: string; }) => <LastSeenText userId={userId} />,
    { noop: true }
);

export default definePlugin({
    name: "LastSeen",
    description: "Показывает когда юзер был в сети последний раз, прямо в профиле.",
    authors: [{ name: "Nightcord", id: 0n }],
    client: "nightcord",
    tags: ["Utility"],
    enabledByDefault: false,
    settings,

    patches: [
        {
            find: "#{intl::PROVISIONAL_ACCOUNT}),headingIcon:",
            replacement: {
                match: /(#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id)}\)}\))/,
                replace: "$1,$self.renderLastSeen({userId:$2,isSideBar:true})"
            }
        },
        {
            find: ",applicationRoleConnection:",
            replacement: {
                match: /(#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id),.{0,100}}\)}\)),/,
                replace: "$1,$self.renderLastSeen({userId:$2,isSideBar:false}),"
            }
        },
        {
            find: ".MODAL_V2,onClose:",
            replacement: {
                match: /(#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id),.{0,100}}\)}\)),/,
                replace: "$1,$self.renderLastSeen({userId:$2,isSideBar:false}),"
            }
        }
    ],

    start() {
        FluxDispatcher.subscribe("PRESENCE_UPDATE", onPresenceUpdate);
        FluxDispatcher.subscribe("PRESENCE_UPDATES", onPresenceUpdates);
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", onVoiceStateUpdates);
        FluxDispatcher.subscribe("TYPING_START", onTypingStart);
        FluxDispatcher.subscribe("MESSAGE_REACTION_ADD", onReactionAdd);
    },

    stop() {
        FluxDispatcher.unsubscribe("PRESENCE_UPDATE", onPresenceUpdate);
        FluxDispatcher.unsubscribe("PRESENCE_UPDATES", onPresenceUpdates);
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", onVoiceStateUpdates);
        FluxDispatcher.unsubscribe("TYPING_START", onTypingStart);
        FluxDispatcher.unsubscribe("MESSAGE_REACTION_ADD", onReactionAdd);
    },

    renderLastSeen({ userId, isSideBar }: { userId: string; isSideBar: boolean; }) {
        if (!userId) return null;
        return (
            <Section
                heading={settings.store.language !== "en" ? "Был(а) в сети" : "Last Seen"}
                headingVariant={isSideBar ? "text-xs/semibold" : "text-xs/medium"}
                headingColor={isSideBar ? "text-strong" : "text-default"}
            >
                <LastSeenSection userId={userId} />
            </Section>
        );
    }
});
