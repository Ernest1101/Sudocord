import SudoThemesView from "@views/SudoThemes";
import { Suspense } from "react";

export const metadata = {
    title: "Themes",
};

export default function SudoThemesPage() {
    return (
        <Suspense>
            <SudoThemesView />
        </Suspense>
    );
}
