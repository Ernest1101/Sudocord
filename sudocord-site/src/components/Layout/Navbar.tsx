"use client";

import Button from "@components/UI/Button";
import Popover from "@components/UI/Popover";
import { faDiscord, faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import {
    Book,
    BookMarked,
    CloudFog,
    Code,
    Download,
    DownloadIcon,
    ExternalLink,
    Heart,
    Paintbrush,
    Palette,
    Puzzle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { BrowseItem, BrowseSection, NavItem } from "@/types";

const BrowseSections: BrowseSection[] = [
    {
        category: "Discover",
        items: [
            {
                icon: () => <Puzzle size={20} />,
                text: "Plugins",
                description: "List of SudoCord's third-party plugins",
                href: "/plugins",
            },
            {
                icon: () => <Palette size={20} />,
                text: "Themes",
                description: "Родные темы SudoCord",
                href: "/themes/sudocord",
            },
            {
                icon: () => <Palette size={20} />,
                text: "Better Themes",
                description: "Темы BetterDiscord для клиента",
                href: "/themes",
            },
            {
                icon: () => <BookMarked size={20} />,
                text: "Projects",
                description: "List of SudoCord's active repositories",
                href: "/projects",
            },
            {
                icon: () => <CloudFog size={20} />,
                text: "Cloud",
                description: "About SudoCord's cloud integration",
                href: "/cloud",
            },
        ],
    },
    {
        category: "Resources",
        items: [
            {
                icon: () => <DownloadIcon size={20} />,
                text: "Download",
                description: "Download SudoCord's installer Sudotl",
                href: "/download",
            },
            {
                icon: () => <Book size={20} />,
                text: "Documentation",
                description: "Learn how to use SudoCord",
                href: "/docs",
            },
            {
                icon: () => <Heart size={20} />,
                text: "Donate",
                description: "Поддержать SudoCord криптой",
                href: "/donate",
            },
            {
                icon: () => <Code size={20} />,
                text: "Source Code",
                description: "View the SudoCord repository",
                href: "https://github.com/Ernest1101/Sudocord",
                external: true,
            },
        ],
    },
    {
        category: "Community",
        items: [
            {
                icon: () => <FontAwesomeIcon icon={faDiscord} className="h-5 w-5" />,
                text: "Discord",
                description: "Join the active community on Discord",
                href: "/discord",
                external: true,
            },
            {
                icon: () => <FontAwesomeIcon icon={faGithub} className="size-5" />,
                text: "GitHub",
                description: "Contribute to SudoCord and other projects",
                href: "https://github.com/Ernest1101",
                external: true,
            },
            {
                icon: () => <Paintbrush size={20} />,
                text: "Icons",
                description: "Custom icons for SudoCord",
                href: "/icons",
            },
        ],
    },
];

const NavItems: NavItem[] = [
    {
        text: "Team",
        href: "/team",
    },
    {
        text: "Docs",
        href: "/docs",
    },
];

function DropdownItem({ item, onClick }: { item: BrowseItem; onClick?: () => void; }) {
    return (
        <Link
            href={item.href}
            target={item.external ? "_blank" : undefined}
            onClick={onClick}
            className="relative group flex items-start gap-3 rounded-xl p-3 text-neutral-300 hover:text-white transition-colors duration-150"
        >
            <div className="flex items-center justify-center pt-2">{item.icon()}</div>

            <div className="flex flex-1 flex-col">
                <h4 className="font-semibold">{item.text}</h4>
                <p className="text-sm font-medium text-neutral-500 group-hover:text-neutral-400 transition-colors duration-150">
                    {item.description}
                </p>
            </div>

            <div className="-z-10 absolute size-full inset-0 rounded-xl bg-neutral-800 opacity-0 group-hover:opacity-100 group-hover:scale-100 scale-95 transition-all duration-150" />
        </Link>
    );
}

function NavLink({ item }: { item: NavItem; }) {
    return (
        <Link
            href={item.href}
            target={item.external ? "_blank" : undefined}
            className="flex cursor-pointer items-center hover:bg-neutral-900 py-2 px-3 rounded-xl gap-1 font-medium text-neutral-400 transition-colors hover:text-white"
        >
            {item.text}
            {item.external && <ExternalLink size={16} />}
        </Link>
    );
}

export default function Navbar() {
    const pathname = usePathname();
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [hasScrolled, setHasScrolled] = useState(false);

    const toggleMobileMenu = (force?: boolean) => {
        const next = force ?? !showMobileMenu;
        setShowMobileMenu(next);
        document.body.style.overflowY = next ? "hidden" : "auto";
    };

    const handleScroll = () => setHasScrolled(window.scrollY > 0);

    useEffect(() => {
        window.addEventListener("scroll", handleScroll);
        return () => {
            window.removeEventListener("scroll", handleScroll);
            document.body.style.overflowY = "auto";
        };
    }, []);

    useEffect(() => {
        setShowMobileMenu(false);
        document.body.style.overflowY = "auto";
    }, [pathname]);

    const logoSrc = "/assets/sudocord-logo.png";

    return (
        <>
            {showMobileMenu && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
                    onClick={() => toggleMobileMenu(false)}
                />
            )}

            <div
                className={classNames(
                    "fixed top-0 right-0 z-40 h-dvh w-80 flex-col overflow-y-scroll border-l border-l-neutral-800/50 bg-neutral-900 md:hidden transition-transform duration-300 ease-out",
                    showMobileMenu ? "translate-x-0" : "translate-x-full",
                )}
            >
                <div className="flex flex-col gap-6 p-6 pt-20">
                    {BrowseSections.map(section => (
                        <div key={section.category} className="flex flex-col">
                            <div className="mb-2 font-bold">{section.category}</div>
                            {section.items.map(item => (
                                <DropdownItem
                                    key={item.text}
                                    item={item}
                                    onClick={() => toggleMobileMenu(false)}
                                />
                            ))}
                        </div>
                    ))}

                    <div className="flex flex-col gap-2 border-t border-neutral-800 pt-4">
                        {NavItems.map(item => (
                            <Link
                                key={item.text}
                                href={item.href}
                                target={item.external ? "_blank" : undefined}
                                className="flex items-center gap-1 rounded-xl p-3 font-bold hover:bg-neutral-800/50"
                                onClick={() => toggleMobileMenu(false)}
                            >
                                {item.text}
                                {item.external && <ExternalLink size={16} />}
                            </Link>
                        ))}

                        {pathname !== "/download" && (
                            <Link href="/download" onClick={() => toggleMobileMenu(false)}>
                                <Button
                                    icon={<Download size={16} />}
                                    variant="secondary"
                                    className="w-full justify-center"
                                >
                                    Download
                                </Button>
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            <header
                className={classNames(
                    "max-w-eq-lg z-30 mx-auto flex items-center justify-between px-6 py-8 transition-colors",
                    hasScrolled && "sticky top-0 bg-neutral-950/90 backdrop-blur-lg",
                )}
            >
                <div className="flex items-center gap-6">
                    <Link
                        href="/"
                        className="flex items-center gap-3 text-lg font-bold text-white transition-transform active:scale-[.95]"
                    >
                        <Image
                            src={logoSrc}
                            width={32}
                            height={32}
                            className="size-8 select-none"
                            draggable={false}
                            alt="SudoCord logo"
                        />
                        SudoCord
                    </Link>

                    <hr className="max-lg:hidden border-r h-8 border-neutral-900" />

                    <div className="hidden items-center gap-3 lg:flex">
                        {BrowseSections.map(section => (
                            <Popover
                                key={section.category}
                                trigger={
                                    <span className="cursor-pointer text-neutral-400 hover:text-white transition-colors font-medium">
                                        {section.category}
                                    </span>
                                }
                                popoverClass="left-1/2 -translate-x-1/3 w-[240px] p-3"
                            >
                                <div className="flex flex-col gap-2">
                                    {section.items.map(item => (
                                        <DropdownItem key={item.text} item={item} />
                                    ))}
                                </div>
                            </Popover>
                        ))}

                        {NavItems.map(item => (
                            <NavLink key={item.text} item={item} />
                        ))}
                    </div>
                </div>

                {pathname !== "/download" && (
                    <Link href="/download" className="hidden md:flex">
                        <Button icon={<Download size={16} />} variant="primary">
                            Download
                        </Button>
                    </Link>
                )}

                <button
                    className="z-50 flex size-12 flex-col items-center justify-center gap-1.5 rounded-xl md:hidden focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
                    onClick={() => toggleMobileMenu()}
                    aria-label="Toggle menu"
                    aria-expanded={showMobileMenu}
                >
                    <span
                        className={classNames(
                            showMobileMenu && "translate-y-2 rotate-45",
                            "h-0.5 w-5 rounded-full bg-neutral-200 transition-all",
                        )}
                    />
                    <span
                        className={classNames(
                            showMobileMenu && "opacity-0",
                            "h-0.5 w-5 rounded-full bg-neutral-200 transition-all",
                        )}
                    />
                    <span
                        className={classNames(
                            showMobileMenu && "-translate-y-2 -rotate-45",
                            "h-0.5 w-5 rounded-full bg-neutral-200 transition-all",
                        )}
                    />
                </button>
            </header>
        </>
    );
}
