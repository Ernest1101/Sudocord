"use client";

import Button from "@components/UI/Button";
import Dropdown from "@components/UI/Dropdown";
import Switch from "@components/UI/Switch";
import { Blocks, Braces, Cog, Monitor, Tags } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type PluginFilterValue = "all" | "equicord" | "vencord" | "modified";
type PlatformFilterValue =
    | "all"
    | "dev"
    | "web"
    | "desktop"
    | "discordDesktop"
    | "equibop";

interface Props {
    pluginFilter: PluginFilterValue;
    setPluginFilter: (value: PluginFilterValue) => void;
    platformFilter: PlatformFilterValue;
    setPlatformFilter: (value: PlatformFilterValue) => void;
    filterHasCommands: boolean;
    setFilterHasCommands: (value: boolean) => void;
    compactMode: boolean;
    setCompactMode: (value: boolean) => void;
    tagFilter: string;
    setTagFilter: (value: string) => void;
    availableTags: string[];
}

const Platforms = [
    { label: "All", value: "all" as const },
    { label: "Desktop", value: "desktop" as const },
    { label: "Web", value: "web" as const },
    { label: "Discord App", value: "discordDesktop" as const },
    { label: "Equibop", value: "equibop" as const },
    { label: "Dev Build", value: "dev" as const },
];

const Sources = [
    { label: "All", value: "all" as const },
    {
        label: "Vencord",
        icon: (
            <Image
                src="/assets/icons/vencord/icon.webp"
                width={24}
                height={24}
                className="size-6 select-none"
                alt="Vencord"
            />
        ),
        value: "vencord" as const,
    },
    {
        label: "SudoCord",
        icon: (
            <Image
                src="/assets/icons/equicord/icon.png"
                width={24}
                height={24}
                className="size-6 select-none"
                alt="SudoCord"
            />
        ),
        value: "equicord" as const,
    },
    {
        label: "Modified",
        icon: (
            <Image
                src="/assets/icons/equicord/modified.webp"
                width={24}
                height={24}
                className="size-6 select-none"
                alt="SudoCord"
            />
        ),
        value: "modified" as const,
    },
];

export default function PluginPopover({
    pluginFilter,
    setPluginFilter,
    platformFilter,
    setPlatformFilter,
    filterHasCommands,
    setFilterHasCommands,
    compactMode,
    setCompactMode,
    tagFilter,
    setTagFilter,
    availableTags,
}: Props) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const toggle = () => setOpen(prev => !prev);
    const close = () => setOpen(false);

    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest(".popover-container")) close();
    };

    useEffect(() => {
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, []);

    return (
        <div
            ref={containerRef}
            className="popover-container relative inline-block"
        >
            <Button
                icon={<Cog size={16} />}
                variant="secondary"
                onClick={toggle}
            >
                Options
            </Button>

            {open && (
                <div className="absolute right-0 z-50 mt-2 flex w-68 flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4 shadow-lg">
                    <Switch
                        icon={<Blocks size={16} />}
                        label="Compact Mode"
                        checked={compactMode}
                        onChange={e =>
                            setCompactMode(e.currentTarget.checked)
                        }
                    />

                    <Switch
                        icon={<Braces size={16} />}
                        label="Has Commands"
                        checked={filterHasCommands}
                        onChange={e =>
                            setFilterHasCommands(e.currentTarget.checked)
                        }
                    />

                    <Dropdown<PluginFilterValue>
                        icon={<Blocks size={16} />}
                        items={Sources.map(item => ({
                            icon: item.icon,
                            label: item.label,
                            value: item.value,
                        }))}
                        selected={
                            Sources.find(
                                item => item.value === pluginFilter,
                            ) ?? null
                        }
                        onSelect={item => setPluginFilter(item.value)}
                        placeholder="Source"
                    />

                    <Dropdown<PlatformFilterValue>
                        icon={<Monitor size={16} />}
                        items={Platforms.map(item => ({
                            label: item.label,
                            value: item.value,
                        }))}
                        selected={
                            Platforms.find(
                                item => item.value === platformFilter,
                            ) ?? null
                        }
                        onSelect={item => setPlatformFilter(item.value)}
                        placeholder="Platform"
                    />

                    {availableTags.length > 0 && (
                        <Dropdown<string>
                            icon={<Tags size={16} />}
                            items={[
                                { label: "All Tags", value: "all" },
                                ...availableTags.map(tag => ({
                                    label: tag,
                                    value: tag,
                                })),
                            ]}
                            selected={
                                tagFilter === "all"
                                    ? { label: "All Tags", value: "all" }
                                    : { label: tagFilter, value: tagFilter }
                            }
                            onSelect={item => setTagFilter(item.value)}
                            placeholder="Tag"
                        />
                    )}
                </div>
            )}
        </div>
    );
}
