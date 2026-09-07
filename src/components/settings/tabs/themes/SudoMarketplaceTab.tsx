/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 dsd16
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { initThemes } from "@api/Themes";
import { Card } from "@components/Card";
import { Flex } from "@components/Flex";
import { Link } from "@components/Link";
import { Forms, React, showToast, Toasts, useEffect, useState } from "@webpack/common";

import { BdTheme, MarketplaceThemeCard } from "./MarketplaceTab";
import { clearBackgroundFile, getBackgroundSource, setBackgroundFile } from "../../../../userplugins/CustomBackground";

const SUDO_API = "https://sudocord.h4ck.me/api/sudo-themes.json";

function formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
}

export function SudoMarketplaceTab() {
    const [themes, setThemes] = useState<BdTheme[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeVideoSrc, setActiveVideoSrc] = useState<string | null>(null);
    const [, force] = React.useReducer(x => x + 1, 0);

    useEffect(() => {
        let dead = false;
        (async () => {
            try {
                const res = await VencordNative.fetchUrl(SUDO_API);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = JSON.parse(res.text);
                if (!dead) setThemes(Array.isArray(data) ? data : []);
            } catch (e: any) {
                if (!dead) {
                    setError(e?.message || "Failed to load themes");
                    setThemes([]);
                }
            }
        })();
        void getBackgroundSource().then(s => {
            if (!dead) setActiveVideoSrc(s);
        });
        return () => {
            dead = true;
        };
    }, []);

    function isInstalled(theme: BdTheme): boolean {
        if (theme.kind === "video") return !!activeVideoSrc && activeVideoSrc === theme.downloadUrl;
        return Settings.themeLinks.some(link => link === theme.downloadUrl);
    }

    function installTheme(theme: BdTheme) {
        if (isInstalled(theme)) {
            Settings.themeLinks = Settings.themeLinks.filter(link => link !== theme.downloadUrl);
            initThemes();
            showToast(`Removed ${theme.name}`, Toasts.Type.SUCCESS);
        } else {
            Settings.themeLinks = [...Settings.themeLinks, theme.downloadUrl];
            initThemes();
            showToast(`Installed ${theme.name}`, Toasts.Type.SUCCESS);
        }
        force();
    }

    async function installVideoTheme(theme: BdTheme) {
        if (activeVideoSrc === theme.downloadUrl) {
            try {
                await clearBackgroundFile();
                setActiveVideoSrc(null);
                showToast(`Фон "${theme.name}" убран`, Toasts.Type.SUCCESS);
            } catch (e) {
                console.error("[SudoMarketplace] video remove failed", e);
                showToast("Не вышло убрать фон", Toasts.Type.FAILURE);
            }
            force();
            return;
        }
        try {
            showToast("Качаю видеофон...", Toasts.Type.MESSAGE);
            const res = await fetch(theme.downloadUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            if (!blob.size || blob.size > 80 * 1024 * 1024) throw new Error("bad size");
            await setBackgroundFile(blob, theme.downloadUrl);
            setActiveVideoSrc(theme.downloadUrl);
            showToast(`Фон "${theme.name}" установлен`, Toasts.Type.SUCCESS);
        } catch (e) {
            console.error("[SudoMarketplace] video install failed", e);
            showToast("Не вышло скачать фон", Toasts.Type.FAILURE);
        }
        force();
    }

    const installed = (themes ?? []).filter(isInstalled).length;

    return (
        <Flex flexDirection="column" gap="1em">
            <Card>
                <Forms.FormTitle tag="h5">Темы SudoCord</Forms.FormTitle>
                <Forms.FormText>
                    Родная подборка SudoCord — то же самое, что на сайте. Установка в один клик, как Online Themes.
                </Forms.FormText>
            </Card>

            {themes === null && (
                <Card variant="info" style={{ textAlign: "center", padding: "24px" }}>
                    <Forms.FormText>Загрузка тем...</Forms.FormText>
                </Card>
            )}

            {error && (
                <Card variant="danger">
                    <Forms.FormText>Ошибка: {error}</Forms.FormText>
                </Card>
            )}

            {themes !== null && themes.length === 0 && (
                <Card>
                    <Forms.FormText>
                        Пока пусто — как на сайте. Своя подборка тут:{" "}
                        <Link href="https://sudocord.h4ck.me/themes/sudocord">
                            Themes
                        </Link>
                    </Forms.FormText>
                </Card>
            )}

            {themes !== null && themes.length > 0 && (
                <>
                    <div style={{ color: "#72767d", fontSize: 12 }}>
                        {themes.length} тем | {installed} установлено
                    </div>

                    <div className="vc-settings-theme-grid">
                        {themes.map(theme => (
                            <MarketplaceThemeCard
                                key={theme.id}
                                theme={theme}
                                installed={isInstalled(theme)}
                                onToggle={() => (theme.kind === "video" ? void installVideoTheme(theme) : installTheme(theme))}
                                formatNumber={formatNumber}
                            />
                        ))}
                    </div>
                </>
            )}
        </Flex>
    );
}
