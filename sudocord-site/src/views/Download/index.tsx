"use client";

import PageBootstrap from "@components/PageBootstrap";
import Button from "@components/UI/Button";
import CommandBlock from "@components/UI/CommandBlock";
import {
    faApple,
    faChrome,
    faEdge,
    faFirefox,
    faLinux,
    faWindows,
} from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    getMacArch,
    isChromeOS,
    isLinux,
    isMac,
    isWindows,
} from "@utils/navigator";
import classNames from "classnames";
import { AlertCircle, DownloadIcon, MonitorCheck, Package } from "lucide-react";


import type { Platform, Section } from "@/types";

const SudoCordPlatforms: Platform[] = [
    {
        title: "Windows",
        icon: faWindows,
        downloads: [
            {
                text: "GUI",
                href: "https://github.com/Ernest1101/Sudotl/releases/latest/download/Sudotl.exe",
                prioritize: true,
                note: "Recommended",
            },
            {
                text: "CLI",
                href: "https://github.com/Ernest1101/Sudotl/releases/latest/download/SudotlCli.exe",
            },
        ],
        isCurrent: isWindows(),
    },
    {
        title: "Linux",
        icon: faLinux,
        downloads: [
            {
                text: "GUI",
                href: "https://github.com/Ernest1101/Sudotl/releases/latest/download/Sudotl",
                prioritize: true,
                note: "Both X11 and Wayland",
            },
            {
                text: "GUI",
                href: "https://github.com/Ernest1101/Sudotl/releases/latest/download/Sudotl-x11",
                note: "X11 only",
            },
            {
                text: "GUI",
                href: "https://github.com/Ernest1101/Sudotl/releases/latest/download/Sudotl-wayland",
                note: "Wayland only",
            },
            {
                text: "Hyprland",
                href: "https://github.com/Ernest1101/Sudotl/releases/latest/download/Sudotl-wayland",
                note: "Hyprland (Wayland)",
            },
            {
                text: "CLI",
                href: "https://github.com/Ernest1101/Sudotl/releases/latest/download/SudotlCli-linux",
            },
        ],
        command: {
            label: "Terminal install (auto-detects Wayland / X11)",
            text: "sh -c \"$(curl -sS https://sudocord.h4ck.me/install.sh)\"",
        },
        isCurrent: isLinux(),
    },
    {
        title: "MacOS",
        icon: faApple,
        downloads: [
            {
                text: "GUI",
                href: "https://github.com/Ernest1101/Sudotl/releases/latest/download/Sudotl-darwin-arm64.zip",
                prioritize: getMacArch() === "arm64",
                note: "Apple Silicon (ARM64)",
            },
            {
                text: "GUI",
                href: "https://github.com/Ernest1101/Sudotl/releases/latest/download/Sudotl-darwin-x64.zip",
                prioritize: getMacArch() === "x64",
                note: "Intel (X64)",
            },
            {
                text: "CLI",
                href: "https://github.com/Ernest1101/Sudotl/releases/latest/download/SudotlCli-darwin-arm64",
                prioritize: getMacArch() === "arm64",
            },
        ],
        isCurrent: isMac(),
    },
];

const BrowserPlatforms: Platform[] = [
    {
        title: "Firefox",
        icon: faFirefox,
        downloads: [
            {
                text: "Zip",
                href: "https://github.com/Ernest1101/Sudocord/releases/download/devbuild/extension-firefox.zip",
                prioritize: true,
                note: "Requires Firefox Developer Edition",
            },
        ],
        isCurrent: false,
    },
    {
        title: "Chrome",
        icon: faChrome,
        downloads: [
            {
                text: "Zip",
                href: "https://github.com/Ernest1101/Sudocord/releases/download/devbuild/extension-chrome.zip",
                prioritize: true,
            },
        ],
        isCurrent: isChromeOS(),
    },
    {
        title: "Edge",
        icon: faEdge,
        downloads: [
            {
                text: "Zip",
                href: "https://github.com/Ernest1101/Sudocord/releases/download/devbuild/extension-chrome.zip",
                prioritize: true,
            },
        ],
        isCurrent: false,
    },
];

const OtherOfferings = [
    {
        name: "NixOS - SudoCord",
        href: "https://search.nixos.org/packages?channel=unstable&show=equicord&from=0&size=50&sort=relevance&type=packages&query=SudoCord",
    },
    {
        name: "NixOS - Equibop",
        href: "https://search.nixos.org/packages?channel=unstable&show=equibop&from=0&size=50&sort=relevance&type=packages&query=Equibop",
    },
    { name: "Legcord", href: "https://github.com/Legcord/Legcord" },
    { name: "Goofcord", href: "https://github.com/Milkshiift/GoofCord" },
    { name: "Dorion", href: "https://github.com/SpikeHD/Dorion" },
    { name: "Shelter", href: "https://shelter.uwu.network" },
];

const getSections = (): Section[] => [
    {
        title: "SudoCord",
        description:
            "An enhanced version of Vencord with more of 100+ extra plugins.",
        githubUrl: "https://github.com/Ernest1101/Sudocord",
        platforms: SudoCordPlatforms,
    },
    {
        title: "Browser Extensions",
        description:
            "SudoCord won't be providing support for extensions whether official sources or sideloaded.",
        githubUrl: "",
        platforms: BrowserPlatforms,
        globalWarning:
            "Safari not supported (Apple restrictions). Opera may work via sideloading but is not officially supported.",
    },
];

export default function Download() {
    return (
        <PageBootstrap
            meta={{ title: "Download" }}
            icon={<DownloadIcon />}
            fullWidth
            title="Download"
            description="Here are your download options."
        >
            <div className="flex flex-col gap-12">
                {getSections().map(section => (
                        <div
                            key={section.title}
                            className="flex flex-col gap-4"
                        >
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-2xl font-bold">
                                        {section.title}
                                    </h2>
                                    {section.githubUrl && (
                                        <a
                                            href={section.githubUrl}
                                            target="_blank"
                                            className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
                                        >
                                            GitHub →
                                        </a>
                                    )}
                                </div>
                                <p className="text-neutral-400 text-sm">
                                    {section.description}
                                </p>
                                {section.globalWarning && (
                                    <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-yellow-950/30 border border-yellow-900/50 text-yellow-200 text-sm">
                                        <AlertCircle
                                            size={16}
                                            className="mt-0.5 shrink-0"
                                        />
                                        <span>{section.globalWarning}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-stretch flex-wrap gap-6">
                                {section.platforms.map(platform => (
                                    <div
                                        key={platform.title}
                                        className={classNames(
                                            "flex-1 xs:min-w-80 flex flex-col justify-between gap-4 py-6 px-6 rounded-xl border border-neutral-800",
                                            platform.isCurrent
                                                ? "bg-linear-to-tl from-neutral-900 to-green-950"
                                                : "bg-linear-to-br from-neutral-900 to-neutral-950",
                                        )}
                                    >
                                        <div className="flex flex-col gap-3">
                                            <div className="flex justify-between items-center">
                                                <span className="flex items-center gap-1 font-semibold">
                                                    <FontAwesomeIcon
                                                        icon={platform.icon}
                                                        className="size-4!"
                                                    />
                                                    {platform.title}
                                                </span>

                                                {platform.isCurrent && (
                                                    <span className="flex items-center gap-1 rounded-lg py-2 px-2 bg-linear-to-r from-transparent to-green-900/50 text-green-200 text-sm font-medium">
                                                        <MonitorCheck
                                                            size={14}
                                                        />
                                                        For your device
                                                    </span>
                                                )}
                                            </div>

                                            {platform.warning && (
                                                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-yellow-950/30 border border-yellow-900/50 text-yellow-200 text-xs">
                                                    <AlertCircle
                                                        size={12}
                                                        className="mt-0.5 shrink-0"
                                                    />
                                                    <span>
                                                        {platform.warning}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="inline-flex items-start flex-wrap gap-3">
                                            {platform.downloads.map(
                                                download => (
                                                    <div
                                                        key={
                                                            download.text +
                                                            download.href
                                                        }
                                                        className="flex-1 flex flex-col gap-1.5"
                                                    >
                                                        {download.href ? (
                                                            <a
                                                                href={
                                                                    download.href
                                                                }
                                                                target="_blank"
                                                                className="w-full"
                                                            >
                                                                <Button
                                                                    variant={
                                                                        platform.isCurrent &&
                                                                            download.prioritize
                                                                            ? "primary"
                                                                            : "secondary"
                                                                    }
                                                                    className="w-full"
                                                                    icon={
                                                                        <DownloadIcon
                                                                            size={
                                                                                14
                                                                            }
                                                                        />
                                                                    }
                                                                >
                                                                    {
                                                                        download.text
                                                                    }
                                                                </Button>
                                                            </a>
                                                        ) : (
                                                            <Button
                                                                variant="secondary"
                                                                className="w-full cursor-not-allowed opacity-60"
                                                                disabled
                                                            >
                                                                {download.text}
                                                            </Button>
                                                        )}

                                                        <span className="text-xs text-neutral-500 text-center px-1 min-h-4">
                                                            {download.note ??
                                                                ""}
                                                        </span>
                                                    </div>
                                                ),
                                            )}
                                        </div>

                                        {platform.command && (
                                            <CommandBlock
                                                label={
                                                    platform.command.label
                                                }
                                                command={
                                                    platform.command.text
                                                }
                                            />
                                        )}

                                        <p className="text-neutral-300 text-sm">
                                            {platform.subtext}
                                        </p>

                                        <div className="inline-flex items-center flex-wrap gap-3">
                                            {platform.subsection?.map(
                                                download => (
                                                    <div
                                                        key={download.text}
                                                        className="flex-1 flex flex-col gap-1"
                                                    >
                                                        <a
                                                            href={download.href}
                                                            target="_blank"
                                                        >
                                                            <Button
                                                                variant={
                                                                    platform.isCurrent &&
                                                                        download.prioritize
                                                                        ? "primary"
                                                                        : "secondary"
                                                                }
                                                                className="w-full"
                                                                icon={
                                                                    <DownloadIcon
                                                                        size={
                                                                            14
                                                                        }
                                                                    />
                                                                }
                                                            >
                                                                {download.text}
                                                            </Button>
                                                        </a>
                                                        {download.note && (
                                                            <span className="text-xs text-neutral-400 text-center">
                                                                {download.note}
                                                            </span>
                                                        )}
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                            <Package size={24} />
                            Other Offerings
                        </h2>
                        <p className="text-neutral-400 text-sm">
                            Third-party Discord clients and package managers
                            that support SudoCord.
                        </p>
                        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-yellow-950/30 border border-yellow-900/50 text-yellow-200 text-sm">
                            <AlertCircle
                                size={16}
                                className="mt-0.5 shrink-0"
                            />
                            <span>
                                We may have difficulty offering support for
                                these third-party packages.
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {OtherOfferings.map(offering => (
                            <a
                                key={offering.name}
                                href={offering.href}
                                target="_blank"
                                className="px-4 py-3 rounded-lg border border-neutral-800 bg-linear-to-br from-neutral-900 to-neutral-950 hover:border-neutral-700 transition-colors"
                            >
                                <span className="text-sm font-medium">
                                    {offering.name}
                                </span>
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        </PageBootstrap>
    );
}
