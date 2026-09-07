# SudoCord — Global Update Changelog

## Unreleased — Global Update (2026-09-06)

Big all-in-one update: new client plugins, Themes marketplace synced with the
website, crypto donations, video backgrounds, transparency overhaul and a
Discord audit-log bot.

### Client plugins

- **StaffDetector** (new): alerts when staff (admin / moderator by role name or
  moderation permissions) joins your voice channel — sound alert, in-client
  overlay card with name, role and permissions, plus a topmost overlay window
  over games (main-process window, click-through, auto-hide).
- **StreamQuality** (new): Go Live quality panel — custom FPS (1–120),
  resolution and bitrate overrides injected into the stream quality popout,
  with per-viewer / self-preview readouts.
- **GeniusLyrics** (new): takes the current Spotify track (player state with
  Presence fallback) and puts the synced lyric line into the Discord status.
  Lyrics via LRCLIB (cached + search) with Genius fallback, 30s status queue
  with 429 backoff.
- **SudoBadges** (new): SudoCord profile badge from the
  `sudocord.h4ck.me/api/badges.json` registry, cached in DataStore.
- **Soundpad** (new): uwupad soundboard in its own tab + chat button —
  trending / popular / latest / search, waveform previews, audio proxied via
  `sudocord.h4ck.me/uwu-audio`, output routing (incl. virtual mic cable).
- **CustomBackground** (reworked): own Discord background (mp4 / gif / png,
  file or link, fit / dim / blur). Surfaces, app backdrops (`background_*`,
  `bg__*`), guilds nav, DM/channel navs, scrollers, voice panels and the chat
  input are made transparent; Discord-native `backdrop-filter` frosting is
  disabled for a clean picture. Built-in opaque-layer scanner with triple
  delayed passes and oklab/oklch diagnostics in console.
- **FontSelector** (hidden): font picker section inside Themes.
- Removed the manual "transparent surfaces without background" toggle —
  transparency now follows the client transparency switch and glass themes.

### Themes marketplace (client + website in sync)

- New **SudoCord** tab in client Themes + `/themes/sudocord` page on the
  website, both fed by a single `api/sudo-themes.json` registry.
- One-click installs: CSS themes via Online Themes links, **video
  backgrounds** download straight into CustomBackground (progress + installed
  state, remove support).
- First entry: "Mr Robot 1080p Loop FIX" video background, hosted at
  `/backgrounds/mr-robot-1080p-loop.mp4` with CORS for in-client download.
- BetterDiscord Marketplace tab kept, with trailing-dot FQDN + CSP fixes.

### Website (sudocord.h4ck.me)

- **Donate page** (`/donate`): crypto donations via CryptoBot (Crypto Pay
  invoices for TON / USDT / BTC), token kept server-side in systemd env,
  plus a Donate button in the home hero and navbar.
- **Linux one-liner**: `install.sh` (X11 / Wayland / universal auto-pick) on
  the download page and in docs (incl. Hyprland notes).
- Themes pages, badges registry with CORS, standalone deploy procedure
  (static must be synced into `standalone/.next/static` before restart —
  the server snapshots static assets at startup).

### SudoBot (community bot, on VDS)

- New `serverLogs` module: private #логи channel (closed to @everyone),
  logging member join/leave, voice join/leave/move/mute/stream, bans/unbans
  and deleted/edited messages with Russian embeds.

### Notes

- Client transparency requires the Vencord transparency switch + full
  Discord restart (tray quit); renderer-only reload is not enough for the
  window flag.
- No secrets in this repo: CryptoBot token and bot tokens live only in
  server-side systemd environment.