import Button from "@components/UI/Button";
import { Scroll } from "lucide-react";
import Link from "next/link";

export default function Policy() {
    return (
        <div className="relative flex flex-col gap-2 overflow-hidden rounded-xl border border-neutral-900 p-12">
            <h2 className="text-xl font-bold">Cloud Privacy Policy</h2>

            <p className="font-medium text-neutral-400">
                We respect your privacy and collect only the information
                necessary to provide our services.
            </p>

            <Link href="/cloud/policy" target="_blank" className="mt-6 w-fit">
                <Button
                    variant="secondary"
                    icon={<Scroll fill="#ffffff10" size={16} />}
                >
                    Read Privacy Policy
                </Button>
            </Link>
        </div>
    );
}
