import { fetchPlugins } from "@utils/plugin";
import type { MetadataRoute } from "next";

const BASE = "https://sudocord.mooo.com";

// refresh the plugin list once a day instead of on every request
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const now = new Date();
    const pages: MetadataRoute.Sitemap = [
        { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
        { url: `${BASE}/download`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
        { url: `${BASE}/plugins`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
        { url: `${BASE}/themes`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
        { url: `${BASE}/themes/sudocord`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
        { url: `${BASE}/docs/`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
        { url: `${BASE}/donate`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
        { url: `${BASE}/team`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
        { url: `${BASE}/projects`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
        { url: `${BASE}/icons`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
        { url: `${BASE}/cloud`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    ];

    try {
        const plugins = await fetchPlugins("all");
        for (const plugin of plugins) {
            pages.push({
                url: `${BASE}/plugins/${encodeURIComponent(plugin.name)}`,
                changeFrequency: "monthly",
                priority: 0.5,
            });
        }
    } catch {
        // the plugin list is optional, the main pages still get indexed
    }

    return pages;
}
