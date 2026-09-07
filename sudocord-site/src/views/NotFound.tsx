import SimpleBootstrap from "@components/SimpleBootstrap";
import Button from "@components/UI/Button";
import { ArrowLeft, Flower2 } from "lucide-react";
import Link from "next/link";

const Texts: string[] = [
    "Looks like you've lost your map!",
    "You've lost your way!",
    "Yeah... This page doesn't exist.",
    "Hey! Oh yeah, this page doesn't exist.",
    "Naibuu was here.",
    "Thor took this path away.",
];

export default function NotFound() {
    const text = Texts[Math.floor(Math.random() * Texts.length)];

    return (
        <SimpleBootstrap icon={<Flower2 size={72} />} title={text}>
            <Link href="/">
                <Button
                    variant="secondary"
                    icon={<ArrowLeft size={16} />}
                    className="text-sm"
                >
                    Go back
                </Button>
            </Link>
        </SimpleBootstrap>
    );
}
