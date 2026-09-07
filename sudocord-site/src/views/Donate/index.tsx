"use client";

import PageBootstrap from "@components/PageBootstrap";
import Button from "@components/UI/Button";
import Input from "@components/UI/Input";
import { Coins, ExternalLink, Heart } from "lucide-react";
import { useState } from "react";

const ASSETS = ["TON", "USDT", "BTC"] as const;
type Asset = (typeof ASSETS)[number];

const PRESETS: Record<Asset, string[]> = {
    TON: ["1", "5", "10"],
    USDT: ["1", "5", "10"],
    BTC: ["0.0001", "0.0005", "0.001"],
};

export default function Donate() {
    const [asset, setAsset] = useState<Asset>("TON");
    const [amount, setAmount] = useState("5");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const donate = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/donate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ asset, amount }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.pay_url) throw new Error(data?.error || "Не вышло создать счёт");
            window.open(data.pay_url, "_blank");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка");
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageBootstrap
            meta={{ title: "Donate" }}
            icon={<Heart />}
            title="Donate"
            description="Поддержи SudoCord криптой. Оплата проходит через CryptoBot в Telegram."
        >
            <div className="flex max-w-md flex-col gap-4 rounded-xl border border-neutral-800 bg-linear-to-br from-neutral-900 to-neutral-950 p-6">
                <div className="flex gap-2">
                    {ASSETS.map(a => (
                        <button
                            key={a}
                            onClick={() => {
                                setAsset(a);
                                setAmount(PRESETS[a][1]);
                            }}
                            className={`flex-1 rounded-xl border px-4 py-2 text-sm font-bold transition-all ${asset === a
                                ? "border-white bg-neutral-100 text-neutral-800"
                                : "border-neutral-800/50 bg-neutral-900 text-neutral-300 hover:bg-neutral-800/70"
                            }`}
                        >
                            {a}
                        </button>
                    ))}
                </div>

                <div className="flex gap-2">
                    {PRESETS[asset].map(p => (
                        <button
                            key={p}
                            onClick={() => setAmount(p)}
                            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold transition-all ${amount === p
                                ? "border-sky-700/50 bg-sky-900 text-sky-200"
                                : "border-neutral-800/50 bg-neutral-900 text-neutral-300 hover:bg-neutral-800/70"
                            }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>

                <Input
                    icon={<Coins size={14} />}
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="Своя сумма"
                    inputMode="decimal"
                />

                {error && (
                    <p className="text-sm font-medium text-red-400">
                        {error}
                    </p>
                )}

                <Button
                    variant="primary"
                    icon={<ExternalLink size={16} />}
                    onClick={donate}
                    disabled={loading || !amount.trim()}
                    className="w-full justify-center"
                >
                    {loading ? "Создаю счёт..." : `Задонатить ${amount || "0"} ${asset}`}
                </Button>

                <p className="text-xs text-neutral-500">
                    Откроется счёт CryptoBot — оплата в Telegram, счёт живёт сутки.
                </p>
            </div>
        </PageBootstrap>
    );
}
