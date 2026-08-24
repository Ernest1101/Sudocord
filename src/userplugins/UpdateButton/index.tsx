/*
 * SudoCord, a modification for Discord's desktop app
 * Copyright (c) 2026 dsd16
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import ErrorBoundary from "@components/ErrorBoundary";
import { relaunch } from "@utils/native";
import { checkForUpdates, update } from "@utils/updater";
import definePlugin from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { Toasts, useRef, useState } from "@webpack/common";
import type { PropsWithChildren } from "react";

const HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_BOTTOM,", 'position:"bottom"');

function UpdateIcon({ busy }: { busy: boolean; }) {
    return (
        <svg
            viewBox="0 0 24 24"
            width={20}
            height={20}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={busy ? { opacity: 0.5 } : undefined}
        >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
        </svg>
    );
}

function toast(message: string, type: number) {
    Toasts.show({
        message,
        type,
        id: Toasts.genId()
    });
}

function SudoCordUpdateButton() {
    const buttonRef = useRef(null);
    const [busy, setBusy] = useState(false);

    async function onClick() {
        if (busy) return;
        setBusy(true);
        try {
            toast("Проверяю обновления SudoCord...", 1);
            const outdated = await checkForUpdates();
            if (!outdated) {
                toast("SudoCord актуальной версии", 2);
                return;
            }
            toast("Обновляю SudoCord...", 1);
            const ok = await update();
            if (!ok) throw new Error("update failed");
            toast("Готово! Перезапускаю Discord...", 2);
            setTimeout(relaunch, 1000);
        } catch (err: any) {
            console.error("[UpdateButton] update failed:", err);
            toast("Ошибка обновления. Запустите инсталлер Sudotl вручную", 3);
        } finally {
            setBusy(false);
        }
    }

    return (
        <HeaderBarIcon
            ref={buttonRef}
            className="vc-update-btn"
            onClick={onClick}
            tooltip={busy ? "Обновление..." : "Проверить обновления SudoCord"}
            icon={() => <UpdateIcon busy={busy} />}
        />
    );
}

export default definePlugin({
    name: "UpdateButton",
    description: "Кнопка рядом с инбоксом: проверяет обновления SudoCord и обновляет клиент в один клик",
    tags: ["Utility"],
    authors: [{ name: "dsd16", id: 0n }],
    enabledByDefault: true,

    patches: [
        {
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(trailing:.{0,50}?)(\i\.Fragment|\i\.\w+Wrapper),(?=\{children:\[)/,
                replace: "$1$self.TrailingWrapper,"
            }
        }
    ],

    TrailingWrapper({ children }: PropsWithChildren) {
        return (
            <>
                {children}
                <ErrorBoundary key="vc-update-btn" noop>
                    <SudoCordUpdateButton />
                </ErrorBoundary>
            </>
        );
    },
});
