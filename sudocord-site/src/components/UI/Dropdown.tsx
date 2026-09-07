"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

export interface DropdownItem<T extends string | number = string> {
    label: string;
    value: T;
    icon?: ReactNode;
}

interface Props<T extends string | number = string> {
    icon?: ReactNode;
    items: DropdownItem<T>[];
    placeholder?: string;
    selected?: DropdownItem<T> | null;
    onSelect?: (item: DropdownItem<T>) => void;
}

export default function Dropdown<T extends string | number = string>({
    icon,
    items,
    placeholder,
    selected,
    onSelect,
}: Props<T>) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const toggle = () => setOpen(prev => !prev);
    const close = () => setOpen(false);

    const handleClickOutside = (event: MouseEvent) => {
        if (
            containerRef.current &&
            !containerRef.current.contains(event.target as Node)
        ) {
            close();
        }
    };

    const handleSelect = (item: DropdownItem<T>) => {
        onSelect?.(item);
        close();
    };

    useEffect(() => {
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} className="relative w-full">
            <button
                onClick={toggle}
                aria-haspopup="listbox"
                aria-expanded={open}
                className={`flex w-full cursor-pointer items-center gap-1 justify-between rounded-lg border border-neutral-800 px-3 py-3 font-medium transition-colors hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${open ? "bg-neutral-900 text-white" : "bg-neutral-950 text-neutral-400"}`}
            >
                <div className="flex flex-1 justify-between items-center gap-1">
                    <span className="flex items-center gap-1">
                        {icon && icon}
                        {placeholder ?? "Select option"}
                    </span>

                    {selected && (
                        <span className="rounded bg-green-400 px-2 py-0.5 text-xs font-semibold text-green-950">
                            {selected.label}
                        </span>
                    )}
                </div>

                {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {open && (
                <div
                    role="listbox"
                    aria-label="Options"
                    className="absolute z-50 mt-2 flex w-full flex-col divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-lg"
                >
                    {items.map(item => (
                        <button
                            key={String(item.value)}
                            role="option"
                            aria-selected={selected?.value === item.value}
                            className="flex w-full cursor-pointer items-center gap-2 px-3 py-3 font-medium text-neutral-200 hover:bg-neutral-800/70 focus-visible:bg-neutral-800/70 focus-visible:outline-none transition-colors duration-150"
                            onClick={() => handleSelect(item)}
                        >
                            {item.icon && item.icon}
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
