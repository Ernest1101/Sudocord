# SudoCord Changelog (English)

## v2.0.1 — Discord startup fix (2026-11-07)

### Fixed

- **Endless "Starting" screen**: the Discord update from November 7 changed
  how its modules export values, and SudoCord's hook dropped them, so the
  client froze on launch with `i.A is not a constructor`. SudoCord now
  understands the new format.
- **Plugins not finding Discord modules**: modules in the new Discord build no
  longer carry a "loaded" flag, which made module search skip everything.
  This caused error spam (e.g. ShowHiddenChannels) and many plugins silently
  doing nothing.
- `ChannelActions`, `VoiceActions`, `UserProfileActions` and `SettingsRouter`
  lookups updated for Discord's split modules.

If Discord is stuck on "Starting", reinstall SudoCord with the installer —
the in-client updater can't run while the client doesn't start.

## v2.0.0 — Nightcord & Equicord (2026-11-03)

### Added

- **Nightcord plugins**: 142 plugins from Nightcord. Ones that clash with
  existing plugins are registered as `nc_*` but keep their original names.
- **Equicord plugins**: 202 plugins from Equicord, clashing ones as `eq_*`.
  Everything ported is off by default.
- **Plugin source icons**: every plugin card shows which client it comes from,
  plus a filter by client (SudoCord / Vencord / Equicord / Nightcord).
- **VoiceSubtitles** plugin: live subtitles for the voice channel via Groq
  Whisper with translation. Captures only Discord's own audio, so music,
  games and the browser stay out. Optional overlay above all windows.
- **VoiceSubtitles filters**: skip Russian speech (any Cyrillic in the text)
  or show English speech only.
- Core APIs needed by the ported plugins: HeaderBar, UserArea, pluginI18n,
  AudioPlayer, ProfileSections, SurfaceClasses.

### Changed

- **FakeAdmin rewritten**: spoofs permissions and server ownership on your
  client through PermissionStore / GuildStore instead of fake dialogs.
  Channel visibility is left untouched, and the server still rejects
  actions you have no rights for.
- Toasts accept Discord's new `{ text, variant }` format alongside the old one.
- Site moved to **sudocord.mooo.com** with its own icons, OpenGraph and
  screenshots.
- The client bundle is noticeably bigger because of the merged plugin
  collections.

### Fixed

- **ShowHiddenChannels**: stage channel patches updated for the current
  Discord (stages now share the voice call view); the stage header no longer
  loses its divider.
- Patches broken by Discord updates; missing themes are skipped instead of
  erroring.
- Console error `findByCode found no module` on every toast.
- All TypeScript and ESLint errors (CI is green again).
- UpdateButton.

### Removed

- FakeAdmin's homemade modals, styles and context menu items.

## Global Update (2026-09-06) — included in v2.0.0

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