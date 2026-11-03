/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import { Button } from "@components/Button";
import { HeadingPrimary } from "@components/Heading";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import { deleteQuickMessage, getQuickMessages, loadQuickMessages, QuickMessage, saveQuickMessage, subscribe } from "@nightcordplugins/quickMessages/store";
import { insertTextIntoChatInputBox, sendMessage } from "@utils/discord";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot } from "@utils/modal";
import { Channel } from "@vencord/discord-types";
import { findStoreLazy } from "@webpack";
import { TextArea, TextInput, useEffect, useMemo, useState } from "@webpack/common";

import { EditIcon, InsertIcon, PlusIcon, QuickMessagesIcon, SendIcon, TrashIcon } from "./Icons";

const ChannelStore = findStoreLazy("ChannelStore");
const SelectedChannelStore = findStoreLazy("SelectedChannelStore");

function getActiveChannel(provided?: Channel | null): Channel | null {
    if (provided) return provided;
    try {
        const curId = SelectedChannelStore?.getChannelId?.();
        return curId ? ChannelStore?.getChannel?.(curId) : null;
    } catch {
        return null;
    }
}

export function QuickMessagesModal({
    rootProps,
    channel,
    autoCloseOnSend = true
}: {
    rootProps: ModalProps;
    channel?: Channel | null;
    autoCloseOnSend?: boolean;
}) {
    const [messages, setMessages] = useState<QuickMessage[]>(getQuickMessages());
    const [searchQuery, setSearchQuery] = useState("");
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formTitle, setFormTitle] = useState("");
    const [formContent, setFormContent] = useState("");
    const [statusNotice, setStatusNotice] = useState<string | null>(null);

    useEffect(() => {
        loadQuickMessages().then(list => setMessages(list));
        const unsub = subscribe(() => {
            setMessages(getQuickMessages());
        });
        return unsub;
    }, []);

    const filteredMessages = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return messages;
        return messages.filter(
            m => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q)
        );
    }, [messages, searchQuery]);

    const activeChannel = useMemo(() => getActiveChannel(channel), [channel]);

    function handleStartCreate() {
        setEditingId(null);
        setFormTitle("");
        setFormContent("");
        setIsFormOpen(true);
    }

    function handleStartEdit(msg: QuickMessage) {
        setEditingId(msg.id);
        setFormTitle(msg.title);
        setFormContent(msg.content);
        setIsFormOpen(true);
    }

    function handleCancelForm() {
        setIsFormOpen(false);
        setEditingId(null);
        setFormTitle("");
        setFormContent("");
    }

    async function handleSaveForm() {
        if (!formTitle.trim() || !formContent.trim()) return;
        await saveQuickMessage({
            id: editingId || undefined,
            title: formTitle,
            content: formContent
        });
        setIsFormOpen(false);
        setEditingId(null);
        setFormTitle("");
        setFormContent("");
    }

    async function handleSend(msg: QuickMessage) {
        const target = getActiveChannel(channel);
        if (!target) {
            setStatusNotice(t("No active channel found to send this message."));
            return;
        }
        try {
            sendMessage(target.id, { content: msg.content });
            if (autoCloseOnSend) {
                rootProps.onClose();
            } else {
                setStatusNotice(t("Message sent successfully."));
                setTimeout(() => setStatusNotice(null), 3000);
            }
        } catch (e) {
            console.error("[QuickMessages] Failed to send message:", e);
            setStatusNotice(t("Failed to send message."));
        }
    }

    function handleInsert(msg: QuickMessage) {
        try {
            insertTextIntoChatInputBox(msg.content);
            rootProps.onClose();
        } catch (e) {
            console.error("[QuickMessages] Failed to insert text:", e);
        }
    }

    return (
        <ModalRoot {...rootProps} size="medium" className="nc-qm-modal theme-dark">
            <ModalHeader className="nc-qm-header">
                <div className="nc-qm-title-row">
                    <div className="nc-qm-header-icon">
                        <QuickMessagesIcon width={22} height={22} color="var(--brand-500)" />
                    </div>
                    <HeadingPrimary className="nc-qm-modal-title">{t("Quick Messages")}</HeadingPrimary>
                </div>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>

            <ModalContent className="nc-qm-content">
                <div className="nc-qm-search-bar-row">
                    <div className="nc-qm-search-input-wrap">
                        <TextInput
                            placeholder={t("Search quick messages...")}
                            value={searchQuery}
                            onChange={setSearchQuery}
                        />
                    </div>
                    {!isFormOpen && (
                        <Button
                            size="small"
                            variant="primary"
                            onClick={handleStartCreate}
                            className="nc-qm-action-btn"
                        >
                            <PlusIcon width={14} height={14} />
                            {t("New Preset")}
                        </Button>
                    )}
                </div>

                {statusNotice && (
                    <div style={{ color: "var(--brand-500)", fontSize: "13px", padding: "4px 8px" }}>
                        {statusNotice}
                    </div>
                )}

                {isFormOpen && (
                    <div className="nc-qm-form-card">
                        <div className="nc-qm-form-title">
                            {editingId ? t("Edit Quick Message") : t("New Quick Message")}
                        </div>
                        <TextInput
                            placeholder={t("Title (e.g. Server Rules, Welcome Greeting...)")}
                            value={formTitle}
                            onChange={setFormTitle}
                        />
                        <TextArea
                            placeholder={t("Message content to send or paste...")}
                            value={formContent}
                            onChange={setFormContent}
                            rows={4}
                        />
                        <div className="nc-qm-form-actions">
                            <Button
                                size="small"
                                variant="secondary"
                                onClick={handleCancelForm}
                            >
                                {t("Cancel")}
                            </Button>
                            <Button
                                size="small"
                                variant="primary"
                                disabled={!formTitle.trim() || !formContent.trim()}
                                onClick={handleSaveForm}
                            >
                                {editingId ? t("Save Changes") : t("Create Message")}
                            </Button>
                        </div>
                    </div>
                )}

                <div className="nc-qm-list">
                    {filteredMessages.length === 0 ? (
                        <div className="nc-qm-empty">
                            <QuickMessagesIcon width={36} height={36} color="var(--text-muted)" />
                            <div className="nc-qm-empty-title">{t("No quick messages found")}</div>
                            <div className="nc-qm-empty-desc">
                                {searchQuery
                                    ? t("No messages match your search query.")
                                    : t("Create your first preset to send it instantly with a single click.")}
                            </div>
                            {!isFormOpen && (
                                <Button
                                    size="small"
                                    variant="primary"
                                    onClick={handleStartCreate}
                                    style={{ marginTop: "8px" }}
                                >
                                    {t("Create Preset")}
                                </Button>
                            )}
                        </div>
                    ) : (
                        filteredMessages.map(item => (
                            <div key={item.id} className="nc-qm-card">
                                <div className="nc-qm-card-header">
                                    <div className="nc-qm-card-title">{item.title}</div>
                                    <div className="nc-qm-card-actions">
                                        <Button
                                            size="small"
                                            variant="primary"
                                            onClick={() => handleSend(item)}
                                            className="nc-qm-action-btn"
                                            title={t("Send message to current channel")}
                                        >
                                            <SendIcon width={13} height={13} />
                                            {t("Send")}
                                        </Button>
                                        <Button
                                            size="small"
                                            variant="secondary"
                                            onClick={() => handleInsert(item)}
                                            className="nc-qm-action-btn"
                                            title={t("Paste message into text box")}
                                        >
                                            <InsertIcon width={13} height={13} />
                                            {t("Insert")}
                                        </Button>
                                        <Button
                                            size="small"
                                            variant="secondary"
                                            onClick={() => handleStartEdit(item)}
                                            title={t("Edit")}
                                        >
                                            <EditIcon width={13} height={13} />
                                        </Button>
                                        <Button
                                            size="small"
                                            variant="danger"
                                            onClick={() => deleteQuickMessage(item.id)}
                                            title={t("Delete")}
                                        >
                                            <TrashIcon width={13} height={13} />
                                        </Button>
                                    </div>
                                </div>
                                <div className="nc-qm-card-body">{item.content}</div>
                            </div>
                        ))
                    )}
                </div>
            </ModalContent>

            <ModalFooter className="nc-qm-footer">
                <div className="nc-qm-footer-info">
                    {messages.length} {messages.length === 1 ? t("preset saved") : t("presets saved")}
                </div>
                <Button size="small" variant="secondary" onClick={rootProps.onClose}>
                    {t("Close")}
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}
