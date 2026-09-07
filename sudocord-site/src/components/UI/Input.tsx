import type { InputHTMLAttributes, ReactNode } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
    icon?: ReactNode
}

export default function Input({ icon, className, ...rest }: Props) {
    return (
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 focus-within:bg-neutral-900 focus-within:ring-2 focus-within:ring-sky-500">
            {icon && <span className="shrink-0 text-neutral-400">{icon}</span>}

            <input
                {...rest}
                className={`w-full bg-transparent text-sm font-medium text-white placeholder-neutral-600 outline-none ${className ?? ""}`}
            />
        </div>
    );
}
