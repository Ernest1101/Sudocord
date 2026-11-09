/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps } from "@webpack";
import { GuildStore, PermissionsBits, PermissionStore, UserStore } from "@webpack/common";

const logger = new Logger("FakeAdmin");

const settings = definePluginSettings({
    modifyCan: {
        type: OptionType.BOOLEAN,
        description: "Подменять проверки прав PermissionStore (can, доступ к настройкам, управление участниками). Просмотр каналов не трогается",
        default: true,
        onChange: refresh
    },
    modifyGuildPerms: {
        type: OptionType.BOOLEAN,
        description: "Добавлять в PermissionStore.getGuildPermissions все права, кроме просмотра каналов",
        default: true,
        onChange: refresh
    },
    spoofOwner: {
        type: OptionType.BOOLEAN,
        description: "Показывать тебя владельцем сервера (подмена ownerId)",
        default: true,
        onChange: refresh
    }
});

// Проверки интерфейса, которые для тебя всегда true. Методы, которых в текущем Discord нет, пропускаются
const ALWAYS_TRUE_METHODS = [
    "canAccessGuildSettings",
    "canAccessMemberSafetyPage",
    "canImpersonateRole",
    "canManageUser",
    "canAccessChannel",
    "canAccessGuildAnalytics",
    "canAccessGuildExpressions"
];

type AnyFn = (...args: any[]) => any;

// Оригиналы и то, были ли методы собственными свойствами объекта (у сторов они обычно на прототипе)
const patches: { target: any; key: string; original: AnyFn; hadOwn: boolean; }[] = [];

function patchMethod(target: any, key: string, makeReplacement: (original: AnyFn) => AnyFn) {
    const original = target?.[key];
    if (typeof original !== "function") {
        logger.info(`Метода ${key} нет, пропускаю`);
        return;
    }

    patches.push({ target, key, original, hadOwn: Object.hasOwn(target, key) });
    target[key] = makeReplacement(original);
}

function restoreMethods() {
    for (const { target, key, original, hadOwn } of patches.reverse()) {
        if (hadOwn) target[key] = original;
        else delete target[key];
    }
    patches.length = 0;
}

const getMyId = () => UserStore.getCurrentUser()?.id;

function isCurrentUser(userId?: string) {
    return userId == null || userId === getMyId();
}

// VIEW_CHANNEL отдаём настоящим: иначе появятся скрытые каналы, и клиент будет открывать их с 403.
// can получает bigint, canBasicChannel — число из того же набора битов
function touchesViewChannel(permission: unknown) {
    if (typeof permission === "bigint") return (permission & PermissionsBits.VIEW_CHANNEL) !== 0n;
    if (typeof permission === "number") return (BigInt(permission) & PermissionsBits.VIEW_CHANNEL) !== 0n;
    return false;
}

// ---------- Подмена владельца ----------

// Гильдии в сторе не меняем: отдаём Proxy, который читает всё из оригинала вживую и подменяет только ownerId.
// Proxy кэшируется по исходному объекту, поэтому getGuild возвращает один и тот же объект, пока стор не заменит
// гильдию (иначе подписанные на стор компоненты перерисовывались бы бесконечно). Новая гильдия от стора сразу
// получает свой Proxy, так что подмена переживает обновления без отдельного слушателя
let spoofedGuilds = new WeakMap<object, any>();
let spoofedGuildMaps = new WeakMap<object, any>();

function spoofGuild(guild: any) {
    if (!settings.store.spoofOwner || guild == null || typeof guild !== "object" || !getMyId()) return guild;

    let proxy = spoofedGuilds.get(guild);
    if (!proxy) {
        // у замороженного объекта Proxy не может вернуть другой ownerId, поэтому для него делаем копию
        proxy = Object.isFrozen(guild)
            ? Object.defineProperty(Object.assign(Object.create(Object.getPrototypeOf(guild)), guild), "ownerId", { get: getMyId, enumerable: true })
            : new Proxy(guild, { get: (target, key, receiver) => key === "ownerId" ? getMyId() ?? target.ownerId : Reflect.get(target, key, receiver) });
        spoofedGuilds.set(guild, proxy);
    }
    return proxy;
}

function spoofGuildMap(guilds: any) {
    if (!settings.store.spoofOwner || guilds == null || typeof guilds !== "object" || Object.isFrozen(guilds)) return guilds;

    let proxy = spoofedGuildMaps.get(guilds);
    if (!proxy) {
        proxy = new Proxy(guilds, { get: (target, key, receiver) => spoofGuild(Reflect.get(target, key, receiver)) });
        spoofedGuildMaps.set(guilds, proxy);
    }
    return proxy;
}

function refresh() {
    // новые объекты после переключения, чтобы компоненты увидели изменение
    spoofedGuilds = new WeakMap();
    spoofedGuildMaps = new WeakMap();
    PermissionStore?.emitChange();
    GuildStore?.emitChange();
}

export default definePlugin({
    name: "FakeAdmin",
    description: "Spoofs permissions and server ownership through PermissionStore and GuildStore to open the admin interface. Only on your client: the server still rejects actions you have no rights for",
    descriptionLocales: { ru: "Подменяет права и владельца сервера через PermissionStore и GuildStore, открывая интерфейс администратора. Только на твоём клиенте, сервер реальные действия без прав отклонит" },
    tags: ["SudoCord", "Trolling"],
    authors: [{ name: "dsd16", id: 0n }],

    settings,

    start() {
        // ---------- PermissionStore ----------

        patchMethod(PermissionStore, "can", original => function (this: unknown, ...args: any[]) {
            const [permission, , , , userId] = args;
            if (settings.store.modifyCan && !touchesViewChannel(permission) && isCurrentUser(userId)) return true;
            return original.apply(this, args);
        });

        patchMethod(PermissionStore, "canBasicChannel", original => function (this: unknown, ...args: any[]) {
            const [permission, , , , userId] = args;
            if (settings.store.modifyCan && !touchesViewChannel(permission) && isCurrentUser(userId)) return true;
            return original.apply(this, args);
        });

        patchMethod(PermissionStore, "canWithPartialContext", original => function (this: unknown, ...args: any[]) {
            if (settings.store.modifyCan && !touchesViewChannel(args[0])) return true;
            return original.apply(this, args);
        });

        for (const key of ALWAYS_TRUE_METHODS) {
            patchMethod(PermissionStore, key, original => function (this: unknown, ...args: any[]) {
                if (settings.store.modifyCan) return true;
                return original.apply(this, args);
            });
        }

        patchMethod(PermissionStore, "getGuildPermissions", original => function (this: unknown, ...args: any[]) {
            const real = original.apply(this, args);
            if (!settings.store.modifyGuildPerms) return real;
            return (typeof real === "bigint" ? real : 0n) | ~PermissionsBits.VIEW_CHANNEL;
        });

        // ---------- GuildStore: владелец ----------

        patchMethod(GuildStore, "getGuild", original => function (this: unknown, ...args: any[]) {
            return spoofGuild(original.apply(this, args));
        });

        patchMethod(GuildStore, "getGuilds", original => function (this: unknown, ...args: any[]) {
            return spoofGuildMap(original.apply(this, args));
        });

        // В текущем Discord у Guild нет isOwner: владельца проверяют отдельной функцией по ownerId.
        // Если методы появятся на прототипе, подменяем их только для тебя, чтобы корона не оказалась у всех
        const anyGuild = Object.values(GuildStore.getGuilds() ?? {})[0];
        const guildProto = anyGuild && Object.getPrototypeOf(anyGuild);
        if (guildProto && guildProto !== Object.prototype) {
            for (const key of ["isOwner", "isOwnerWithRequiredMfaLevel"]) {
                if (typeof guildProto[key] !== "function") continue;
                patchMethod(guildProto, key, original => function (this: unknown, ...args: any[]) {
                    if (settings.store.spoofOwner && isCurrentUser(args[0])) return true;
                    return original.apply(this, args);
                });
            }
        }

        // ---------- Шаблоны гильдии ----------

        // checkGuildTemplateDirty после действий с каналами и ролями запрашивает шаблоны и сразу читает
        // body.length. На 403 отдаём пустой список, чтобы ошибка не вылетала как Uncaught (in promise)
        try {
            const GuildTemplateActions = findByProps("loadTemplatesForGuild", "createGuildTemplate");
            patchMethod(GuildTemplateActions, "loadTemplatesForGuild", original => function (this: unknown, ...args: any[]) {
                return Promise.resolve()
                    .then(() => original.apply(this, args))
                    .catch(err => {
                        if (err?.status !== 403) throw err;
                        return { body: [] };
                    });
            });
        } catch (e) {
            logger.warn("Модуль шаблонов гильдии не найден, обёртка не установлена", e);
        }

        refresh();
    },

    stop() {
        restoreMethods();
        refresh();
    }
});
