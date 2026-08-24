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

import { app, BrowserWindow } from "electron";

// SudoCord logo (webp, embedded)
const LOGO = "data:image/webp;base64,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";

const SPLASH_HTML = `<!doctype html>
<html>
<head>
<style>
  html, body {
    margin: 0;
    height: 100%;
    background: #000;
    overflow: hidden;
  }
  .wrap {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 18px;
  }
  .logo {
    width: 150px;
    border-radius: 24px;
    animation: scpulse 1.2s ease-in-out infinite;
  }
  .name {
    color: #fff;
    font-family: "gg sans", "Noto Sans", sans-serif;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 1px;
    animation: scpulse 1.2s ease-in-out infinite;
  }
  @keyframes scpulse {
    0%, 100% { opacity: 0.55; transform: scale(0.96); }
    50%      { opacity: 1;    transform: scale(1); }
  }
</style>
</head>
<body>
  <div class="wrap">
    <img class="logo" src="${LOGO}" />
    <div class="name">SudoCord</div>
  </div>
</body>
</html>`;

function isSplashWindow(wc: Electron.WebContents): boolean {
    try {
        const win = BrowserWindow.fromWebContents(wc);
        if (!win) return false;
        const [w, h] = win.getSize();
        // discord splash: small frameless window (~300x300)
        return w > 0 && h > 0 && w <= 400 && h <= 400 && !win.isResizable();
    } catch {
        return false;
    }
}

function brandSplash(wc: Electron.WebContents) {
    try {
        // paint black immediately so the original splash never flashes
        wc.insertCSS("html,body{background:#000 !important}").catch(() => { });
        wc.executeJavaScript(
            `document.open(); document.write(${JSON.stringify(SPLASH_HTML)}); document.close();`,
        ).catch(() => { });
    } catch { }
}

export function initSplashBranding() {
    app.on("web-contents-created", (_event, wc) => {
        wc.on("did-finish-load", () => {
            if (isSplashWindow(wc)) brandSplash(wc);
        });
    });
}