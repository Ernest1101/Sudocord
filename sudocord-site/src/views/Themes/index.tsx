"use client";

import PageBootstrap from "@components/PageBootstrap";
import Input from "@components/UI/Input";
import { Paintbrush, Search } from "lucide-react";
import { useMemo, useState } from "react";

import rawThemes from "../../../public/api/themes.json";
import ThemeCard, { SudoTheme } from "./components/ThemeCard";

const themes = rawThemes as SudoTheme[];

export default function Themes() {
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return themes;
        return themes.filter(t =>
            t.name.toLowerCase().includes(q) ||
            t.author.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            t.tags.some(tag => tag.toLowerCase().includes(q)),
        );
    }, [search]);

    return (
        <PageBootstrap
            meta={{ title: "Better Themes" }}
            icon={<Paintbrush />}
            fullWidth
            title="Better Themes"
            description="Темы SudoCord для клиента. Скачай .css или скопируй ссылку в Online Themes."
        >
            <div className="flex flex-col gap-6">
                <div className="max-w-md">
                    <Input
                        icon={<Search size={14} />}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Название, автор или тег..."
                    />
                </div>
                <span className="text-sm text-neutral-500">
                    {filtered.length} тем
                </span>
                {filtered.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                        Ничего не найдено.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {filtered.map(theme => (
                            <ThemeCard
                                key={theme.id}
                                theme={theme}
                            />
                        ))}
                    </div>
                )}
            </div>
        </PageBootstrap>
    );
}
