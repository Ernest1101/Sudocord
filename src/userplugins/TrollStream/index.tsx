/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 dsd16
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import { findAll } from "@webpack";
import { ChannelStore, SelectedChannelStore, useState } from "@webpack/common";

const logger = new Logger("TrollStream", "#faa61a");

type StreamFn = (...args: any[]) => void;

/** настоящий запуск демонстрации экрана (то же, что кнопка «Демонстрация») */
let startStream: StreamFn | null = null;
/** остановка своей активной демонстрации */
let stopCurrentStream: StreamFn | null = null;
let resolved = false;

/**
 * Ищем модуль действий стрима ЛЕНИВО — при первом запуске тролля.
 * findAll перебирает исполненные модули: у нужного нам экспорт — объект,
 * среди значений которого есть функции (поэтому findByCode не подходит —
 * он ищет только модули-функции).
 */
function resolveStreamFunctions(): boolean {
    if (resolved) return true;
    try {
        const mods = findAll(exports => {
            if (typeof exports !== "object" || exports === null) return false;
            for (const key of Object.keys(exports)) {
                try {
                    const v = (exports as Record<string, unknown>)[key];
                    if (typeof v === "function" && v.toString().includes("STREAM_START")) return true;
                } catch { /* пропускаем нечитаемые экспорты */ }
            }
            return false;
        });

        const mod = mods[0] as Record<string, unknown> | undefined;
        if (mod) {
            for (const key of Object.keys(mod)) {
                try {
                    const v = mod[key];
                    if (typeof v !== "function") continue;
                    const src = v.toString();
                    if (startStream == null && src.includes("STREAM_START")) startStream = v as StreamFn;
                    if (stopCurrentStream == null && src.includes("getCurrentUserActiveStream")) stopCurrentStream = v as StreamFn;
                } catch { /* пропускаем нечитаемые экспорты */ }
            }
        }
    } catch (e) {
        logger.error("Не удалось найти модуль действий стрима", e);
    }

    if (startStream != null && stopCurrentStream != null) {
        resolved = true;
        logger.info("Функции стрима найдены");
        return true;
    }
    return false;
}

const settings = definePluginSettings({
    interval: {
        type: OptionType.NUMBER,
        description: "Пауза между вкл/выкл в мс (реальному стриму нужно время подключиться — меньше 1000 не советую)",
        default: 1500,
    },
});

let running = false;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function trollLoop() {
    const interval = Math.max(500, settings.store.interval);
    logger.info(`Тролль запущен, интервал ${interval} мс`);

    while (running) {
        const channelId = SelectedChannelStore.getVoiceChannelId();
        if (!channelId) {
            logger.info("Вышел из голосового канала — останавливаюсь");
            break;
        }
        const channel = ChannelStore.getChannel(channelId);

        try {
            startStream?.(channel?.guild_id ?? null, channelId);
        } catch (e) {
            logger.error("Не удалось запустить демонстрацию", e);
        }

        await sleep(interval);
        if (!running) break;

        try {
            stopCurrentStream?.();
        } catch (e) {
            logger.error("Не удалось остановить демонстрацию", e);
        }

        await sleep(interval);
    }

    running = false;
}

function startTroll(): boolean {
    if (running) return true;
    if (!SelectedChannelStore.getVoiceChannelId()) return false;
    if (!resolveStreamFunctions()) {
        logger.error("Не найдены функции запуска/остановки стрима — Discord обновился или модуль ещё не загружен, попробуй ещё раз");
        return false;
    }
    running = true;
    void trollLoop();
    return true;
}

function stopTroll() {
    running = false;
    try {
        stopCurrentStream?.();
    } catch { /* стрим уже выключен — не важно */ }
    logger.info("Тролль остановлен");
}

const TrollStreamIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg
        width={width}
        height={height}
        className={className}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
    >
        {/* экран с молнией — «стрим» */}
        <path d="M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-7v2h3a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2h3v-2H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 2v9h16V6H4Z" />
        <path d="M13.2 7.4 9.4 11.2h2l-.8 3 3.8-3.8h-2l.8-3Z" />
    </svg>
);

const TrollStreamButton: ChatBarButtonFactory = ({ isAnyChat }) => {
    const [active, setActive] = useState(running);
    if (!isAnyChat) return null;

    return (
        <ChatBarButton
            tooltip={active
                ? "😈 Остановить тролль-демонстрацию"
                : "😈 Тролль: быстро включать/выключать демонстрацию экрана"}
            onClick={() => {
                const nowActive = running
                    ? (stopTroll(), false)
                    : startTroll();
                setActive(nowActive);
            }}
        >
            <span style={active ? { color: "#ed4245" } : undefined}>
                <TrollStreamIcon />
            </span>
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "TrollStream",
    description: "Кнопка в чате — по-настоящему включает и выключает демонстрацию экрана бесконечно (видят все)",
    authors: [{ name: "dsd16", id: 0n }], tags: ["SudoCord", "Trolling"],
    settings,

    chatBarButton: {
        icon: TrollStreamIcon,
        render: TrollStreamButton,
    },

    stop() {
        stopTroll();
    },

    settingsAboutComponent() {
        return (
            <span>
                Нажми кнопку с молнией в панели ввода — демонстрация экрана начнёт
                по-настоящему включаться и выключаться бесконечно: у всех в канале
                плитка стрима и уведомления будут появляться и пропадать.
                Повторное нажатие останавливает, при выходе из войса троллинг
                останавливается сам.<br /><br />
                <b>Важно:</b> сначала один раз запусти демонстрацию вручную и
                останови её — Discord запомнит источник экрана и качество, и
                тролль сможет включать её сам. Интервал по умолчанию 1500 мс:
                реальному стриму нужно время на подключение.
            </span>
        );
    },
});
