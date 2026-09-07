---
title: FAQ
description: Find answers to frequently asked questions and troubleshooting tips for SudoCord.
---

# FAQ

## 1. "A JavaScript error occurred in the main process"

This could be many things to do with the installer or Discord's JavaScript files. If your installer is out of date, **PLEASE UPDATE!**

## 2. "Patching C:\Users\user\AppData\Local\Discord. ERROR Didn't find desktop.asar"

Your Discord install is likely messed up. Please follow this:

1. Press `Windows+R`.
2. Type `%AppData%` and delete the Discord folder.
3. Repeat for `%LocalAppData%`.
4. Install Discord.

OR do a clean reinstall using the guide [on corrupt Discord installations](https://support.discord.com/hc/en-us/articles/115004307527--Windows-Corrupt-Installation).

### Simplified Steps

1. Hold the Windows Key and press `R`. Type `%AppData%` and click OK.
2. Delete the Discord folder.
3. Repeat the same steps for `%LocalAppData%` and delete the Discord folder.
4. Install Discord again. Quick download links:

- [Main Branch (Discord)](https://discord.com/api/downloads/distributions/app/installers/latest?channel=stable&platform=win&arch=x64)
- [PTB Branch (Discord PTB)](https://ptb.discord.com/api/downloads/distributions/app/installers/latest?channel=ptb&platform=win&arch=x64)
- [Canary Branch (Discord Canary)](https://canary.discord.com/api/downloads/distributions/app/installers/latest?channel=canary&platform=win&arch=x64)

## 3. "Something went wrong. Please check the logs above."

This could be Windows Defender blocking SudoCord's CLI installer. Please disable or add an exclusion. Learn how to add an exclusion [in this article](https://www.howtogeek.com/671233/how-to-add-exclusions-in-windows-defender-on-windows-10/).

## 4. "Discord Activities aren't working!"

This could be because of OpenASAR. Simply uninject OpenASAR from Discord. This can be done by opening the Sudotl installer.

- **CLI:**
  ![CLI Example](/cli.png)
- **GUI:**
  ![GUI Example](/gui.png)

## 5. "The update button says an error happened!"

Try running the update again — it is usually a network hiccup. If it keeps failing, update manually:

```sh
git fetch origin
git reset --hard origin/main
pnpm build
```

(only needed if you installed from source; setup installs fix themselves on the next update attempt)

## 6. "I have a different issue!"

For any other issues, please open an issue [on GitHub](https://github.com/Ernest1101/Sudocord/issues) or ask on the [website](https://sudocord.h4ck.me).
