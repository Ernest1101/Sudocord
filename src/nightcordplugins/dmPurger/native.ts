/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { exec } from "child_process";
import { app, dialog, shell } from "electron";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import * as tls from "tls";
import { URL } from "url";

import type { EmailCredentials, PackageChannel, PackageMessage, PurgerState } from "./types";

function getBaseDirectory(): string {
    let baseDir = "";
    try {
        const appData = app.getPath("appData");
        if (appData) baseDir = path.join(appData, "Nightcord");
    } catch { }

    if (!baseDir) {
        try {
            const userData = app.getPath("userData");
            if (userData) baseDir = path.join(userData, "Nightcord");
        } catch { }
    }

    if (!baseDir) {
        baseDir = path.join(process.cwd(), "Nightcord");
    }

    try {
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
    } catch (e) {
        console.error("[DmPurgerNative] Error creating base directory:", e);
    }

    return baseDir;
}

function getLogsFilePath(): string {
    const dir = getBaseDirectory();
    return path.join(dir, "dm_purger_logs.txt");
}

function getStateFilePath(): string {
    const dir = getBaseDirectory();
    return path.join(dir, "dm_purger_state.json");
}

class SimpleImapSession {
    private socket: tls.TLSSocket | null = null;
    private tagCounter = 0;

    async connect(host: string, port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const socket = tls.connect({
                host,
                port,
                rejectUnauthorized: false,
                timeout: 30000
            }, () => {
                this.socket = socket;
            });

            socket.setEncoding("utf8");

            let initialBuffer = "";
            const onInitialData = (chunk: string) => {
                initialBuffer += chunk;
                if (initialBuffer.includes("* OK")) {
                    socket.off("data", onInitialData);
                    resolve();
                }
            };

            socket.on("data", onInitialData);
            socket.on("error", err => {
                socket.destroy();
                reject(err);
            });
            socket.on("timeout", () => {
                socket.destroy();
                reject(new Error("Connection to mail server timed out"));
            });
        });
    }

    async exec(cmd: string, timeoutMs = 25000): Promise<{ ok: boolean; response: string }> {
        if (!this.socket) throw new Error("IMAP socket not connected");
        const tag = `A${++this.tagCounter}`;
        const fullCmd = `${tag} ${cmd}\r\n`;

        return new Promise((resolve, reject) => {
            let resBuffer = "";
            const timer = setTimeout(() => {
                this.socket?.off("data", onData);
                resolve({ ok: false, response: resBuffer });
            }, timeoutMs);

            const onData = (chunk: string) => {
                resBuffer += chunk;
                const lines = resBuffer.split("\r\n");
                for (const line of lines) {
                    if (line.startsWith(`${tag} OK`)) {
                        clearTimeout(timer);
                        this.socket?.off("data", onData);
                        return resolve({ ok: true, response: resBuffer });
                    }
                    if (line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) {
                        clearTimeout(timer);
                        this.socket?.off("data", onData);
                        return resolve({ ok: false, response: resBuffer });
                    }
                }
            };

            this.socket!.on("data", onData);
            this.socket!.write(fullCmd);
        });
    }

    close() {
        try {
            this.socket?.end();
            this.socket?.destroy();
        } catch { }
        this.socket = null;
    }
}

function downloadFile(urlStr: string, destPath: string, maxRedirects = 5): Promise<void> {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error("Too many redirects"));

        const url = new URL(urlStr);
        const getter = url.protocol === "https:" ? https.get : http.get;

        const req = getter(urlStr, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        }, res => {
            if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                const nextUrl = new URL(res.headers.location, urlStr).toString();
                return downloadFile(nextUrl, destPath, maxRedirects - 1).then(resolve, reject);
            }

            if (res.statusCode && res.statusCode >= 400) {
                return reject(new Error(`Failed to download file: HTTP ${res.statusCode}`));
            }

            const fileStream = fs.createWriteStream(destPath);
            res.pipe(fileStream);
            fileStream.on("finish", () => {
                fileStream.close(() => resolve());
            });
            fileStream.on("error", err => {
                fs.unlink(destPath, () => { });
                reject(err);
            });
        });

        req.on("error", reject);
        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error("Download request timed out"));
        });
    });
}

export async function fetchDiscordDataEmail(_: any, creds: EmailCredentials): Promise<{ success: boolean; zipPath?: string; downloadUrl?: string; error?: string }> {
    const session = new SimpleImapSession();
    try {
        let host = creds.customHost || "";
        let port = creds.customPort || 993;

        if (creds.provider === "outlook") {
            host = "outlook.office365.com";
            port = 993;
        } else if (creds.provider === "gmail") {
            host = "imap.gmail.com";
            port = 993;
        } else if (creds.provider === "yahoo") {
            host = "imap.mail.yahoo.com";
            port = 993;
        }

        if (!host) {
            return { success: false, error: "Missing IMAP host address" };
        }

        await session.connect(host, port);

        const escapedUser = creds.email.replace(/["\\]/g, "\\$&");
        const escapedPass = creds.password.replace(/["\\]/g, "\\$&");
        const loginRes = await session.exec(`LOGIN "${escapedUser}" "${escapedPass}"`);
        if (!loginRes.ok) {
            session.close();
            return {
                success: false,
                error: "Authentication failed. For Gmail/Yahoo/Outlook with 2FA, please use an App Password instead of your standard password."
            };
        }

        const selectRes = await session.exec("SELECT INBOX");
        if (!selectRes.ok) {
            session.close();
            return { success: false, error: "Could not access email INBOX" };
        }

        let searchRes = await session.exec('SEARCH FROM "noreply@discord.com"');
        let ids: string[] = [];
        let match = searchRes.response.match(/\* SEARCH ([\d\s]+)/i);
        if (match && match[1]) {
            ids = match[1].trim().split(/\s+/).filter(Boolean);
        }

        if (ids.length === 0) {
            searchRes = await session.exec('SEARCH TEXT "Discord"');
            match = searchRes.response.match(/\* SEARCH ([\d\s]+)/i);
            if (match && match[1]) {
                ids = match[1].trim().split(/\s+/).filter(Boolean);
            }
        }

        if (ids.length === 0) {
            session.close();
            return { success: false, error: "No Discord emails found in your INBOX" };
        }

        const latestMsgId = ids[ids.length - 1];
        const fetchRes = await session.exec(`FETCH ${latestMsgId} (BODY[] BODY[TEXT])`);

        await session.exec("LOGOUT").catch(() => { });
        session.close();

        let rawEmail = fetchRes.response;
        // Decode quoted-printable
        rawEmail = rawEmail.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/=\r?\n/g, "");

        // Decode base64 chunks
        const b64Regex = /([A-Za-z0-9+/=]{70,})/g;
        let b64Match: RegExpExecArray | null;
        let decodedExtra = "";
        while ((b64Match = b64Regex.exec(rawEmail)) !== null) {
            try {
                decodedExtra += "\n" + Buffer.from(b64Match[1], "base64").toString("utf8");
            } catch { }
        }
        const fullContent = rawEmail + "\n" + decodedExtra;

        // Search for Discord data package download URLs
        const urlRegex = /https:\/\/(?:cdn\.discordapp\.com\/data-packages\/[^\s"'>\\]+|discord\.com\/api\/v\d+\/users\/@me\/harvest\/[^\s"'>\\]+|[^\s"'>\\]*package\.zip[^\s"'>\\]*|[^\s"'>\\]*data-package[^\s"'>\\]*)/i;
        const urlMatch = fullContent.match(urlRegex);

        if (!urlMatch || !urlMatch[0]) {
            return {
                success: false,
                error: "Discord email found, but no active package download link was detected. The link may have expired (links expire after 30 days)."
            };
        }

        const downloadUrl = urlMatch[0].replace(/[.,>)"']$/, "");

        const baseDir = getBaseDirectory();
        const zipPath = path.join(baseDir, `discord_package_${Date.now()}.zip`);

        await downloadFile(downloadUrl, zipPath);

        return {
            success: true,
            zipPath,
            downloadUrl
        };
    } catch (e: any) {
        session.close();
        return { success: false, error: e?.message || String(e) };
    }
}

export async function extractZip(_: any, zipPath: string, autoDelete = false): Promise<{ success: boolean; dir?: string; error?: string }> {
    try {
        if (!fs.existsSync(zipPath)) {
            return { success: false, error: "Package zip file not found on disk" };
        }

        const baseDir = getBaseDirectory();
        const destDir = path.join(baseDir, `extracted_${Date.now()}`);
        fs.mkdirSync(destDir, { recursive: true });

        await new Promise<void>((resolve, reject) => {
            // Use bsdtar (built into Windows 10/11)
            exec(`tar -xf "${zipPath}" -C "${destDir}"`, err => {
                if (!err) return resolve();
                // Fallback to PowerShell Expand-Archive
                const safeZip = zipPath.replace(/'/g, "''");
                const safeDest = destDir.replace(/'/g, "''");
                exec(`powershell -Command "Expand-Archive -LiteralPath '${safeZip}' -DestinationPath '${safeDest}' -Force"`, err2 => {
                    if (err2) reject(err2);
                    else resolve();
                });
            });
        });

        if (autoDelete) {
            try {
                fs.unlinkSync(zipPath);
            } catch (err) {
                console.warn("[DmPurgerNative] Could not auto-delete zip archive:", err);
            }
        }

        return { success: true, dir: destDir };
    } catch (e: any) {
        return { success: false, error: e?.message || String(e) };
    }
}

function findMessagesDirectory(startDir: string): string | null {
    if (path.basename(startDir).toLowerCase() === "messages") {
        return startDir;
    }

    const messagesDirect = path.join(startDir, "messages");
    if (fs.existsSync(messagesDirect) && fs.statSync(messagesDirect).isDirectory()) {
        return messagesDirect;
    }

    try {
        const entries = fs.readdirSync(startDir);
        for (const entry of entries) {
            const sub = path.join(startDir, entry);
            if (fs.statSync(sub).isDirectory()) {
                if (entry.toLowerCase() === "messages") return sub;
                const nested = path.join(sub, "messages");
                if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
                    return nested;
                }
            }
        }
    } catch { }

    return null;
}

export async function parsePackageMessages(
    _: any,
    targetPath: string,
    autoDeleteZip = false
): Promise<{ success: boolean; channels?: PackageChannel[]; totalMessages?: number; error?: string }> {
    try {
        let rootDir = targetPath;

        if (targetPath.toLowerCase().endsWith(".zip")) {
            const extractRes = await extractZip(null, targetPath, autoDeleteZip);
            if (!extractRes.success || !extractRes.dir) {
                return { success: false, error: extractRes.error || "Failed to extract package zip" };
            }
            rootDir = extractRes.dir;
        }

        const messagesDir = findMessagesDirectory(rootDir) || rootDir;

        if (!fs.existsSync(messagesDir)) {
            return { success: false, error: "Messages directory not found in the package" };
        }

        // Try reading index.json if present
        let channelNamesMap: Record<string, string> = {};
        const indexFile = path.join(messagesDir, "index.json");
        if (fs.existsSync(indexFile)) {
            try {
                channelNamesMap = JSON.parse(fs.readFileSync(indexFile, "utf8"));
            } catch { }
        }

        const entries = fs.readdirSync(messagesDir);
        const channels: PackageChannel[] = [];
        let totalMessages = 0;

        for (const entry of entries) {
            const channelFolder = path.join(messagesDir, entry);
            try {
                if (!fs.statSync(channelFolder).isDirectory()) continue;
            } catch {
                continue;
            }

            const channelJsonFile = path.join(channelFolder, "channel.json");
            const messagesJsonFile = path.join(channelFolder, "messages.json");

            if (!fs.existsSync(channelJsonFile) || !fs.existsSync(messagesJsonFile)) {
                continue;
            }

            try {
                const channelData = JSON.parse(fs.readFileSync(channelJsonFile, "utf8"));
                const rawMessages = JSON.parse(fs.readFileSync(messagesJsonFile, "utf8"));

                const channelId = String(channelData.id || entry.replace(/^c/, ""));
                const channelType = String(channelData.type || "DM");
                const recipients = Array.isArray(channelData.recipients) ? channelData.recipients.map(String) : [];

                const messages: PackageMessage[] = [];
                if (Array.isArray(rawMessages)) {
                    for (const m of rawMessages) {
                        const id = String(m.ID || m.id || "");
                        if (!id) continue;
                        messages.push({
                            id,
                            timestamp: String(m.Timestamp || m.timestamp || ""),
                            contents: String(m.Contents || m.contents || ""),
                            attachments: String(m.Attachments || m.attachments || "")
                        });
                    }
                }

                if (messages.length > 0) {
                    totalMessages += messages.length;
                    channels.push({
                        id: channelId,
                        type: channelType,
                        recipients,
                        name: channelNamesMap[channelId] || channelData.name,
                        messages
                    });
                }
            } catch (err) {
                console.warn("[DmPurgerNative] Error parsing channel in folder:", entry, err);
            }
        }

        return {
            success: true,
            channels,
            totalMessages
        };
    } catch (e: any) {
        return { success: false, error: e?.message || String(e) };
    }
}

export async function cleanupFolder(_: any, folderPath: string): Promise<boolean> {
    try {
        if (fs.existsSync(folderPath)) {
            fs.rmSync(folderPath, { recursive: true, force: true });
        }
        return true;
    } catch (e) {
        console.error("[DmPurgerNative] Cleanup error:", e);
        return false;
    }
}

export async function appendDeletedLogs(_: any, lines: string[]): Promise<boolean> {
    try {
        if (!lines || lines.length === 0) return true;
        const logPath = getLogsFilePath();
        const content = lines.join("\n") + "\n";
        fs.appendFileSync(logPath, content, "utf8");
        return true;
    } catch (e) {
        console.error("[DmPurgerNative] Append logs error:", e);
        return false;
    }
}

export async function openLogsFile(_: any): Promise<boolean> {
    try {
        const logPath = getLogsFilePath();
        if (!fs.existsSync(logPath)) {
            const initialHeader = `# Nightcord DM Purger - Deleted Messages Log\n# Created: ${new Date().toISOString()}\n\n`;
            fs.writeFileSync(logPath, initialHeader, "utf8");
        }
        await shell.openPath(logPath);
        return true;
    } catch (e) {
        console.error("[DmPurgerNative] Open logs error:", e);
        return false;
    }
}

export async function savePurgerState(_: any, state: PurgerState): Promise<boolean> {
    try {
        const stateFile = getStateFilePath();
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf8");
        return true;
    } catch (e) {
        console.error("[DmPurgerNative] Save state error:", e);
        return false;
    }
}

export async function loadPurgerState(_: any): Promise<PurgerState | null> {
    try {
        const stateFile = getStateFilePath();
        if (!fs.existsSync(stateFile)) return null;
        const data = fs.readFileSync(stateFile, "utf8");
        return JSON.parse(data) as PurgerState;
    } catch (e) {
        console.error("[DmPurgerNative] Load state error:", e);
        return null;
    }
}

export async function selectZipOrFolderDialog(_: any): Promise<string | null> {
    try {
        const res = await dialog.showOpenDialog({
            title: "Select Discord Data Package (.zip or messages folder)",
            properties: ["openFile", "openDirectory"],
            filters: [
                { name: "Discord Package Archive", extensions: ["zip"] },
                { name: "All Files", extensions: ["*"] }
            ]
        });

        if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
            return null;
        }

        return res.filePaths[0];
    } catch (e) {
        console.error("[DmPurgerNative] Dialog error:", e);
        return null;
    }
}
