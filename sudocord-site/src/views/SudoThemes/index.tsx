"use client";

import PageBootstrap from "@components/PageBootstrap";
import ThemeCard, { SudoTheme } from "@views/Themes/components/ThemeCard";
import { Paintbrush } from "lucide-react";
import { useEffect, useState } from "react";

export default function SudoThemes() {
    const [themes, setThemes] = useState<SudoTheme[] | null>(null);

    useEffect(() => {
        fetch("/api/sudo-themes.json")
            .then(r => (r.ok ? r.json() : []))
            .then((d: SudoTheme[]) => setThemes(Array.isArray(d) ? d : []))
            .catch(() => setThemes([]));
    }, []);

    return (
        <PageBootstrap
            meta={{ title: "Themes" }}
            icon={<Paintbrush />}
            fullWidth
            title="Themes"
            description="Родные темы SudoCord. Скачай .css или скопируй ссылку в Online Themes."
        >
            {themes === null ? (
                <p className="text-sm text-neutral-500">
                    Загрузка...
                </p>
            ) : themes.length === 0 ? (
                <div className="flex flex-col gap-4 rounded-xl border border-neutral-800 bg-linear-to-br from-neutral-900 to-neutral-950 p-8 text-center">
                    <span className="text-lg font-bold">
                        Пока пусто
                    </span>
                    <p className="mx-auto max-w-md text-sm text-neutral-400">
                        Здесь появятся родные темы SudoCord. Свои темы присылай
                        владельцу — лучшие попадут в подборку.
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    <span className="text-sm text-neutral-500">
                        {themes.length} тем
                    </span>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {themes.map(theme => (
                            <ThemeCard
                                key={theme.id}
                                theme={theme}
                            />
                        ))}
                    </div>
                </div>
            )}
        </PageBootstrap>
    );
}
