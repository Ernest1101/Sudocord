---
title: Installation
description: Step-by-step installation guide for SudoCord on Windows, Linux, and macOS.
---

# Installation

## Installing SudoCord

This guide will walk you through the installation process for SudoCord across various platforms. Choose the appropriate method for your operating system.

### Windows

SudoCord offers both graphical and command-line installation options for Windows users:

- **Graphical Installer:** [Download Sudotl.exe](https://github.com/Ernest1101/Sudotl/releases/latest/download/Sudotl.exe)
- **Command-Line Installer:** [Download SudotlCli.exe](https://github.com/Ernest1101/Sudotl/releases/latest/download/SudotlCli.exe)

Run the installer, pick your Discord install, press **Install** — done. Restart Discord afterwards.

> [!WARNING]
> If Windows Defender blocks the installer, add an exclusion for it. Learn how to add an exclusion [in this article](https://www.howtogeek.com/671233/how-to-add-exclusions-in-windows-defender-on-windows-10/).

### Linux

One-line install (picks the build matching your session — Wayland, X11, or universal):

```bash
sh -c "$(curl -sS https://sudocord.h4ck.me/install.sh)"
```

Flags: `--x11`, `--wayland`, `--universal`, `--cli` (headless), `--download-only`, `--help`.

SudoCord ships separate installers for the different display servers. Pick the one that matches your setup:

- **Graphical Installer (X11 + Wayland):** [Download Sudotl](https://github.com/Ernest1101/Sudotl/releases/latest/download/Sudotl)
- **Graphical Installer (X11 only):** [Download Sudotl-x11](https://github.com/Ernest1101/Sudotl/releases/latest/download/Sudotl-x11)
- **Graphical Installer (Wayland only):** [Download Sudotl-wayland](https://github.com/Ernest1101/Sudotl/releases/latest/download/Sudotl-wayland)
- **Command-Line Installer:** [Download SudotlCli-linux](https://github.com/Ernest1101/Sudotl/releases/latest/download/SudotlCli-linux)

#### General steps (any display server)

1. Download the installer binary for your setup.
2. Make it executable and run it:

   ```bash
   chmod +x Sudotl
   ./Sudotl
   ```

3. Follow the installer steps, pick your Discord install and press **Install**.
4. Fully quit and reopen Discord, then enjoy SudoCord.

#### X11 (Xorg)

Use the [X11 or universal installer](#linux). To start it with the X11 build:

```bash
chmod +x Sudotl-x11
./Sudotl-x11
```

Make sure an X11 / Xorg server and basic window utilities are installed:

```bash
# Debian / Ubuntu
sudo apt install xorg xdotool

# Arch
sudo pacman -S xorg xdotool
```

#### Wayland

Use the [Wayland-only or universal installer](#linux). Wayland compositors (GNOME, KDE, Sway, etc.) work with the Wayland build:

```bash
chmod +x Sudotl-wayland
./Sudotl-wayland
```

For screen sharing, Wayland requires an `xdg-desktop-portal` backend:

```bash
# Debian / Ubuntu (GNOME / KDE)
sudo apt install xdg-desktop-portal xdg-desktop-portal-wlr

# Arch
sudo pacman -S xdg-desktop-portal xdg-desktop-portal-wlr
```

After installing portals, log out and back into your Wayland session, then restart Discord.

#### Hyprland

Hyprland is a Wayland compositor, so use the **Wayland** build of the installer:

```bash
chmod +x Sudotl-wayland
./Sudotl-wayland
```

Install the Hyprland portal backend and the usual companion utilities for full functionality (screen share, screenshots, color picker):

```bash
# Arch (most common for Hyprland)
sudo pacman -S xdg-desktop-portal-hyprland grim slurp hyprpicker

# Fedora
sudo dnf install xdg-desktop-portal-hyprland
```

Then restart Discord. If screen sharing still doesn't show, confirm the Hyprland portal is active:

```bash
systemctl --user restart xdg-desktop-portal-hyprland
```

### macOS

- **Graphical X64 Installer:** [Download Sudotl-darwin-x64.zip](https://github.com/Ernest1101/Sudotl/releases/latest/download/Sudotl-darwin-x64.zip)
- **Graphical ARM64 Installer:** [Download Sudotl-darwin-arm64.zip](https://github.com/Ernest1101/Sudotl/releases/latest/download/Sudotl-darwin-arm64.zip)

### Installing from Source

Prefer building it yourself? Follow the [Building from Source](/building-from-source) guide — clone the repo, build, inject. This also gives you the updater button and auto-updates straight from devbuilds.
