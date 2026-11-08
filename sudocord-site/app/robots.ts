import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/version"] },
        sitemap: "https://sudocord.mooo.com/sitemap.xml",
        host: "https://sudocord.mooo.com",
    };
}
