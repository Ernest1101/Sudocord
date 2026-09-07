import classNames from "classnames";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";

interface Props {
    customClass?: string
    icon: ComponentType<LucideProps>
    title: string
    excerpt: string
}

export default function Card({
    customClass,
    icon: Icon,
    title,
    excerpt,
}: Props) {
    return (
        <div
            className={classNames(
                customClass,
                "flex w-full flex-col gap-2 rounded-2xl bg-neutral-900 p-6",
            )}
        >
            <div className="flex items-center gap-3">
                <span className="flex items-center gap-2 text-xl font-bold text-neutral-200">
                    <Icon size={18} fill="#ffffff10" />
                    {title}
                </span>
            </div>
            <p className="text-sm font-medium text-neutral-400">{excerpt}</p>
        </div>
    );
}
