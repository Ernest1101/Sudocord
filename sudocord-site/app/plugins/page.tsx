import PluginsView from "@views/Plugins";
import { Suspense } from "react";

export const metadata = {
    title: "Plugins",
};

export default function PluginsPage() {
    return (
        <Suspense>
            <PluginsView />
        </Suspense>
    );
}
