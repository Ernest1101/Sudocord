/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import { getGroqKey, groqChat } from "@nightcordplugins/nightcordAI/groqManager";
import { copyToClipboard } from "@utils/clipboard";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { makeRange, OptionType } from "@utils/types";
import { ChannelStore, Constants, GuildMemberStore, Menu, MessageStore, React, RestAPI, Text, Toasts } from "@webpack/common";

const settings = definePluginSettings({
    messageSummaryLines: {
        type: OptionType.SLIDER,
        description: "Number of lines for single message summary",
        markers: makeRange(1, 5, 1),
        default: 2,
        stickToMarkers: true,
    },
    conversationSummaryLines: {
        type: OptionType.SLIDER,
        description: "Number of lines for conversation summary",
        markers: makeRange(1, 8, 1),
        default: 3,
        stickToMarkers: true,
    },
    conversationMessageCount: {
        type: OptionType.SLIDER,
        description: "Number of messages to analyze for conversation summary",
        markers: [10, 20, 30, 40, 50, 75, 100],
        default: 50,
        stickToMarkers: true,
    },
    summaryLanguage: {
        type: OptionType.SELECT,
        description: "Output language for AI summaries",
        options: [
            { label: "Auto (Same as conversation)", value: "auto", default: true },
            { label: "French (Français)", value: "French" },
            { label: "English", value: "English" },
            { label: "Spanish (Español)", value: "Spanish" },
            { label: "German (Deutsch)", value: "German" },
            { label: "Arabic (العربية)", value: "Arabic" },
            { label: "Russian (Русский)", value: "Russian" },
            { label: "Chinese (中文)", value: "Chinese" },
        ],
    },
    customApiKey: {
        type: OptionType.STRING,
        description: "Optional custom Groq API key override (leave empty to use Nightcord AI key)",
        default: "",
    },
});

function SummarizeIcon({ width = 18, height = 18, color = "currentColor" }: { width?: number; height?: number; color?: string; }) {
    return (
        <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h10M4 18h14" />
            <path d="M18 9l3 3-3 3" />
        </svg>
    );
}

function CopyIcon({ width = 16, height = 16, color = "currentColor" }: { width?: number; height?: number; color?: string; }) {
    return (
        <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
    );
}

function LoadingSpinner({ size = 28 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            style={{ animation: "ai-spin 1s linear infinite" }}
        >
            <style>{`
                @keyframes ai-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
            <circle
                cx="12"
                cy="12"
                r="10"
                stroke="var(--background-modifier-accent, rgba(255,255,255,0.15))"
                strokeWidth="3"
                fill="none"
            />
            <path
                d="M12 2a10 10 0 0 1 10 10"
                stroke="var(--brand-500, #5865f2)"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
            />
        </svg>
    );
}

async function resolveApiKey(): Promise<string> {
    const custom = settings.store.customApiKey?.trim();
    if (custom) return custom;
    const nightcordKey = await getGroqKey();
    if (nightcordKey) return nightcordKey;
    const fallbackKey = (SudoCord as any)?.Settings?.plugins?.NightcordAI?.apiKey?.trim?.();
    if (fallbackKey) return fallbackKey;
    return "";
}

async function fetchRecentMessages(channelId: string, limit = 50): Promise<any[]> {
    try {
        const endpoint = Constants?.Endpoints?.MESSAGES?.(channelId) ?? `/channels/${channelId}/messages`;
        const res = await RestAPI.get({
            url: endpoint,
            query: { limit }
        });
        if (Array.isArray(res?.body) && res.body.length > 0) {
            // Discord API returns newest first; reverse for chronological reading
            return res.body.slice().reverse();
        }
    } catch (err) {
        console.warn("[AISummarizer] REST fetch failed, using local cache:", err);
    }
    const cached = MessageStore?.getMessages?.(channelId)?._array ?? [];
    return cached.slice(-limit);
}

function resolveLanguageInstruction(langChoice: string): string {
    if (!langChoice || langChoice === "auto") {
        return "the same predominant language used in the source content";
    }
    return langChoice;
}

function getAuthorDisplayName(author: any, guildId?: string): string {
    if (!author) return "User";
    if (guildId && GuildMemberStore?.getNick) {
        try {
            const nick = GuildMemberStore.getNick(guildId, author.id);
            if (nick) return nick;
        } catch {}
    }
    return author.globalName || author.global_name || author.username || "User";
}

interface SummaryModalProps {
    rootProps: ModalProps;
    title: string;
    subtitle: string;
    generateSummary: () => Promise<string>;
}

function SummaryModal({ rootProps, title, subtitle, generateSummary }: SummaryModalProps) {
    const [loading, setLoading] = React.useState(true);
    const [summary, setSummary] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);

    React.useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const key = await resolveApiKey();
                if (!key) {
                    throw new Error(t("No Groq API key configured. Please configure your key in Nightcord AI or AISummarizer settings."));
                }
                const result = await generateSummary();
                if (mounted) {
                    setSummary(result);
                    setLoading(false);
                }
            } catch (e: any) {
                if (mounted) {
                    setError(e?.message || String(e));
                    setLoading(false);
                }
            }
        })();
        return () => { mounted = false; };
    }, []);

    const handleCopy = async () => {
        if (!summary) return;
        try {
            await copyToClipboard(summary);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            Toasts.show({
                message: t("Summary copied to clipboard"),
                type: Toasts.Type.SUCCESS,
                id: Toasts.genId()
            });
        } catch {}
    };

    return (
        <ModalRoot {...rootProps} size={ModalSize.DYNAMIC}>
            <ModalHeader separator={false} style={{ padding: "20px 24px 12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <SummarizeIcon width={20} height={20} color="var(--brand-500)" />
                        <Text variant="heading-lg/semibold" style={{ color: "var(--header-primary, #ffffff)", margin: 0 }}>
                            {title}
                        </Text>
                    </div>
                    <Text variant="text-sm/normal" style={{ color: "var(--text-muted, #949ba4)", margin: 0 }}>
                        {subtitle}
                    </Text>
                </div>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>

            <ModalContent style={{ padding: "12px 24px 20px" }}>
                {loading && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px", gap: 16 }}>
                        <LoadingSpinner size={32} />
                        <Text variant="text-md/medium" style={{ color: "var(--text-muted, #949ba4)" }}>
                            {t("AI analysis in progress...")}
                        </Text>
                    </div>
                )}

                {error && (
                    <div style={{
                        padding: "16px",
                        backgroundColor: "rgba(237, 66, 69, 0.1)",
                        border: "1px solid rgba(237, 66, 69, 0.3)",
                        borderRadius: "8px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8
                    }}>
                        <Text variant="text-md/semibold" style={{ color: "var(--text-danger, #ed4245)" }}>
                            {t("Summarization Error")}
                        </Text>
                        <Text variant="text-sm/normal" style={{ color: "var(--text-normal, #dbdee1)", whiteSpace: "pre-wrap" }}>
                            {error}
                        </Text>
                    </div>
                )}

                {!loading && !error && (
                    <div style={{
                        padding: "16px",
                        backgroundColor: "var(--background-secondary, #2b2d31)",
                        borderRadius: "8px",
                        border: "1px solid var(--background-modifier-accent, rgba(255,255,255,0.08))"
                    }}>
                        <Text variant="text-md/normal" style={{
                            color: "var(--header-primary, #ffffff)",
                            lineHeight: "1.6",
                            whiteSpace: "pre-wrap",
                            userSelect: "text"
                        }}>
                            {summary}
                        </Text>
                    </div>
                )}
            </ModalContent>

            <ModalFooter style={{ padding: "12px 24px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                    {!loading && !error && (
                        <Button
                            variant="secondary"
                            size="small"
                            onClick={handleCopy}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                        >
                            <CopyIcon width={14} height={14} />
                            {copied ? t("Copied") : t("Copy Summary")}
                        </Button>
                    )}
                </div>
                <Button variant="primary" size="small" onClick={rootProps.onClose}>
                    {t("Close")}
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

async function summarizeMessage(message: any) {
    const content = message?.content?.trim();
    if (!content) {
        Toasts.show({
            message: t("The message has no text content to summarize"),
            type: Toasts.Type.FAILURE,
            id: Toasts.genId()
        });
        return;
    }

    const lines = settings.store.messageSummaryLines ?? 2;
    const lang = resolveLanguageInstruction(settings.store.summaryLanguage);
    const ch = ChannelStore.getChannel(message?.channel_id);
    const guildId = message?.guild_id || ch?.guild_id || ch?.guildId || ch?.getGuildId?.();
    const authorName = getAuthorDisplayName(message?.author, guildId);

    openModal(props => (
        <SummaryModal
            rootProps={props}
            title={t("Message Summary")}
            subtitle={`${t("Message from")} @${authorName}`}
            generateSummary={async () => {
                const systemPrompt = `You are a smart, modern Discord AI summarizer.
Analyze the provided Discord message and produce a concise, faithful summary in exactly ${lines} lines (or sentences).
Rules:
1. Always use the author's Discord pseudo (${authorName}) and the names of anyone mentioned. NEVER say generic words like "l'auteur", "l'interlocuteur" or "la personne".
2. Use a natural, dynamic, slightly informal tone (like a sharp Discord friend explaining what happened, not a formal academic paper or corporate report).
3. Understand informal chat slang, idioms, abbreviations, humor, sarcasm, typos, and multilingual messages.
4. Respond strictly in ${lang}.
5. Output ONLY the summary text directly without introductory filler, greetings, or quotes.`;

                const userPrompt = `Message from ${authorName}:\n"${content}"`;

                return await groqChat({
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.5,
                    maxTokens: 500,
                });
            }}
        />
    ));
}

async function summarizeChannel(channel: any) {
    if (!channel?.id) return;

    const channelName = channel.name ? `#${channel.name}` : (channel.rawRecipients?.map((r: any) => r.username).join(", ") || channel.id);
    const msgCount = settings.store.conversationMessageCount ?? 50;
    const lines = settings.store.conversationSummaryLines ?? 3;
    const lang = resolveLanguageInstruction(settings.store.summaryLanguage);
    const guildId = channel.guild_id || channel.guildId || channel.getGuildId?.();

    openModal(props => (
        <SummaryModal
            rootProps={props}
            title={t("Conversation Summary")}
            subtitle={`${channelName} • ${msgCount} ${t("messages requested")}`}
            generateSummary={async () => {
                const rawMessages = await fetchRecentMessages(channel.id, msgCount);
                if (!rawMessages || rawMessages.length === 0) {
                    throw new Error(t("No messages found in this conversation to summarize."));
                }

                // Filter out pure bot/system messages or format text
                const formattedList = rawMessages
                    .map(m => {
                        const author = getAuthorDisplayName(m.author, guildId);
                        const text = (m.content || "").trim();
                        if (!text && (!m.attachments || m.attachments.length === 0)) return null;
                        const attachmentNote = m.attachments?.length ? ` [${m.attachments.length} attachment(s)]` : "";
                        return `${author}: ${text}${attachmentNote}`;
                    })
                    .filter(Boolean);

                if (formattedList.length === 0) {
                    throw new Error(t("No readable text messages found in the last batch of messages."));
                }

                const participants = Array.from(new Set(rawMessages.map(m => getAuthorDisplayName(m.author, guildId)).filter(Boolean)));
                const transcript = formattedList.join("\n");

                const systemPrompt = `You are a smart, modern Discord AI summarizer.
Analyze the following Discord conversation transcript (${formattedList.length} messages between: ${participants.join(", ")}) and produce an accurate, lively summary in exactly ${lines} lines (or sentences).
Rules:
1. ALWAYS explicitly name each participant by their Discord pseudo (e.g. ${participants.slice(0, 3).join(", ")}). NEVER use vague terms like "Deux amis", "Des personnes", "Des utilisateurs", "L'un", "L'autre", or "Son interlocuteur". Clearly state what each person said, asked, argued, or decided using their pseudos.
2. Tone: Natural, direct, modern, and slightly informal. Write like a concise, sharp overview on Discord—not a dry bureaucratic essay, court transcript, or stiff novel.
3. Highlight the core topics, who suggested what, key jokes or debates, and the conclusion or current status.
4. Understand internet slang, chat abbreviations, sarcasm, memes, emojis, and multilingual conversation.
5. Respond strictly in ${lang}.
6. Output ONLY the summary text directly without introductory filler, bullet points, headers, or quotes.`;

                const userPrompt = `Participants: ${participants.join(", ")}\n\nConversation transcript:\n${transcript}`;

                return await groqChat({
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.5,
                    maxTokens: 800,
                });
            }}
        />
    ));
}

const messageContextPatch: NavContextMenuPatchCallback = (children, props: any) => {
    const msg = props?.message;
    if (!msg?.content && !msg?.attachments?.length) return;

    const group = findGroupChildrenByChildId("copy-link", children) || children;
    group.push(
        <Menu.MenuItem
            id="ai-summarize-message"
            label={t("Summarize Message")}
            icon={SummarizeIcon}
            action={() => summarizeMessage(msg)}
        />
    );
};

const channelContextPatch: NavContextMenuPatchCallback = (children, props: any) => {
    let ch = props?.channel;
    if (!ch && props?.user?.id) {
        ch = ChannelStore.getDMFromUserId(props.user.id);
    }
    if (!ch?.id) return;

    const group = findGroupChildrenByChildId("mark-as-read", children) || children;
    group.push(
        <Menu.MenuItem
            id="ai-summarize-channel"
            label={t("Summarize Conversation")}
            icon={SummarizeIcon}
            action={() => summarizeChannel(ch)}
        />
    );
};

export default definePlugin({
    name: "AISummarizer",
    description: "Summarize messages or entire conversations using AI (Groq API). Right-click any message or conversation.",
    authors: [{ name: "Nightcord", id: 0n }],
    enabledByDefault: false,
    settings,

    contextMenus: {
        "message": messageContextPatch,
        "channel-context": channelContextPatch,
        "gdm-context": channelContextPatch,
        "thread-context": channelContextPatch,
        "user-context": channelContextPatch,
    },
});
