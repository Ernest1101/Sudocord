---
title: Installing User Plugins
description: How to install third-party and private plugins in SudoCord.
---

# Installing User Plugins

SudoCord supports any plugin to be built into your Discord, whether they are plugins made by the community, adapted from Vencord, or ones you wrote yourself.

> [!WARNING]
> SudoCord does not provide support for user plugins or dev builds.
> If you run into issues you cannot resolve on your own, you may ask nicely, but a response is not guaranteed.

## Before You Start

User plugins require building SudoCord from source. If you have not done this yet, follow the [Building from Source](/building-from-source) guide first.

You will also need to understand where plugins live in the project, since putting a plugin in the wrong folder is the most common cause of issues.

### Where plugins live

SudoCord separates plugins into two folders depending on their purpose:

| Folder                | What goes here                                        |
| --------------------- | ------------------------------------------------------ |
| `src/plugins/`        | Plugins sourced from or based on Vencord.              |
| `src/userplugins/`    | SudoCord's own plugins (DecibelLimiter, SpoofPlatform, StreamQuality and friends) and your private plugins. |

**Unless you are contributing to SudoCord itself, put your plugins in `src/userplugins/`.**

## Installing a Plugin

### 1. Find the `userplugins` folder

Navigate to `src/` inside your SudoCord folder — the `userplugins` folder is already there:

```text
src/userplugins/
```

### 2. Add the plugin

Place the plugin inside `src/userplugins/`. **Each plugin must have its own folder**, and the entry file must be named `index.ts` or `index.tsx`.

> [!TIP] Valid structures
>
> ```text
> src/userplugins/myMagicPlugin/index.ts
> src/userplugins/myMagicPlugin/index.tsx
> ```

> [!DANGER] Invalid structures
>
> ```text
> src/userplugins/MyMagicPlugin/MyMagicPlugin/MyMagicPlugin.ts
> src/userplugins/MyMagicPlugin/MyMagicPlugin/MyMagicPlugin.tsx
>
> src/userplugins/index.ts
> src/userplugins/index.tsx
> ```

### 3. Rebuild SudoCord

After adding the plugin, rebuild so it gets bundled into Discord:

```sh
pnpm build
```

If you want to also include developer-only plugins, use:

```sh
pnpm build --dev
```

### 4. Restart Discord

Once the build finishes, restart Discord. Your plugin should now appear in the plugins tab.

## Updating SudoCord & official plugins

Run these three commands inside your SudoCord folder:

```sh
git fetch
git pull
pnpm build
```

> [!NOTE]
> `git fetch` and `git pull` only update **SudoCord itself and its bundled plugins**. They do **not** update your user plugins automatically.

After building, you only need to run `pnpm inject` again if Discord is not already injected. If it was already running, a simple restart of Discord is enough.

## Updating user plugins

Git does **not** manage your user plugins. To update a user plugin, you need to:

1. Download the new version of the plugin manually from its repository or source.
2. Replace the old file(s) inside `src/userplugins/` with the new ones.
3. Rebuild SudoCord:

```sh
pnpm build
```

> [!TIP]
> If you are not familiar with Git yet, the [GitHub Git guide](https://docs.github.com/en/get-started/using-git/getting-changes-from-a-remote-repository) is a great place to start. It will teach you how Git works, which will help you both here and in many other situations.

## Troubleshooting

If your plugin isn't showing up, check these first:

- Wrong folder (`plugins` or `userplugins`).
- The entry file is not named `index.ts` or `index.tsx`.
- Folder name is not camelCase.
- SudoCord was not rebuilt after adding the plugin.

### Missing dependencies

If `pnpm build` complains about missing packages, run:

```sh
pnpm install
```

Then try building again.

### Discord not reflecting your build

If Discord still shows the old version after building, make sure Discord was fully restarted after the build completed (check the tray icon too).

### Something in your user plugin broke

Errors that persist after running `pnpm install` are almost always caused by the plugin itself — a syntax error, a missing file, a broken import or whatever. Read the error message carefully and check the plugin's source manually.

> [!NOTE]
> Want to help improve these docs? Open a PR [on GitHub](https://github.com/Ernest1101/Sudocord/pulls).
