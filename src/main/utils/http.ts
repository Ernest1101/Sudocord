/*
 * SudoCord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
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

import { createWriteStream } from "original-fs";
import { Readable } from "stream";
import { finished } from "stream/promises";

type Url = string | URL;

export async function checkedFetch(url: Url, options?: RequestInit) {
    try {
        var res = await fetch(url, options);
    } catch (err) {
        if (err instanceof Error && err.cause) {
            err = err.cause;
        }

        throw new Error(`${options?.method ?? "GET"} ${url} failed: ${err}`);
    }

    if (res.ok) {
        return res;
    }

    let message = `${options?.method ?? "GET"} ${url}: ${res.status} ${res.statusText}`;
    try {
        const reason = await res.text();
        message += `\n${reason}`;
    } catch { }

    throw new Error(message);
}

export async function fetchJson<T = any>(url: Url, options?: RequestInit) {
    const res = await checkedFetch(url, options);
    return res.json() as Promise<T>;
}

export async function fetchBuffer(url: Url, options?: RequestInit) {
    const res = await checkedFetch(url, options);
    const buf = await res.arrayBuffer();

    return Buffer.from(buf);
}

/**
 * Like fetchBuffer, but gives up instead of hanging forever: connectTimeout limits the wait for the response,
 * stallTimeout aborts once no data has arrived for that long (a stuck VPN or blocked CDN otherwise never errors).
 */
export async function fetchBufferWithTimeout(url: Url, options: RequestInit = {}, { connectTimeout = 20_000, stallTimeout = 30_000 } = {}) {
    const controller = new AbortController();
    let timer = setTimeout(() => controller.abort(new Error(`no response in ${connectTimeout / 1000}s`)), connectTimeout);
    const resetStallTimer = () => {
        clearTimeout(timer);
        timer = setTimeout(() => controller.abort(new Error(`download stalled for ${stallTimeout / 1000}s`)), stallTimeout);
    };

    try {
        const res = await checkedFetch(url, { ...options, signal: controller.signal });
        if (!res.body) throw new Error(`GET ${url}: response body is empty`);

        const expected = Number(res.headers.get("content-length")) || 0;
        const chunks: Uint8Array[] = [];
        let received = 0;
        const reader = res.body.getReader();
        resetStallTimer();
        for (; ;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.byteLength;
            resetStallTimer();
        }

        if (expected && received !== expected)
            throw new Error(`GET ${url}: got ${received} of ${expected} bytes`);

        return Buffer.concat(chunks);
    } catch (err) {
        if (controller.signal.aborted && controller.signal.reason instanceof Error)
            throw new Error(`GET ${url} failed: ${controller.signal.reason.message}`);
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

export async function downloadToFile(url: Url, path: string, options?: RequestInit) {
    const res = await checkedFetch(url, options);
    if (!res.body) {
        throw new Error(`Download ${url}: response body is empty`);
    }

    // @ts-expect-error weird type conflict
    const body = Readable.fromWeb(res.body);
    await finished(body.pipe(createWriteStream(path)));
}
