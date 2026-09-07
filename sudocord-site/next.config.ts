import type { NextConfig } from "next"

const nextConfig: NextConfig = {
    output: "standalone",
    headers: async () => [
        {
            // SudoBadges plugin fetches this from the discord.com origin
            source: "/api/badges.json",
            headers: [
                { key: "Access-Control-Allow-Origin", value: "*" },
            ],
        },
        {
            // SudoCord marketplace: one-click video backgrounds fetch mp4 from discord.com origin
            source: "/backgrounds/:path*",
            headers: [
                { key: "Access-Control-Allow-Origin", value: "*" },
            ],
        },
    ],
    redirects: async () => [
        {
            source: "/discord",
            destination: "https://discord.gg/VRnHBq2tTF",
            permanent: false,
        },
    ],
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "cdn.discordapp.com",
            },
            {
                protocol: "https",
                hostname: "raw.githubusercontent.com",
            },
        ],
    },
    turbopack: {
        root: __dirname,
    }
}

export default nextConfig
