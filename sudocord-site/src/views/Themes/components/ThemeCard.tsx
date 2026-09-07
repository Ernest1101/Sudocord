"use client";

import Button from "@components/UI/Button";
import { Check, Copy, DownloadIcon, Paintbrush } from "lucide-react";
import { useState } from "react";

export interface SudoTheme {
    id: number
    name: string
    description: string
    author: string
    downloads: number
    likes: string
    tags: string[]
    imageUrl: string
    downloadUrl: string
    detailUrl: string
    kind?: string
}

function formatNumber(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
}

export default function ThemeCard({ theme }: { theme: SudoTheme }) {
    const [copied, setCopied] = useState(false);
    const [imgOk, setImgOk] = useState(true);

    const copyUrl = async () => {
        try {
            await navigator.clipboard.writeText(theme.downloadUrl);
        } catch {
            const ta = document.createElement("textarea");
            ta.value = theme.downloadUrl;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col overflow-hidden rounded-xl border border-neutral-800 bg-linear-to-br from-neutral-900 to-neutral-950">
            {theme.imageUrl && imgOk && (
                <div className="h-36 w-full overflow-hidden bg-black/40">
                    <img
                        src={theme.imageUrl}
                        alt={theme.name}
                        loading="lazy"
                        onError={() => setImgOk(false)}
                        className="size-full object-cover"
                    />
                </div>
            )}
            <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-center gap-2">
                    <Paintbrush
                        size={14}
                        className="shrink-0 text-neutral-500"
                    />
                    <span className="truncate text-sm font-bold">
                        {theme.name}
                    </span>
                </div>
                <span className="text-xs text-neutral-500">
                    by {theme.author}
                </span>
                {theme.description && (
                    <p className="line-clamp-2 text-xs text-neutral-400">
                        {theme.description}
                    </p>
                )}
                {theme.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {theme.tags.slice(0, 4).map(tag => (
                            <span
                                key={tag}
                                className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
                <span className="text-[11px] text-neutral-600">
                    {formatNumber(theme.downloads)} загрузок | {theme.likes} лайков
                </span>
                <div className="mt-auto flex gap-2 pt-1">
                    <a
                        href={theme.downloadUrl}
                        target="_blank"
                        className="flex-1"
                    >
                        <Button
                            variant="secondary"
                            className="w-full px-3 py-2 text-xs"
                            icon={<DownloadIcon size={12} />}
                        >
                            Скачать
                        </Button>
                    </a>
                    <button
                        onClick={copyUrl}
                        title={theme.kind === "video" ? "Скопировать ссылку на видеофон" : "Скопировать ссылку для Online Themes"}
                        className="shrink-0 rounded-xl border border-neutral-800/50 bg-neutral-900 p-2 text-neutral-400 transition-colors hover:bg-neutral-800/70 hover:text-neutral-200"
                    >
                        {copied ? (
                            <Check
                                size={14}
                                className="text-green-400"
                            />
                        ) : (
                            <Copy size={14} />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
