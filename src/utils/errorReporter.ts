/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Anonymous error reports: when a Discord update breaks a plugin, the server sees which patch or plugin failed,
// on which build and for how many clients, before anyone has to send a console log.
// Only technical data is sent: SudoCord build, Discord release channel, plugin name and the error text with user
// paths, tokens and Discord ids stripped. No account id, no messages. Turn off with Settings.errorReports.

import { Settings } from "@api/Settings";

import gitHash from "~git-hash";

const ENDPOINT = "https://sudocord.mooo.com/api/errors";
const FIRST_FLUSH_MS = 60_000;
const FLUSH_EVERY_MS = 10 * 60_000;
const MAX_PER_BATCH = 50;
const MAX_MESSAGE = 400;

export type ErrorKind = "patch-no-effect" | "patch-error" | "plugin-start" | "plugin-stop" | "find-failed";

interface ErrorEntry {
    kind: ErrorKind;
    plugin: string;
    message: string;
    count: number;
}

const pending = new Map<string, ErrorEntry>();
// already sent this session: report each distinct error once per launch
const sent = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function sanitize(text: string) {
    return text
        .replace(/[a-z]:\\users\\[^\\\s"'`]+/gi, "C:\\Users\\<user>")
        .replace(/\/(home|Users)\/[^/\s"'`]+/g, "/$1/<user>")
        .replace(/[\w-]{24,28}\.[\w-]{6}\.[\w-]{27,40}/g, "<token>")
        .replace(/\b\d{17,20}\b/g, "<id>")
        .slice(0, MAX_MESSAGE);
}

export function reportError(kind: ErrorKind, plugin: string, error: unknown) {
    if (IS_REPORTER || IS_DEV || IS_WEB) return;
    try {
        if (!Settings.errorReports) return;

        const message = sanitize(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
        const key = `${kind}|${plugin}|${message}`;
        if (sent.has(key)) return;

        const entry = pending.get(key);
        if (entry) entry.count++;
        else pending.set(key, { kind, plugin: String(plugin).slice(0, 80), message, count: 1 });

        timer ??= setTimeout(flush, sent.size ? FLUSH_EVERY_MS : FIRST_FLUSH_MS);
    } catch {
        // reporting must never break the client
    }
}

async function flush() {
    timer = null;
    if (!pending.size || !Settings.errorReports) {
        pending.clear();
        return;
    }

    const batch = [...pending].slice(0, MAX_PER_BATCH);
    for (const [key] of batch) {
        pending.delete(key);
        sent.add(key);
    }

    try {
        await fetch(ENDPOINT, {
            method: "POST",
            // text/plain keeps it a simple request (no CORS preflight)
            body: JSON.stringify({
                build: gitHash,
                channel: (window as any).GLOBAL_ENV?.RELEASE_CHANNEL ?? "unknown",
                errors: batch.map(([, e]) => e)
            }),
            signal: AbortSignal.timeout(15_000)
        });
    } catch {
        // offline or server down: drop this batch, the same errors come back next launch
    }

    if (pending.size) timer = setTimeout(flush, FLUSH_EVERY_MS);
}
