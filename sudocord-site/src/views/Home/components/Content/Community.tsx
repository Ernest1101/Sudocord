import Button from "@components/UI/Button";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";

export default function Community() {
    return (
        <div className="relative flex flex-col gap-2 overflow-hidden rounded-xl border border-neutral-900 p-12">
            <h2 className="text-xl font-bold">Join our community!</h2>

            <p className="font-medium text-neutral-400">
                We have an active community of people on Discord, join and stay
                up to date with new updates and announcements!
            </p>

            <Link href="/discord" target="_blank" className="mt-6 w-fit">
                <Button variant="secondary">
                    <FontAwesomeIcon icon={faDiscord} className="size-4" />
                    Join Discord
                </Button>
            </Link>
        </div>
    );
}
