import Button from "@components/UI/Button";
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";

export default function Contribute() {
    return (
        <div className="relative flex flex-col gap-2 overflow-hidden rounded-xl border border-neutral-900 p-12">
            <h2 className="text-xl font-bold">Want to contribute?</h2>

            <p className="font-medium text-neutral-400">
                Most submitted plugins are accepted, with plugin requests
                actively handled to continuously expand the collection.
            </p>

            <Link
                href="https://github.com/Ernest1101/Sudocord"
                target="_blank"
                className="mt-6 w-fit"
            >
                <Button
                    variant="secondary"
                    icon={
                        <FontAwesomeIcon icon={faGithub} className="size-4" />
                    }
                >
                    View repository
                </Button>
            </Link>

            <div className="absolute inset-0 -z-10 h-96 w-full -translate-y-44 mask-radial-[50%_50%] mask-radial-from-0% mask-radial-at-center bg-repeat opacity-5 md:-translate-x-30 md:-translate-y-32" />
        </div>
    );
}
