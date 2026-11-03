/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

export function AlwaysRightIcon({
    width = 20,
    height = 20,
    color = "currentColor",
    className,
    loading = false,
}: {
    width?: number;
    height?: number;
    color?: string;
    className?: string;
    loading?: boolean;
}) {
    return (
        <svg
            className={`vc-ic-save-icon ${className ?? ""}`}
            aria-hidden="true"
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            width={width}
            height={height}
            fill="none"
            viewBox="0 0 24 24"
            style={{
                display: "block",
                color: loading ? "var(--brand-500)" : color,
                opacity: loading ? 0.75 : 1,
                transition: "transform 0.2s ease, color 0.2s ease, opacity 0.2s ease",
                transform: loading ? "scale(0.92)" : "scale(1)",
            }}
        >
            <path
                fill="currentColor"
                fillRule="evenodd"
                d="M5 2a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h9c.1 0 .12-.11.04-.15a3 3 0 0 1-2.03-3.16c.04-.34-.2-.69-.55-.69H6a1 1 0 1 1 0-2h9.5a.5.5 0 0 0 .5-.5V15a3 3 0 0 1 .19-1.05c.15-.4-.11-.95-.54-.95H6a1 1 0 1 1 0-2h12a1 1 0 0 1 .88.52c.13.24.35.48.62.52A3 3 0 0 1 21.83 14v.02c.02.06.17.05.17-.02V5a3 3 0 0 0-3-3H5Zm1 4a1 1 0 0 0 0 2h5a1 1 0 1 0 0-2H6Z"
                clipRule="evenodd"
            />
            <path
                fill="currentColor"
                d="M19 14a1 1 0 0 1 1 1v3h3a1 1 0 1 1 0 2h-3v3a1 1 0 1 1-2 0v-3h-3a1 1 0 1 1 0-2h3v-3a1 1 0 0 1 1-1Z"
            />
        </svg>
    );
}
