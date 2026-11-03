/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import { Button } from "@components/Button";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot } from "@utils/modal";
import { PendingReplyStore, React, TextArea } from "@webpack/common";

import { generateAndInsertReply } from "./generator";
import { AlwaysRightIcon } from "./Icon";

export function AlwaysRightModal({
    rootProps,
    channel,
}: {
    rootProps: ModalProps;
    channel: any;
}) {
    const [guidance, setGuidance] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);

    const pendingReply = PendingReplyStore?.getPendingReply?.(channel?.id);
    const targetMsg = pendingReply?.message;

    const presetChips = [
        t("Contradict them"),
        t("Prove them wrong"),
        t("Agree & expand"),
        t("Narcissistic & sharp"),
        t("Explain simply"),
    ];

    const handleSubmit = async () => {
        if (submitting) return;
        setSubmitting(true);
        rootProps.onClose();
        await generateAndInsertReply(channel, guidance, targetMsg);
    };

    const handleKeyDown = (e: React.KeyboardEvent<any>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false} style={{ padding: "20px 24px 12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <AlwaysRightIcon width={22} height={22} color="var(--brand-500)" />
                        <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--header-primary, #ffffff)" }}>
                            {t("AlwaysRight Prompt")}
                        </span>
                    </div>
                    <span style={{ fontSize: "13px", color: "var(--text-muted, #949ba4)", lineHeight: 1.4 }}>
                        {t("Enter specific instructions or guidance for this response before generating (e.g. 'contradict them', 'prove them wrong').")}
                    </span>
                </div>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>

            <ModalContent style={{ padding: "12px 24px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                {targetMsg && (
                    <div style={{
                        padding: "8px 12px",
                        borderRadius: "6px",
                        backgroundColor: "var(--background-secondary, #2b2d31)",
                        borderLeft: "3px solid var(--brand-500)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2
                    }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--brand-500)", textTransform: "uppercase" }}>
                            {t("Replying to message")}
                        </span>
                        <span style={{ fontSize: "13px", color: "var(--text-normal, #dbdee1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            <strong style={{ color: "#ffffff" }}>@{targetMsg.author?.username || "User"}:</strong> {targetMsg.content || "[Media]"}
                        </span>
                    </div>
                )}

                <TextArea
                    placeholder={t("Additional instructions (e.g. 'contradict them', 'prove them wrong', 'explain with facts')...")}
                    value={guidance}
                    onChange={setGuidance}
                    onKeyDown={handleKeyDown}
                    rows={4}
                    autoFocus
                />

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted, #949ba4)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {t("Quick Suggestions")}
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {presetChips.map(chip => (
                            <button
                                key={chip}
                                type="button"
                                onClick={() => setGuidance(prev => prev ? `${prev}, ${chip}` : chip)}
                                style={{
                                    background: "rgba(255, 255, 255, 0.06)",
                                    border: "1px solid rgba(255, 255, 255, 0.12)",
                                    borderRadius: "16px",
                                    padding: "6px 12px",
                                    fontSize: "12px",
                                    fontWeight: 500,
                                    color: "var(--text-normal, #dbdee1)",
                                    cursor: "pointer",
                                    transition: "background 0.15s ease, border-color 0.15s ease",
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.12)";
                                    e.currentTarget.style.borderColor = "var(--brand-500)";
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)";
                                }}
                            >
                                {chip}
                            </button>
                        ))}
                    </div>
                </div>
            </ModalContent>

            <ModalFooter style={{ padding: "16px 24px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <Button
                    variant="secondary"
                    size="small"
                    onClick={rootProps.onClose}
                >
                    {t("Cancel")}
                </Button>
                <Button
                    variant="primary"
                    size="small"
                    onClick={handleSubmit}
                >
                    {t("Generate Reply")}
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}
