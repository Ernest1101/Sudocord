/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 dsd16
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, GuildMemberStore, GuildRoleStore, GuildStore, PermissionsBits, SelectedChannelStore, UserStore, VoiceStateStore } from "@webpack/common";

const OVERLAY_ID = "sc-staff-overlay";

const settings = definePluginSettings({
    staffNames: {
        type: OptionType.STRING,
        description: "Имена стафф-ролей через запятую (совпадение без учёта регистра)",
        default: "admin,админ,administrator,администратор,moderator,модер,модератор,mod,owner,владелец,helper,хелпер,support,саппорт,curator,куратор"
    },
    checkPermissions: {
        type: OptionType.BOOLEAN,
        description: "Считать стаффом и по правам ролей (кик, бан, мут, управление...)",
        default: true
    },
    overlaySec: {
        type: OptionType.NUMBER,
        description: "Сколько висит оверлей (сек)",
        default: 5
    },
    volume: {
        type: OptionType.NUMBER,
        description: "Громкость звука (0-100)",
        default: 80
    },
    topOverlay: {
        type: OptionType.BOOLEAN,
        description: "Оверлей поверх всех окон и игр (тот же дизайн, отдельное окно)",
        default: true
    },
    soundUrl: {
        type: OptionType.STRING,
        description: "Ссылка на звук алерта",
        default: "https://sudocord.h4ck.me/assets/staff-alert.mp3"
    }
});

interface StaffHit {
    label: string;
    color: string | null;
    perms: string[];
}

// стафф-права от сильных к слабым: что роль реально умеет
const STAFF_PERMS: { key: string; label: string; }[] = [
    { key: "ADMINISTRATOR", label: "админ" },
    { key: "MANAGE_GUILD", label: "управление сервером" },
    { key: "MANAGE_ROLES", label: "роли" },
    { key: "MANAGE_CHANNELS", label: "каналы" },
    { key: "BAN_MEMBERS", label: "бан" },
    { key: "KICK_MEMBERS", label: "кик" },
    { key: "MODERATE_MEMBERS", label: "тайм-аут" },
    { key: "MANAGE_MESSAGES", label: "удаление сообщений" },
    { key: "MUTE_MEMBERS", label: "мут" },
    { key: "DEAFEN_MEMBERS", label: "деафен" },
    { key: "MOVE_MEMBERS", label: "перемещение" },
    { key: "MANAGE_NICKNAMES", label: "ники" },
    { key: "MANAGE_THREADS", label: "ветки" },
    { key: "MANAGE_EVENTS", label: "события" },
    { key: "MENTION_EVERYONE", label: "пинг всех" },
    { key: "PRIORITY_SPEAKER", label: "приоритет" },
    { key: "VIEW_AUDIT_LOG", label: "аудит" }
];

function rolePerms(role: any): string[] {
    const out: string[] = [];
    try {
        const raw = role?.permissions;
        if (raw == null) return out;
        const perms = BigInt(raw);
        for (const { key, label } of STAFF_PERMS) {
            try {
                const bit = (PermissionsBits as any)?.[key];
                if (bit == null) continue;
                if ((perms & BigInt(bit)) !== 0n) out.push(label);
            } catch { /* ignore */ }
        }
    } catch { /* ignore */ }
    return out;
}

function staffNames(): string[] {
    return settings.store.staffNames.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

function toColor(color: unknown): string | null {
    try {
        const n = typeof color === "number" ? color : Number(color);
        if (!Number.isFinite(n) || n <= 0) return null;
        return `#${Math.floor(n).toString(16).padStart(6, "0")}`;
    } catch {
        return null;
    }
}

function getRole(guildId: string, roleId: string): any {
    try {
        const r = GuildRoleStore.getRole?.(guildId, roleId);
        if (r) return r;
    } catch { /* ignore */ }
    return null;
}

function resolveStaff(guildId: string, userId: string): StaffHit | null {
    try {
        const guild = GuildStore.getGuild(guildId);
        if (guild && (guild as any).ownerId === userId) return { label: "Владелец", color: "#ed4245", perms: ["всё"] };
        const member = GuildMemberStore.getMember(guildId, userId);
        const roles: string[] = member?.roles ?? [];
        const names = staffNames();

        let nameHit: { name: string; color: string | null; perms: string[]; } | null = null;
        let permHit: { name: string; color: string | null; perms: string[]; pos: number; } | null = null;

        for (const roleId of roles) {
            let role: any;
            try {
                role = getRole(guildId, roleId);
            } catch {
                continue;
            }
            if (!role) continue;
            const name: string = role.name ?? "";
            const perms = settings.store.checkPermissions ? rolePerms(role) : [];
            const pos = Number(role.position) || 0;
            if (!nameHit && name && names.some(n => name.toLowerCase().includes(n))) {
                nameHit = { name, color: toColor(role.color), perms };
            }
            if (perms.length && (!permHit || perms.length > permHit.perms.length || (perms.length === permHit.perms.length && pos > permHit.pos))) {
                permHit = { name: name || "Администрация", color: toColor(role.color), perms, pos };
            }
        }

        if (nameHit) return { label: nameHit.name, color: nameHit.color, perms: nameHit.perms };
        if (permHit) return { label: permHit.name, color: permHit.color, perms: permHit.perms };
    } catch (e) {
        console.error("[StaffDetector] resolve failed", e);
    }
    return null;
}

function avatarUrl(userId: string): string {
    try {
        const user = UserStore.getUser(userId) as any;
        if (user?.avatar) return `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.webp?size=64`;
        const idx = Number((BigInt(userId) >> 22n) % 6n);
        return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    } catch {
        return "https://cdn.discordapp.com/embed/avatars/0.png";
    }
}

function displayName(userId: string): string {
    try {
        const user = UserStore.getUser(userId) as any;
        return user?.globalName || user?.username || userId;
    } catch {
        return userId;
    }
}

function playAlert() {
    try {
        const a = new Audio(settings.store.soundUrl);
        a.volume = Math.min(1, Math.max(0, Number(settings.store.volume) || 0) / 100);
        a.preload = "auto";
        void a.play().then(
            () => console.info("[StaffDetector] sound played"),
            e => console.error("[StaffDetector] play failed", e?.name, e?.message)
        );
    } catch (e) {
        console.error("[StaffDetector] play failed", e);
    }
}

// тот же оверлей, но отдельным окном поверх всех окон и игр.
// работает только в десктопе (нужен главный процесс).
function showTopOverlay(userId: string, hit: StaffHit) {
    try {
        if (!settings.store.topOverlay) return;
        if (typeof VencordNative === "undefined" || !VencordNative?.staffOverlay?.show) {
            console.info("[StaffDetector] top overlay unavailable (no main bridge)");
            return;
        }
        const shown = hit.perms.slice(0, 4).join(" • ");
        void VencordNative.staffOverlay.show({
            name: displayName(userId),
            avatar: avatarUrl(userId),
            role: hit.label,
            color: hit.color,
            perms: hit.perms.length ? `умеет: ${shown}${hit.perms.length > 4 ? ` +${hit.perms.length - 4}` : ""}` : "",
            durationSec: Math.max(2, Math.min(30, Number(settings.store.overlaySec) || 5))
        }).then(
            () => console.info(`[StaffDetector] top overlay shown for ${displayName(userId)}`),
            e => console.error("[StaffDetector] top overlay failed", e)
        );
    } catch (e) {
        console.error("[StaffDetector] top overlay failed", e);
    }
}

let hideTimer: ReturnType<typeof setTimeout> | null = null;

function showOverlay(userId: string, hit: StaffHit) {
    try {
        document.getElementById(OVERLAY_ID)?.remove();
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
        const accent = hit.color ?? "#5865f2";
        const box = document.createElement("div");
        box.id = OVERLAY_ID;
        Object.assign(box.style, {
            position: "fixed", right: "20px", bottom: "20px", zIndex: "10002",
            display: "flex", alignItems: "center", gap: "12px",
            background: "#111214", border: "1px solid #26272b",
            borderLeft: `4px solid ${accent}`, borderRadius: "12px",
            padding: "12px 16px 12px 12px", minWidth: "240px", maxWidth: "340px",
            boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
            opacity: "0", transform: "translateY(12px)",
            transition: "opacity 0.25s ease, transform 0.25s ease",
            fontFamily: "inherit", pointerEvents: "none"
        } as CSSStyleDeclaration);

        const av = document.createElement("img");
        av.src = avatarUrl(userId);
        Object.assign(av.style, { width: "44px", height: "44px", borderRadius: "50%", flexShrink: "0" } as CSSStyleDeclaration);
        box.appendChild(av);

        const col = document.createElement("div");
        col.style.display = "flex";
        col.style.flexDirection = "column";
        col.style.gap = "4px";
        col.style.minWidth = "0";

        const name = document.createElement("div");
        name.textContent = displayName(userId);
        Object.assign(name.style, {
            color: "#f2f3f5", fontSize: "15px", fontWeight: "700",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
        } as CSSStyleDeclaration);
        col.appendChild(name);

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "6px";

        const pill = document.createElement("span");
        pill.textContent = hit.label;
        Object.assign(pill.style, {
            background: `${accent}33`, border: `1px solid ${accent}88`, color: accent,
            fontSize: "11px", fontWeight: "700", borderRadius: "6px", padding: "2px 8px",
            textTransform: "uppercase", letterSpacing: "0.04em"
        } as CSSStyleDeclaration);
        row.appendChild(pill);

        const sub = document.createElement("span");
        sub.textContent = "зашёл в войс";
        Object.assign(sub.style, { color: "#949ba4", fontSize: "12px" } as CSSStyleDeclaration);
        row.appendChild(sub);

        col.appendChild(row);

        if (hit.perms.length) {
            const caps = document.createElement("div");
            const shown = hit.perms.slice(0, 4).join(" • ");
            caps.textContent = `умеет: ${shown}${hit.perms.length > 4 ? ` +${hit.perms.length - 4}` : ""}`;
            Object.assign(caps.style, {
                color: "#72767d", fontSize: "11px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "230px"
            } as CSSStyleDeclaration);
            col.appendChild(caps);
        }
        box.appendChild(col);
        document.body.appendChild(box);
        console.info(`[StaffDetector] in-client overlay shown for ${displayName(userId)}`);

        requestAnimationFrame(() => requestAnimationFrame(() => {
            box.style.opacity = "1";
            box.style.transform = "translateY(0)";
        }));

        const ms = Math.max(2, Math.min(30, Number(settings.store.overlaySec) || 5)) * 1000;
        hideTimer = setTimeout(() => {
            box.style.opacity = "0";
            box.style.transform = "translateY(8px)";
            setTimeout(() => box.remove(), 300);
        }, ms);
    } catch (e) {
        console.error("[StaffDetector] overlay failed", e);
    }
}

let timer: ReturnType<typeof setInterval> | null = null;
let lastChannel: string | null = null;
const seen = new Set<string>();

function scan() {
    try {
        const channelId = SelectedChannelStore.getVoiceChannelId?.();
        if (!channelId) {
            lastChannel = null;
            seen.clear();
            return;
        }
        if (channelId !== lastChannel) {
            lastChannel = channelId;
            seen.clear();
            console.info(`[StaffDetector] watching ${channelId}`);
        }
        const me = UserStore.getCurrentUser()?.id;
        let states: Record<string, any> = {};
        try {
            states = VoiceStateStore.getVoiceStatesForChannel(channelId) ?? {};
        } catch {
            return;
        }
        const channel = ChannelStore.getChannel(channelId) as any;
        const guildId: string | undefined = channel?.guild_id;
        if (!guildId) return;

        // забываем ушедших: иначе повторный вход не считается входом
        const present = new Set(Object.keys(states));
        for (const id of seen) {
            if (!present.has(id)) seen.delete(id);
        }

        for (const userId of Object.keys(states)) {
            if (!userId || userId === me || seen.has(userId)) continue;
            seen.add(userId);
            let roleNames: string[] = [];
            try {
                const member = GuildMemberStore.getMember(guildId, userId);
                roleNames = (member?.roles ?? []).map(rid => {
                    try {
                        return getRole(guildId, rid)?.name ?? rid;
                    } catch {
                        return rid;
                    }
                });
            } catch { /* ignore */ }
            const hit = resolveStaff(guildId, userId);
            console.info(`[StaffDetector] join ${displayName(userId)} roles=[${roleNames.join(", ")}] -> ${hit ? `${hit.label} (${hit.perms.join(", ")})` : "not staff"}`);
            if (!hit) continue;
            console.info(`[StaffDetector] staff joined: ${displayName(userId)} (${hit.label})`);
            playAlert();
            showOverlay(userId, hit);
            showTopOverlay(userId, hit);
        }
    } catch (e) {
        console.error("[StaffDetector] scan failed", e);
    }
}

export default definePlugin({
    name: "StaffDetector",
    description: "Алерт когда в войс заходит стафф (админ/модер): звук + плавный оверлей с именем и ролью",
    tags: ["SudoCord", "Voice", "Utility"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    settings,

    start() {
        lastChannel = null;
        seen.clear();
        console.info("[StaffDetector] started, watching voice joins");
        timer = setInterval(scan, 2000);
        scan();
    },

    stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
        try {
            document.getElementById(OVERLAY_ID)?.remove();
        } catch { /* ignore */ }
        seen.clear();
    }
});
