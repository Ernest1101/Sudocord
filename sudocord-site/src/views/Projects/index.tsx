"use client";

import PageBootstrap from "@components/PageBootstrap";
import Input from "@components/UI/Input";
import LoadingState from "@components/UI/LoadingState";
import { CacheKeys, CacheTTL, LanguageColors, Urls } from "@constants";
import { cleanDescription } from "@utils/plugin";
import { Book, BookMarked, Search, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { Repository } from "@/types";

const fetchRepos = async (): Promise<Repository[]> => {
    try {
        const cached = localStorage.getItem(CacheKeys.REPOS);
        if (cached) {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CacheTTL.SIXHOURS) {
                return data;
            }
        }
    } catch {}

    const res = await fetch(Urls.GITHUB_REPOS);
    let data: Repository[] = await res.json();

    data = data
        .filter(repo => !repo.archived)
        .sort((a, b) => b.stargazers_count - a.stargazers_count);

    try {
        localStorage.setItem(
            CacheKeys.REPOS,
            JSON.stringify({ timestamp: Date.now(), data }),
        );
    } catch {}

    return data;
};

const LanguageTag = ({ lang }: { lang: string | null }) => {
    if (!lang)
        return (
            <span className="flex items-center gap-2 text-sm font-medium text-neutral-400">
                Unknown
            </span>
        );

    const color = LanguageColors[lang] || LanguageColors.default;

    return (
        <span className="flex items-center gap-2 text-sm font-medium text-neutral-300">
            <span className={`w-2 h-2 rounded-full ${color}`} /> {lang}
        </span>
    );
};

export default function Projects() {
    const [repos, setRepos] = useState<Repository[] | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [search, setSearch] = useState("");

    useEffect(() => {
        fetchRepos().then(setRepos).catch(setError);
    }, []);

    const filteredRepos = useMemo(() => {
        if (!repos) return [];

        const query = search.toLowerCase().trim();
        if (!query) return repos;

        return repos.filter(
            repo =>
                repo.name.toLowerCase().includes(query) ||
                repo.description?.toLowerCase().includes(query) ||
                repo.language?.toLowerCase().includes(query),
        );
    }, [repos, search]);

    return (
        <PageBootstrap
            meta={{ title: "Projects" }}
            icon={<BookMarked />}
            fullWidth
            title="Projects"
            description={`${filteredRepos.length} active repositor${filteredRepos.length !== 1 ? "ies" : "y"}`}
        >
            <div className="flex flex-col gap-6">
                <Input
                    placeholder="Search projects..."
                    value={search}
                    onInput={e =>
                        setSearch((e.target as HTMLInputElement).value)
                    }
                    icon={<Search size={18} />}
                    className="max-w-md"
                />

                <div className="flex items-center flex-wrap gap-6">
                    <LoadingState
                        loading={repos === null && error === null}
                        error={error}
                        loadingText="Loading repositories"
                        errorText="Failed to load repositories"
                        onRetry={() => {
                            setRepos(null);
                            setError(null);
                            fetchRepos().then(setRepos).catch(setError);
                        }}
                    >
                        {filteredRepos.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-1 py-12 text-neutral-200 w-full">
                                <BookMarked
                                    size={48}
                                    className="text-neutral-500"
                                />
                                <p className="text-lg font-bold">
                                    No projects found
                                </p>
                                <p className="text-neutral-400 text-sm">
                                    Try a different search term
                                </p>
                            </div>
                        ) : (
                            filteredRepos.map(repo => (
                                <Link
                                    key={repo.full_name}
                                    href={
                                        "https://github.com/" + repo.full_name
                                    }
                                    target="_blank"
                                    className="flex-1 min-w-full sm:min-w-96 flex flex-col justify-between gap-6 h-52 py-6 px-6 rounded-xl bg-linear-to-br from-neutral-900 to-neutral-950 border border-neutral-800 transition-transform active:scale-[.98]"
                                >
                                    <div className="flex flex-col gap-3">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-3">
                                                <div className="items-center justify-center bg-linear-to-t from-neutral-900 to-neutral-800/90 outline-2 outline-offset-2 outline-neutral-600/50 flex size-10 rounded-lg border border-neutral-800">
                                                    <Book size={16} />
                                                </div>

                                                <div className="inline-block leading-tight">
                                                    <span className="text-xs text-neutral-400 font-medium">
                                                        {repo.full_name}
                                                    </span>
                                                    <h2 className="text-xl font-semibold">
                                                        {repo.name}
                                                    </h2>
                                                </div>
                                            </div>

                                            <span className="inline-flex items-center text-neutral-300 font-medium gap-1">
                                                <Star size={16} />
                                                {repo.stargazers_count}
                                            </span>
                                        </div>

                                        <p className="text-sm font-medium text-neutral-300">
                                            {cleanDescription(
                                                repo.description,
                                            ) || "No description"}
                                        </p>
                                    </div>

                                    <LanguageTag lang={repo.language} />
                                </Link>
                            ))
                        )}
                    </LoadingState>
                </div>
            </div>
        </PageBootstrap>
    );
}
