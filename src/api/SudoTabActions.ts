/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 dsd16
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ComponentType } from "react";

// Кнопки плагинов во вкладке SudoCord (секция Quick Actions).
// Живёт в ядре, чтобы userplugins (вне гита) могли регистрироваться без импорта ядра.

export interface SudoTabAction {
    key: string;
    Icon: ComponentType<{ className?: string; }>;
    text: string;
    action: () => void;
}

const actions: SudoTabAction[] = [];

export function addSudoTabAction(action: SudoTabAction) {
    if (!actions.some(a => a.key === action.key)) actions.push(action);
}

export function removeSudoTabAction(key: string) {
    const i = actions.findIndex(a => a.key === key);
    if (i !== -1) actions.splice(i, 1);
}

export function getSudoTabActions(): SudoTabAction[] {
    return [...actions];
}
