"use client";

import {
    type ChangeEvent,
    type InputHTMLAttributes,
    type ReactNode,
    useState,
} from "react";

interface Props extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "onChange"
> {
    label?: string
    icon?: ReactNode
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void
}

export default function Switch({
    icon,
    className,
    label,
    checked,
    onChange,
    ...rest
}: Props) {
    const [isChecked, setIsChecked] = useState(!!checked);

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setIsChecked(event.currentTarget.checked);
        onChange?.(event);
    };

    return (
        <label
            className={`group flex w-full cursor-pointer items-center justify-between gap-3 ${className ?? ""}`}
        >
            <div className="flex items-center gap-2">
                {icon && icon}
                {label && (
                    <span className="text-sm font-medium text-white">
                        {label}
                    </span>
                )}
            </div>

            <div
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ${
                    isChecked
                        ? "border-green-500 bg-green-400"
                        : "border-neutral-800 bg-neutral-950 group-hover:bg-neutral-900"
                }`}
            >
                <input
                    {...rest}
                    type="checkbox"
                    checked={isChecked}
                    onChange={handleChange}
                    className="peer sr-only"
                />
                <span
                    className={`inline-block h-4 w-4 transform rounded-full shadow transition-all duration-200 ${
                        isChecked
                            ? "translate-x-6 bg-green-950"
                            : "translate-x-1 bg-neutral-200"
                    }`}
                />
            </div>
        </label>
    );
}
