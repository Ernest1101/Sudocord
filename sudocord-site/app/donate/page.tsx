import DonateView from "@views/Donate";
import { Suspense } from "react";

export const metadata = {
    title: "Donate",
};

export default function DonatePage() {
    return (
        <Suspense>
            <DonateView />
        </Suspense>
    );
}
