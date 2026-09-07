---
title: Plugin Development
description: Learn how to start developing your own SudoCord plugins from scratch.
---

# Plugin Development

SudoCord uses the same plugin system as Vencord, which means you can develop entirely new plugins from scratch or adapt existing ones.

This page covers:

- Creating your first plugin
- Understanding the plugin boilerplate
- Development tips and resources

## Creating Your First Plugin

### 1. Choose the correct folder

| Path               | Purpose                                       |
| ------------------ | ---------------------------------------------- |
| `src/userplugins/` | SudoCord's own plugins and your personal ones  |
| `src/plugins/`     | Plugins based on Vencord                       |

### 2. Create a new folder using camelCase

| Example             | Valid |
| ------------------- | ----- |
| `myFirstPlugin`     | Yes   |
| `MyFirstPlugin`     | No    |
| `my first plugin`   | No    |

### 3. Add an `index.ts` file

Each plugin must have its own folder and the entry file must be named `index.ts` or `index.tsx`.

```text
src/userplugins/myFirstPlugin/index.ts
```

## Plugin Boilerplate

Inside `index.ts`, define your plugin using `definePlugin`.

```ts
import definePlugin from "@utils/types";

export default definePlugin({
    name: "MyCoolPlugin",
    description: "I am very cool!",
    authors: [{ name: "Your Name", id: 1234567890n }],
});
```

## Guidelines

- `name` should be short, clear, and unique
- `description` should clearly explain what the plugin does
- Use a plain object with your own name and Discord ID in `authors`
- Look at SudoCord's own plugins in `src/userplugins/` for real-world examples — from simple (FakeTyping) to complex (DecibelLimiter with flux subscriptions and native stats)

## Further Resources

To learn more about how plugins work, check out the [SudoCord GitHub repository](https://github.com/Ernest1101/Sudocord) and explore the existing plugins in:

- `src/userplugins` — SudoCord plugins
- `src/plugins` — Vencord plugins

Since SudoCord is a Vencord fork, the [Vencord docs](https://docs.vencord.dev/) and the Vencord plugin ecosystem fully apply here too.

### Where to get help

For plugin development questions, open an issue or discussion [on GitHub](https://github.com/Ernest1101/Sudocord/issues).

> [!NOTE]
> Want to help improve these docs? Open a PR [on GitHub](https://github.com/Ernest1101/Sudocord/pulls).
