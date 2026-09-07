"use client";

import {
    cleanDescription,
    formatAuthors,
    getAvailabilityText,
    type Plugin,
} from "@utils/plugin";
import classNames from "classnames";
import { Puzzle, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { getPluginSource, PluginSourceIcon } from "../Details";

interface Props extends Plugin {
    variant: CardVariant;
}

type CardVariant = "compact" | "normal";

export default function PluginCard(props: Props) {
    const [hovered, setHovered] = useState(false);

    return (
        <Link
            href={`/plugins/${props.name}`}
            className={classNames(
                "relative flex w-full flex-col gap-3 rounded-xl border border-neutral-800",
                "bg-linear-to-br from-neutral-900 to-neutral-950 p-6 transition-transform",
                "active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
                {
                    "pb-20": props.variant === "normal",
                },
            )}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div className="flex items-center gap-4">
                <div
                    className={classNames(
                        "hidden size-10 relative w-12 h-12 rounded-xl border border-neutral-800",
                        "bg-linear-to-t from-neutral-900 to-neutral-800/90 min-w-12",
                        "outline-2 outline-offset-2 outline-neutral-600/50 md:flex",
                    )}
                >
                    <div
                        className={classNames(
                            "absolute inset-0 flex items-center justify-center transition-all duration-300 ease-in-out",
                            hovered
                                ? "opacity-100 scale-100"
                                : "opacity-0 scale-100",
                        )}
                    >
                        <PluginSourceIcon
                            source={getPluginSource(props)}
                            size={8}
                        />
                    </div>
                    <div
                        className={classNames(
                            "absolute inset-0 flex items-center justify-center transition-all duration-300 ease-in-out",
                            hovered
                                ? "opacity-0 scale-100"
                                : "opacity-100 scale-100",
                        )}
                    >
                        <Puzzle size={16} />
                    </div>
                </div>

                <div className="flex flex-col min-w-0">
                    <span className="text-xl font-bold text-neutral-100 wrap-break-word">
                        {props.name}
                    </span>

                    {props.variant === "normal" && (
                        <p className="flex flex-wrap items-center gap-1 text-sm font-medium text-neutral-400">
                            <Users size={16} /> by{" "}
                            {formatAuthors(props.authors)}
                        </p>
                    )}
                </div>
            </div>

            {props?.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                    {props.tags.map(tag => (
                        <span
                            key={tag}
                            className="rounded-full bg-neutral-800/80 px-2.5 py-0.5 text-xs font-medium text-neutral-300"
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            )}

            <p className="text-sm font-medium text-neutral-300">
                {cleanDescription(props.description)}.{" "}
                {getAvailabilityText(props.name, props.required, props.target)}.
            </p>

            {props.variant === "normal" &&
                props.hasCommands &&
                props.commands.length > 0 &&
                (
                    <p className="absolute bottom-6 text-sm font-medium">
                        Click to view commands.
                    </p>
                )
            }
        </Link>
    );
}
