import PageBootstrap from "@components/PageBootstrap";
import { Scroll } from "lucide-react";

export default function CloudGDPR() {
    return (
        <PageBootstrap
            meta={{ title: "Cloud GDPR Policy" }}
            icon={<Scroll />}
            fullWidth
            title="Cloud GDPR Policy"
            description="GDPR policy for SudoCord's cloud services."
        >
            <div className="prose prose-invert max-w-none">
                <p className="text-lg font-medium text-neutral-300 mb-8">
                    Last Updated: September 15, 2025
                </p>

                <section className="mb-8">
                    <h2 className="text-2xl font-bold mb-4">Introduction</h2>

                    <div className="bg-neutral-900/50 border border-neutral-700 rounded-lg p-4 mb-4">
                        <p className="text-sm font-medium text-neutral-300 mb-0">
                            <strong>TL;DR:</strong> We won&apos;t do anything
                            bad with your data, only use it for legitimate
                            purposes, and you can get it changed or removed
                            anytime by contacting privacy@equicord.org.
                        </p>
                    </div>

                    <p className="leading-relaxed font-medium text-neutral-400 mb-4">
                        We are a Data Controller of your information.
                        SudoCord&apos;s legal basis for collecting and using
                        personal information depends on what we collect and the
                        context:
                    </p>

                    <ul className="space-y-2 mb-4">
                        {[
                            "SudoCord needs to perform a contract with you",
                            "You have given SudoCord permission to do so",
                            "Processing your information is in SudoCord's legitimate interests",
                            "SudoCord needs to comply with the law",
                        ].map((item, i) => (
                            <li key={i} className="flex items-start gap-3">
                                <span className="text-blue-400 font-bold text-sm mt-0.5 min-w-6">
                                    {i + 1}.
                                </span>
                                <span className="font-medium text-neutral-300">
                                    {item}
                                </span>
                            </li>
                        ))}
                    </ul>

                    <p className="leading-relaxed font-medium text-neutral-400 mb-4">
                        We only retain your personal information as long as
                        necessary for the purposes in this policy. We&apos;ll
                        keep and use your information to comply with legal
                        obligations, resolve disputes, and enforce our policies.
                    </p>

                    <p className="leading-relaxed font-medium text-neutral-400 mb-4">
                        If you&apos;re an EEA resident, you have data protection
                        rights. Contact us if you want to know what information
                        we hold or want it removed.
                    </p>

                    <h3 className="text-lg font-semibold text-neutral-200 mb-3">
                        Your Rights
                    </h3>
                    <ul className="space-y-2">
                        {[
                            "Access, update or delete your information",
                            "Right of rectification",
                            "Right to object",
                            "Right of restriction",
                            "Right to data portability",
                            "Right to withdraw consent",
                        ].map(right => (
                            <li key={right} className="flex items-start gap-2">
                                <span className="text-green-400 font-bold mt-1">
                                    •
                                </span>
                                <span className="font-medium text-neutral-300">
                                    {right}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-bold mb-4">Log Files</h2>
                    <p className="leading-relaxed font-medium text-neutral-400 mb-4">
                        We use standard log files when you visit our website,
                        just like all hosting companies do for analytics
                        purposes.
                    </p>

                    <h3 className="text-lg font-semibold text-neutral-200 mb-3">
                        What We Collect
                    </h3>
                    <p className="leading-relaxed font-medium text-neutral-400">
                        IP addresses, browser type, ISP, timestamps, referring
                        pages, and click data. This information isn&apos;t
                        linked to personally identifiable information and is
                        used for analyzing trends, site administration, and
                        gathering demographic information.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-bold mb-4">
                        Children&apos;s Information
                    </h2>
                    <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4 mb-4">
                        <p className="text-sm font-medium text-yellow-200 mb-0">
                            <strong>Important:</strong> We don&apos;t knowingly
                            collect information from children under 13.
                        </p>
                    </div>
                    <p className="leading-relaxed font-medium text-neutral-400">
                        We encourage parents to monitor their children&apos;s
                        online activity. If you believe your child provided
                        information on our website, contact us immediately and
                        we&apos;ll remove it promptly.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-bold mb-4">Scope</h2>
                    <p className="leading-relaxed font-medium text-neutral-400">
                        This policy applies only to our online activities and
                        website visitors. It doesn&apos;t cover information
                        collected offline or through other channels.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-bold mb-4">Consent</h2>
                    <p className="leading-relaxed font-medium text-neutral-400">
                        By using our website, you consent to this Privacy Policy
                        and our data collection practices as described above.
                    </p>
                </section>

                <div className="mt-12 p-6 bg-neutral-900 border border-neutral-700 rounded-lg">
                    <h3 className="text-lg font-semibold text-neutral-200 mb-2">
                        Questions?
                    </h3>
                    <p className="text-sm font-medium text-neutral-400">
                        Contact us at{" "}
                        <a
                            href="mailto:privacy@equicord.org"
                            className="text-blue-400 hover:text-blue-300 underline"
                        >
                            privacy@equicord.org
                        </a>{" "}
                        for any privacy-related concerns.
                    </p>
                </div>
            </div>
        </PageBootstrap>
    );
}
