import ThemesView from "@views/Themes";
import { Suspense } from "react";

export const metadata = {
    title: "Better Themes",
};

export default function ThemesPage() {
    return (
        <Suspense>
            <ThemesView />
        </Suspense>
    );
}
