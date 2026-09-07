import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import Button from "./Button";

interface LoadingStateProps {
    loading: boolean
    error?: Error | null
    loadingText?: string
    errorText?: string
    onRetry?: () => void
    children: ReactNode
}

export default function LoadingState({
    loading,
    error,
    loadingText,
    errorText,
    onRetry,
    children,
}: LoadingStateProps) {
    if (!loading && !error) {
        return <>{children}</>;
    }

    return (
        <div className="flex items-center justify-center py-12">
            {error ? (
                <div className="flex flex-col items-center gap-2">
                    <p className="text-sm font-bold text-red-400">
                        {errorText ?? "Failed to load"}
                    </p>
                    {onRetry && (
                        <Button
                            variant="red"
                            icon={<RotateCcw size={16} />}
                            onClick={onRetry}
                        >
                            Retry
                        </Button>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center gap-2">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-sky-500" />
                    <p className="text-sm font-bold text-sky-200">
                        {loadingText ?? "Loading"}
                    </p>
                </div>
            )}
        </div>
    );
}
