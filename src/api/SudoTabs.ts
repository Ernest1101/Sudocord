/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 dsd16
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { IconProps } from "@utils/types";
import type { ComponentType } from "react";

// Отдельные вкладки плагинов в секции SudoCord (сайдбар настроек).
// Живёт в ядре, чтобы userplugins (вне гита) регистрировались без импорта ядра.

export interface SudoTab {
    key: string;
    title: string;
    panelTitle?: string;
    Component: ComponentType<{}>;
    Icon: ComponentType<IconProps>;
}

const tabs: SudoTab[] = [];

export function addSudoTab(tab: SudoTab) {
    if (!tabs.some(t => t.key === tab.key)) tabs.push(tab);
}

export function removeSudoTab(key: string) {
    const i = tabs.findIndex(t => t.key === key);
    if (i !== -1) tabs.splice(i, 1);
}

export function getSudoTabs(): SudoTab[] {
    return [...tabs];
}
