"use client";

import Button from "@components/UI/Button";
import LoadingState from "@components/UI/LoadingState";
import { fetchPlugins, formatAuthors, type Plugin } from "@utils/plugin";
import {
    ArrowLeft,
    Braces,
    ChartNoAxesColumnDecreasing,
    ChevronRight,
    Code,
    Command,
    FileText,
    Globe,
    Link as LinkIcon,
    Notebook,
    Tags,
    Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

const enum PluginSource {
    SudoCord = "SudoCord",
    Vencord = "Vencord",
    Modified = "Modified",
    Unknown = "Unknown",
}

export const getPluginSource = (props: {
    filePath: string;
    isModified: boolean;
}): PluginSource => {
    const { filePath, isModified } = props;
    const lower = filePath.toLowerCase();

    if (isModified) return PluginSource.Modified;
    if (lower.startsWith("src/equicordplugins")) return PluginSource.SudoCord;
    if (lower.startsWith("src/plugins")) return PluginSource.Vencord;

    return PluginSource.Unknown;
};

interface PluginSourceProps {
    source: PluginSource;
    size: number;
}

const pluginIcons: Record<PluginSource, string> = {
    [PluginSource.SudoCord]: "/assets/icons/equicord/icon.png",
    [PluginSource.Vencord]: "/assets/icons/vencord/icon.webp",
    [PluginSource.Modified]: "/assets/icons/equicord/modified.webp",
    [PluginSource.Unknown]: "/assets/icons/misc/userplugin.webp",
};

export function PluginSourceIcon({ size, source }: PluginSourceProps) {
    const icon = pluginIcons[source];

    return (
        <span
            className={"rounded-full py-0.5 font-semibold flex items-center gap-1"}
        >
            {icon && (
                <Image
                    src={icon}
                    width={size * 4}
                    height={size * 4}
                    className={`size-${size}`}
                    alt={source}
                />
            )}
        </span>
    );
}

export default function PluginDetails({
    params,
}: {
    params: { name: string; };
}) {
    const router = useRouter();
    const [plugins, setPlugins] = useState<Plugin[] | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [activeTab, setActiveTab] = useState<"overview" | "commands">(
        "overview",
    );

    useEffect(() => {
        fetchPlugins("all").then(setPlugins).catch(setError);
    }, []);

    const plugin = useMemo(
        () =>
            plugins?.find(
                p => p.name.toLowerCase() === params.name?.toLowerCase(),
            ),
        [plugins, params.name],
    );

    const copyLink = (plugin: Plugin) => {
        const url = `https://equicord.org/plugins/${plugin.name}`;
        navigator.clipboard.writeText(url);
        toast.success("Copied Link", {
            className:
                "border-1 !rounded-xl !bg-neutral-900 !text-white !font-medium border-neutral-800",
            iconTheme: {
                primary: "#fff",
                secondary: "var(--color-neutral-900)",
            },
        });
    };

    return (
        <>
            <title>{plugin ? `${plugin.name} | SudoCord` : "Plugins | SudoCord"}</title>

            <div className="max-w-eq-lg mx-auto flex flex-col gap-6 px-6 py-12">
                <LoadingState
                    loading={plugins === null && error === null}
                    error={error}
                    loadingText="Loading plugin"
                    errorText="Failed to load plugin"
                    onRetry={() => {
                        setPlugins(null);
                        setError(null);
                        fetchPlugins("all").then(setPlugins).catch(setError);
                    }}
                >
                    {!plugin ? (
                        <div className="flex flex-col items-center justify-center gap-1 text-neutral-200">
                            <FileText size={48} className="text-neutral-500" />

                            <p className="text-lg font-bold">
                                Plugin not found.
                            </p>

                            <p className="max-w-92 text-center font-medium text-neutral-300">
                                The plugin &quot;{params.name}&quot; could not
                                be found.
                            </p>

                            <Button
                                variant="secondary"
                                className="mt-2"
                                icon={<Globe size={16} />}
                                onClick={() => router.push("/plugins")}
                            >
                                Browse plugins
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">
                            <Link
                                href="/plugins"
                                className="flex w-fit items-center gap-1 font-medium transition-all hover:opacity-80 active:scale-[.95]"
                            >
                                <ArrowLeft size={16} />
                                Back to plugins
                            </Link>
                            <header className="flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                    <div className="flex size-16 items-center justify-center rounded-xl border border-neutral-800 bg-linear-to-t from-neutral-900 to-neutral-800/90 outline-2 outline-offset-2 outline-neutral-600/50">
                                        <PluginSourceIcon
                                            source={getPluginSource(plugin)}
                                            size={12}
                                        />
                                    </div>

                                    <div className="flex flex-col">
                                        <div className="flex gap-2 items-center">
                                            <h1 className="text-2xl font-bold">
                                                {plugin.name}
                                            </h1>
                                        </div>
                                        <div className="flex items-center gap-2 font-medium text-neutral-300">
                                            <Users size={16} />
                                            <span>
                                                By{" "}
                                                {formatAuthors(plugin.authors)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex w-fit items-center gap-2">
                                    <a
                                        href={`https://github.com/Ernest1101/Sudocord/tree/main/${plugin.filePath}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-1 rounded-xl border px-4 py-2.5 text-sm font-bold transition-all cursor-pointer active:scale-[.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 border-neutral-800/50 bg-neutral-900 text-neutral-300 hover:bg-neutral-800/70 hover:text-neutral-200 focus-visible:ring-neutral-500"
                                    >
                                        <span className="shrink-0">
                                            <Code size={16} />
                                        </span>
                                        View Source
                                    </a>
                                    <Button
                                        icon={<LinkIcon size={16} />}
                                        variant="secondary"
                                        className="px-4! py-2.5! text-sm"
                                        onClick={() => copyLink(plugin)}
                                    >
                                        Copy Link
                                    </Button>
                                </div>
                            </header>

                            <div className="flex items-center gap-2">
                                <Button
                                    icon={
                                        <ChartNoAxesColumnDecreasing
                                            size={16}
                                        />
                                    }
                                    variant={
                                        activeTab === "overview"
                                            ? "primary"
                                            : "secondary"
                                    }
                                    className="text-sm"
                                    onClick={() => setActiveTab("overview")}
                                >
                                    Overview
                                </Button>
                                <Button
                                    icon={<Braces size={16} />}
                                    disabled={!plugin.hasCommands}
                                    variant={
                                        activeTab === "commands"
                                            ? "primary"
                                            : "secondary"
                                    }
                                    className="text-sm"
                                    onClick={() =>
                                        plugin.hasCommands &&
                                        setActiveTab("commands")
                                    }
                                >
                                    Commands
                                </Button>
                            </div>

                            {activeTab === "overview" && (
                                <div className="flex flex-col gap-3">
                                    {plugin.tags && plugin.tags.length > 0 && (
                                        <>
                                            <h4 className="flex items-center gap-2 text-sm font-medium text-neutral-300">
                                                <Tags size={16} /> Tags
                                            </h4>

                                            <div className="flex flex-wrap gap-2">
                                                {plugin.tags.map(tag => (
                                                    <span
                                                        key={tag}
                                                        className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-300"
                                                    >
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </>
                                    )}

                                    <h4 className="mt-2 flex items-center gap-2 text-sm font-medium text-neutral-300">
                                        <Notebook size={16} /> Description
                                    </h4>

                                    <p className="leading-relaxed font-medium">
                                        {plugin.description ||
                                            "No description available."}
                                    </p>
                                </div>
                            )}

                            {activeTab === "commands" && (
                                <div className="flex flex-col gap-6">
                                    <h4 className="flex items-center gap-2 text-sm font-medium text-neutral-300">
                                        <Command size={16} />
                                        Commands
                                        <span className="rounded-full bg-neutral-800 px-3 text-xs font-medium">
                                            {plugin.commands.length}
                                        </span>
                                    </h4>

                                    <div className="flex flex-col gap-3">
                                        {plugin.commands.map(command => (
                                            <div
                                                key={command.name}
                                                className="flex flex-col gap-2 border-b border-neutral-900 pb-3"
                                            >
                                                <h4 className="flex items-center gap-2 font-medium">
                                                    <span className="rounded-lg bg-neutral-800 p-1">
                                                        <ChevronRight
                                                            size={14}
                                                        />
                                                    </span>
                                                    {command.name}
                                                </h4>

                                                {command.description && (
                                                    <p className="text-sm text-neutral-400">
                                                        {command.description}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </LoadingState>
            </div>
        </>
    );
}
