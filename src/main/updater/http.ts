/*
 * SudoCord, a modification for Discord's desktop app
 * Copyright (c) 2026 dsd16
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { fetchBuffer, fetchJson } from "@main/utils/http";
import { IpcEvents } from "@shared/IpcEvents";
import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { ipcMain } from "electron";
import { writeFile } from "fs/promises";
import { join } from "path";

import gitHash from "~git-hash";
import gitRemote from "~git-remote";

import { serializeErrors } from "./common";

const API_BASE = `https://api.github.com/repos/${gitRemote}`;
let PendingAsarUrl: string | null = null;

async function githubGet<T = any>(endpoint: string) {
    return fetchJson<T>(API_BASE + endpoint, {
        headers: {
            Accept: "application/vnd.github+json",
            // "All API requests MUST include a valid User-Agent header.
            // Requests with no User-Agent header will be rejected."
            "User-Agent": VENCORD_USER_AGENT
        }
    });
}

async function calculateGitChanges() {
    const isOutdated = await fetchUpdates();
    if (!isOutdated) return [];

    const data = await githubGet(`/compare/${gitHash}...HEAD`);

    return data.commits.map((c: any) => ({
        // github api only sends the long sha
        hash: c.sha.slice(0, 7),
        author: c.author?.login ?? c.commit?.author?.name ?? "Unknown Author",
        message: c.commit.message.split("\n")[0]
    }));
}

async function fetchUpdates() {
    // list endpoint: the newest release may be a stable one, we want the devbuild prerelease
    const data = await githubGet("/releases?per_page=10");
    const releases = Array.isArray(data) ? data : [data];

    const release = releases.find(r => r.tag_name === "devbuild" || r.prerelease) ?? releases[0];
    if (!release) throw new Error("No releases found");

    const hash = release.name.slice(release.name.lastIndexOf(" ") + 1);
    if (hash === gitHash)
        return false;

    const asar = release.assets?.find((a: any) => a.name === "desktop.asar");
    if (!asar) throw new Error("No desktop.asar found in the latest release");

    PendingAsarUrl = asar.browser_download_url;
    return true;
}

async function applyUpdates() {
    if (!PendingAsarUrl) return false;

    const contents = await fetchBuffer(PendingAsarUrl);

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
