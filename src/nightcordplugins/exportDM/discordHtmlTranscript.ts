/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IconUtils } from "@webpack/common";

export interface TranscriptMessage {
    id: string;
    timestamp: string;
    editedAt?: string;
    authorId: string;
    authorName: string;
    authorAvatar: string | null;
    authorBot?: boolean;
    content: string;
    attachments: Array<{ url: string; filename: string; size: number; contentType: string; }>;
    embeds: Array<{
        title?: string;
        description?: string;
        url?: string;
        image?: string;
        thumbnail?: string;
        color?: number | string;
        author?: { name?: string; iconUrl?: string; url?: string; };
        footer?: { text?: string; iconUrl?: string; };
        fields?: Array<{ name: string; value: string; inline?: boolean; }>;
        type?: string;
    }>;
    stickers: Array<{ name: string; id: string; formatType?: number; }>;
    reactions: Array<{ emoji: string; count: number; }>;
    referencedMessage?: { id: string; authorName: string; content: string; };
    pinned: boolean;
    type: number;
    components: any[];
    deleted?: boolean;
}

export interface TranscriptChannelInfo {
    id: string;
    name: string;
    type?: number;
    icon?: string | null;
    avatar?: string | null;
    recipientId?: string;
    recipientCount?: number;
}

export type Profile = {
    id: string;
    author: string;
    displayName: string;
    username: string;
    avatar?: string;
    bot?: boolean;
    verified?: boolean;
    roleColor?: string;
};

function escapeHtml(str: string): string {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttribute(str: string): string {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function formatBytes(bytes: number, decimals = 1): { size: number; unit: string } {
    if (bytes === 0) return { size: 0, unit: "Bytes" };
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return { size: parseFloat((bytes / Math.pow(k, i)).toFixed(dm)), unit: sizes[i] };
}

function formatSize(bytes: number): string {
    const { size, unit } = formatBytes(bytes);
    return `${size} ${unit}`;
}

function stringifyForScript(value: Record<string, unknown> | readonly unknown[]): string {
    return JSON.stringify(value).replace(
        /[<>&\u2028\u2029]/g,
        char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
    );
}

function convertToHEX(color?: number | string | null): string {
    if (color == null) return "#5865f2";
    if (typeof color === "string") {
        if (color.startsWith("#")) return color;
        const parsed = parseInt(color, 16);
        if (!isNaN(parsed)) return `#${parsed.toString(16).padStart(6, "0")}`;
        return color;
    }
    return `#${color.toString(16).padStart(6, "0")}`;
}

function parseMarkdownToComponents(text: string): string {
    if (!text) return "";
    let s = escapeHtml(text);

    // Codeblocks (```lang ... ```)
    s = s.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<discord-code-block language="${escapeAttribute(lang)}" code="${escapeAttribute(code)}"></discord-code-block>`;
    });

    // Inline code (`...`)
    s = s.replace(/`([^`\n]+)`/g, "<discord-code>$1</discord-code>");

    // Spoilers (||...||)
    s = s.replace(/\|\|([\s\S]+?)\|\|/g, "<discord-spoiler>$1</discord-spoiler>");

    // Blockquotes (>>> or >)
    s = s.replace(/^>>>\s+([\s\S]*)$/gm, "<discord-quote>$1</discord-quote>");
    s = s.replace(/^>\s+(.*)$/gm, "<discord-quote>$1</discord-quote>");

    // Headers (#, ##, ###)
    s = s.replace(/^### (.*$)/gm, '<discord-header level="3">$1</discord-header>');
    s = s.replace(/^## (.*$)/gm, '<discord-header level="2">$1</discord-header>');
    s = s.replace(/^# (.*$)/gm, '<discord-header level="1">$1</discord-header>');

    // Subtext (-# text)
    s = s.replace(/^-# (.*$)/gm, "<discord-subscript>$1</discord-subscript>");

    // Bold + Italic (***...***)
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "<discord-bold><discord-italic>$1</discord-italic></discord-bold>");

    // Bold (**...**)
    s = s.replace(/\*\*([^*]+)\*\*/g, "<discord-bold>$1</discord-bold>");

    // Underline (__...__)
    s = s.replace(/__([^_]+)__/g, "<discord-underlined>$1</discord-underlined>");

    // Italic (*...* or _..._)
    s = s.replace(/\*([^*]+)\*/g, "<discord-italic>$1</discord-italic>");
    s = s.replace(/_([^_]+)_/g, "<discord-italic>$1</discord-italic>");

    // Strikethrough (~~...~~)
    s = s.replace(/~~([^~]+)~~/g, "<s>$1</s>");

    // Discord custom emojis (<a?:name:id>)
    s = s.replace(/&lt;(a)?:([a-zA-Z0-9_]+):([0-9]+)&gt;/g, (_, animated, name, id) => {
        const ext = animated ? "gif" : "webp";
        return `<discord-custom-emoji url="https://cdn.discordapp.com/emojis/${id}.${ext}?size=48&amp;quality=lossless" name="${escapeAttribute(name)}"></discord-custom-emoji>`;
    });

    // Timestamps (<t:timestamp:format>)
    s = s.replace(/&lt;t:([0-9]+)(?::([tTdDfFR]))?&gt;/g, (_, unix) => {
        return `<discord-time timestamp="${new Date(Number(unix) * 1000).toISOString()}"></discord-time>`;
    });

    // Mentions
    s = s.replace(/&lt;@!?([0-9]+)&gt;/g, '<discord-mention type="user">@user</discord-mention>');
    s = s.replace(/&lt;@&amp;([0-9]+)&gt;/g, '<discord-mention type="role">@role</discord-mention>');
    s = s.replace(/&lt;#([0-9]+)&gt;/g, '<discord-mention type="channel">#channel</discord-mention>');
    s = s.replace(/@everyone/g, '<discord-mention type="role" highlight>@everyone</discord-mention>');
    s = s.replace(/@here/g, '<discord-mention type="role" highlight>@here</discord-mention>');

    // Links
    s = s.replace(/(https?:\/\/[^\s<]+)/g, '<discord-link href="$1" target="_blank" rel="noreferrer">$1</discord-link>');

    // Line breaks
    s = s.replace(/\n/g, "<br />");

    return s;
}

function getMediaType(url: string, ct: string): "image" | "video" | "audio" | "file" {
    if (ct.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i.test(url)) return "image";
    if (ct.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url)) return "video";
    if (ct.startsWith("audio/") || /\.(mp3|ogg|wav|flac|m4a|aac)(\?|$)/i.test(url)) return "audio";
    return "file";
}

function buildProfiles(messages: TranscriptMessage[]): Record<string, Profile> {
    const profiles: Record<string, Profile> = {};

    for (const msg of messages) {
        if (!profiles[msg.authorId]) {
            let avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
            if (msg.authorAvatar) {
                if (msg.authorAvatar.startsWith("http")) {
                    avatarUrl = msg.authorAvatar;
                } else {
                    avatarUrl = IconUtils.getUserAvatarURL({ id: msg.authorId, avatar: msg.authorAvatar } as any, false, 64);
                }
            } else {
                try {
                    const idNum = BigInt(msg.authorId);
                    const idx = Number(idNum >> 22n) % 6;
                    avatarUrl = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
                } catch {
                    avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
                }
            }

            profiles[msg.authorId] = {
                id: msg.authorId,
                author: msg.authorName || "User",
                displayName: msg.authorName || "User",
                username: msg.authorName || "user",
                avatar: avatarUrl,
                bot: Boolean(msg.authorBot),
                verified: false,
                roleColor: undefined,
            };
        }
    }

    return profiles;
}

export function generateDiscordHtmlTranscript(messages: TranscriptMessage[], channel: TranscriptChannelInfo): string {
    const channelName = channel.name || "Direct Message";
    const totalMessages = messages.length;

    let channelAvatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
    if (channel.avatar) {
        channelAvatarUrl = IconUtils.getUserAvatarURL({ id: channel.recipientId, avatar: channel.avatar } as any, false, 64);
    } else if (channel.icon) {
        channelAvatarUrl = `https://cdn.discordapp.com/channel-icons/${channel.id}/${channel.icon}.png?size=64`;
    }

    const profiles = buildProfiles(messages);

    let messagesHtml = "";

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const isSystem = msg.type !== 0 && msg.type !== 19;

        if (isSystem) {
            if (msg.type === 6) {
                // Pin message
                messagesHtml += `
                <discord-system-message id="m-${escapeAttribute(msg.id)}" type="pin">
                    <i>${escapeHtml(msg.authorName)}</i> pinned <i>a message</i> to this channel.
                </discord-system-message>`;
                continue;
            }
            if (msg.type === 1 || msg.type === 2) {
                // Recipient add / join
                messagesHtml += `
                <discord-system-message id="m-${escapeAttribute(msg.id)}" type="join">
                    <i>${escapeHtml(msg.authorName)}</i> joined the group.
                </discord-system-message>`;
                continue;
            }
            if (msg.type === 8 || msg.type === 9 || msg.type === 10 || msg.type === 11) {
                // Server Boost
                messagesHtml += `
                <discord-system-message id="m-${escapeAttribute(msg.id)}" type="boost">
                    <i>${escapeHtml(msg.authorName)}</i> boosted the conversation!
                </discord-system-message>`;
                continue;
            }
        }

        let replyHtml = "";
        if (msg.referencedMessage) {
            replyHtml = `
            <discord-reply slot="reply" author="${escapeAttribute(msg.referencedMessage.authorName)}">
                <span data-goto="${escapeAttribute(msg.referencedMessage.id)}">${msg.referencedMessage.content ? parseMarkdownToComponents(msg.referencedMessage.content.slice(0, 180)) : "<em>Click to see attachment or original message</em>"}</span>
            </discord-reply>`;
        }

        let contentHtml = "";
        if (msg.content) {
            contentHtml = parseMarkdownToComponents(msg.content);
        }

        // Attachments
        let attachmentsHtml = "";
        if (msg.attachments && msg.attachments.length > 0) {
            const mediaGallery: typeof msg.attachments = [];
            const otherAttachments: typeof msg.attachments = [];

            for (const att of msg.attachments) {
                const type = getMediaType(att.url, att.contentType);
                if (type === "image" || type === "video") {
                    mediaGallery.push(att);
                } else {
                    otherAttachments.push(att);
                }
            }

            let galleryItemsHtml = "";
            for (const att of mediaGallery) {
                galleryItemsHtml += `<discord-media-gallery-item media="${escapeAttribute(att.url)}" mime-type="${escapeAttribute(att.contentType)}"></discord-media-gallery-item>`;
            }

            let otherItemsHtml = "";
            for (const att of otherAttachments) {
                const type = getMediaType(att.url, att.contentType);
                if (type === "audio") {
                    otherItemsHtml += `<discord-audio-attachment url="${escapeAttribute(att.url)}" bytes="${att.size}"></discord-audio-attachment>`;
                } else {
                    otherItemsHtml += `<discord-file-attachment href="${escapeAttribute(att.url)}" file-name="${escapeAttribute(att.filename)}" bytes="${att.size}"></discord-file-attachment>`;
                }
            }

            attachmentsHtml = `
            <discord-attachments slot="attachments">
                ${galleryItemsHtml ? `<discord-media-gallery>${galleryItemsHtml}</discord-media-gallery>` : ""}
                ${otherItemsHtml}
            </discord-attachments>`;
        }

        // Embeds
        let embedsHtml = "";
        if (msg.embeds && msg.embeds.length > 0) {
            for (const emb of msg.embeds) {
                const isMediaOnly = emb.type === "image" || emb.type === "video" || emb.type === "gifv";
                if (isMediaOnly && emb.thumbnail) {
                    embedsHtml += `
                    <discord-media-gallery slot="embeds">
                        <discord-media-gallery-item media="${escapeAttribute(emb.thumbnail)}"></discord-media-gallery-item>
                    </discord-media-gallery>`;
                    continue;
                }

                let fieldsHtml = "";
                if (emb.fields && emb.fields.length > 0) {
                    for (const f of emb.fields) {
                        fieldsHtml += `
                        <discord-embed-field field-title="${escapeAttribute(f.name)}" ${f.inline ? "inline" : ""}>
                            ${parseMarkdownToComponents(f.value)}
                        </discord-embed-field>`;
                    }
                }

                let descHtml = "";
                if (emb.description) {
                    descHtml = `<discord-embed-description slot="description">${parseMarkdownToComponents(emb.description)}</discord-embed-description>`;
                }

                let footerHtml = "";
                if (emb.footer && emb.footer.text) {
                    footerHtml = `<discord-embed-footer slot="footer" ${emb.footer.iconUrl ? `footer-image="${escapeAttribute(emb.footer.iconUrl)}"` : ""}>${escapeHtml(emb.footer.text)}</discord-embed-footer>`;
                }

                embedsHtml += `
                <discord-embed
                    slot="embeds"
                    ${emb.title ? `embed-title="${escapeAttribute(emb.title)}"` : ""}
                    ${emb.url ? `url="${escapeAttribute(emb.url)}"` : ""}
                    ${emb.color ? `color="${convertToHEX(emb.color)}"` : ""}
                    ${emb.author?.name ? `author-name="${escapeAttribute(emb.author.name)}"` : ""}
                    ${emb.author?.iconUrl ? `author-image="${escapeAttribute(emb.author.iconUrl)}"` : ""}
                    ${emb.author?.url ? `author-url="${escapeAttribute(emb.author.url)}"` : ""}
                    ${emb.image ? `image="${escapeAttribute(emb.image)}"` : ""}
                    ${emb.thumbnail ? `thumbnail="${escapeAttribute(emb.thumbnail)}"` : ""}
                >
                    ${descHtml}
                    ${fieldsHtml ? `<discord-embed-fields slot="fields">${fieldsHtml}</discord-embed-fields>` : ""}
                    ${footerHtml}
                </discord-embed>`;
            }
        }

        // Reactions
        let reactionsHtml = "";
        if (msg.reactions && msg.reactions.length > 0) {
            let rList = "";
            for (const r of msg.reactions) {
                let emojiUrl = "";
                if (/^[0-9]+$/.test(r.emoji)) {
                    emojiUrl = `https://cdn.discordapp.com/emojis/${r.emoji}.webp?size=48`;
                } else {
                    emojiUrl = `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/${encodeURIComponent(r.emoji)}.svg`;
                }
                rList += `<discord-reaction name="${escapeAttribute(r.emoji)}" count="${r.count}" emoji="${escapeAttribute(emojiUrl)}"></discord-reaction>`;
            }
            reactionsHtml = `<discord-reactions slot="reactions">${rList}</discord-reactions>`;
        }

        const isEdited = Boolean(msg.editedAt);
        const isHighlight = msg.content ? (msg.content.includes("@everyone") || msg.content.includes("@here")) : false;

        messagesHtml += `
        <discord-message
            id="m-${escapeAttribute(msg.id)}"
            profile="${escapeAttribute(msg.authorId)}"
            timestamp="${escapeAttribute(msg.timestamp)}"
            ${isEdited ? "edited" : ""}
            ${isHighlight ? "highlight" : ""}
            ${msg.deleted ? 'style="border-left: 2px solid #ed4245; background-color: rgba(237, 66, 69, 0.08);"' : ""}
        >
            ${replyHtml}
            ${msg.deleted ? '<div style="color: #ed4245; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; display: inline-flex; align-items: center; gap: 4px;">Deleted Message (Recovered)</div>' : ""}
            ${contentHtml}
            ${attachmentsHtml}
            ${embedsHtml}
            ${reactionsHtml}
        </discord-message>`;
    }

    const scrollToMessageScript = `
    document.addEventListener("click", t => {
        let e = t.target;
        if (!e) return;
        let o = e.getAttribute("data-goto") || e.closest("[data-goto]")?.getAttribute("data-goto");
        if (o) {
            let r = document.getElementById("m-" + o);
            if (r) {
                r.scrollIntoView({ behavior: "smooth", block: "center" });
                r.style.backgroundColor = "rgba(148, 156, 247, 0.15)";
                r.style.transition = "background-color 0.5s ease";
                setTimeout(() => { r.style.backgroundColor = "transparent"; }, 1500);
            }
        }
    });`;

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(channelName)} — Transcript</title>
    <link rel="icon" type="image/png" href="${escapeAttribute(channelAvatarUrl)}" />

    <!-- Message Reference Handler (sweety-html-transcripts client) -->
    <script>
        ${scrollToMessageScript}
    </script>

    <!-- Profiles Metadata for Web Components -->
    <script>
        window.$discordMessage = { profiles: ${stringifyForScript(profiles)} };
    </script>

    <!-- Component Library from @penwin/discord-components-core (sweety-html-transcripts engine) -->
    <script type="module" src="https://cdn.jsdelivr.net/npm/@penwin/discord-components-core@4.5.0/dist/bundle/index.mjs"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@penwin/discord-components-core@4.5.0/dist/bundle/styles/base.css" />

    <style>
        body {
            margin: 0;
            min-height: 100vh;
            background-color: #313338;
            font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #dbdee1;
        }
        .sweety-footer {
            text-align: center;
            width: 100%;
            padding: 24px 0 32px 0;
            color: #949ba4;
            font-size: 13px;
        }
        .sweety-footer a {
            color: #00a8fc;
            text-decoration: none;
        }
        .sweety-footer a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <discord-messages style="min-height: 100vh;">
        <!-- Header -->
        <discord-transcript-header
            guild="Direct Messages"
            channel="${escapeAttribute(channelName)}"
            icon="${escapeAttribute(channelAvatarUrl)}"
        >
            Direct Messages with ${escapeHtml(channelName)}
        </discord-transcript-header>

        <!-- Messages -->
        ${messagesHtml}

        <!-- Footer -->
        <div class="sweety-footer">
            Exported ${totalMessages} message${totalMessages > 1 ? "s" : ""}. Powered by <a href="https://github.com/Ganyu-Studios/sweety-html-transcripts" target="_blank" rel="noreferrer">sweety-html-transcripts</a> &amp; Nightcord.
        </div>
    </discord-messages>
</body>
</html>`;

    return fullHtml;
}
