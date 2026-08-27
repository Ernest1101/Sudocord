/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { initThemes } from "@api/Themes";
import { Card } from "@components/Card";
import { Flex } from "@components/Flex";
import { Link } from "@components/Link";
import { Margins } from "@components/margins";
import { Forms, React, useEffect, showToast, Toasts, useState } from "@webpack/common";

const BD_API = "https://betterdiscord.app";

interface BdTheme {
    id: number;
    name: string;
    description: string;
    author: string;
    downloads: number;
    likes: string;
    tags: string[];
    imageUrl: string;
    downloadUrl: string;
    detailUrl: string;
}

function parseThemesFromHtml(html: string): BdTheme[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const cards = doc.querySelectorAll("a.card-wrap");
    const themes: BdTheme[] = [];

    for (const card of cards) {
        try {
            const href = card.getAttribute("href") || "";
            const img = card.querySelector("img.card-image");
            const title = card.querySelector("h3.card-title");
            const subtext = card.querySelector("p.card-subtext");
            const desc = card.querySelector("p.card-description");
            const tags = card.querySelectorAll(".addon-tag");
            const downloadLink = card.querySelector('a[href*="download"]');
            const statsEls = card.querySelectorAll(".card-stats > div");

            const name = title?.textContent?.trim() || "";
            const authorText = subtext?.textContent?.trim() || "";
            const author = authorText.replace(/^by\s+/i, "").trim();
            const description = desc?.textContent?.trim() || "";
            const tagList = Array.from(tags).map(t => t.textContent?.trim() || "").filter(Boolean);

            const imgSrc = (img?.getAttribute("src") || "").replace(/\.(\/|$)/, "$1");
            const imageUrl = imgSrc.startsWith("http") ? imgSrc : `${BD_API}${imgSrc}`;

            const dlHref = (downloadLink?.getAttribute("href") || "").replace(/\.(\?|$)/, "$1");
            const downloadUrl = dlHref.startsWith("http") ? dlHref : `${BD_API}${dlHref}`;

            const idMatch = dlHref.match(/id=(\d+)/);
            const id = idMatch ? parseInt(idMatch[1]) : 0;

            let downloads = 0;
            let likes = "0";
            if (statsEls.length >= 1) downloads = parseInt(statsEls[0]?.textContent?.replace(/[,\s]/g, "") || "0");
            if (statsEls.length >= 2) likes = statsEls[1]?.textContent?.trim() || "0";

            const detailUrl = href.startsWith("http") ? href : `${BD_API}${href}`;

            if (name) {
                themes.push({ id, name, description, author, downloads, likes, tags: tagList, imageUrl, downloadUrl, detailUrl });
            }
        } catch {
            continue;
        }
    }

    return themes;
}

export function MarketplaceTab() {
    const [themes, setThemes] = useState<BdTheme[]>([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [activeTag, setActiveTag] = useState<string | null>(null);

    const allTags = [...new Set(themes.flatMap(t => t.tags))].sort();

    const filteredThemes = themes.filter(t => {
        const matchesSearch = !search ||
            t.name.toLowerCase().includes(search.toLowerCase()) ||
            t.author.toLowerCase().includes(search.toLowerCase()) ||
            t.description.toLowerCase().includes(search.toLowerCase());
        const matchesTag = !activeTag || t.tags.includes(activeTag);
        return matchesSearch && matchesTag;
    });

    async function loadThemes() {
        setLoading(true);
        setError(null);
        try {
            const res = await VencordNative.fetchUrl(`${BD_API}/themes`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const parsed = parseThemesFromHtml(res.text);
            if (parsed.length === 0) throw new Error("No themes found in response");
            setThemes(parsed);
            setLoaded(true);
        } catch (e: any) {
            setError(e?.message || "Failed to load themes");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!loaded && !loading) loadThemes();
    }, []);

    function isInstalled(theme: BdTheme): boolean {
        return Settings.themeLinks.some(link => link.includes(`download?id=${theme.id}`));
    }

    function installTheme(theme: BdTheme) {
        if (isInstalled(theme)) {
            Settings.themeLinks = Settings.themeLinks.filter(link => !link.includes(`download?id=${theme.id}`));
            initThemes();
            showToast(`Removed ${theme.name}`, Toasts.Type.SUCCESS);
            return;
        }

        Settings.themeLinks = [...Settings.themeLinks, theme.downloadUrl];
        initThemes();
        showToast(`Installed ${theme.name}`, Toasts.Type.SUCCESS);
    }

    function formatNumber(n: number): string {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
        if (n >= 1000) return (n / 1000).toFixed(1) + "K";
        return String(n);
    }

    return (
        <Flex flexDirection="column" gap="1em">
            <Card>
                <Forms.FormTitle tag="h5">Themes Marketplace</Forms.FormTitle>
                <Forms.FormText>
                    Скачивай темы из BetterDiscord прямо из SudoCord. Темы загружаются как Online Themes (через URL).
                </Forms.FormText>
            </Card>

            {loading && (
                <Card variant="info" style={{ textAlign: "center", padding: "24px" }}>
                    <Forms.FormText>Загрузка тем...</Forms.FormText>
                </Card>
            )}

            {error && (
                <Card variant="danger">
                    <Forms.FormText>Ошибка: {error}</Forms.FormText>
                    <button
                        onClick={loadThemes}
                        style={{
                            marginTop: 8, padding: "6px 16px", borderRadius: 6,
                            border: "none", background: "#ed4245", color: "#fff",
                            fontSize: 13, fontWeight: 600, cursor: "pointer"
                        }}
                    >
                        Попробовать снова
                    </button>
                </Card>
            )}

            {loaded && (
                <>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Поиск тем..."
                            style={{
                                flex: 1, padding: "8px 12px", borderRadius: 8,
                                border: "1px solid #2e3035", background: "#1e1f22",
                                color: "#f2f3f5", fontSize: 14, outline: "none"
                            }}
                        />
                        <button
                            onClick={loadThemes}
                            style={{
                                padding: "8px 16px", borderRadius: 8, border: "1px solid #2e3035",
                                background: "#2e3035", color: "#b5bac1", fontSize: 13,
                                fontWeight: 600, cursor: "pointer"
                            }}
                        >
                            ↻
                        </button>
                    </div>

                    {allTags.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            <TagChip label="All" active={activeTag === null} onClick={() => setActiveTag(null)} />
                            {allTags.slice(0, 20).map(tag => (
                                <TagChip key={tag} label={tag} active={activeTag === tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)} />
                            ))}
                        </div>
                    )}

                    <div style={{ color: "#72767d", fontSize: 12 }}>
                        {filteredThemes.length} тем | {themes.filter(isInstalled).length} установлено
                    </div>

                    <div className="vc-settings-theme-grid">
                        {filteredThemes.map(theme => (
                            <MarketplaceThemeCard
                                key={theme.id}
                                theme={theme}
                                installed={isInstalled(theme)}
                                onToggle={() => installTheme(theme)}
                                formatNumber={formatNumber}
                            />
                        ))}
                    </div>
                </>
            )}
        </Flex>
    );
}

function TagChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void; }) {
    return (
        <span
            onClick={onClick}
            style={{
                display: "inline-block", padding: "3px 10px", borderRadius: 12,
                background: active ? "#5865f2" : "#2e3035",
                color: active ? "#fff" : "#b5bac1",
                fontSize: 12, cursor: "pointer", userSelect: "none",
                transition: "background 0.15s"
            }}
        >
            {label}
        </span>
    );
}

function MarketplaceThemeCard({ theme, installed, onToggle, formatNumber }: {
    theme: BdTheme;
    installed: boolean;
    onToggle: () => void;
    formatNumber: (n: number) => string;
}) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div
            style={{
                borderRadius: 12, overflow: "hidden",
                border: installed ? "1px solid #23a55a55" : "1px solid #2e3035",
                background: "#1e1f22", transition: "border-color 0.15s"
            }}
        >
            {theme.imageUrl && (
                <div
                    style={{
                        width: "100%", height: 140, overflow: "hidden",
                        background: "#111214", cursor: "pointer"
                    }}
                    onClick={() => setExpanded(!expanded)}
                >
                    <img
                        src={theme.imageUrl}
                        alt={theme.name}
                        style={{
                            width: "100%", height: "100%", objectFit: "cover",
                            transition: "transform 0.2s"
                        }}
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                </div>
            )}
            <div style={{ padding: "10px 12px" }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#f2f3f5", marginBottom: 2 }}>
                    {theme.name}
                </div>
                <div style={{ fontSize: 12, color: "#b5bac1", marginBottom: 4 }}>
                    by {theme.author}
                </div>
                {expanded && (
                    <div style={{ fontSize: 12, color: "#b5bac1", marginBottom: 8, lineHeight: "1.4" }}>
                        {theme.description}
                    </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 8 }}>
                    {theme.tags.slice(0, expanded ? undefined : 3).map(tag => (
                        <span
                            key={tag}
                            style={{
                                padding: "1px 6px", borderRadius: 4,
                                background: "#2e3035", color: "#72767d", fontSize: 10
                            }}
                        >
                            {tag}
                        </span>
                    ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 11, color: "#72767d" }}>
                        ↓ {formatNumber(theme.downloads)} | ♥ {theme.likes}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Link href={theme.detailUrl} style={{ fontSize: 11 }}>
                            Details
                        </Link>
                        <button
                            onClick={onToggle}
                            style={{
                                padding: "4px 12px", borderRadius: 6, border: "none",
                                background: installed ? "#ed4245" : "#23a55a",
                                color: "#fff", fontSize: 12, fontWeight: 600,
                                cursor: "pointer"
                            }}
                        >
                            {installed ? "Remove" : "Install"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
