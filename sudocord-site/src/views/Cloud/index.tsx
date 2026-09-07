import PageBootstrap from "@components/PageBootstrap";
import Button from "@components/UI/Button";
import {
    CloudFog,
    Link as LinkIcon,
    Rabbit,
    RefreshCcw,
    Scroll,
} from "lucide-react";
import Link from "next/link";

export default function Cloud() {
    return (
        <PageBootstrap
            meta={{ title: "Cloud" }}
            icon={<CloudFog />}
            fullWidth
            title="Cloud"
            description="SudoCord comes with a cloud integration allowing settings to be synced across apps and devices. We use our own Equicloud source code to provide our cloud instance which has a 60MB backup cap."
        >
            <div className="mt-6 flex flex-col gap-6">
                <h1 className="text-2xl font-bold">What is included?</h1>

                <div className="flex flex-col gap-1">
                    <h2 className="inline-flex items-center gap-2 text-xl font-bold">
                        <RefreshCcw size={16} />
                        Settings Sync
                    </h2>

                    <p className="font-medium text-neutral-400">
                        Synchronises your settings across all your devices
                    </p>
                </div>

                <div className="flex flex-col gap-1">
                    <h2 className="inline-flex items-center gap-2 text-xl font-bold">
                        <Rabbit size={16} />
                        Coming soon
                    </h2>

                    <p className="font-medium text-neutral-400">
                        Stay tuned for more future features!
                    </p>
                </div>
            </div>

            <div className="mt-6 flex flex-col gap-3">
                <h1 className="text-2xl font-bold">Getting Started</h1>

                <p className="font-medium text-neutral-400">
                    To start using our cloud integration, head over to the
                    SudoCord settings section inside Discord and check the
                    &quot;Enable Cloud Integrations&quot; switch. After
                    authorising, you&apos;re good to go! You can now enable
                    specific features on the same page.
                </p>

                <p className="font-medium text-neutral-400">
                    To use our cloud, all you need to do is change the backend
                    url in the cloud tab to{" "}
                    <code className="bg-neutral-800 text-neutral-100 px-2 py-1 rounded border border-neutral-700 font-mono">
                        https://cloud.equicord.org
                    </code>
                </p>
            </div>

            <div className="mt-6 flex items-center gap-3">
                <Link
                    href="https://github.com/Ernest1101/Sudocord"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-fit"
                >
                    <Button
                        variant="primary"
                        icon={<LinkIcon size={16} />}
                        className="text-sm"
                    >
                        View the source code
                    </Button>
                </Link>

                <Link href="/cloud/policy" className="w-fit">
                    <Button
                        variant="primary"
                        icon={<Scroll size={16} />}
                        className="text-sm"
                    >
                        Read our privacy policy
                    </Button>
                </Link>
            </div>
        </PageBootstrap>
    );
}
