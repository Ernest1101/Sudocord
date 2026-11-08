/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fetchBufferWithTimeout, fetchJson } from "@main/utils/http";
import { IpcEvents } from "@shared/IpcEvents";
import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { ipcMain } from "electron";
import { writeFile } from "fs/promises";
import { join } from "path";

import gitHash from "~git-hash";
import gitRemote from "~git-remote";

import { serializeErrors } from "./common";

const API_BASE = `https://api.github.com/repos/${gitRemote}`;
// Release mirror on the site (sudocord-mirror.timer on the VDS) for when GitHub is blocked or hangs behind a VPN
const MIRROR_RELEASES = "https://sudocord.mooo.com/releases/Sudocord";
const MIRROR_ASAR = "https://sudocord.mooo.com/releases/files/Sudocord/desktop.asar";
const API_TIMEOUT = 20_000;

let PendingAsarUrl: string | null = null;
let PendingHash: string | null = null;

async function githubGet<T = any>(endpoint: string) {
    return fetchJson<T>(API_BASE + endpoint, {
        headers: {
            Accept: "application/vnd.github+json",
            // "All API requests MUST include a valid User-Agent header.
            // Requests with no User-Agent header will be rejected."
            "User-Agent": VENCORD_USER_AGENT
        },
        signal: AbortSignal.timeout(API_TIMEOUT)
    });
}

async function getReleases(): Promise<any[]> {
    let data: any;
    try {
        // list endpoint: the newest release may be a stable one, we want the devbuild prerelease
        data = await githubGet("/releases?per_page=10");
    } catch (githubErr) {
        console.warn("[SudoCord Updater] GitHub unavailable, using mirror:", githubErr);
        try {
            data = await fetchJson(MIRROR_RELEASES, {
                headers: { "User-Agent": VENCORD_USER_AGENT },
                signal: AbortSignal.timeout(API_TIMEOUT)
            });
        } catch (mirrorErr) {
            throw new Error(`${githubErr}\nMirror: ${mirrorErr}`);
        }
    }
    return Array.isArray(data) ? data : [data];
}

async function calculateGitChanges() {
    const isOutdated = await fetchUpdates();
    if (!isOutdated) return [];

    try {
        const data = await githubGet(`/compare/${gitHash}...HEAD`);

        return data.commits.map((c: any) => ({
            // github api only sends the long sha
            hash: c.sha.slice(0, 7),
            author: c.author?.login ?? c.commit?.author?.name ?? "Unknown Author",
            message: c.commit.message.split("\n")[0]
        }));
    } catch (err) {
        // the commit list is only shown in the updater; without GitHub the update itself still works through the mirror
        console.warn("[SudoCord Updater] Could not load the commit list:", err);
        return [{ hash: PendingHash!.slice(0, 7), author: "SudoCord", message: "New build (commit list unavailable)" }];
    }
}

async function fetchUpdates() {
    const releases = await getReleases();

    const release = releases.find(r => r.tag_name === "devbuild" || r.prerelease) ?? releases[0];
    if (!release) throw new Error("No releases found");

    const hash = release.name.slice(release.name.lastIndexOf(" ") + 1);
    if (!/^[0-9a-f]{7,40}$/.test(hash))
        throw new Error(`Devbuild release has invalid name: "${release.name}"`);
    if (hash === gitHash)
        return false;

    const asar = release.assets?.find((a: any) => a.name === "desktop.asar");
    if (!asar) throw new Error("No desktop.asar found in the latest release");

    PendingAsarUrl = asar.browser_download_url;
    PendingHash = hash;
    return true;
}

async function downloadAsar(url: string) {
    const contents = await fetchBufferWithTimeout(url, { headers: { "User-Agent": VENCORD_USER_AGENT } });
    // never write an error page or a truncated file over the working install
    if (contents.length < 1_000_000)
        throw new Error(`GET ${url}: got only ${contents.length} bytes, not a SudoCord build`);
    return contents;
}

async function applyUpdates() {
    if (!PendingAsarUrl) return false;

    let contents: Buffer;
    try {
        contents = await downloadAsar(PendingAsarUrl);
    } catch (err) {
        if (PendingAsarUrl === MIRROR_ASAR) throw err;
        console.warn("[SudoCord Updater] Download from GitHub failed, using mirror:", err);
        try {
            contents = await downloadAsar(MIRROR_ASAR);
        } catch (mirrorErr) {
            throw new Error(`${err}\nMirror: ${mirrorErr}`);
        }
    }

    // when running from inside an asar, __dirname looks like
    // "...\SudoCord\sudocord.asar\..." - the real file on disk is the part up to ".asar"
    const asarFile = __dirname.includes(".asar")
        ? __dirname.slice(0, __dirname.lastIndexOf(".asar") + 5)
        : join(__dirname, "desktop.asar");

    await writeFile(asarFile, contents);

    PendingAsarUrl = null;
    return true;
}

ipcMain.handle(IpcEvents.GET_REPO, serializeErrors(() => `https://github.com/${gitRemote}`));
ipcMain.handle(IpcEvents.GET_UPDATES, serializeErrors(calculateGitChanges));
ipcMain.handle(IpcEvents.UPDATE, serializeErrors(fetchUpdates));
ipcMain.handle(IpcEvents.BUILD, serializeErrors(applyUpdates));
