"use client";

import { ReactNode, useEffect, useState } from "react";

interface Props {
    meta?: {
        title: string
    }
    icon: ReactNode
    title: string
    children?: ReactNode
}

export default function SimpleBootstrap({
    meta,
    icon,
    title,
    children,
}: Props) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setMounted(true));
    }, []);

    return (
        <>
            {meta?.title && <title>{meta.title}</title>}
            <div className="flex w-full flex-col items-center justify-center gap-2 pt-32">
                <div
                    className={`transition-all duration-700 ease-out ${
                        mounted
                            ? "opacity-100 translate-y-0 scale-100 blur-0"
                            : "opacity-0 -translate-y-8 scale-90 blur-sm"
                    }`}
                >
                    {icon}
                </div>

                <h2
                    className={`text-lg font-medium transition-all duration-700 ease-out delay-150 ${
                        mounted
                            ? "opacity-100 translate-y-0 blur-0"
                            : "opacity-0 translate-y-8 blur-sm"
                    }`}
                >
                    {title}
                </h2>

                <div
                    className={`flex items-center gap-2 max-sm:flex-col transition-all duration-700 ease-out delay-300 ${
                        mounted
                            ? "opacity-100 translate-y-0 blur-0"
                            : "opacity-0 translate-y-5 blur-sm"
                    }`}
                >
                    {children}
                </div>
            </div>
        </>
    );
}
