/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 dsd16
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { Margins } from "@utils/margins";
import definePlugin, { OptionType, StartAt } from "@utils/types";
import { Forms } from "@webpack/common";

const logger = new Logger("SpoofPlatform", "#7289da");

const QUEST_USER_AGENT = "Mozilla/5.0 (Linux; Android 12L; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/39.2.0.0.56 Chrome/136.0.7103.177 SamsungBrowser/4.0 VR Safari/537.36";
const IOS_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21D61 Discord/263.0";
const ANDROID_USER_AGENT = "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36 Discord/263.0";

interface SpoofConfig {
    label: string;
    /** поля, которые подмешиваются в properties пакетов IDENTIFY / UPDATE PRESENCE */
    props: Record<string, string | number>;
}

/**
 * Что видят другие, зависит от поля properties.browser, которое клиент
 * отправляет серверу в gateway-пакете IDENTIFY при подключении:
 * - "Discord Client" + os → иконка ПК (Windows/Mac/Linux)
 * - "Chrome" и т.п. → иконка браузера
 * - "Discord iOS" / "Discord Android" → иконка телефона (+ «отправлено с iPhone»)
 * - "Discord Embedded" → статус embedded (иконка консоли Xbox/PlayStation)
 * - "Discord VR" → статус vr (иконка VR-шлема)
 * Для консоли и VR важен полный набор полей (browser_user_agent, client_build_number,
 * release_channel) — по документации Discord именно так представляется настоящий клиент.
 */
const PLATFORMS: Record<string, SpoofConfig> = {
    windows: {
        label: "ПК — Windows",
        props: { browser: "Discord Client", os: "Windows" },
    },
    macos: {
        label: "ПК — macOS",
        props: { browser: "Discord Client", os: "Mac" },
    },
    linux: {
        label: "ПК — Linux",
        props: { browser: "Discord Client", os: "Linux" },
    },
    ios: {
        label: "Телефон — iPhone (iOS)",
        props: {
            browser: "Discord iOS",
            os: "iOS",
            os_version: "18.3.2",
            browser_user_agent: IOS_USER_AGENT,
        },
    },
    android: {
        label: "Телефон — Android",
        props: {
            browser: "Discord Android",
            os: "Android",
            os_version: "35",
            browser_user_agent: ANDROID_USER_AGENT,
        },
    },
    web: {
        label: "Браузер (Chrome)",
        props: { browser: "Chrome" },
    },
    console: {
        label: "Консоль (иконка Xbox/PlayStation)",
        // полный набор полей как у настоящего embedded-клиента из документации
        props: {
            browser: "Discord Embedded",
            browser_user_agent: "Discord Embedded/0.0.8",
            browser_version: "0.0.8",
            client_build_number: 4440,
            release_channel: "unknown",
        },
    },
    vr: {
        label: "VR (Quest)",
        props: {
            browser: "Discord VR",
            os: "Android",
            os_version: "12L",
            browser_user_agent: QUEST_USER_AGENT,
        },
    },
};

const settings = definePluginSettings({
    platform: {
        type: OptionType.SELECT,
        description: "Устройство, которое будут видеть другие пользователи",
        restartNeeded: true,
        default: "windows",
        options: Object.entries(PLATFORMS).map(([value, p]) => ({
            label: p.label,
            value,
            default: value === "windows",
        })),
    },
});

type WsSend = (this: WebSocket, data: string | ArrayBufferLike | Blob | ArrayBufferView) => void;

let originalWsSend: WsSend | null = null;
let identifySpoofed = false;

/** Диагностика: пишется в консоль (Ctrl+Shift+I, фильтр SpoofPlatform) и показывается в настройках плагина */
const diag = {
    identifyBuiltCount: 0,
    lastIdentifyBuilt: null as string | null,
    fastConnectDisabled: false,
    wsInstalled: false,
    wsFramesRewritten: 0,
    lastWsEvent: null as string | null,
};

function getSpoofProps(source = "patch"): Record<string, string | number> {
    const { platform } = settings.store;
    const conf = PLATFORMS[platform];

    if (source === "patch") {
        diag.identifyBuiltCount++;
        diag.lastIdentifyBuilt = new Date().toLocaleTimeString();
    }

    if (!conf) {
        logger.warn(`[${source}] Неизвестная платформа «${platform}» — свойства подмешаны НЕ будут`);
        return {};
    }

    logger.info(`[${source}] Строится IDENTIFY, выбрана платформа «${platform}», подмешиваю:`, conf.props);
    return conf.props;
}

export default definePlugin({
    name: "SpoofPlatform",
    description: "Подменяет устройство, которое видят другие: ПК, телефон, браузер, консоль, VR",
    authors: [{ name: "dsd16", id: 0n }],
    settings,

    // стартуем как можно раньше — до раннего скрипта fast-connect,
    // иначе IDENTIFY уйдёт мимо нашего патча
    startAt: StartAt.Init,

    // используется патчем ниже через $self
    getSpoofProps,

    patches: [
        {
            // Основной механизм: патчим сборку IDENTIFY-пакета в gateway-менеджере.
            // Вебпак-патч применяется при загрузке модуля — гарантированно до
            // отправки пакета, поэтому спуф попадает в самое первое подключение.
            find: "_doIdentify(){",
            replacement: {
                // properties:ЗНАЧЕНИЕ,presence → properties:{...ЗНАЧЕНИЕ,...наши поля}
                match: /(\[IDENTIFY\].*let.{0,5}=\{.*properties:)(.*),presence/,
                replace: "$1{...$2,...$self.getSpoofProps()},presence"
            }
        }
    ],

    start() {
        if (originalWsSend) return;

        /**
         * Discord использует «fast connect»: ранний скрипт открывает gateway
         * WebSocket ещё до загрузки основного кода, кладёт его в window._ws,
         * и IDENTIFY уходит мимо основного модуля (минуя наш патч), причём
         * в бинарной кодировке ETF. Мы стартуем раньше этого скрипта, поэтому
         * просто гасим window._ws: без него fast-connect сразу выходит, и
         * клиент подключается обычным путём через _doIdentify — а его мы
         * уже патчим. Цена — чуть более медленное подключение к Discord.
         */
        const closeWs = (v: unknown) => {
            try {
                (v as { ws?: { close?: () => void; } })?.ws?.close?.();
            } catch { /* соединение уже закрыто — не важно */ }
        };

        const w = window as unknown as Record<string, unknown>;
        if (w._ws != null) {
            closeWs(w._ws);
            delete w._ws;
            logger.info("fast-connect: найден и закрыт ранний WebSocket");
        }

        Object.defineProperty(window, "_ws", {
            configurable: true,
            set(v) {
                closeWs(v);
            },
            get() {
                return undefined;
            }
        });
        diag.fastConnectDisabled = true;
        logger.info("fast-connect отключён — клиент пойдёт обычным путём через _doIdentify");

        /**
         * Запасной механизм: перехватываем нативный WebSocket.send для
         * JSON-кадров (op 2/3). В десктопе основной путь шлёт ETF, и спуф
         * применяется вебпак-патчем выше, а этот перехват страхует случаи,
         * когда кадр идёт JSON (например, web-сборка или фолбэк).
         */
        const proto = WebSocket.prototype as unknown as { send: WsSend; };
        originalWsSend = proto.send;

        proto.send = function (data) {
            if (typeof data === "string" && (data.includes("\"op\":2") || data.includes("\"op\":3"))) {
                try {
                    const frame = JSON.parse(data);
                    if (frame.op === 2 || frame.op === 3) {
                        const props = frame.d?.properties;
                        if (props && typeof props === "object") {
                            const before = String(props.browser);
                            Object.assign(props, getSpoofProps("ws"));
                            diag.wsFramesRewritten++;
                            if (frame.op === 2) {
                                identifySpoofed = true;
                                diag.lastWsEvent = `op2: browser «${before}» → «${props.browser}»`;
                                logger.info(`[ws] Перехвачен IDENTIFY, browser «${before}» → «${props.browser}»`);
                            } else {
                                diag.lastWsEvent = `op3: presence, browser → «${props.browser}»`;
                            }
                            data = JSON.stringify(frame);
                        }
                    }
                } catch (e) {
                    logger.warn("[ws] Не удалось разобрать кадр — отправляю как есть", e);
                }
            }
            return originalWsSend!.call(this, data);
        };

        diag.wsInstalled = true;
        logger.info(`Плагин запущен. Выбрана платформа: «${settings.store.platform}». WS-перехват установлен.`);
    },

    stop() {
        if (!originalWsSend) return;
        (WebSocket.prototype as unknown as { send: WsSend; }).send = originalWsSend;
        originalWsSend = null;
        identifySpoofed = false;
        diag.wsInstalled = false;
        try {
            delete (window as unknown as Record<string, unknown>)._ws;
        } catch { /* уже нет — не важно */ }
        logger.info("Плагин остановлен, WS-перехват снят");
    },

    settingsAboutComponent() {
        return (
            <>
                <Forms.FormText>
                    Платформа отправляется на сервер в момент подключения, поэтому после
                    включения плагина или смены устройства нужен перезапуск клиента
                    (Ctrl+R). Тогда все увидят рядом с твоим ником выбранную иконку —
                    в списке участников, профиле и у сообщений (если у людей включён
                    показ платформ).
                </Forms.FormText>
                <Forms.FormText className={Margins.top8}>
                    Свой зелёный кружок у своей аватарки не меняется — так устроен
                    Discord, свой статус всегда рисуется локально. Проверяй так:
                    «Настройки → Устройства» — текущая сессия должна отображаться
                    как выбранное устройство (например, «iOS • Discord iOS»).
                </Forms.FormText>
                <Forms.FormText className={Margins.top8}>
                    Бонусы: на «iPhone» к сообщениям добавляется пометка «отправлено с
                    iPhone», а «Консоль» показывает иконку геймпада как у игроков с
                    Xbox/PlayStation. VR — экспериментально.
                </Forms.FormText>

                <Forms.FormTitle className={Margins.top16}>Диагностика</Forms.FormTitle>
                <Forms.FormText>Выбранная платформа: «{String(settings.store.platform)}»</Forms.FormText>
                <Forms.FormText>
                    fast-connect отключён: {diag.fastConnectDisabled ? "да" : "НЕТ (старт был поздно!)"}
                </Forms.FormText>
                <Forms.FormText>
                    Патч IDENTIFY срабатывал: {diag.identifyBuiltCount} раз(а)
                    {diag.lastIdentifyBuilt ? ` (последний в ${diag.lastIdentifyBuilt})` : ""}
                </Forms.FormText>
                <Forms.FormText>
                    WS-перехват: {diag.wsInstalled ? "установлен" : "НЕ установлен"},
                    кадров переписано: {diag.wsFramesRewritten}
                    {diag.lastWsEvent ? `, последнее: ${diag.lastWsEvent}` : ""}
                </Forms.FormText>
                <Forms.FormText className={Margins.top8}>
                    Расшифровка: «патч срабатывал 0 раз» после переподключения — патч не
                    применяется; «платформа windows» при выбранном телефоне — настройка
                    не сохранилась. Подробные логи — в консоли (Ctrl+Shift+I), фильтр
                    «SpoofPlatform». Переоткрой эту страницу, чтобы обновить цифры.
                </Forms.FormText>
            </>
        );
    },
});
