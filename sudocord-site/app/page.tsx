import HomeContent from "@views/Home/components/Content";
import HomeHero from "@views/Home/components/Hero";
import type { Metadata } from "next";

export const metadata: Metadata = {
    alternates: { canonical: "/" },
};

// structured data so search engines know "SudoCord" is this app and site
const jsonLd = [
    {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "SudoCord",
        alternateName: ["Sudocord", "Sudo Cord", "СудоКорд"],
        url: "https://sudocord.mooo.com/",
    },
    {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "SudoCord",
        alternateName: "Sudocord",
        description: "Discord client mod with Vencord, Equicord and Nightcord plugins in one client.",
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Windows, Linux, macOS",
        url: "https://sudocord.mooo.com/",
        downloadUrl: "https://sudocord.mooo.com/download",
        image: "https://sudocord.mooo.com/assets/opengraph.png",
        license: "https://www.gnu.org/licenses/gpl-3.0.html",
        sameAs: ["https://github.com/Ernest1101/Sudocord"],
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
];

export default function Home() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <HomeHero />
            <HomeContent />
        </>
    );
}
