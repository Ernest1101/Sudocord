"use client";

import classNames from "classnames";
import { ReactNode, useEffect, useState } from "react";

interface Props {
    meta?: {
        title: string;
    };
    icon?: ReactNode;
    fullWidth?: boolean;
    title: string;
    description: string;
    children?: ReactNode;
}

export default function PageBootstrap({
    meta,
    icon,
    fullWidth,
    title,
    description,
    children,
}: Props) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setMounted(true));
    }, []);

    return (
        <>
            {meta?.title && <title>{`${meta.title} | SudoCord`}</title>}
            <div
                className={classNames(
                    fullWidth ? "max-w-eq-lg" : "max-w-eq-sm",
                    "mx-auto flex flex-col gap-6 px-6 py-12 transition-all duration-400 ease-out",
                    mounted
                        ? "opacity-100 translate-y-0 blur-0"
                        : "opacity-0 translate-y-12 blur-sm",
                )}
            >
                <header className="flex flex-col gap-1">
                    <h1 className="inline-flex items-center gap-2 text-3xl font-bold md:text-4xl">
                        {icon} {title}
                    </h1>
                    <p className="max-w-xl text-lg font-medium text-neutral-400">
                        {description}
                    </p>
                </header>

                {children}
            </div>
        </>
    );
}
