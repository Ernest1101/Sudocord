/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 dsd16
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ComponentType } from "react";

// Дополнительные секции плагинов во вкладке Темы (рисуются в Local Themes).
// Живёт в ядре, чтобы userplugins (вне гита) регистрировались без импорта ядра.

export interface ThemeSection {
    key: string;
    component: ComponentType<{}>;
}

const sections: ThemeSection[] = [];

export function addThemeSection(section: ThemeSection) {
    if (!sections.some(s => s.key === section.key)) sections.push(section);
}

export function removeThemeSection(key: string) {
    const i = sections.findIndex(s => s.key === key);
    if (i !== -1) sections.splice(i, 1);
}

export function getThemeSections(): ThemeSection[] {
    return [...sections];
}
