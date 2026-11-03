/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Nightcord Team
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import "./styles.css";

import { ApplicationCommandInputType } from "@api/Commands";
import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import definePlugin, { OptionType } from "@utils/types";

import { openTotpModal, TotpSettingsPanel } from "./components";
import { startMfaModalObserver, stopMfaModalObserver } from "./mfaModalObserver";

function ShieldKeyHeaderIcon({ width = 22, height = 22 }: { width?: number; height?: number }) {
    return (
        <svg aria-hidden="true" role="img" width={width} height={height} viewBox="0 0 24 24" fill="none">
            <path
                d="M12 2L4 5V11.09C4 16.14 7.41 20.85 12 22C16.59 20.85 20 16.14 20 11.09V5L12 2Z"
                fill="currentColor"
                opacity="0.2"
            />
            <path
                d="M12 2L4 5V11.09C4 16.14 7.41 20.85 12 22C16.59 20.85 20 16.14 20 11.09V5L12 2Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M12 8V12M12 16H12.01"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function TotpHeaderButton() {
    return (
        <HeaderBarButton
            icon={ShieldKeyHeaderIcon}
            tooltip={t("Nightcord 2FA Authenticator")}
            onClick={openTotpModal}
        />
    );
}

export default definePlugin({
    name: "TotpManager",
    description: "Integrated 2FA / TOTP Authenticator manager with live countdown and instant code copy.",
    tags: ["Security", "Utility", "Privacy"],
    authors: [{ name: "Nightcord Team", id: 999999999999999990n }],
    dependencies: ["HeaderBarAPI"],
    settingsAboutComponent: TotpSettingsPanel,

    options: {
        showInHeader: {
            type: OptionType.BOOLEAN,
            description: "Show 2FA Authenticator icon in Discord top header bar",
            default: true,
            onChange(val: boolean) {
                if (val) {
                    addHeaderBarButton("nightcord-totp-btn", () => <TotpHeaderButton />, 8);
                } else {
                    removeHeaderBarButton("nightcord-totp-btn");
                }
            }
        }
    },

    commands: [
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "2fa",
            description: "Open the integrated Nightcord 2FA Authenticator",
            execute: async () => {
                openTotpModal();
            }
        },
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "totp",
            description: "Open the integrated Nightcord 2FA Authenticator",
            execute: async () => {
                openTotpModal();
            }
        }
    ],

    start() {
        startMfaModalObserver();
        if (this.options.showInHeader.value) {
            addHeaderBarButton("nightcord-totp-btn", () => <TotpHeaderButton />, 8);
        }
    },

    stop() {
        stopMfaModalObserver();
        removeHeaderBarButton("nightcord-totp-btn");
    }
});
