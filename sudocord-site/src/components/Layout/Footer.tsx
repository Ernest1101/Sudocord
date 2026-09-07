export default function Footer() {
    return (
        <div className="mt-25 w-full border-t border-neutral-900 bg-neutral-950 px-8 py-2">
            <div className="max-w-eq-lg mx-auto flex flex-col gap-12 px-6 py-6">
                <div className="flex items-center justify-between max-sm:flex-col-reverse max-sm:gap-3">
                    <span className="text-sm font-medium text-neutral-200">
                        © {new Date().getFullYear()} SudoCord — an enhanced version of
                        Vencord. Site based on EquiBite (GPL-3.0).
                    </span>

                    <span className="text-sm font-medium text-neutral-200">
                        Made with ❤️ by the SudoCord team
                    </span>
                </div>
            </div>
        </div>
    );
}
