export const dynamic = "force-dynamic";

const ASSETS = ["TON", "USDT", "BTC"] as const;
type Asset = (typeof ASSETS)[number];

const PRESETS: Record<Asset, string[]> = {
    TON: ["1", "5", "10"],
    USDT: ["1", "5", "10"],
    BTC: ["0.0001", "0.0005", "0.001"],
};

export async function GET() {
    return Response.json({ assets: ASSETS, presets: PRESETS });
}

export async function POST(req: Request) {
    try {
        const token = process.env.CRYPTOPAY_TOKEN;
        if (!token) {
            return Response.json({ error: "Donations are not configured" }, { status: 503 });
        }

        const body = await req.json().catch(() => null);
        const asset = String(body?.asset ?? "").toUpperCase();
        const amount = String(body?.amount ?? "").trim();

        if (!(ASSETS as readonly string[]).includes(asset)) {
            return Response.json({ error: "Bad asset" }, { status: 400 });
        }
        const num = Number(amount);
        if (!Number.isFinite(num) || num <= 0 || num > 100000) {
            return Response.json({ error: "Bad amount" }, { status: 400 });
        }

        const res = await fetch("https://pay.crypt.bot/api/createInvoice", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Crypto-Pay-API-Token": token,
            },
            body: JSON.stringify({
                asset,
                amount: String(num),
                description: "SudoCord donate",
                expires_in: 86400,
            }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
            console.error("Crypto Pay createInvoice failed", data);
            return Response.json({ error: "Payment provider error" }, { status: 502 });
        }
        return Response.json({ pay_url: data.result.pay_url, invoice_id: data.result.invoice_id });
    } catch (e) {
        console.error("Donate route failed", e);
        return Response.json({ error: "Internal error" }, { status: 500 });
    }
}
