/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Safe mode dialog, opened from the safe mode notification. Doesn't depend on any plugin patch
// (NoticesAPI may itself be broken by a Discord update), only on Discord's modal components.

import { Button } from "@components/Button";
import { openSettingsTabModal, UpdaterTab } from "@components/settings";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { relaunch } from "@utils/native";
import { clearSafeMode } from "@utils/safeMode";
import type { RenderModalProps } from "@vencord/discord-types";

function SafeModeModal(props: RenderModalProps) {
    return (
        <ModalRoot {...props} size={ModalSize.SMALL}>
            <ModalHeader separator={false}>
                <span style={{ flexGrow: 1, fontSize: 20, fontWeight: 700, color: "var(--header-primary, #f2f3f5)" }}>
                    SudoCord safe mode
                </span>
                <ModalCloseButton onClick={props.onClose} />
            </ModalHeader>
            <ModalContent>
                <div style={{ padding: "4px 0 16px", color: "var(--text-normal, #dbdee1)", lineHeight: 1.45, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div>Discord failed to load twice in a row, so SudoCord started with plugins turned off. Your plugin settings are not changed.</div>
                    <div>Update SudoCord first: installing an update leaves safe mode on its own. If there is no update, exit safe mode to turn your plugins back on.</div>
                </div>
            </ModalContent>
            <ModalFooter>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, width: "100%" }}>
                    <Button variant="secondary" onClick={() => { clearSafeMode(); relaunch(); }}>
                        Exit safe mode
                    </Button>
                    <Button onClick={() => { props.onClose(); openSettingsTabModal(UpdaterTab!); }}>
                        Check for updates
                    </Button>
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

export function openSafeModeModal() {
    openModal(props => <SafeModeModal {...props} />);
}
