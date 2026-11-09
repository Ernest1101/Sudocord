/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// "What's new" modal: after an update, show the newest CHANGELOG section once, so people know what was fixed.

import { Settings } from "@api/Settings";
import { Button } from "@components/Button";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import type { RenderModalProps } from "@vencord/discord-types";
import { Parser } from "@webpack/common";
import changelog from "file://../../CHANGELOG.md";

interface Section {
    heading: string;
    body: string;
}

/** Newest "## vX.Y.Z — title" section of CHANGELOG.md, with hard-wrapped lines joined back together. */
export function getLatestSection(): Section | null {
    const lines = changelog.split(/\r?\n/);
    const start = lines.findIndex(l => l.startsWith("## "));
    if (start === -1) return null;

    let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
    if (end === -1) end = lines.length;

    const out: string[] = [];
    for (const line of lines.slice(start + 1, end)) {
        const isBlock = !line.trim() || /^\s*(#|[-*] |\d+\. )/.test(line);
        const prev = out[out.length - 1];
        if (!isBlock && prev?.trim()) out[out.length - 1] = `${prev} ${line.trim()}`;
        else out.push(line);
    }

    return { heading: lines[start].slice(3).trim(), body: out.join("\n").trim() };
}

/** Block-level markdown (### headings, - lists, paragraphs); Discord's parser only handles the inline part. */
function renderBody(body: string) {
    return body.split("\n").map((line, i) => {
        if (!line.trim()) return null;

        const heading = line.match(/^#{1,6}\s+(.*)/);
        if (heading)
            return <div key={i} style={{ fontSize: 15, fontWeight: 700, margin: "14px 0 6px", color: "var(--header-primary, #f2f3f5)" }}>{heading[1]}</div>;

        const item = line.match(/^(\s*)[-*]\s+(.*)/);
        if (item)
            return (
                <div key={i} style={{ display: "flex", gap: 8, margin: "4px 0", paddingLeft: Math.min(item[1].length, 8) * 8, lineHeight: 1.45 }}>
                    <span>•</span>
                    <span>{Parser.parse(item[2])}</span>
                </div>
            );

        return <div key={i} style={{ margin: "6px 0", lineHeight: 1.45 }}>{Parser.parse(line.trim())}</div>;
    });
}

function WhatsNewModal({ section, ...props }: RenderModalProps & { section: Section; }) {
    return (
        <ModalRoot {...props} size={ModalSize.MEDIUM}>
            <ModalHeader separator={false}>
                <span style={{ flexGrow: 1, fontSize: 20, fontWeight: 700, color: "var(--header-primary, #f2f3f5)" }}>
                    What's new in SudoCord
                </span>
                <ModalCloseButton onClick={props.onClose} />
            </ModalHeader>
            <ModalContent>
                <div style={{ padding: "4px 0 16px", color: "var(--text-normal, #dbdee1)", userSelect: "text" }}>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{section.heading}</div>
                    {renderBody(section.body)}
                </div>
            </ModalContent>
            <ModalFooter>
                <Button onClick={props.onClose}>Got it</Button>
            </ModalFooter>
        </ModalRoot>
    );
}

/** Shows the newest changelog section once per section. Call after Discord has loaded. */
export function maybeShowWhatsNew() {
    if (IS_REPORTER || IS_WEB) return;
    try {
        const section = getLatestSection();
        if (!section || Settings.lastChangelog === section.heading) return;

        Settings.lastChangelog = section.heading;
        openModal(props => <WhatsNewModal {...props} section={section} />);
    } catch (e) {
        console.error("[SudoCord] could not show the changelog", e);
    }
}
