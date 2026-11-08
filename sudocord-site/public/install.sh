#!/bin/sh
# SudoCord Linux installer — downloads the Sudotl installer and runs it.
#
# One-line install (same style as Vencord):
#   sh -c "$(curl -sS https://sudocord.mooo.com/install.sh)"
#
# Flags (append inside the quotes, e.g. sh -c "$(curl -sS https://sudocord.mooo.com/install.sh)" sh --cli):
#   --x11            use the X11-only installer build
#   --wayland        use the Wayland-only installer build
#   --universal      use the X11+Wayland installer build
#   --cli            use the command-line installer (no GUI)
#   --download-only  only download to ~/.local/bin, do not run
#   --dir DIR        install location (default: ~/.local/bin, or $SUDOCORD_BIN_DIR)
#   -h, --help       show this help
set -eu

REPO="Ernest1101/Sudotl"
BASE="https://github.com/$REPO/releases/latest/download"
# copy of the latest Sudotl release on the site (sudocord-mirror.timer), used when GitHub fails or is blocked
MIRROR="https://sudocord.mooo.com/releases/files/Sudotl"
BIN_DIR="${SUDOCORD_BIN_DIR:-$HOME/.local/bin}"

ASSET=""
OUT_NAME="sudotl"
RUN=1

usage() {
    echo "Usage: install.sh [--x11|--wayland|--universal|--cli] [--download-only] [--dir DIR]"
    echo "Installs the SudoCord (Sudotl) installer to $BIN_DIR and runs it."
}

while [ $# -gt 0 ]; do
    case "$1" in
        --x11) ASSET="Sudotl-x11"; OUT_NAME="sudotl" ;;
        --wayland) ASSET="Sudotl-wayland"; OUT_NAME="sudotl" ;;
        --universal) ASSET="Sudotl"; OUT_NAME="sudotl" ;;
        --cli) ASSET="SudotlCli-linux"; OUT_NAME="sudotl-cli" ;;
        --download-only) RUN=0 ;;
        --dir)
            BIN_DIR="$2"; shift ;;
        --dir=*) BIN_DIR="${1#--dir=}" ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
    esac
    shift
done

# pick the build matching the session when the user did not choose one
if [ -z "$ASSET" ]; then
    if [ -n "${WAYLAND_DISPLAY:-}" ]; then
        ASSET="Sudotl-wayland"
    elif [ -n "${DISPLAY:-}" ]; then
        ASSET="Sudotl-x11"
    else
        ASSET="Sudotl"
    fi
fi

arch="$(uname -m)"
case "$arch" in
    x86_64|amd64) ;;
    *) echo "Unsupported architecture: $arch (only x86_64 builds exist)" >&2; exit 1 ;;
esac

if command -v curl >/dev/null 2>&1; then
    # give up on a dead or stalled connection instead of hanging (GitHub behind some ISPs/VPNs)
    dl() { curl -fSL --progress-bar --connect-timeout 15 --speed-limit 1024 --speed-time 30 -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
    dl() { wget -T 30 -t 2 -O "$2" "$1"; }
else
    echo "Need curl or wget to download SudoCord" >&2; exit 1
fi

if [ "$RUN" -eq 1 ] && [ "$ASSET" != "SudotlCli-linux" ] && [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
    echo "Warning: no display detected, the graphical installer may fail. Use --cli for headless install." >&2
fi

mkdir -p "$BIN_DIR"
tmp="$(mktemp "${TMPDIR:-/tmp}/sudotl.XXXXXX")"
cleanup() { rm -f "$tmp"; }
trap cleanup EXIT INT TERM

echo "Downloading $ASSET..."
if ! dl "$BASE/$ASSET" "$tmp"; then
    echo "GitHub download failed, trying the sudocord.mooo.com mirror..." >&2
    dl "$MIRROR/$ASSET" "$tmp"
fi
# never install an error page instead of the installer
if [ "$(wc -c < "$tmp")" -lt 1000000 ]; then
    echo "Download is broken (too small). Try again later." >&2; exit 1
fi
chmod +x "$tmp"
cp "$tmp" "$BIN_DIR/$OUT_NAME"
chmod +x "$BIN_DIR/$OUT_NAME"
cleanup
trap - EXIT INT TERM
echo "Installed to $BIN_DIR/$OUT_NAME"

case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) echo "Note: $BIN_DIR is not in PATH. Add it with: export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac

if [ "$RUN" -eq 1 ]; then
    echo "Running installer..."
    exec "$BIN_DIR/$OUT_NAME"
fi
