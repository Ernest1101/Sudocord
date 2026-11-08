import "./globals.css";

import Footer from "@components/Layout/Footer";
import Navbar from "@components/Layout/Navbar";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "react-hot-toast";

export const viewport: Viewport = {
    themeColor: "#216bff",
};

export const metadata: Metadata = {
    metadataBase: new URL("https://sudocord.mooo.com"),
    title: {
        default: "SudoCord — Discord client mod with 500+ plugins",
        template: "%s | SudoCord",
    },
    description:
        "SudoCord is a Discord client mod: Vencord, Equicord and Nightcord plugins in one client, custom backgrounds, themes and voice subtitles. Free download for Windows, Linux and macOS.",
    applicationName: "SudoCord",
    keywords: [
        "SudoCord",
        "Sudocord",
        "Sudo Cord",
        "Discord client mod",
        "Discord mod",
        "Vencord",
        "Equicord",
        "Nightcord",
        "Discord plugins",
        "Discord themes",
        "мод для Discord",
        "плагины Discord",
    ],
    robots: { index: true, follow: true },
    openGraph: {
        siteName: "SudoCord",
        title: "SudoCord — Discord client mod with 500+ plugins",
        description: "Vencord, Equicord and Nightcord plugins in one Discord client. Free for Windows, Linux and macOS.",
        url: "/",
        type: "website",
        images: [
            {
                url: "/assets/opengraph.png",
                width: 1200,
                height: 630,
                alt: "SudoCord Logo",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        images: ["/assets/opengraph.png"],
    },
};

export default function RootLayout({ children }: { children: ReactNode; }) {
    return (
        <html lang="en">
            <body className="bg-neutral-950 text-white">
                <Toaster position="top-right" gutter={8} />
                <Navbar />
                {children}
                <Footer />
            </body>
        </html>
    );
}
