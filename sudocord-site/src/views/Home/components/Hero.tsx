"use client";

import Button from "@components/UI/Button";
import { faApple, faLinux, faWindows } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { isLinux, isMac, isWindows } from "@utils/navigator";
import { Download, Heart } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";

function getPlatform(mounted: boolean): {
    label: string
    href: string
    icon: ReactNode
} {
    if (!mounted) {
        return {
            label: "Download",
            href: "/download",
            icon: <Download size={16} />,
        };
    }
    if (isWindows()) {
        return {
            label: "Download for Windows",
            href: "/download?platform=windows",
            icon: <FontAwesomeIcon icon={faWindows} className="size-4" />,
        };
    }
    if (isMac()) {
        return {
            label: "Download for macOS",
            href: "/download?platform=macos",
            icon: <FontAwesomeIcon icon={faApple} className="size-4" />,
        };
    }
    if (isLinux()) {
        return {
            label: "Download for Linux",
            href: "/download?platform=linux",
            icon: <FontAwesomeIcon icon={faLinux} className="size-4" />,
        };
    }
    return {
        label: "Download",
        href: "/download",
        icon: <Download size={16} />,
    };
}

export default function HomeHero() {
    const [mounted, setMounted] = useState(false);
    const headerWords = "An enhanced version of Vencord".split(" ");

    useEffect(() => {
        requestAnimationFrame(() => setMounted(true));
    }, []);

    const platform = getPlatform(mounted);

    return (
        <div className="max-w-eq-lg mx-auto flex flex-col items-center px-6 pt-24">
            <div className="flex max-w-175 flex-col items-center justify-center gap-4 text-center">
                <h1 className="text-4xl font-bold text-white lg:text-7xl lg:leading-18">
                    {headerWords.map((word, index) => {
                        const delays = [
                            "delay-0",
                            "delay-[100ms]",
                            "delay-[200ms]",
                            "delay-[300ms]",
                            "delay-[400ms]",
                        ];
                        return (
                            <span
                                key={index}
                                className={`mr-2 inline-block transition-all duration-700 ease-out ${delays[index] || ""} ${
                                    mounted
                                        ? "opacity-100 translate-y-0 blur-0"
                                        : "opacity-0 translate-y-10 blur-sm"
                                }`}
                            >
                                {word}
                            </span>
                        );
                    })}
                </h1>

                <p
                    className={`text-lg font-semibold text-neutral-400 transition-all duration-700 ease-out delay-400 ${
                        mounted
                            ? "opacity-100 translate-y-0 blur-0"
                            : "opacity-0 translate-y-10 blur-sm"
                    }`}
                >
                    A fork that offers a wider selection of plugins from the
                    community.
                </p>
                <p
                    className={`text-xs font-semibold text-neutral-400 transition-all duration-700 ease-out delay-400 ${
                        mounted
                            ? "opacity-100 translate-y-0 blur-0"
                            : "opacity-0 translate-y-10 blur-sm"
                    }`}
                >
                    The unstable fork of Vencord.
                </p>

                <div
                    className={`mt-6 flex flex-col items-center gap-3 transition-all duration-700 ease-out delay-600 ${
                        mounted
                            ? "opacity-100 translate-y-0 blur-0"
                            : "opacity-0 translate-y-10 blur-sm"
                    }`}
                >
                    <div className="flex flex-col items-center gap-3 sm:flex-row">
                        <Link href={platform.href}>
                            <Button variant="primary" icon={platform.icon}>
                                {platform.label}
                            </Button>
                        </Link>

                        <Link href="/donate">
                            <Button variant="secondary" icon={<Heart size={16} />}>
                                Donate
                            </Button>
                        </Link>
                    </div>

                    <span className="inline-flex items-center gap-1 text-xs font-bold text-neutral-400">
                        Available on{" "}
                        <FontAwesomeIcon icon={faWindows} className="size-3" />{" "}
                        Windows,{" "}
                        <FontAwesomeIcon icon={faApple} className="size-3" />{" "}
                        macOS and{" "}
                        <FontAwesomeIcon icon={faLinux} className="size-3" />{" "}
                        Linux.
                    </span>
                </div>
            </div>

            <Image
                src="/assets/home/settings.webp"
                alt="SudoCord Settings Interface"
                width={2222}
                height={1250}
                priority
                className={`mt-12 rounded-t-2xl mask-b-from-75% select-none transition-all duration-700 ease-out delay-800 ${
                    mounted
                        ? "opacity-100 scale-100 blur-0"
                        : "opacity-0 scale-95 blur-md"
                }`}
                draggable={false}
            />
        </div>
    );
}
