"use client";

import PageBootstrap from "@components/PageBootstrap";
import Input from "@components/UI/Input";
import LoadingState from "@components/UI/LoadingState";
import {
    INITIAL_VISIBLE_COUNT,
    LOAD_MORE_COUNT,
    LOAD_MORE_THRESHOLD,
} from "@constants";
import { fetchPlugins, Plugin } from "@utils/plugin";
import { getStored, setStored } from "@utils/storage";
import { Puzzle, Search, SearchX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import PluginCard from "./components/PluginCard";
import PluginPopover from "./components/PluginPopover";

type PluginFilter = "all" | "equicord" | "vencord" | "modified";
type PlatformFilter =
    | "all"
    | "dev"
    | "web"
    | "desktop"
    | "discordDesktop"
    | "equibop";

export default function Plugins() {
    const searchParams = useSearchParams();
    const [plugins, setPlugins] = useState<Plugin[] | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [search, setSearch] = useState(searchParams.get("search") ?? "");
    const [compactMode, setCompactMode] = useState(() =>
        getStored<boolean>("compactMode", true),
    );
    const [pluginFilter, setPluginFilter] = useState<PluginFilter>(
        (searchParams.get("source") as PluginFilter) ?? "all",
    );
    const [platformFilter, setPlatformFilter] = useState<PlatformFilter>(
        (searchParams.get("platform") as PlatformFilter) ?? "all",
    );
    const [tagFilter, setTagFilter] = useState<string>(
        searchParams.get("tag") ?? "all",
    );
    const [filterHasCommands, setFilterHasCommands] = useState(
        searchParams.get("commands") === "true",
    );
    const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        fetchPlugins("all").then(setPlugins).catch(setError);
    }, []);

    useEffect(() => {
        setStored("compactMode", compactMode);
    }, [compactMode]);

    const updateSearch = (value: string) => {
        setSearch(value);
        setVisibleCount(INITIAL_VISIBLE_COUNT);
    };

    const availableTags = useMemo(() => {
        if (!plugins) return [];
        const tags = new Set<string>();
        for (const plugin of plugins) {
            if (plugin.tags) {
                for (const tag of plugin.tags) {
                    tags.add(tag);
                }
            }
        }
        return Array.from(tags).sort();
    }, [plugins]);

    const filteredPlugins = useMemo(() => {
        if (!plugins) return [];

        let result = [...plugins];

        const query = (
            Array.isArray(search) ? (search[0] ?? "") : (search ?? "")
        )
            .toLowerCase()
            .trim();

        if (query) {
            result = result.filter(plugin => {
                const nameMatch = plugin.name.toLowerCase().includes(query);
                const authorMatch = plugin.authors.some(author =>
                    author.name.toLowerCase().includes(query),
                );
                const tagMatch = plugin.tags?.some(tag =>
                    tag.toLowerCase().includes(query),
                );
                return nameMatch || authorMatch || tagMatch;
            });
        }

        switch (pluginFilter) {
            case "equicord":
                result = result.filter(plugin =>
                    plugin.filePath
                        .toLowerCase()
                        .startsWith("src/equicordplugins"),
                );
                break;
            case "vencord":
                result = result.filter(plugin =>
                    plugin.filePath.toLowerCase().startsWith("src/plugins"),
                );
                break;
            case "modified":
                result = result.filter(plugin => plugin.isModified);
                break;
        }

        switch (platformFilter) {
            case "desktop":
                result = result.filter(plugin => plugin.target === "desktop");
                break;
            case "dev":
                result = result.filter(plugin => plugin.target === "dev");
                break;
            case "discordDesktop":
                result = result.filter(
                    plugin => plugin.target === "discordDesktop",
                );
                break;
            case "equibop":
                result = result.filter(plugin => plugin.target === "equibop");
                break;
            case "web":
                result = result.filter(plugin => plugin.target === "web");
                break;
        }

        if (filterHasCommands) {
            result = result.filter(plugin => plugin.hasCommands);
        }

        if (tagFilter !== "all") {
            result = result.filter(plugin => plugin.tags?.includes(tagFilter));
        }

        return result.sort((a, b) => a.name.localeCompare(b.name));
    }, [plugins, search, pluginFilter, platformFilter, filterHasCommands, tagFilter]);

    const visiblePlugins = useMemo(
        () => filteredPlugins.slice(0, visibleCount),
        [filteredPlugins, visibleCount],
    );
    const hasMorePlugins = visibleCount < filteredPlugins.length;

    const handleScroll = useCallback(() => {
        if (scrollTimeoutRef.current) return;

        scrollTimeoutRef.current = setTimeout(() => {
            scrollTimeoutRef.current = null;

            const { innerHeight, scrollY } = window;
            const { offsetHeight } = document.body;

            if (
                innerHeight + scrollY >= offsetHeight - LOAD_MORE_THRESHOLD &&
                hasMorePlugins
            ) {
                setVisibleCount(count => count + LOAD_MORE_COUNT);
            }
        }, 100);
    }, [hasMorePlugins]);

    useEffect(() => {
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", handleScroll);
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        };
    }, [handleScroll]);

    return (
        <PageBootstrap
            meta={{ title: "Plugins" }}
            fullWidth
            icon={<Puzzle />}
            title="Plugins"
            description={`${filteredPlugins.length} plugin${filteredPlugins.length !== 1 ? "s" : ""} found`}
        >
            <div className="flex items-center gap-3">
                <Input
                    placeholder="Search plugins..."
                    value={search}
                    onInput={e =>
                        updateSearch((e.target as HTMLInputElement).value)
                    }
                    icon={<Search size={18} />}
                    className="flex-1 py-1.5"
                />
                <PluginPopover
                    pluginFilter={pluginFilter}
                    setPluginFilter={setPluginFilter}
                    platformFilter={platformFilter}
                    setPlatformFilter={setPlatformFilter}
                    tagFilter={tagFilter}
                    setTagFilter={setTagFilter}
                    availableTags={availableTags}
                    filterHasCommands={filterHasCommands}
                    setFilterHasCommands={setFilterHasCommands}
                    compactMode={compactMode}
                    setCompactMode={setCompactMode}
                />
            </div>

            <main className="w-full">
                <LoadingState
                    loading={plugins === null && error === null}
                    error={error}
                    loadingText="Loading plugins"
                    errorText="Failed to load plugins"
                    onRetry={() => {
                        setPlugins(null);
                        setError(null);
                        fetchPlugins("all").then(setPlugins).catch(setError);
                    }}
                >
                    {filteredPlugins.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-1 py-12 text-neutral-200">
                            <SearchX size={48} className="text-neutral-500" />
                            <p className="text-lg font-bold">
                                No plugins found.
                            </p>
                            <p className="max-w-92 text-center font-medium text-neutral-300">
                                Try adjusting your search or filters to find
                                what you are looking for.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {visiblePlugins.map(plugin => (
                                    <PluginCard
                                        key={plugin.name}
                                        variant={
                                            compactMode ? "compact" : "normal"
                                        }
                                        {...plugin}
                                    />
                                ))}
                            </div>

                            {hasMorePlugins && (
                                <div className="mt-8 flex flex-col items-center gap-2">
                                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-sky-500" />
                                    <p className="text-sm text-neutral-400">
                                        Showing {visiblePlugins.length} of{" "}
                                        {filteredPlugins.length} plugins
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </LoadingState>
            </main>
        </PageBootstrap>
    );
}
