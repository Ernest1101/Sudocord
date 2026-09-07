/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 dsd16
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { BrowserWindow, ipcMain, screen } from "electron";
import staffOverlayHtml from "file://staffOverlay.html?minify&base64";

export interface StaffOverlayData {
    name: string;
    avatar: string;
    role: string;
    color: string | null;
    perms: string;
    durationSec: number;
}

let win: BrowserWindow | null = null;
let hideTimer: NodeJS.Timeout | null = null;

function getWindow(): BrowserWindow {
    if (win && !win.isDestroyed()) return win;

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const W = 380;
    const H = 150;

    win = new BrowserWindow({
        title: "SudoCord Staff Alert",
        width: W,
        height: H,
        x: Math.max(0, width - W - 16),
        y: Math.max(0, height - H - 16),
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: false,
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.setAlwaysOnTop(true, "screen-saver");
    win.setIgnoreMouseEvents(true);
    try {
        (win as any).setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch { /* ignore */ }
    win.on("closed", () => {
        win = null;
    });

    return win;
}

function renderHtml(data: StaffOverlayData): string {
    const template = Buffer.from(staffOverlayHtml, "base64").toString("utf-8");
    const payload = JSON.stringify({
        name: String(data.name ?? "").slice(0, 64),
        avatar: String(data.avatar ?? ""),
        role: String(data.role ?? "STAFF").slice(0, 32),
        color: String(data.color ?? "#5865f2"),
        perms: String(data.perms ?? "").slice(0, 120)
    }).replace(/</g, "\\u003c");
    return Buffer.from(template.replace("__SC_STAFF_DATA_JSON__", () => payload), "utf-8").toString("base64");
}

export function showStaffOverlay(data: StaffOverlayData) {
    try {
        const w = getWindow();
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
        w.loadURL(`data:text/html;base64,${renderHtml(data)}`);
        w.once("ready-to-show", () => {
            try {
                w.showInactive();
            } catch { /* ignore */ }
        });
        setTimeout(() => {
            try {
                if (!w.isDestroyed() && !w.isVisible()) w.showInactive();
            } catch { /* ignore */ }
        }, 500);
        const ms = Math.min(30000, Math.max(2000, (Number(data.durationSec) || 5) * 1000));
        hideTimer = setTimeout(() => {
            try {
                if (!w.isDestroyed()) w.hide();
            } catch { /* ignore */ }
        }, ms);
    } catch (e) {
        console.error("[SudoCord] staff overlay failed", e);
    }
}

ipcMain.handle(IpcEvents.SHOW_STAFF_OVERLAY, (_, data: StaffOverlayData) => {
    showStaffOverlay(data);
});
