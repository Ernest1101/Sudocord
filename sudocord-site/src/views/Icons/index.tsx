"use client";

import PageBootstrap from "@components/PageBootstrap";
import Input from "@components/UI/Input";
import LoadingState from "@components/UI/LoadingState";
import { CacheKeys, CacheTTL, CLIENT_MODS, Urls } from "@constants";
import {
    capitalizeArtist,
    capitalizeWords,
    splitCamelCase,
} from "@utils/formatting";
import classNames from "classnames";
import { Download, Image as ImageIcon, Search } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import type { DisplayImage, FolderImages, GitHubContent } from "@/types";

function formatTitle(name: string): string {
    const base = name.replace(/\.[^/.]+$/, "");
    const parts = base.split("-");

    if (parts.length === 2) {
        return `${capitalizeWords(splitCamelCase(parts[0]))} by ${capitalizeArtist(parts[1])}`;
    }

    return capitalizeWords(splitCamelCase(base));
}

function formatFolderName(name: string): string {
    return capitalizeWords(splitCamelCase(name));
}

async function fetchImagesRecursiveInternal(
    apiUrl: string,
    currentFolder = "",
): Promise<FolderImages[]> {
    const res = await fetch(apiUrl);
    if (!res.ok) return [];

    const data: GitHubContent[] = await res.json();
    const folders = new Map<string, DisplayImage[]>();

    for (const item of data) {
        if (item.type === "file" && item.download_url) {
            const title = formatTitle(item.name);

            if (!folders.has(currentFolder)) {
                folders.set(currentFolder, []);
            }

            folders.get(currentFolder)!.push({ title, url: item.download_url });
        } else if (item.type === "dir") {
            const subFolders = await fetchImagesRecursiveInternal(
                item.url,
                item.name,
            );
            subFolders.forEach(({ folder, images }) => {
                if (!folders.has(folder)) {
                    folders.set(folder, []);
                }
                folders.get(folder)!.push(...images);
            });
        }
    }

    return Array.from(folders.entries()).map(([folder, images]) => ({
        folder,
        images,
    }));
}

async function fetchImagesRecursive(apiUrl: string): Promise<FolderImages[]> {
    try {
        const cached = localStorage.getItem(CacheKeys.ICONS);
        if (cached) {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CacheTTL.SIXHOURS) {
                return data;
            }
        }
    } catch {}

    const data = await fetchImagesRecursiveInternal(apiUrl);

    try {
        localStorage.setItem(
            CacheKeys.ICONS,
            JSON.stringify({ timestamp: Date.now(), data }),
        );
    } catch {}

    return data;
}

const downloadIcon = async (url: string, title: string) => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = title.replace(/\s+/g, "_") + ".png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        toast.success(`Downloaded ${title}`);
    } catch (error) {
        console.error("Failed to download icon:", error);
        toast.error("Failed to download icon");
    }
};

function IconCard({ title, url }: { title: string; url: string }) {
    return (
        <div
            className={classNames(
                "group relative flex flex-col items-center gap-3 rounded-xl border border-neutral-800 bg-linear-to-br from-neutral-900 to-neutral-950 p-4",
                "hover:border-neutral-700 hover:shadow-lg hover:shadow-neutral-900/50 transition-all duration-200",
            )}
        >
            <div className="relative w-full aspect-square">
                <Image
                    src={url}
                    alt={title}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                    className="object-contain rounded-lg cursor-pointer"
                    onClick={() => window.open(url, "_blank")}
                    unoptimized
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-colors duration-200 rounded-lg flex items-center justify-center">
                    <button
                        onClick={() => downloadIcon(url, title)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm"
                        title="Download icon"
                    >
                        <Download size={20} className="text-white" />
                    </button>
                </div>
            </div>
            <span className="text-center text-xs font-medium text-neutral-300 line-clamp-2 w-full">
                {title}
            </span>
        </div>
    );
}

export default function Icons() {
    const [folders, setFolders] = useState<FolderImages[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchImagesRecursive(Urls.GITHUB_ICONS).then(images => {
            images.sort((a, b) => {
                if (a.folder === "equicord") return -1;
                if (b.folder === "equicord") return 1;
                if (a.folder === "") return 1;
                if (b.folder === "") return -1;
                if (CLIENT_MODS.includes(a.folder)) return 1;
                if (CLIENT_MODS.includes(b.folder)) return -1;
                return a.folder.localeCompare(b.folder);
            });

            setFolders(images);
            setLoading(false);
        });
    }, []);

    const filteredFolders = useMemo(() => {
        const query = searchQuery.toLowerCase();
        if (!query) return folders;

        return folders
            .map(folder => ({
                ...folder,
                images: folder.images.filter(img =>
                    img.title.toLowerCase().includes(query),
                ),
            }))
            .filter(folder => folder.images.length > 0);
    }, [folders, searchQuery]);

    const totalIcons = folders.reduce(
        (acc, folder) => acc + folder.images.length,
        0,
    );

    return (
        <PageBootstrap
            meta={{ title: "Icons" }}
            icon={<ImageIcon />}
            fullWidth
            title="Icon Gallery"
            description="Browse and download custom Discord icons for SudoCord"
        >
            <div className="flex flex-col gap-8">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex-1 max-w-md w-full">
                        <div className="relative">
                            <Search
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                                size={18}
                            />
                            <Input
                                type="text"
                                placeholder="Search icons..."
                                value={searchQuery}
                                onInput={e =>
                                    setSearchQuery(
                                        (e.target as HTMLInputElement).value,
                                    )
                                }
                                className="pl-10 w-full"
                            />
                        </div>
                    </div>
                    {!loading && (
                        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-800/50 border border-neutral-700">
                            <ImageIcon size={16} className="text-neutral-400" />
                            <span className="text-sm text-neutral-300">
                                {totalIcons} icons available
                            </span>
                        </div>
                    )}
                </div>

                <LoadingState loading={loading} loadingText="Loading icons">
                    {filteredFolders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <ImageIcon className="text-neutral-600" size={64} />
                            <p className="text-neutral-400">
                                No icons found matching &quot;{searchQuery}
                                &quot;
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-16">
                            {filteredFolders
                                .filter(f => !CLIENT_MODS.includes(f.folder))
                                .map(({ folder, images }) => (
                                    <div
                                        key={folder}
                                        className="flex flex-col gap-6"
                                    >
                                        <div className="flex items-center gap-3">
                                            <h2 className="text-2xl font-bold">
                                                {folder === ""
                                                    ? "General"
                                                    : formatFolderName(folder)}
                                            </h2>
                                            <span className="px-3 py-1 rounded-full bg-neutral-800 text-neutral-400 text-sm font-medium">
                                                {images.length}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                            {images.map(({ title, url }) => (
                                                <IconCard
                                                    key={url}
                                                    title={title}
                                                    url={url}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}

                            {filteredFolders.some(f =>
                                CLIENT_MODS.includes(f.folder),
                            ) && (
                                <div className="flex flex-col gap-6">
                                    <h2 className="text-2xl font-bold">
                                        Client Mods
                                    </h2>
                                    {filteredFolders
                                        .filter(f =>
                                            CLIENT_MODS.includes(f.folder),
                                        )
                                        .map(({ folder, images }) => (
                                            <div
                                                key={folder}
                                                className="flex flex-col gap-3"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <h3 className="text-xl font-semibold">
                                                        {formatFolderName(
                                                            folder,
                                                        )}
                                                    </h3>
                                                    <span className="px-2 py-1 rounded-full bg-neutral-800 text-neutral-400 text-sm font-medium">
                                                        {images.length}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                                    {images.map(
                                                        ({ title, url }) => (
                                                            <IconCard
                                                                key={url}
                                                                title={title}
                                                                url={url}
                                                            />
                                                        ),
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    )}
                </LoadingState>
            </div>
        </PageBootstrap>
    );
}
