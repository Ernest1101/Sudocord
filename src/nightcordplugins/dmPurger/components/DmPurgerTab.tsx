/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import { Card } from "@components/Card";
import { FormSwitch } from "@components/FormSwitch";
import { TrashIcon } from "@components/Icons";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import { requestDiscordData,settings } from "@nightcordplugins/dmPurger/index";
import type { PackageChannel, PurgerState } from "@nightcordplugins/dmPurger/types";
import { purgerEngine } from "@nightcordplugins/dmPurger/utils/purgerEngine";
import { Alerts, Button, Forms, React, Slider, TextInput, Toasts, UserStore } from "@webpack/common";

// ─── Minimalist SVG Vector Icons (Strict Zero-Emoji Policy) ───────────────────

function MailIcon(props: any) {
    return (
        <svg aria-hidden="true" role="img" width={props.width || 18} height={props.height || 18} fill="none" viewBox="0 0 24 24" {...props}>
            <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
            <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m3 7 9 6 9-6" />
        </svg>
    );
}

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

function PlayIcon(props: any) {
    return (
        <svg aria-hidden="true" role="img" width={props.width || 16} height={props.height || 16} fill="currentColor" viewBox="0 0 24 24" {...props}>
            <path d="M8 5v14l11-7z" />
        </svg>
    );
}

function PauseIcon(props: any) {
    return (
        <svg aria-hidden="true" role="img" width={props.width || 16} height={props.height || 16} fill="currentColor" viewBox="0 0 24 24" {...props}>
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
    );
}

function StopIcon(props: any) {
    return (
        <svg aria-hidden="true" role="img" width={props.width || 16} height={props.height || 16} fill="currentColor" viewBox="0 0 24 24" {...props}>
            <path d="M6 6h12v12H6z" />
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

function WarningIcon(props: any) {
    return (
        <svg aria-hidden="true" role="img" width={props.width || 16} height={props.height || 16} fill="none" viewBox="0 0 24 24" {...props}>
            <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        </svg>
    );
}

function CloseIcon(props: any) {
    return (
        <svg aria-hidden="true" role="img" width={props.width || 14} height={props.height || 14} fill="none" viewBox="0 0 24 24" {...props}>
            <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
        </svg>
    );
}

function formatRemainingTime(seconds: number): string {
    if (seconds <= 0) return "0s";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

export default function DmPurgerTab() {
    const s = settings.use([
        "autoRequestEvery30Days",
        "lastRequestTimestamp",
        "requestMessagesOnly",
        "deleteDelay",
        "emailProvider",
        "emailAddress",
        "emailPassword",
        "customImapHost",
        "customImapPort",
        "autoDeleteZipAfterExtract",
        "includeGroupDms",
        "whitelistUsers",
        "whitelistGroups",
        "autoResumeOnStartup"
    ]);

    const [purgerState, setPurgerState] = React.useState<PurgerState>(purgerEngine.getState());
    const [manualPath, setManualPath] = React.useState("");
    const [isDragging, setIsDragging] = React.useState(false);
    const [isFetchingEmail, setIsFetchingEmail] = React.useState(false);
    const [isLoadingPackage, setIsLoadingPackage] = React.useState(false);
    const [isRequestingHarvest, setIsRequestingHarvest] = React.useState(false);
    const [loadedChannels, setLoadedChannels] = React.useState<PackageChannel[]>([]);
    const [totalLoadedMessages, setTotalLoadedMessages] = React.useState(0);
    const [newWhitelistUser, setNewWhitelistUser] = React.useState("");
    const [newWhitelistGroup, setNewWhitelistGroup] = React.useState("");

    React.useEffect(() => {
        return purgerEngine.subscribe(state => setPurgerState(state));
    }, []);

    const currentUser = UserStore.getCurrentUser();
    const discordEmail = (currentUser?.email || "").trim().toLowerCase();
    const configuredEmail = (s.emailAddress || "").trim().toLowerCase();
    const hasEmailConfigured = configuredEmail.length > 0;
    const isEmailMatching = hasEmailConfigured && configuredEmail === discordEmail;

    const whitelistUsersList = s.whitelistUsers.split(",").map(id => id.trim()).filter(Boolean);
    const whitelistGroupsList = s.whitelistGroups.split(",").map(id => id.trim()).filter(Boolean);

    const handleAddWhitelistUser = () => {
        const id = newWhitelistUser.trim();
        if (!id) return;
        if (!whitelistUsersList.includes(id)) {
            const updated = [...whitelistUsersList, id].join(",");
            settings.store.whitelistUsers = updated;
            setNewWhitelistUser("");
            Toasts.show(Toasts.create(t("User added to whitelist"), Toasts.Type.SUCCESS));
        }
    };

    const handleRemoveWhitelistUser = (idToRemove: string) => {
        const updated = whitelistUsersList.filter(id => id !== idToRemove).join(",");
        settings.store.whitelistUsers = updated;
    };

    const handleAddWhitelistGroup = () => {
        const id = newWhitelistGroup.trim();
        if (!id) return;
        if (!whitelistGroupsList.includes(id)) {
            const updated = [...whitelistGroupsList, id].join(",");
            settings.store.whitelistGroups = updated;
            setNewWhitelistGroup("");
            Toasts.show(Toasts.create(t("Group added to whitelist"), Toasts.Type.SUCCESS));
        }
    };

    const handleRemoveWhitelistGroup = (idToRemove: string) => {
        const updated = whitelistGroupsList.filter(id => id !== idToRemove).join(",");
        settings.store.whitelistGroups = updated;
    };

    const handleRequestHarvestNow = async () => {
        setIsRequestingHarvest(true);
        const types = s.requestMessagesOnly ? ["messages"] : ["all"];
        const res = await requestDiscordData(types);
        setIsRequestingHarvest(false);
        if (res.success) {
            Toasts.show(Toasts.create(res.message, Toasts.Type.SUCCESS));
        } else {
            Toasts.show(Toasts.create(res.message, Toasts.Type.FAILURE));
        }
    };

    const handleSelectFileOrFolder = async () => {
        try {
            const native = (window as any).VencordNative?.pluginHelpers?.DmPurger;
            if (native?.selectZipOrFolderDialog) {
                const selected = await native.selectZipOrFolderDialog();
                if (selected) {
                    setManualPath(selected);
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

    const handleFetchFromEmail = async () => {
        if (!s.emailAddress || !s.emailPassword) {
            Toasts.show(Toasts.create(t("Please enter your email address and password"), Toasts.Type.FAILURE));
            return;
        }

        const proceed = async () => {
            setIsFetchingEmail(true);
            try {
                const native = (window as any).VencordNative?.pluginHelpers?.DmPurger;
                if (!native?.fetchDiscordDataEmail) {
                    throw new Error("Native mail client unavailable");
                }

                const res = await native.fetchDiscordDataEmail({
                    provider: s.emailProvider,
                    email: s.emailAddress,
                    password: s.emailPassword,
                    customHost: s.customImapHost,
                    customPort: s.customImapPort
                });

                if (!res.success || !res.zipPath) {
                    throw new Error(res.error || "Failed to fetch package from email");
                }

                Toasts.show(Toasts.create(t("Package downloaded from email! Loading..."), Toasts.Type.SUCCESS));
                setManualPath(res.zipPath);
                await handleLoadPackage(res.zipPath);
            } catch (e: any) {
                Toasts.show(Toasts.create(e?.message || "Email retrieval error", Toasts.Type.FAILURE));
            } finally {
                setIsFetchingEmail(false);
            }
        };

        if (hasEmailConfigured && !isEmailMatching) {
            Alerts.show({
                title: t("Email Address Mismatch"),
                confirmText: t("Proceed Anyway"),
                cancelText: t("Cancel"),
                body: (
                    <div style={{ color: "var(--text-normal)", fontSize: 14, lineHeight: "20px" }}>
                        {t("The configured email address differs from your active Discord account email")} ({discordEmail || "N/A"}).
                        <br /><br />
                        {t("Make sure your Discord data package was sent to this mailbox before continuing.")}
                    </div>
                ),
                onConfirm: proceed
            });
        } else {
            await proceed();
        }
    };

    const handleStartPurge = () => {
        if (loadedChannels.length === 0) {
            Toasts.show(Toasts.create(t("Please load a Discord data package first."), Toasts.Type.FAILURE));
            return;
        }

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

    const handleOpenLogs = async () => {
        try {
            const native = (window as any).VencordNative?.pluginHelpers?.DmPurger;
            if (native?.openLogsFile) {
                await native.openLogsFile();
            }
        } catch (e: any) {
            Toasts.show(Toasts.create(e?.message || "Failed to open logs", Toasts.Type.FAILURE));
        }
    };

    // Calculate progress stats
    const progressPercent = purgerState.totalMessages > 0
        ? Math.min(100, Math.round((purgerState.currentIndex / purgerState.totalMessages) * 100))
        : 0;
    const remainingCount = Math.max(0, purgerState.totalMessages - purgerState.currentIndex);
    const estimatedRemainingSeconds = remainingCount * (s.deleteDelay / 1000);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 40 }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap", marginBottom: 4 }}>
                <div style={{ flex: "1 1 340px", minWidth: 260 }}>
                    <div style={{ color: "#ffffff", fontSize: 22, fontWeight: 700, margin: "0 0 6px 0", lineHeight: "28px" }}>
                        {t("DM Purger")}
                    </div>
                    <p style={{ color: "#949ba4", fontSize: 14, margin: 0, lineHeight: "20px" }}>
                        {t("Purge direct messages and group chats from your Discord account data package with automated request, email fetching, resume, whitelists, and logs.")}
                    </p>
                </div>
                <Button
                    size={Button.Sizes.SMALL}
                    color={Button.Colors.BRAND}
                    onClick={handleOpenLogs}
                    style={{
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "0 16px",
                        height: 34,
                        minWidth: "fit-content",
                    }}
                >
                    <FolderIcon width={16} height={16} />
                    <span>{t("Open Deleted Messages Log File")}</span>
                </Button>
            </div>

            {/* Active Purge Progress Card */}
            {(purgerState.status === "running" || purgerState.status === "paused" || purgerState.totalMessages > 0) && (
                <Card style={{ backgroundColor: "var(--background-secondary)", padding: "18px 20px", borderRadius: 8, border: "1px solid var(--background-modifier-accent)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <TrashIcon width={20} height={20} style={{ color: "var(--brand-500)" }} />
                            <span style={{ color: "#ffffff", fontWeight: 700, fontSize: 16 }}>
                                {purgerState.status === "running" ? t("Purge In Progress") : purgerState.status === "paused" ? t("Purge Paused") : t("Purge Status")}
                            </span>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                            {purgerState.status === "running" ? (
                                <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} onClick={() => purgerEngine.pausePurge()} style={{ whiteSpace: "nowrap" }}>
                                    <PauseIcon width={14} height={14} style={{ marginRight: 6 }} />
                                    {t("Pause Purge")}
                                </Button>
                            ) : (
                                <Button size={Button.Sizes.SMALL} color={Button.Colors.BRAND} onClick={() => purgerEngine.resumePurge(s.deleteDelay)} style={{ whiteSpace: "nowrap" }}>
                                    <PlayIcon width={14} height={14} style={{ marginRight: 6 }} />
                                    {t("Resume Purge")}
                                </Button>
                            )}
                            <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={() => purgerEngine.stopPurge()} style={{ whiteSpace: "nowrap" }}>
                                <StopIcon width={14} height={14} style={{ marginRight: 6 }} />
                                {t("Stop Purge")}
                            </Button>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ width: "100%", height: 8, backgroundColor: "var(--background-primary)", borderRadius: 4, overflow: "hidden", margin: "12px 0" }}>
                        <div
                            style={{
                                width: `${progressPercent}%`,
                                height: "100%",
                                backgroundColor: "var(--brand-500)",
                                transition: "width 0.3s ease"
                            }}
                        />
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: 13 }}>
                        <span>
                            {purgerState.currentIndex} / {purgerState.totalMessages} ({progressPercent}%) - {purgerState.deletedMessages} {t("deleted")}
                            {purgerState.skippedMessages > 0 && ` • ${purgerState.skippedMessages} ${t("skipped")}`}
                            {purgerState.failedMessages > 0 && ` • ${purgerState.failedMessages} ${t("failed")}`}
                        </span>
                        <span>
                            {purgerState.status === "running" && `${t("Est. remaining:")} ${formatRemainingTime(estimatedRemainingSeconds)}`}
                        </span>
                    </div>

                    {purgerState.currentChannelId && (
                        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
                            {t("Channel:")} {purgerState.currentChannelId} {purgerState.currentChannelName && `(${purgerState.currentChannelName})`}
                        </div>
                    )}
                </Card>
            )}

            {/* Section 1: Automated Discord Data Request */}
            <Card style={{ backgroundColor: "var(--background-secondary)", padding: 20, borderRadius: 8 }}>
                <Forms.FormTitle tag="h3" style={{ color: "#ffffff", marginBottom: 12, fontSize: 16, fontWeight: 700 }}>
                    {t("Discord Data Request")}
                </Forms.FormTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <FormSwitch
                        value={s.autoRequestEvery30Days}
                        onChange={v => settings.store.autoRequestEvery30Days = v}
                        title={t("Automatically request Discord data every 30 days")}
                        description={t("Periodically sends a request to Discord to compile your data package")}
                    />
                    <FormSwitch
                        value={s.requestMessagesOnly}
                        onChange={v => settings.store.requestMessagesOnly = v}
                        title={t("Request Messages data only")}
                        description={t("Only includes messages in the Discord data request package")}
                    />

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--background-modifier-accent)" }}>
                        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                            {t("Last requested:")} {s.lastRequestTimestamp ? new Date(s.lastRequestTimestamp).toLocaleDateString() : t("Never")}
                        </span>
                        <Button
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.BRAND}
                            onClick={handleRequestHarvestNow}
                            disabled={isRequestingHarvest}
                            style={{ flexShrink: 0, whiteSpace: "nowrap", minWidth: "fit-content" }}
                        >
                            {isRequestingHarvest ? t("Requesting data...") : t("Request Data From Discord Now")}
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Section 2: Data Package Retrieval */}
            <Card style={{ backgroundColor: "var(--background-secondary)", padding: 20, borderRadius: 8 }}>
                <Forms.FormTitle tag="h3" style={{ color: "#ffffff", marginBottom: 12, fontSize: 16, fontWeight: 700 }}>
                    {t("Data Package Retrieval")}
                </Forms.FormTitle>

                {/* Sub-Card A: Automated Email Retrieval */}
                <div style={{ backgroundColor: "var(--background-floating)", padding: 16, borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <MailIcon width={18} height={18} style={{ color: "var(--brand-500)" }} />
                        <span style={{ color: "#ffffff", fontWeight: 600, fontSize: 14 }}>
                            {t("Email Fetcher (Automatic)")}
                        </span>
                    </div>

                    {/* Email Correlation Badge */}
                    {hasEmailConfigured && (
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 12px",
                                borderRadius: 6,
                                marginBottom: 14,
                                backgroundColor: isEmailMatching ? "rgba(87, 242, 135, 0.1)" : "rgba(250, 166, 26, 0.1)",
                                border: `1px solid ${isEmailMatching ? "rgba(87, 242, 135, 0.3)" : "rgba(250, 166, 26, 0.3)"}`,
                                color: isEmailMatching ? "#57f287" : "#faa61a",
                                fontSize: 13
                            }}
                        >
                            {isEmailMatching ? <CheckIcon width={16} height={16} /> : <WarningIcon width={16} height={16} />}
                            <span>
                                {isEmailMatching
                                    ? t("Email verified: Matches your Discord account email.")
                                    : `${t("Email mismatch: configured email differs from your Discord email")} (${discordEmail || "N/A"}).`}
                            </span>
                        </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                        <div>
                            <Forms.FormTitle style={{ fontSize: 12, marginBottom: 6 }}>{t("Mail Provider")}</Forms.FormTitle>
                            <select
                                value={s.emailProvider}
                                onChange={e => settings.store.emailProvider = e.target.value as any}
                                style={{
                                    width: "100%",
                                    height: 38,
                                    borderRadius: 4,
                                    backgroundColor: "var(--input-background, var(--background-secondary))",
                                    color: "var(--text-normal)",
                                    border: "1px solid var(--background-modifier-accent)",
                                    padding: "0 10px"
                                }}
                            >
                                <option value="outlook">Outlook / Hotmail / Office365</option>
                                <option value="gmail">Gmail</option>
                                <option value="yahoo">Yahoo Mail</option>
                                <option value="custom">Custom IMAP</option>
                            </select>
                        </div>
                        <div>
                            <Forms.FormTitle style={{ fontSize: 12, marginBottom: 6 }}>{t("Email Address")}</Forms.FormTitle>
                            <TextInput
                                value={s.emailAddress}
                                onChange={v => settings.store.emailAddress = v}
                                placeholder="name@example.com"
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <Forms.FormTitle style={{ fontSize: 12, marginBottom: 6 }}>{t("Email Password or App Password")}</Forms.FormTitle>
                        <TextInput
                            type="password"
                            value={s.emailPassword}
                            onChange={v => settings.store.emailPassword = v}
                            placeholder="Password or App Password"
                        />
                    </div>

                    {s.emailProvider === "custom" && (
                        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
                            <div>
                                <Forms.FormTitle style={{ fontSize: 12, marginBottom: 6 }}>{t("Custom IMAP Host")}</Forms.FormTitle>
                                <TextInput
                                    value={s.customImapHost}
                                    onChange={v => settings.store.customImapHost = v}
                                    placeholder="imap.example.com"
                                />
                            </div>
                            <div>
                                <Forms.FormTitle style={{ fontSize: 12, marginBottom: 6 }}>{t("Custom IMAP Port")}</Forms.FormTitle>
                                <TextInput
                                    type="number"
                                    value={String(s.customImapPort)}
                                    onChange={v => settings.store.customImapPort = parseInt(v, 10) || 993}
                                />
                            </div>
                        </div>
                    )}

                    <Button
                        size={Button.Sizes.SMALL}
                        color={Button.Colors.BRAND}
                        onClick={handleFetchFromEmail}
                        disabled={isFetchingEmail}
                        style={{ marginTop: 4, whiteSpace: "nowrap", flexShrink: 0 }}
                    >
                        {isFetchingEmail ? t("Fetching email...") : t("Fetch Package From Email")}
                    </Button>
                </div>

                {/* Sub-Card B: Manual Zip or Messages Folder Selection */}
                <div style={{ backgroundColor: "var(--background-floating)", padding: 16, borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <FolderIcon width={18} height={18} style={{ color: "var(--brand-500)" }} />
                        <span style={{ color: "#ffffff", fontWeight: 600, fontSize: 14 }}>
                            {t("Manual File Selection")}
                        </span>
                    </div>

                    {/* Drag and Drop Zone */}
                    <div
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                        onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
                        onDrop={async e => {
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
                        }}
                        onClick={handleSelectFileOrFolder}
                        style={{
                            border: `2px dashed ${isDragging ? "var(--brand-500)" : "var(--background-modifier-accent)"}`,
                            backgroundColor: isDragging ? "rgba(88, 101, 242, 0.12)" : "var(--background-secondary)",
                            borderRadius: 8,
                            padding: "20px 16px",
                            textAlign: "center",
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            marginBottom: 12,
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

                    <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 200px" }}>
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

                    {totalLoadedMessages > 0 && (
                        <div style={{ color: "#57f287", fontSize: 13, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                            <CheckIcon width={15} height={15} />
                            <span>
                                {t("Package loaded:")} {loadedChannels.length} {t("channels")}, {totalLoadedMessages} {t("messages ready for purge.")}
                            </span>
                        </div>
                    )}
                </div>

                <FormSwitch
                    value={s.autoDeleteZipAfterExtract}
                    onChange={v => settings.store.autoDeleteZipAfterExtract = v}
                    title={t("Delete original zip file automatically after extraction")}
                    description={t("Safely deletes the archive to save disk space once uncompressed")}
                />
            </Card>

            {/* Section 3: Whitelists & Group Filter */}
            <Card style={{ backgroundColor: "var(--background-secondary)", padding: 20, borderRadius: 8 }}>
                <Forms.FormTitle tag="h3" style={{ color: "#ffffff", marginBottom: 12, fontSize: 16, fontWeight: 700 }}>
                    {t("Whitelists & Filters")}
                </Forms.FormTitle>

                <FormSwitch
                    value={s.includeGroupDms}
                    onChange={v => settings.store.includeGroupDms = v}
                    title={t("Include Group DMs in deletion")}
                    description={t("Also delete messages in group conversations (DMs only by default)")}
                />

                {/* Whitelist Direct Messages */}
                <div style={{ marginTop: 16 }}>
                    <Forms.FormTitle style={{ fontSize: 13, marginBottom: 6 }}>
                        {t("Whitelist Direct Messages")}
                    </Forms.FormTitle>
                    <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                            <TextInput
                                value={newWhitelistUser}
                                onChange={setNewWhitelistUser}
                                placeholder={t("User ID (e.g. 123456789012345678)")}
                            />
                        </div>
                        <Button
                            size={Button.Sizes.MEDIUM}
                            color={Button.Colors.PRIMARY}
                            onClick={handleAddWhitelistUser}
                            disabled={!newWhitelistUser.trim()}
                        >
                            {t("Add User to Whitelist")}
                        </Button>
                    </div>

                    {whitelistUsersList.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                            {whitelistUsersList.map(id => (
                                <div
                                    key={id}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        backgroundColor: "var(--background-floating)",
                                        padding: "4px 10px",
                                        borderRadius: 16,
                                        fontSize: 12,
                                        color: "var(--text-normal)"
                                    }}
                                >
                                    <span>{id}</span>
                                    <span
                                        onClick={() => handleRemoveWhitelistUser(id)}
                                        style={{ cursor: "pointer", display: "flex", alignItems: "center", color: "var(--text-muted)" }}
                                    >
                                        <CloseIcon width={12} height={12} />
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Whitelist Group Chats */}
                <div style={{ marginTop: 16 }}>
                    <Forms.FormTitle style={{ fontSize: 13, marginBottom: 6 }}>
                        {t("Whitelist Group Chats")}
                    </Forms.FormTitle>
                    <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                            <TextInput
                                value={newWhitelistGroup}
                                onChange={setNewWhitelistGroup}
                                placeholder={t("Group Channel ID")}
                            />
                        </div>
                        <Button
                            size={Button.Sizes.MEDIUM}
                            color={Button.Colors.PRIMARY}
                            onClick={handleAddWhitelistGroup}
                            disabled={!newWhitelistGroup.trim()}
                        >
                            {t("Add Group to Whitelist")}
                        </Button>
                    </div>

                    {whitelistGroupsList.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                            {whitelistGroupsList.map(id => (
                                <div
                                    key={id}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        backgroundColor: "var(--background-floating)",
                                        padding: "4px 10px",
                                        borderRadius: 16,
                                        fontSize: 12,
                                        color: "var(--text-normal)"
                                    }}
                                >
                                    <span>{id}</span>
                                    <span
                                        onClick={() => handleRemoveWhitelistGroup(id)}
                                        style={{ cursor: "pointer", display: "flex", alignItems: "center", color: "var(--text-muted)" }}
                                    >
                                        <CloseIcon width={12} height={12} />
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Card>

            {/* Section 4: Purge Controls & Settings */}
            <Card style={{ backgroundColor: "var(--background-secondary)", padding: 20, borderRadius: 8 }}>
                <Forms.FormTitle tag="h3" style={{ color: "#ffffff", marginBottom: 12, fontSize: 16, fontWeight: 700 }}>
                    {t("Purge Controls & Progress")}
                </Forms.FormTitle>

                <div style={{ marginBottom: 16 }}>
                    <Forms.FormTitle style={{ fontSize: 13, marginBottom: 6 }}>
                        {t("Deletion Delay (ms)")}: {s.deleteDelay}ms
                    </Forms.FormTitle>
                    <Slider
                        minValue={500}
                        maxValue={5000}
                        value={s.deleteDelay}
                        onChange={(v: number) => settings.store.deleteDelay = v}
                        markers={[500, 1000, 1500, 2000, 3000, 5000]}
                        onMarkerRender={(v: number) => `${v}ms`}
                    />
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                        {t("Delay between each message deletion to prevent rate limits (recommended: 1500ms)")}
                    </div>
                </div>

                <FormSwitch
                    value={s.autoResumeOnStartup}
                    onChange={v => settings.store.autoResumeOnStartup = v}
                    title={t("Auto-resume purge when Discord launches")}
                    description={t("Continues message deletion automatically if Discord was restarted")}
                />

                <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
                    <Button
                        size={Button.Sizes.LARGE}
                        color={Button.Colors.RED}
                        onClick={handleStartPurge}
                        disabled={loadedChannels.length === 0 || purgerState.status === "running"}
                        style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                        <TrashIcon width={18} height={18} />
                        {t("Start DM Purge")}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
