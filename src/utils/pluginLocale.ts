/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Plugin descriptions follow the language selected in Discord (LocaleStore):
//   ru*            -> Russian: the plugin's own `descriptionLocales.ru`, else a checked translation from pluginI18n
//   anything else  -> English (`description`), including en-US / en-GB and every language without a translation
// usePluginLang() subscribes to LocaleStore, so changing Discord's language re-renders without a restart.

import { pluginTranslations } from "@api/pluginI18n";
import type { Plugin, PluginLang } from "@utils/types";
import { LocaleStore, useStateFromStores } from "@webpack/common";

export function localeToPluginLang(locale: string | undefined | null): PluginLang {
    return locale?.toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function getPluginLang(): PluginLang {
    try {
        return localeToPluginLang(LocaleStore?.locale);
    } catch {
        return "en";
    }
}

/** Current plugin language; re-renders the component when Discord's language changes. */
export function usePluginLang(): PluginLang {
    return useStateFromStores([LocaleStore], getPluginLang);
}

// The bulk translations in pluginI18n are machine-generated and some entries are broken (leftover "⟦SEP⟧" markers,
// a neighbouring string's text, truncated halves). Only use a translation that looks like a translation of `text`.
function isUsableTranslation(text: string, translated: string | undefined): translated is string {
    if (!translated || translated === text || /[⟦⟧]/.test(translated)) return false;
    if (!/[Ѐ-ӿ]/.test(translated)) return false;
    const ratio = translated.length / Math.max(text.length, 1);
    if (ratio < 0.6 || ratio > 2.2) return false;
    return translated.split("\n").length === text.split("\n").length;
}

export function getPluginDescription(plugin: Pick<Plugin, "description" | "descriptionLocales">, lang: PluginLang = getPluginLang()) {
    const own = plugin.descriptionLocales?.[lang];
    if (own) return own;

    if (lang === "ru") {
        const translated = pluginTranslations[plugin.description]?.ru;
        if (isUsableTranslation(plugin.description, translated)) return translated;
    }

    return plugin.description;
}
