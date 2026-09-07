"use client";

import Button from "@components/UI/Button";
import { CacheKeys, CacheTTL, Urls } from "@constants";
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { formatTimeAgo, truncateText } from "@utils/formatting";
import { Check, Merge, TrafficCone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { Commit } from "@/types";

async function fetchCommits(): Promise<Commit[]> {
    try {
        const cached = localStorage.getItem(CacheKeys.COMMITS);
        if (cached) {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CacheTTL.HALFHOUR) {
                return data;
            }
        }
    } catch {}

    const res = await fetch(`${Urls.GITHUB_COMMITS}?per_page=4`);
    if (!res.ok) return [];

    const data: Commit[] = await res.json();

    try {
        localStorage.setItem(
            CacheKeys.COMMITS,
            JSON.stringify({ timestamp: Date.now(), data }),
        );
    } catch {}

    return data;
}

function isMergeCommit(message: string): boolean {
    return message.toLowerCase().startsWith("merge");
}

function Commits() {
    const [commits, setCommits] = useState<Commit[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCommits().then(data => {
            setCommits(data);
            setLoading(false);
        });
    }, []);

    return (
        <div className="flex h-64 border-l border-neutral-800 pl-4 sm:pl-8">
            <div className="flex flex-col rounded-xl border border-neutral-800 bg-neutral-900 mask-b-from-80% md:w-72">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-sky-500" />
                    </div>
                ) : (
                    commits.map(commit => (
                        <div
                            key={commit.sha}
                            className="flex flex-col gap-1 border-b border-neutral-800 py-3 pr-6 pl-4"
                        >
                            <span className="font-semibold">
                                {truncateText(commit.commit.message)}
                            </span>

                            <p className="flex items-center gap-2 text-sm font-medium text-neutral-400">
                                Committed{" "}
                                {formatTimeAgo(commit.commit.author.date)}
                                {isMergeCommit(commit.commit.message) ? (
                                    <Merge
                                        className="text-purple-500"
                                        size={16}
                                    />
                                ) : (
                                    <Check
                                        className="text-green-500"
                                        size={16}
                                    />
                                )}
                            </p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default function FeatureMaintained() {
    return (
        <div className="flex justify-between gap-6 max-md:flex-col md:flex-row-reverse">
            <div className="flex w-full flex-col gap-6 rounded-xl bg-neutral-900 px-8 py-12 md:w-2/3 md:justify-between">
                <div className="flex flex-col gap-2">
                    <span className="flex items-center gap-2 text-xl font-semibold">
                        <TrafficCone fill="#ffffff10" size={24} />
                        Actively Maintained
                    </span>

                    <p className="font-medium text-neutral-400">
                        Active maintenance ensures every plugin remains safe and
                        compatible with any Discord changes.
                    </p>
                </div>

                <Link
                    href="https://github.com/Ernest1101/Sudocord"
                    target="_blank"
                    className="w-fit"
                >
                    <Button
                        variant="secondary"
                        icon={
                            <FontAwesomeIcon
                                icon={faGithub}
                                className="size-4"
                            />
                        }
                    >
                        View repository
                    </Button>
                </Link>
            </div>

            <div className="flex w-full items-center justify-center py-6 max-md:px-8 max-sm:gap-3">
                <Commits />
            </div>
        </div>
    );
}
