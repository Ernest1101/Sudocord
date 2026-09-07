import { fetchPlugins } from "@utils/plugin";
import PluginDetails from "@views/Plugins/Details";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ name: string; }>; }): Promise<Metadata> {
    try {
        const resolvedParams = await params;
        const plugins = await fetchPlugins("all");
        const plugin = plugins.find(p => p.name.toLowerCase() === resolvedParams.name?.toLowerCase());

        if (!plugin) {
            return {
                title: "Plugin Not Found",
                description: null,
                openGraph: null,
                twitter: null,
            };
        }

        const lower = plugin.filePath.toLowerCase();
        let iconUrl = "/assets/icons/equicord/icon-128.png";

        if (plugin.isModified) {
            iconUrl = "/assets/icons/equicord/modified.webp";
        } else if (lower.startsWith("src/plugins")) {
            iconUrl = "/assets/icons/vencord/icon.webp";
        }

        return {
            title: plugin.name,
            description: plugin.description || "No description available.",
            openGraph: {
                title: plugin.name,
                description: plugin.description || "No description available.",
                images: [
                    {
                        url: iconUrl,
                        width: 128,
                        height: 128,
                        alt: `${plugin.name} Icon`,
                    },
                ],
            },
            twitter: {
                card: "summary",
                title: plugin.name,
                description: plugin.description || "No description available.",
                images: [iconUrl],
            },
        };
    } catch (e) {
        return {};
    }
}

export async function generateViewport({ params }: { params: Promise<{ name: string; }>; }) {
    try {
        const resolvedParams = await params;
        const plugins = await fetchPlugins("all");
        const plugin = plugins.find(p => p.name.toLowerCase() === resolvedParams.name?.toLowerCase());

        if (!plugin) return {};

        const lower = plugin.filePath.toLowerCase();
        let themeColor: string | undefined;

        if (plugin.isModified) {
            themeColor = "#A175FF";
        } else if (lower.startsWith("src/equicordplugins")) {
            themeColor = "#2197FF";
        } else if (lower.startsWith("src/plugins")) {
            themeColor = "#DD7878";
        }

        return themeColor ? { themeColor } : {};
    } catch (e) {
        return {};
    }
}

export default async function PluginDetailPage({ params }: { params: Promise<{ name: string; }>; }) {
    const resolvedParams = await params;
    return <PluginDetails params={resolvedParams} />;
}
