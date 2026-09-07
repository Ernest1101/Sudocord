"use client";

import { Check, Copy, Terminal } from "lucide-react";
import { useState } from "react";

export default function CommandBlock({ label, command }: { label: string; command: string; }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(command);
        } catch {
            const ta = document.createElement("textarea");
            ta.value = command;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-xs text-neutral-500">{label}</span>
            <div className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-black/60 px-3 py-2.5">
                <Terminal
                    size={14}
                    className="shrink-0 text-green-400"
                />
                <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px] text-neutral-200">
                    {command}
                </code>
                <button
                    onClick={copy}
                    title="Copy command"
                    className="shrink-0 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
                >
                    {copied ? (
                        <Check
                            size={14}
                            className="text-green-400"
                        />
                    ) : (
                        <Copy size={14} />
                    )}
                </button>
            </div>
        </div>
    );
}
