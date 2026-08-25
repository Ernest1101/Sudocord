/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 dsd16
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { sendBotMessage } from "@api/Commands";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { Margins } from "@utils/margins";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { MessageFlags } from "@vencord/discord-types/enums";
import {
    ChannelStore,
    Forms,
    Menu,
    MessageCache,
    MessageStore,
    Modal,
    openModal,
    Select,
    SelectedChannelStore,
    SnowflakeUtils,
    UserStore,
    useState
} from "@webpack/common";

const DATA_KEY = "FakeMessages";
const logger = new Logger("FakeMessages", "#e5c07b");

interface FakeMessageData {
    id: string;
    content: string;
    authorId: string;
    createdAt: number;
}

/** channelId -> список фейков */
const fakeStore = new Map<string, FakeMessageData[]>();
let saveTimeout: ReturnType<typeof setTimeout> | undefined;
let idCounter = 0;

const settings = definePluginSettings({
    persist: {
        type: OptionType.BOOLEAN,
        description: "Сохранять фейковые сообщения после перезапуска Discord",
        default: true,
        restartNeeded: true,
    },
});

function nextFakeId(): string {
    // положительный снежинко-подобный id — сообщение всегда оказывается внизу списка
    return (BigInt(SnowflakeUtils.fromTimestamp(Date.now())) + BigInt(++idCounter % 100_000)).toString();
}

function isFake(channelId: string, messageId: string): boolean {
    return fakeStore.get(channelId)?.some(f => f.id === messageId) ?? false;
}

function scheduleSave() {
    if (!settings.store.persist) return;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        DataStore.set(DATA_KEY, Object.fromEntries(fakeStore))
            .catch(e => logger.error("Не удалось сохранить фейковые сообщения", e));
    }, 1000);
}

/** Вставляет фейк в реальный кэш сообщений клиента (локально, как обычное сообщение) */
function injectFake(channelId: string, data: FakeMessageData): boolean {
    const author = UserStore.getUser(data.authorId);
    if (!author) return false;
    try {
        sendBotMessage(channelId, {
            id: data.id,
            content: data.content,
            author,
            timestamp: new Date(data.createdAt),
            // без этого сообщение наследует флаг EPHEMERAL от Clyde-шаблона
            // и показывает плашку «Только вы видите это сообщение»
            flags: 0 as MessageFlags,
        });
        return true;
    } catch (e) {
        logger.error("Ошибка вставки фейкового сообщения", e);
        return false;
    }
}

/** Вставляет все фейки канала, которых ещё нет в кэше (безопасно вызывать повторно) */
function injectMissing(channelId: string) {
    const fakes = fakeStore.get(channelId);
    if (!fakes?.length) return;
    for (const f of fakes) {
        if (MessageStore.getMessage(channelId, f.id)) continue;
        injectFake(channelId, f);
    }
}

/** Восстанавливает фейки канала с задержками — пока Discord догружает историю и профили */
function restoreChannel(channelId: string) {
    if (!fakeStore.get(channelId)?.length) return;
    setTimeout(() => injectMissing(channelId), 500);
    setTimeout(() => injectMissing(channelId), 1500);
    setTimeout(() => injectMissing(channelId), 4000);
}

function addFakeMessage(channelId: string, authorId: string, content: string) {
    const data: FakeMessageData = {
        id: nextFakeId(),
        content,
        authorId,
        createdAt: Date.now(),
    };
    if (!injectFake(channelId, data)) return;
    const arr = fakeStore.get(channelId) ?? [];
    arr.push(data);
    fakeStore.set(channelId, arr);
    scheduleSave();
}

function deleteFake(channelId: string, messageId: string) {
    const arr = fakeStore.get(channelId);
    if (!arr) return;
    const next = arr.filter(f => f.id !== messageId);
    if (next.length) fakeStore.set(channelId, next);
    else fakeStore.delete(channelId);
    scheduleSave();
    try {
        const cache = MessageCache.getOrCreate(channelId);
        MessageCache.commit(cache.remove(messageId));
        MessageStore.emitChange();
    } catch (e) {
        logger.error("Ошибка удаления фейкового сообщения", e);
    }
}

function clearChannel(channelId: string) {
    const arr = fakeStore.get(channelId);
    if (!arr?.length) return;
    fakeStore.delete(channelId);
    scheduleSave();
    try {
        let cache = MessageCache.getOrCreate(channelId);
        for (const f of arr) cache = cache.remove(f.id);
        MessageCache.commit(cache);
        MessageStore.emitChange();
    } catch (e) {
        logger.error("Ошибка очистки фейковых сообщений", e);
    }
}

function getAuthorOptions(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    const me = UserStore.getCurrentUser();
    const options: { label: string; value: string; }[] = [];

    for (const id of channel?.recipients ?? []) {
        const u = UserStore.getUser(id);
        if (!u) continue;
        if (me && u.id === me.id) continue;
        options.push({ label: u.globalName || u.username, value: u.id });
    }

    // себя добавляем последним — вдруг захочется написать «от себя»
    if (me) options.push({ label: `${me.globalName || me.username} (это вы)`, value: me.id });

    return options;
}

function FakeMessageModal(props: RenderModalProps & { channelId: string; }) {
    const [content, setContent] = useState("");
    const options = getAuthorOptions(props.channelId);
    const [authorId, setAuthorId] = useState(options[0]?.value ?? "");

    return (
        <Modal
            {...props}
            title="Фейковое сообщение"
            actions={[{
                text: "Создать",
                variant: "primary",
                onClick: () => {
                    const text = content.trim();
                    if (!text || !authorId) return;
                    addFakeMessage(props.channelId, authorId, text);
                    props.onClose();
                }
            }]}
        >
            {options.length > 1 && (
                <>
                    <Forms.FormTitle>От имени</Forms.FormTitle>
                    <Select
                        options={options}
                        isSelected={v => v === authorId}
                        select={setAuthorId}
                        serialize={v => v}
                        className={Margins.bottom16}
                    />
                </>
            )}

            <Forms.FormTitle>Сообщение</Forms.FormTitle>
            <textarea
                value={content}
                onChange={e => setContent(e.currentTarget.value)}
                rows={4}
                autoFocus
                placeholder="Что «напишет» этот человек…"
                style={{
                    width: "100%",
                    resize: "vertical",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "none",
                    background: "var(--background-secondary)",
                    color: "var(--text-normal)",
                    font: "inherit",
                    boxSizing: "border-box",
                }}
            />

            <Forms.FormText className={Margins.top8}>
                Сообщение появится в этом чате как настоящее, но увидите его только вы —
                собеседнику ничего не придёт.
            </Forms.FormText>
        </Modal>
    );
}

const FakeMessagesIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg
        width={width}
        height={height}
        className={className}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
    >
        <path d="M9.5 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        <path d="M9.5 13C5.9 13 3 15 3 17.5V20h13v-2.5C16 15 13.1 13 9.5 13Z" />
        <path d="M17.6 2.9c.44 0 .8.36.8.8v1.5h1.5a.8.8 0 1 1 0 1.6h-1.5v1.5a.8.8 0 1 1-1.6 0V6.8h-1.5a.8.8 0 1 1 0-1.6h1.5V3.7c0-.44.36-.8.8-.8Z" />
    </svg>
);

const FakeMessagesButton: ChatBarButtonFactory = ({ isAnyChat, channel }) => {
    if (!isAnyChat) return null;
    // только личные ЛС (1) и групповые ЛС (3)
    if (channel?.type !== 1 && channel?.type !== 3) return null;

    return (
        <ChatBarButton
            tooltip="Фейковое сообщение от собеседника"
            buttonProps={{ "aria-haspopup": "dialog" }}
            onClick={() => openModal(props => <FakeMessageModal {...props} channelId={channel.id} />)}
        >
            <FakeMessagesIcon />
        </ChatBarButton>
    );
};

const patchMessageContextMenu: NavContextMenuPatchCallback = (children, props) => {
    const message = props?.message;
    if (!message?.id || !message.channel_id) return;

    const channelFakes = fakeStore.get(message.channel_id) ?? [];
    if (!isFake(message.channel_id, message.id) && channelFakes.length === 0) return;

    if (isFake(message.channel_id, message.id)) {
        children.push((
            <Menu.MenuItem
                id="vc-fake-messages-delete"
                key="vc-fake-messages-delete"
                label="Удалить фейковое сообщение"
                color="danger"
                action={() => deleteFake(message.channel_id, message.id)}
            />
        ));
    }

    if (channelFakes.length > 0) {
        children.push((
            <Menu.MenuItem
                id="vc-fake-messages-clear"
                key="vc-fake-messages-clear"
                label={`Удалить все фейковые (${channelFakes.length})`}
                action={() => clearChannel(message.channel_id)}
            />
        ));
    }
};

export default definePlugin({
    name: "FakeMessages",
    description: "Пишите визуальные сообщения от имени собеседника в ЛС — видно только вам",
    authors: [{ name: "dsd16", id: 0n }], tags: ["SudoCord", "Trolling"],
    settings,

    chatBarButton: {
        icon: FakeMessagesIcon,
        render: FakeMessagesButton,
    },

    contextMenus: {
        "message": patchMessageContextMenu,
    },

    flux: {
        CHANNEL_SELECT({ channelId }) {
            if (channelId) restoreChannel(channelId);
        },
    },

    async start() {
        if (settings.store.persist) {
            try {
                const data = await DataStore.get<Record<string, FakeMessageData[]>>(DATA_KEY);
                if (data) {
                    for (const [channelId, arr] of Object.entries(data)) {
                        if (Array.isArray(arr) && arr.length) fakeStore.set(channelId, arr);
                    }
                }
            } catch (e) {
                logger.error("Не удалось загрузить сохранённые фейковые сообщения", e);
            }
        }

        // если плагин включили, когда чат уже открыт
        const current = SelectedChannelStore.getChannelId();
        if (current) restoreChannel(current);
    },

    stop() {
        clearTimeout(saveTimeout);
    },

    settingsAboutComponent() {
        return (
            <>
                <Forms.FormText>
                    Нажмите иконку «человек с плюсом» в панели ввода в ЛС, выберите от кого и
                    напишите текст — сообщение появится в чате как настоящее.
                </Forms.FormText>
                <Forms.FormText className={Margins.top8}>
                    Это чисто визуал: сообщение существует только в вашем клиенте, никуда не
                    отправляется и переживает переключение каналов (а с включённой настройкой — и
                    перезапуск Discord).
                </Forms.FormText>
                <Forms.FormText className={Margins.top8}>
                    Удалить можно через правый клик по сообщению → «Удалить фейковое сообщение».
                </Forms.FormText>
            </>
        );
    },
});
