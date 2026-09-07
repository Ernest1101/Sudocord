# SudoCord Changelog (English)

## Unreleased — Global Update (2026-09-06)

### Added

- **StaffDetector** plugin: sound + overlay alert when staff joins your voice
  channel (topmost overlay over games included).
- **StreamQuality** plugin: custom FPS / resolution / bitrate for Go Live.
- **GeniusLyrics** plugin: current Spotify lyric line in Discord status.
- **SudoBadges** plugin: SudoCord profile badge from the site registry.
- **Soundpad** plugin: uwupad soundboard tab with mic routing.
- **FontSelector**: font picker section in Themes.
- **SudoCord Themes tab** in the client + `/themes/sudocord` page, both fed
  by one `api/sudo-themes.json` registry.
- **One-click video backgrounds**: marketplace cards download straight into
  CustomBackground (first entry: Mr Robot 1080p Loop).
- **Donate page** (`/donate`): crypto donations via CryptoBot invoices
  (TON / USDT / BTC) + Donate button in home hero and navbar.
- **Linux one-liner** `install.sh` (X11 / Wayland auto-pick) + docs.
- **SudoBot `serverLogs` module**: private #логи channel with join / leave /
  voice / ban / deleted-edited message logs.

### Changed

- **CustomBackground rework**: app backdrops, navs, scrollers, voice panels
  and chat input go transparent; native Discord `backdrop-filter` frosting
  disabled; triple delayed opaque-layer scanner with oklab diagnostics.
- Marketplace install buttons now show honest installed state (incl. video).
- Standalone deploy order: sync `static/` into the bundle before restart.

### Fixed

- Site chunk 404 after deploy (stale static snapshot on the server).
- BetterDiscord marketplace trailing-dot FQDN + CSP image/style sources.
- `sudo-themes.json` BOM breaking strict JSON parsers.
- Transparent `wrapper_*` rule leaking glass look onto buttons.

### Removed

- Manual "transparent surfaces without background" toggle (superseded).
- Bundled liquid-glass themes from the site registry.
- `FavoriteMessages` plugin.