export const revalidate = 300;

export async function GET() {
    try {
        let response = await fetch("https://api.github.com/repos/Ernest1101/Sudocord/releases/latest", {
            next: { revalidate: 300 }
        });

        if (!response.ok) {
            console.warn("Falling back to equicord proxy...");
            response = await fetch("https://equicord.org/releases/equibop", {
                next: { revalidate: 300 }
            });
        }

        if (!response.ok) throw new Error(`Failed to fetch from both GitHub and fallback: ${response.statusText}`);

        const data = await response.json();
        const version = data.tag_name ? data.tag_name.replace(/^v/, "") : "0.0.0";
        return new Response(version, {
            headers: {
                "Content-Type": "text/plain",
                "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
            },
        });
    } catch (error) {
        console.error("Error fetching latest Equibop version:", error);
        return new Response("0.0.0", {
            headers: {
                "Content-Type": "text/plain",
            },
        });
    }
}
