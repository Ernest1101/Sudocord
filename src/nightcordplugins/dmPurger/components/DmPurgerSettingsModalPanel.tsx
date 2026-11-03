/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import { Card } from "@components/Card";
import { openSettingsTabModal } from "@components/settings";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import { settings } from "@nightcordplugins/dmPurger/index";
import type { PackageChannel, PurgerState } from "@nightcordplugins/dmPurger/types";
import { purgerEngine } from "@nightcordplugins/dmPurger/utils/purgerEngine";
import { Alerts, Button, React, TextInput, Toasts } from "@webpack/common";

import DmPurgerTab from "./DmPurgerTab";

function FolderIcon(props: any) {
    return (
        <svg aria-hidden="true" role="img" width={props.width || 18} height={props.height || 18} fill="none" viewBox="0 0 24 24" {...props}>
            <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2Z" />
        </svg>
    );
}

function UploadIcon(props: any) {
    return (
        <svg aria-hidden="true" role="img" width={props.width || 24} height={props.height || 24} fill="none" viewBox="0 0 24 24" {...props}>
            <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
        </svg>
    );
}

function CheckIcon(props: any) {
    return (
        <svg aria-hidden="true" role="img" width={props.width || 16} height={props.height || 16} fill="none" viewBox="0 0 24 24" {...props}>
            <path stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
        </svg>
    );
}

function ExternalIcon(props: any) {
    return (
        <svg aria-hidden="true" role="img" width={props.width || 16} height={props.height || 16} fill="none" viewBox="0 0 24 24" {...props}>
            <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
        </svg>
    );
}

export default function DmPurgerSettingsModalPanel() {
    const s = settings.use([
        "deleteDelay",
        "autoDeleteZipAfterExtract",
        "includeGroupDms",
        "whitelistUsers",
        "whitelistGroups"
    ]);

    const [manualPath, setManualPath] = React.useState("");
    const [isDragging, setIsDragging] = React.useState(false);
    const [isLoadingPackage, setIsLoadingPackage] = React.useState(false);
    const [loadedChannels, setLoadedChannels] = React.useState<PackageChannel[]>([]);
    const [totalLoadedMessages, setTotalLoadedMessages] = React.useState(0);
    const [purgerState, setPurgerState] = React.useState<PurgerState>(purgerEngine.getState());

    React.useEffect(() => {
        return purgerEngine.subscribe(state => setPurgerState(state));
    }, []);

    const handleSelectFileOrFolder = async () => {
        try {
            const native = (window as any).VencordNative?.pluginHelpers?.DmPurger;
            if (native?.selectZipOrFolderDialog) {
                const selected = await native.selectZipOrFolderDialog();
                if (selected) {
                    setManualPath(selected);
                    await handleLoadPackage(selected);
                }
            }
        } catch (e: any) {
            Toasts.show(Toasts.create(e?.message || "File dialog error", Toasts.Type.FAILURE));
        }
    };

    const handleLoadPackage = async (targetPath: string) => {
        if (!targetPath) {
            Toasts.show(Toasts.create(t("Please select a file or folder path first"), Toasts.Type.FAILURE));
            return;
        }

        setIsLoadingPackage(true);
        try {
            const native = (window as any).VencordNative?.pluginHelpers?.DmPurger;
            if (!native?.parsePackageMessages) {
                throw new Error("Native parser unavailable in this environment");
            }

            const res = await native.parsePackageMessages(targetPath, s.autoDeleteZipAfterExtract);
            if (!res.success || !res.channels) {
                throw new Error(res.error || "Failed to parse package");
            }

            setLoadedChannels(res.channels);
            setTotalLoadedMessages(res.totalMessages || 0);

            Toasts.show(
                Toasts.create(
                    `${t("Package loaded:")} ${res.channels.length} ${t("channels")}, ${res.totalMessages} ${t("messages found.")}`,
                    Toasts.Type.SUCCESS
                )
            );
        } catch (e: any) {
            Toasts.show(Toasts.create(e?.message || "Failed to load package", Toasts.Type.FAILURE));
        } finally {
            setIsLoadingPackage(false);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const { files } = e.dataTransfer;
        if (files && files.length > 0) {
            const file = files[0];
            const filePath = (file as any).path || (file as any).name;
            if (filePath) {
                setManualPath(filePath);
                await handleLoadPackage(filePath);
            }
        }
    };

    const handleStartPurge = () => {
        if (loadedChannels.length === 0) {
            Toasts.show(Toasts.create(t("Please load a Discord data package first."), Toasts.Type.FAILURE));
            return;
        }

        const whitelistUsersList = s.whitelistUsers.split(",").map(id => id.trim()).filter(Boolean);
        const whitelistGroupsList = s.whitelistGroups.split(",").map(id => id.trim()).filter(Boolean);

        const queue = purgerEngine.buildQueueFromChannels(
            loadedChannels,
            whitelistUsersList,
            whitelistGroupsList,
            s.includeGroupDms
        );

        if (queue.length === 0) {
            Toasts.show(Toasts.create(t("No messages to delete (all whitelisted or filtered)."), Toasts.Type.INFO));
            return;
        }

        Alerts.show({
            title: t("Start DM Purge"),
            confirmText: t("Start Deletion"),
            cancelText: t("Cancel"),
            body: (
                <div style={{ color: "var(--text-normal)", fontSize: 14, lineHeight: "20px" }}>
                    <strong>{queue.length}</strong> {t("messages will be permanently deleted.")}
                    <br /><br />
                    {t("Are you sure you want to start the DM Purge? This will permanently delete your sent messages in non-whitelisted conversations.")}
                </div>
            ),
            onConfirm: () => {
                purgerEngine.startNewPurge(queue, s.deleteDelay);
                Toasts.show(Toasts.create(t("DM Purge started"), Toasts.Type.SUCCESS));
            }
        });
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 }}>
            {/* Top Banner Card with Direct Dashboard Access */}
            <Card style={{
                backgroundColor: "var(--background-secondary)",
                padding: "16px 18px",
                borderRadius: 8,
                border: "1px solid var(--background-modifier-accent)"
            }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ color: "var(--brand-500)", display: "flex", alignItems: "center" }}>
                            <FolderIcon width={22} height={22} />
                        </div>
                        <div>
                            <div style={{ color: "#ffffff", fontWeight: 700, fontSize: 15 }}>
                                {t("Manual Data Package Loader")}
                            </div>
                            <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>
                                {t("Load a Discord package.zip directly if email retrieval is unavailable or not configured.")}
                            </div>
                        </div>
                    </div>
                    <Button
                        size={Button.Sizes.SMALL}
                        color={Button.Colors.BRAND}
                        onClick={() => openSettingsTabModal(DmPurgerTab)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap", padding: "0 14px", height: 34, minWidth: "fit-content" }}
                    >
                        <ExternalIcon width={14} height={14} />
                        <span>{t("Open DM Purger Dashboard")}</span>
                    </Button>
                </div>

                {/* Drag and Drop Zone */}
                <div
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                    onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
                    onDrop={handleDrop}
                    onClick={handleSelectFileOrFolder}
                    style={{
                        border: `2px dashed ${isDragging ? "var(--brand-500)" : "var(--background-modifier-accent)"}`,
                        backgroundColor: isDragging ? "rgba(88, 101, 242, 0.12)" : "var(--background-floating)",
                        borderRadius: 8,
                        padding: "20px 16px",
                        textAlign: "center",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        marginTop: 14,
                        transition: "all 0.2s ease"
                    }}
                >
                    <UploadIcon width={28} height={28} style={{ color: isDragging ? "var(--brand-500)" : "var(--text-muted)" }} />
                    <span style={{ color: "var(--header-primary)", fontWeight: 600, fontSize: 13 }}>
                        {t("Drop your Discord package.zip here or click to browse")}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                        {t("Supports both .zip packages and extracted messages folders")}
                    </span>
                </div>

                {/* Manual Path Input and Action Buttons */}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <div style={{ flex: 1 }}>
                        <TextInput
                            value={manualPath}
                            onChange={setManualPath}
                            placeholder="C:\path\to\package.zip or messages folder"
                        />
                    </div>
                    <Button
                        size={Button.Sizes.MEDIUM}
                        color={Button.Colors.PRIMARY}
                        onClick={handleSelectFileOrFolder}
                        style={{ flexShrink: 0, whiteSpace: "nowrap" }}
                    >
                        {t("Browse File / Folder")}
                    </Button>
                    <Button
                        size={Button.Sizes.MEDIUM}
                        color={Button.Colors.BRAND}
                        onClick={() => handleLoadPackage(manualPath)}
                        disabled={isLoadingPackage || !manualPath}
                        style={{ flexShrink: 0, whiteSpace: "nowrap" }}
                    >
                        {isLoadingPackage ? t("Analyzing package...") : t("Load & Analyze Package")}
                    </Button>
                </div>

                {/* Loaded Package Status */}
                {totalLoadedMessages > 0 && (
                    <div style={{
                        marginTop: 12,
                        padding: "10px 14px",
                        borderRadius: 6,
                        backgroundColor: "rgba(87, 242, 135, 0.1)",
                        border: "1px solid rgba(87, 242, 135, 0.3)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#57f287", fontSize: 13 }}>
                            <CheckIcon width={16} height={16} />
                            <span>
                                {t("Package loaded:")} {loadedChannels.length} {t("channels")}, {totalLoadedMessages} {t("messages ready for purge.")}
                            </span>
                        </div>
                        <Button
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.RED}
                            onClick={handleStartPurge}
                        >
                            {t("Start Deletion")}
                        </Button>
                    </div>
                )}
            </Card>
        </div>
    );
}
