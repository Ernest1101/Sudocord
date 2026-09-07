"use client";

import classNames from "classnames";
import { ChevronUp } from "lucide-react";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

interface Props {
    trigger: ReactNode
    children: ReactNode
    hover?: boolean
    popoverClass?: string
}

export default function Popover({
    trigger,
    children,
    hover,
    popoverClass,
}: Props) {
    const [open, setOpen] = useState(false);
    const [visible, setVisible] = useState(false);
    const pathname = usePathname();
    const containerRef = useRef<HTMLDivElement>(null);
    const closeTimeoutRef = useRef<
        number | ReturnType<typeof setTimeout> | null
    >(null);
    const prevPathnameRef = useRef(pathname);

    useEffect(() => {
        if (pathname !== prevPathnameRef.current) {
            prevPathnameRef.current = pathname;
            if (open) close();
        }
    }, [pathname]);

    useEffect(() => {
        if (open) {
            requestAnimationFrame(() => setVisible(true));
        }
    }, [open]);

    const openPopover = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        setOpen(true);
    };

    const close = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        setVisible(false);
        setTimeout(() => setOpen(false), 200);
    };

    const delayedClose = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = window.setTimeout(close, 20);
    };

    const toggle = () => {
        if (open) {
            close();
        } else {
            openPopover();
        }
    };

    const handleClickOutside = (event: MouseEvent) => {
        if (
            containerRef.current &&
            !containerRef.current.contains(event.target as Node)
        )
            close();
    };

    useEffect(() => {
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, []);

    return (
        <div
            ref={containerRef}
            className="relative inline-block"
            onMouseEnter={hover ? openPopover : undefined}
            onMouseLeave={hover ? delayedClose : undefined}
        >
            <div
                onClick={!hover ? toggle : undefined}
                className="flex cursor-pointer items-center hover:bg-neutral-900 py-2 px-3 rounded-xl gap-1 font-medium text-neutral-400 transition-colors hover:text-white"
            >
                {trigger}

                <ChevronUp
                    size={16}
                    className={classNames(
                        open && "rotate-180",
                        "transition-transform",
                    )}
                />
            </div>

            {open && (
                <div
                    className={classNames(
                        "absolute z-50 mt-2 rounded-2xl border border-neutral-800 bg-neutral-900 shadow-lg p-3 transition-all duration-200 ease-out",
                        visible
                            ? "opacity-100 translate-y-0"
                            : "opacity-0 -translate-y-1",
                        popoverClass,
                    )}
                    onMouseEnter={hover ? openPopover : undefined}
                    onMouseLeave={hover ? delayedClose : undefined}
                >
                    {children}
                </div>
            )}
        </div>
    );
}
