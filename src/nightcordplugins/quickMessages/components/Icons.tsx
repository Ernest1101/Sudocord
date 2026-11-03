/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function QuickMessagesIcon({
    width = 24,
    height = 24,
    size,
    color = "currentColor",
    className,
    ...props
}: {
    width?: number;
    height?: number;
    size?: number;
    color?: string;
    className?: string;
    [key: string]: any;
}) {
    const finalW = size ?? width;
    const finalH = size ?? height;
    return (
        <svg
            className={`vc-ic-save-icon ${className ?? ""}`}
            aria-hidden="true"
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            width={finalW}
            height={finalH}
            fill="none"
            viewBox="0 0 24 24"
            {...props}
        >
            <path
                d="M5 2a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h6.88c.37 0 .61-.38.5-.73a7 7 0 0 1-.37-2.7.53.53 0 0 0-.52-.57H6a1 1 0 1 1 0-2h6.36c.2 0 .37-.11.46-.28.3-.6.7-1.13 1.17-1.6.35-.37.11-1.12-.4-1.12H6a1 1 0 1 1 0-2h12a1 1 0 0 1 .88.52c.13.24.34.48.62.5.61.04 1.2.16 1.77.36.35.11.73-.13.73-.5V5a3 3 0 0 0-3-3H5Zm1 4a1 1 0 0 0 0 2h5a1 1 0 1 0 0-2H6Z"
                fill={color}
                fillRule="evenodd"
                clipRule="evenodd"
            />
            <path
                d="M24 19a5 5 0 1 1-10 0 5 5 0 0 1 10 0Zm-5-3a1 1 0 0 1 1 1v1.59l.7.7a1 1 0 1 1-1.4 1.42l-1-1A1 1 0 0 1 18 19v-2a1 1 0 0 1 1-1Z"
                fill={color}
                fillRule="evenodd"
                clipRule="evenodd"
            />
        </svg>
    );
}

export function SendIcon({ width = 16, height = 16, color = "currentColor", className }: { width?: number; height?: number; color?: string; className?: string; }) {
    return (
        <svg
            aria-hidden="true"
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            width={width}
            height={height}
            fill="none"
            viewBox="0 0 24 24"
            className={className}
        >
            <path
                fill={color}
                d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"
            />
        </svg>
    );
}

export function InsertIcon({ width = 16, height = 16, color = "currentColor", className }: { width?: number; height?: number; color?: string; className?: string; }) {
    return (
        <svg
            aria-hidden="true"
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            width={width}
            height={height}
            fill="none"
            viewBox="0 0 24 24"
            className={className}
        >
            <path
                fill={color}
                d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"
            />
        </svg>
    );
}

export function EditIcon({ width = 16, height = 16, color = "currentColor", className }: { width?: number; height?: number; color?: string; className?: string; }) {
    return (
        <svg
            aria-hidden="true"
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            width={width}
            height={height}
            fill="none"
            viewBox="0 0 24 24"
            className={className}
        >
            <path
                fill={color}
                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
            />
        </svg>
    );
}

export function TrashIcon({ width = 16, height = 16, color = "currentColor", className }: { width?: number; height?: number; color?: string; className?: string; }) {
    return (
        <svg
            aria-hidden="true"
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            width={width}
            height={height}
            fill="none"
            viewBox="0 0 24 24"
            className={className}
        >
            <path
                fill={color}
                d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
            />
        </svg>
    );
}

export function PlusIcon({ width = 16, height = 16, color = "currentColor", className }: { width?: number; height?: number; color?: string; className?: string; }) {
    return (
        <svg
            aria-hidden="true"
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            width={width}
            height={height}
            fill="none"
            viewBox="0 0 24 24"
            className={className}
        >
            <path
                fill={color}
                d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
            />
        </svg>
    );
}

export function SearchIcon({ width = 16, height = 16, color = "currentColor", className }: { width?: number; height?: number; color?: string; className?: string; }) {
    return (
        <svg
            aria-hidden="true"
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            width={width}
            height={height}
            fill="none"
            viewBox="0 0 24 24"
            className={className}
        >
            <path
                fill={color}
                d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
            />
        </svg>
    );
}
