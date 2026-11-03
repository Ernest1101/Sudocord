/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import { t } from "@nightcordplugins/autoTranslateNightcord";
import { getGroqKey, groqChat } from "@nightcordplugins/nightcordAI/groqManager";
import { showApiKeyWarning } from "@utils/apiKeyWarning";
import {
    ComponentDispatch,
    Constants,
    GuildMemberStore,
    MessageStore,
    PendingReplyStore,
    RestAPI,
    SelectedChannelStore,
    Toasts,
    UserStore
} from "@webpack/common";

import { settings } from "./index";

export async function insertReplyIntoChat(channelId: string, text: string): Promise<boolean> {
    try {
        ComponentDispatch?.dispatchToLastSubscribed?.("TEXTAREA_FOCUS");
    } catch {}

    const slateEl =
        document.querySelector<HTMLElement>('div[role="textbox"][contenteditable="true"]') ||
        document.querySelector<HTMLElement>('div[role="textbox"]') ||
        document.querySelector<HTMLElement>('[data-slate-editor="true"]');

    if (slateEl) {
        try {
            slateEl.focus();
        } catch {}
    }

    await new Promise(resolve => setTimeout(resolve, 25));

    try {
        ComponentDispatch?.dispatchToLastSubscribed?.("CLEAR_TEXT");
    } catch {}

    await new Promise(resolve => setTimeout(resolve, 15));

    try {
        ComponentDispatch?.dispatchToLastSubscribed?.("INSERT_TEXT", {
            rawText: text,
            plainText: text,
        });
    } catch {}

    if (slateEl) {
        try {
            slateEl.focus();
        } catch {}
    } else {
        try {
            ComponentDispatch?.dispatchToLastSubscribed?.("TEXTAREA_FOCUS");
        } catch {}
    }

    return true;
}

let isGenerating = false;
const generatingListeners = new Set<(val: boolean) => void>();

export function getIsGenerating() {
    return isGenerating;
}

export function onGeneratingChange(cb: (val: boolean) => void) {
    generatingListeners.add(cb);
    return () => {
        generatingListeners.delete(cb);
    };
}

function setGenerating(val: boolean) {
    isGenerating = val;
    generatingListeners.forEach(cb => {
        try {
            cb(val);
        } catch {}
    });
}

export async function resolveApiKey(): Promise<string> {
    const custom = settings.store.customApiKey?.trim();
    if (custom) return custom;
    const shared = await getGroqKey();
    if (shared) return shared;
    const fallback = (SudoCord as any)?.Settings?.plugins?.NightcordAI?.apiKey?.trim?.();
    if (fallback) return fallback;
    return "";
}

export async function fetchRecentMessages(channelId: string, limit = 50): Promise<any[]> {
    // 1. Try local cache from MessageStore first - instant, avoids REST network calls and DM/permission blocks
    try {
        const col = MessageStore?.getMessages?.(channelId) as any;
        if (col) {
            let list: any[] = [];
            if (typeof col.toArray === "function") {
                list = col.toArray();
            } else if (Array.isArray(col._array)) {
                list = col._array;
            } else if (col._map && typeof col._map.values === "function") {
                list = Array.from(col._map.values());
            } else if (Array.isArray(col)) {
                list = col;
            }
            if (list.length > 0) {
                return list.slice(-limit);
            }
        }
    } catch (e) {
        console.warn("[AlwaysRight] Error getting local messages:", e);
    }

    // 2. Fallback to REST API if local cache is empty
    try {
        const endpoint = Constants?.Endpoints?.MESSAGES?.(channelId) ?? `/channels/${channelId}/messages`;
        const res = await RestAPI.get({
            url: endpoint,
            query: { limit }
        });
        if (Array.isArray(res?.body) && res.body.length > 0) {
            // Discord API returns newest first; reverse for chronological order
            return res.body.slice().reverse();
        }
    } catch (err) {
        console.warn("[AlwaysRight] REST fetch failed, falling back to cached messages:", err);
    }

    return [];
}

function getAuthorName(author: any, guildId?: string): string {
    if (!author) return "User";
    if (guildId && GuildMemberStore?.getNick) {
        try {
            const nick = GuildMemberStore.getNick(guildId, author.id);
            if (nick) return nick;
        } catch {}
    }
    return author.globalName || author.global_name || author.username || "User";
}

function stripEmojis(text: string): string {
    return text
        .replace(/<a?:[a-zA-Z0-9_]+:[0-9]+>/g, "")
        .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function cleanAiOutput(text: string): string {
    let cleaned = text.trim();

    // Remove leading AI prefixes like "Response:", "Reply:", "AlwaysRight:"
    cleaned = cleaned.replace(/^(?:response|reply|alwaysright|ai):\s*/i, "").trim();

    // Only strip quotes if the ENTIRE message was wrapped in quotes from start to finish
    if (
        (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
        (cleaned.startsWith("«") && cleaned.endsWith("»")) ||
        (cleaned.startsWith("“") && cleaned.endsWith("”"))
    ) {
        cleaned = cleaned.slice(1, -1).trim();
    }

    return cleaned;
}

let cachedGeminiModel: string | null = null;

async function resolveGeminiModel(apiKey: string, requestedModel?: string): Promise<string> {
    const cleanKey = apiKey.trim();
    if (cachedGeminiModel && !requestedModel) {
        return cachedGeminiModel;
    }

    try {
        const listUrl = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100";
        const listRes = await fetch(listUrl, {
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": cleanKey
            }
        });
        if (listRes.ok) {
            const data = await listRes.json();
            if (Array.isArray(data?.models)) {
                const supported = data.models
                    .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
                    .map((m: any) => m.name.replace(/^models\//, ""));

                if (requestedModel && supported.includes(requestedModel)) {
                    cachedGeminiModel = requestedModel;
                    return requestedModel;
                }

                // Prefer modern flash models
                const best =
                    supported.find((m: string) => m.includes("flash-latest")) ||
                    supported.find((m: string) => m.includes("3.8-flash")) ||
                    supported.find((m: string) => m.includes("2.0-flash")) ||
                    supported.find((m: string) => m.includes("flash")) ||
                    supported.find((m: string) => m.includes("pro")) ||
                    supported[0];

                if (best) {
                    cachedGeminiModel = best;
                    return best;
                }
            }
        }
    } catch (e) {
        console.warn("[AlwaysRight] Failed to fetch Gemini model list:", e);
    }

    return requestedModel || "gemini-flash-latest";
}

async function callGeminiApi(systemPrompt: string, userPrompt: string, apiKey: string, model?: string): Promise<string> {
    const cleanKey = apiKey.trim();
    let targetModel = await resolveGeminiModel(cleanKey, model || settings.store.geminiModel);

    const makeRequest = async (mod: string, withTools: boolean = true) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${mod}:generateContent`;
        const bodyPayload: any = {
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [
                {
                    role: "user",
                    parts: [{ text: userPrompt }]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: settings.store.responseFormat === "long" ? 1500 : 800,
            }
        };

        // Enable live Google Search Grounding for real-time web facts, dates, links & answers
        if (withTools) {
            bodyPayload.tools = [{ googleSearch: {} }];
        }

        return fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": cleanKey
            },
            body: JSON.stringify(bodyPayload)
        });
    };

    let res = await makeRequest(targetModel, true);

    // If failed, retry without search tools (some preview or older models reject tools)
    if (!res.ok) {
        console.warn(`[AlwaysRight] Gemini with googleSearch returned ${res.status}, retrying without tools...`);
        const retryRes = await makeRequest(targetModel, false);
        if (retryRes.ok) {
            res = retryRes;
        }
    }

    // If still 404 or 400 on requested model, try standard fallbacks
    if (!res.ok && (res.status === 404 || res.status === 400)) {
        const fallbacks = [
            "gemini-flash-latest",
            "gemini-3.8-flash",
            "gemini-2.0-flash",
            "gemini-pro-latest"
        ].filter(m => m !== targetModel);

        for (const fb of fallbacks) {
            console.warn(`[AlwaysRight] Model ${targetModel} failed (${res.status}), trying fallback: ${fb}`);
            let fbRes = await makeRequest(fb, true);
            if (!fbRes.ok) {
                fbRes = await makeRequest(fb, false);
            }
            if (fbRes.ok) {
                res = fbRes;
                targetModel = fb;
                cachedGeminiModel = fb;
                break;
            }
        }
    }

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 403 && body.includes("denied access")) {
            throw new Error("Google Gemini (403): Votre projet Google Cloud requiert une facturation active en France. Utilisez le provider Groq (100% gratuit et instantané avec recherche web intégrée) !");
        }
        throw new Error(`Google Gemini error (${res.status}): ${body.slice(0, 160)}`);
    }

    const data = await res.json().catch(() => null);
    const parts = data?.candidates?.[0]?.content?.parts;
    const content = Array.isArray(parts) ? parts.map((p: any) => p?.text || "").join("").trim() : "";
    if (!content) {
        throw new Error(t("The AI generated an empty response."));
    }
    return content;
}

export async function generateAndInsertReply(channel: any, quickGuidance?: string, explicitTargetMessage?: any): Promise<void> {
    if (!channel?.id) {
        Toasts.show({
            message: t("No active channel found."),
            type: Toasts.Type.FAILURE,
            id: Toasts.genId()
        });
        return;
    }

    if (isGenerating) {
        Toasts.show({
            message: t("AlwaysRight is analyzing and composing reply..."),
            type: Toasts.Type.NORMAL,
            id: Toasts.genId()
        });
        return;
    }

    const provider = settings.store.apiProvider ?? "nightcord";
    if (provider === "gemini") {
        const geminiKey = settings.store.geminiApiKey?.trim();
        if (!geminiKey) {
            Toasts.show({
                message: t("Gemini API key missing — configure it in AlwaysRight settings."),
                type: Toasts.Type.FAILURE,
                id: Toasts.genId()
            });
            return;
        }
    } else {
        const apiKey = await resolveApiKey();
        if (!apiKey) {
            showApiKeyWarning("AlwaysRight");
            return;
        }
    }

    setGenerating(true);

    try {
        const myUser = UserStore?.getCurrentUser?.();
        const myId = myUser?.id ? String(myUser.id) : null;
        const guildId = channel.guild_id || channel.guildId || channel.getGuildId?.();

        // Check if there is an explicitly selected message to reply to:
        // 1. Directly passed message (e.g. from context menu)
        // 2. Or from Discord's active PendingReplyStore for this channel
        const pendingReply = PendingReplyStore?.getPendingReply?.(channel.id);
        let selectedReplyMsg = explicitTargetMessage;
        if (!selectedReplyMsg && pendingReply?.message) {
            const pendingAuthorId = String(pendingReply.message?.author?.id || "");
            if (pendingAuthorId && (!myId || pendingAuthorId !== myId)) {
                selectedReplyMsg = pendingReply.message;
            }
        }
        const isDirectReply = Boolean(selectedReplyMsg);

        let targetMsg: any = selectedReplyMsg || null;
        const rawMessages: any[] = await fetchRecentMessages(channel.id, isDirectReply ? 20 : 50);

        // If no explicit message was selected, fetch channel history to find the latest interlocutor message
        if (!targetMsg) {
            if (!rawMessages || rawMessages.length === 0) {
                Toasts.show({
                    message: t("No messages found in this channel to reply to."),
                    type: Toasts.Type.FAILURE,
                    id: Toasts.genId()
                });
                return;
            }

            for (let i = rawMessages.length - 1; i >= 0; i--) {
                const m = rawMessages[i];
                const authorId = String(m?.author?.id || "");
                const hasContent = Boolean(m?.content?.trim() || m?.attachments?.length || m?.embeds?.length || m?.stickers?.length);
                if (authorId && (!myId || authorId !== myId) && hasContent) {
                    targetMsg = m;
                    break;
                }
            }

            // Fallback to latest message if none from someone else
            if (!targetMsg) {
                for (let i = rawMessages.length - 1; i >= 0; i--) {
                    const m = rawMessages[i];
                    if (m?.content?.trim() || m?.attachments?.length || m?.embeds?.length || m?.stickers?.length) {
                        targetMsg = m;
                        break;
                    }
                }
            }
        }

        if (!targetMsg) {
            Toasts.show({
                message: t("No messages found in this channel to reply to."),
                type: Toasts.Type.FAILURE,
                id: Toasts.genId()
            });
            return;
        }

        const targetAuthor = getAuthorName(targetMsg.author, guildId);
        let targetContent = targetMsg.content?.trim() || "";
        if (!targetContent) {
            if (targetMsg.attachments?.length) {
                targetContent = "[Piece jointe / Media]";
            } else if (targetMsg.embeds?.length) {
                targetContent = "[Lien / Embed]";
            } else if (targetMsg.stickers?.length) {
                targetContent = "[Sticker]";
            } else {
                targetContent = "[Message]";
            }
        }

        // Build dialogue history (up to 50 messages for deep context)
        const historyLines = rawMessages
            .slice(-50)
            .map(m => {
                const author = getAuthorName(m.author, guildId);
                const isMe = myId && String(m.author?.id) === myId;
                const prefix = isMe ? "[You]" : `[${author}]`;
                const text = (m.content || "").trim();
                if (!text) return null;
                return `${prefix}: ${text}`;
            })
            .filter(Boolean);

        // Immediate last 10 messages
        const recentLines = historyLines.slice(-10);

        // Tone directive
        let toneInstruction = "Friendly, natural, conversational, and grounded. Always addressing the subject substantively without being rude, sarcastic, toxic, or narcissistic.";
        if (settings.store.tone === "cordial") {
            toneInstruction = "Cordial, polite, articulate, well-mannered, and respectful while remaining clear and compelling.";
        } else if (settings.store.tone === "direct") {
            toneInstruction = "Direct, frank, sharp, and concise. Straight to the factual point without polite filler, but strictly respectful and zero toxicity, insults, or arrogance.";
        }

        // Length directive
        let lengthInstruction = "Adaptive: Dynamically match the interlocutor's message length and depth. If they sent a short 1-line message, reply with a concise, punchy 1-line response. If they sent a longer message or asked for an in-depth explanation or sources, reply with a proportionate, well-reasoned paragraph.";
        if (settings.store.responseFormat === "short") {
            lengthInstruction = "Short and punchy (1 to 2 crisp, complete sentences maximum).";
        } else if (settings.store.responseFormat === "medium") {
            lengthInstruction = "Medium length (1 balanced paragraph, around 2 to 4 sentences).";
        } else if (settings.store.responseFormat === "long") {
            lengthInstruction = "Detailed and thorough (1 to 2 comprehensive paragraphs with complete reasoning).";
        }

        // Casing directive
        let casingInstruction = "Use standard, natural capitalization.";
        if (settings.store.capitalization === "lowercase") {
            casingInstruction = "Use strictly lowercase letters only (no uppercase or capital letters anywhere, casual chatter style).";
        }

        // Emoji directive
        let emojiInstruction = "Strictly ZERO emojis. Do not use any emojis or emoticons.";
        if (settings.store.emojiUsage === "with_emojis") {
            emojiInstruction = "You may naturally include 1 or 2 relevant emojis if fitting.";
        }

        // Language directive
        let langInstruction = "Detect the exact language and slang used by the interlocutor in TARGET_MESSAGE and reply in that EXACT same language.";
        if (settings.store.language && settings.store.language !== "auto") {
            langInstruction = `Reply strictly in ${settings.store.language}.`;
        }

        // Custom prompt
        const customPromptSetting = settings.store.customPrompt?.trim();
        const customPromptBlock = customPromptSetting
            ? `\nUser's Custom Persona & Directives: ${customPromptSetting}`
            : "";

        // Quick guidance from right click
        const quickGuidanceBlock = quickGuidance?.trim()
            ? `\nIMMEDIATE PRIORITY INSTRUCTION FOR THIS MESSAGE: ${quickGuidance.trim()}`
            : "";

        // Check if the user explicitly requested a narcissistic, sharp, roast, or aggressive tone in custom prompt or guidance
        const combinedGuidance = `${customPromptSetting || ""} ${quickGuidance || ""}`.toLowerCase();
        const isNarcissismOrRoastRequested = /(narciss|arrogant|clash|roast|m[eé]chant|hautain|sup[eé]rieur|piquant|cassant|d[eé]truit|humili|provoc)/i.test(combinedGuidance);

        let attitudeDirective = "";
        if (isNarcissismOrRoastRequested) {
            attitudeDirective = `USER-REQUESTED COMBATIVE / NARCISSISTIC / ROAST MODE:
The user has EXPLICITLY requested in their prompt or guidance to be narcissistic, sharp, arrogant, or to roast the interlocutor.
- You are FULLY AUTHORIZED to be unapologetically narcissistic, sharp, and biting.
- Make your retort hit hard, leave an unforgettable mark, and dominate the exchange ("marquer les esprits / marquer l'adversaire").
- CRITICAL EXECUTION: Even when roasting, dismantle the partner precisely ON THE ACTUAL SUBSTANCE of their claims, their factual absurdities, or their logic, showcasing effortless intellectual superiority. Do not just spit empty playground insults; make it a masterclass in factual humiliation and devastating wit while directly addressing their message!`;
        } else {
            attitudeDirective = `STRICT RESPECT & SUBSTANCE DIRECTIVE (DEFAULT BEHAVIOR):
- ABSOLUTELY ZERO NARCISSISM, CONDENSCENSION, OR ARROGANCE BY DEFAULT.
- FORMAL PROHIBITION: You are strictly forbidden from attacking the partner's grammar, spelling, typos, typing speed (e.g. NEVER say "avant même d'avoir fini ta phrase", "tes 3 lignes de code"), formatting, or their person (e.g. NEVER say "phrase de crade", "tu fais pitié", "chômeur").
- NO DISMISSIVE BRUSH-OFFS: NEVER say "t'as vraiment rien à faire", "va trouver un travail", "va toucher de l'herbe", "t'as du temps à perdre", "ferme-la", etc.
- ALWAYS answer calmly, articulately, and factually on the substantive subject matter.`;
        }

        const replyScopeInstruction = isDirectReply
            ? `\n\nCRITICAL SCOPE DIRECTIVE (SPECIFIC MESSAGE REPLY):
The user has explicitly selected ONE single message to reply to:
- From: @${targetAuthor}
- Message: "${targetContent}"
Your response MUST content itself with replying SOLELY, DIRECTLY, and EXCLUSIVELY to this particular message.
- Address ONLY what is stated, argued, asked, calculated, or claimed in this specific message.
- Do NOT bring in, merge, or get sidetracked by other unrelated conversation threads, side discussions, or other messages from the channel.
- Be razor-focused on answering, countering, or addressing this exact message.`
            : "";

        const now = new Date();
        const currentDateStr = now.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

        const systemPrompt = `You are AlwaysRight, an intelligent, articulate, mature, and helpful conversation assistant for Discord.
Your goal is to write the user's exact next message in reply to their conversation partner.

TEMPORAL ANCHOR & REAL-WORLD CLOCK:
- Current real-world date: ${currentDateStr} (Year: ${now.getFullYear()}).
- When answering questions about the current year, date, today, or recent releases, always anchor to this real-world date.

BEHAVIOR & ATTITUDE DIRECTIVE:
${attitudeDirective}

SUBSTANTIVE HANDLING BY CONTENT TYPE (ALWAYS MANDATORY):
1. CALCULATIONS, MATH & EXPRESSIONS:
   - If the message contains math, numbers, a formula, or an arithmetic expression (e.g. "10/100**4+!100^8 1", "2+2", "racine de 144", etc.):
   - ALWAYS solve, compute, or explain the mathematical expression and give the concrete calculated result.
   - NEVER mock the calculation, call it useless, or dismiss the sender without solving it.
2. TECHNICAL, COMPUTING & FACTUAL CLAIMS:
   - If the message discusses operating systems (Linux, Windows, macOS, iOS, Android), coding languages, technology, science, or facts:
   - DIRECTLY ADDRESS THE CLAIMS WITH ACCURATE TECHNICAL FACTS.
   - For example, if someone claims "macOS est basé sur android et iOS en scratch", factually and clearly explain that macOS and iOS are based on Apple's Darwin/XNU Unix-like kernel and Cocoa/Cocoa Touch frameworks written in C/Objective-C/Swift, whereas Android is built on the modified Linux kernel, and Scratch is an educational block language.
   - Correct misconceptions factually and clearly.
3. QUESTIONS & INFORMATION REQUESTS:
   - Provide a clear, accurate, direct, and insightful answer. Never answer with an evasive rhetorical question.
4. SOURCES & PROOF REQUESTS:
   - If the partner asks for sources or proof:
   * NEVER say "google it" or "cherche sur internet".
   * ALWAYS cite concrete, real-world authorities, peer-reviewed journals, recognized organizations, or specific landmark studies (e.g. PubMed, OMS/WHO, INSERM, CDC, Nature, Journal of Applied Physiology, INSEE, Pew Research, or specific researchers like Janssen et al.).
5. CASUAL BANTER & CHAT:
   - Keep the momentum going smoothly, casually, and cleverly without forcing an argument or being condescending.

CONTEXT & STANCE CONSISTENCY:
- The conversation history contains messages labeled as [You] (sent by the user) and [@Username] (sent by the interlocutor).
- CAREFULLY ANALYZE [You]'s previous messages: identify the user's exact opinions, arguments, perspective, and past claims. Your reply MUST remain 100% faithful and consistent with what [You] has been defending. Never contradict the user's established position or flip sides.
- CAREFULLY ANALYZE the interlocutor's messages: detect their mindset, claims, questions, or logical fallacies, and address them with precision and sound reasoning.${replyScopeInstruction}

Guidelines:
1. Tone: ${toneInstruction}
2. Format: ${lengthInstruction}
3. Casing: ${casingInstruction}
4. Emojis: ${emojiInstruction}
5. Language: ${langInstruction}${customPromptBlock}${quickGuidanceBlock}

CRITICAL RULES:
- Output ONLY the text of the message itself.
- NEVER wrap your output in quotation marks.
- NEVER add introductory phrases like "Here's what you can say:", "Reply:", or "AlwaysRight:".
- NEVER state that you are an AI. Write as if you are the user themselves typing into Discord chat.
- NO CLICHÉ CONVERSATION ENDERS: NEVER use artificial, arrogant conversation stoppers like "le débat est clos", "point final", "c'est indiscutable", "fin de l'histoire", "circulez", or "case closed". They sound unnatural, childish, and forced. Sound like a real person, confident, grounded, and articulate.
- COMPLETENESS: Always ensure every message is 100% complete and finishes its final sentence properly with valid punctuation. Never stop or cut off mid-thought.`;

        let userPrompt = "";
        const promptInstructionSuffix = isNarcissismOrRoastRequested
            ? "Compose the reply now. Be sharp, narcissistic, and devastatingly impactful ('marquer l'adversaire') while dismantling their specific arguments and errors on the substance:"
            : `Compose the user's reply message now. Address @${targetAuthor}'s actual points, calculations, or claims substantively and constructively without evasion or insults:`;

        if (isDirectReply) {
            userPrompt = `=== SPECIFIC MESSAGE SELECTED TO REPLY TO ===
From: @${targetAuthor}
Content: "${targetContent}"

=== BACKGROUND CONTEXT (Recent messages for context only - focus strictly on replying to the specific message above) ===
${recentLines.join("\n")}

${promptInstructionSuffix}`;
        } else {
            userPrompt = `=== CONVERSATION BACKGROUND (Up to 50 previous messages) ===
${historyLines.join("\n")}

=== RECENT EXCHANGES (Last 10 messages) ===
${recentLines.join("\n")}

=== TARGET MESSAGE TO REPLY TO ===
From: @${targetAuthor}
Content: "${targetContent}"

${promptInstructionSuffix}`;
        }


        let reply = "";
        if (provider === "gemini") {
            const geminiKey = settings.store.geminiApiKey?.trim();
            const model = settings.store.geminiModel || "gemini-flash-latest";
            reply = await callGeminiApi(systemPrompt, userPrompt, geminiKey, model);
        } else {
            reply = await groqChat({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.7,
                maxTokens: settings.store.responseFormat === "long" ? 1200 : 800,
            });
        }

        let finalReply = cleanAiOutput(reply);

        if (settings.store.capitalization === "lowercase") {
            finalReply = finalReply.toLowerCase();
        }

        if (settings.store.emojiUsage === "no_emojis") {
            finalReply = stripEmojis(finalReply);
        }

        if (!finalReply) {
            throw new Error(t("The AI generated an empty response."));
        }

        // Insert the AI-generated reply into chat input robustly
        await insertReplyIntoChat(channel?.id || SelectedChannelStore?.getChannelId?.(), finalReply);

        Toasts.show({
            message: t("AI response placed in chat input."),
            type: Toasts.Type.SUCCESS,
            id: Toasts.genId()
        });

    } catch (err: any) {
        console.error("[AlwaysRight] Generation error:", err);
        Toasts.show({
            message: `${t("AlwaysRight Error")}: ${err?.message || String(err)}`,
            type: Toasts.Type.FAILURE,
            id: Toasts.genId()
        });
    } finally {
        setGenerating(false);
    }
}
