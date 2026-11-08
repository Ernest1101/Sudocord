# SudoCord Changelog (English)

## v2.0.5 — Updater fix (2026-11-08)

### Fixed

- **Updater stuck on "downloading"**: the built-in updater downloaded the
  build from GitHub without any timeout, so behind a VPN or a flaky connection
  it could hang forever. Requests now time out (20 s to respond, 30 s without
  data) and the size is checked against the server's.

### Added

- **Updater mirror**: when GitHub fails, release info and the build come from
  the sudocord.mooo.com mirror. Without GitHub the commit list shows a single
  "new build" line, but the update itself still works.
- The updater never writes an error page or a truncated file over a working
  install.

## v2.0.4 — Captcha fix (2026-11-08)

### Fixed

- **hCaptcha in the client** ("rate limit or network error", e.g. when
  claiming quest rewards): SudoCord's CSP patch added missing directives even
  to pages that had no restrictions at all. hCaptcha's frame sends a policy
  with only `report-uri`, so it ended up blocking its own scripts and requests.
  Pages without restrictions are now left as they are; Discord's own pages are
  patched exactly as before.

## v2.0.3 — Window dragging & background fixes (2026-11-08)

### Fixed

- **Window can be dragged again**: an old SudoCord workaround marked the page
  body as "no-drag". Current Chromium passes that on to every element, so the
  whole interface cut the drag area out of the title bar and the window could
  only be moved by the title text.
- **Missing "Background" section in Themes**: the background and font plugins
  are hidden from the plugin list, so once they ended up disabled there was no
  way to turn them back on. They are now always on; the "show your
  background" toggle in the section controls the background.

### Changed

- **CustomBackground**: the voice call screen is transparent too, so the
  background shows around the call tiles. Tiles, video and streams are
  unchanged.

## v2.0.2 — Custom background fix (2026-11-07)

### Fixed

- **CustomBackground** shows the background again: the November 7 Discord
  update renamed the app background layer (`bg__*` → `bg_*`), so it covered
  the picture.
- **CustomBackground** with Discord client themes (Nitro gradients): the
  theme gradients painted over the chat, member list and server list. They
  are now cleared while a custom background is on.

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