#!/usr/bin/env bash
# LightCutImgz — one-line installer for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/light-cut-imgz/light-cut-imgz/main/install.sh | bash
#
#   macOS         → Homebrew cask (light-cut-imgz/tap/light-cut-imgz)
#   Linux + apt   → .deb package
#   Linux + dnf/zypper → .rpm package
#   Linux (other) → .AppImage in ~/.local/bin, registered in the applications menu
#
# Re-run the same command to upgrade an existing install.
set -eo pipefail

REPO="light-cut-imgz/light-cut-imgz"
TAP="light-cut-imgz/tap"
CASK="light-cut-imgz"
APP_NAME="LightCutImgz"
APP_SLUG="light-cut-imgz"
APP_COMMENT="Native image editor"
CATEGORIES="Graphics;Photography;"
ICON_URL="https://raw.githubusercontent.com/$REPO/main/src-tauri/icons/128x128@2x.png"
ICON_SIZE="256x256"
RUNTIME_DEPS=""

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# fetch <url> [output] — writes to <output>, or to stdout when omitted
fetch() {
  if command -v curl >/dev/null 2>&1; then
    if [ $# -ge 2 ]; then curl -fsSL "$1" -o "$2"; else curl -fsSL "$1"; fi
  elif command -v wget >/dev/null 2>&1; then
    if [ $# -ge 2 ]; then wget -qO "$2" "$1"; else wget -qO- "$1"; fi
  else
    die "curl or wget is required"
  fi
}

# latest_asset <extension> — download URL of the first matching asset of the latest release
latest_asset() {
  fetch "https://api.github.com/repos/$REPO/releases/latest" \
    | grep -o "\"browser_download_url\": *\"[^\"]*\\.$1\"" \
    | head -1 \
    | sed 's/.*"\(https[^"]*\)"/\1/'
}

# verify <file> — compare le fichier à SHA256SUMS de la release (publié par le workflow de
# release). Une release sans SHA256SUMS (ancienne) n'est qu'avertie ; une somme fausse arrête tout.
verify() {
  file="$1"
  sums="$(fetch "https://github.com/$REPO/releases/latest/download/SHA256SUMS" 2>/dev/null || true)"
  if [ -z "$sums" ]; then
    log "Warning: no SHA256SUMS published for this release — integrity not verified."
    return 0
  fi
  want="$(printf '%s\n' "$sums" | awk -v f="$(basename "$file")" '$2 == f || $2 == "*" f {print $1; exit}')"
  [ -n "$want" ] || { log "Warning: $(basename "$file") is not listed in SHA256SUMS."; return 0; }
  if command -v sha256sum >/dev/null 2>&1; then got="$(sha256sum "$file" | cut -d' ' -f1)"
  else got="$(shasum -a 256 "$file" | cut -d' ' -f1)"; fi
  [ "$got" = "$want" ] || die "checksum mismatch for $(basename "$file") (expected $want, got $got)"
  log "Checksum OK."
}

install_runtime_deps() {
  [ -n "$RUNTIME_DEPS" ] || return 0
  missing=""
  for dep in $RUNTIME_DEPS; do
    command -v "$dep" >/dev/null 2>&1 || missing="$missing $dep"
  done
  [ -n "$missing" ] || return 0
  log "Installing runtime dependencies:$missing"
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y $missing
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y $missing
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm $missing
  elif command -v zypper >/dev/null 2>&1; then
    sudo zypper install -y $missing
  else
    log "No supported package manager found — install these manually:$missing"
  fi
}

install_macos() {
  command -v brew >/dev/null 2>&1 \
    || die "Homebrew is required on macOS. Install it from https://brew.sh"
  brew tap "$TAP"
  if brew list --cask "$CASK" >/dev/null 2>&1; then
    log "Upgrading $APP_NAME via Homebrew…"
    brew upgrade --cask "$TAP/$CASK"
  else
    log "Installing $APP_NAME via Homebrew…"
    brew install --cask "$TAP/$CASK"
  fi
  log "Done. Launch $APP_NAME from Spotlight or your Applications folder."
}

install_deb() {
  url="$(latest_asset deb)"
  [ -n "$url" ] || die "No .deb in the latest release — see https://github.com/$REPO/releases"
  tmp="$(mktemp -d)/$(basename "$url")"
  log "Downloading $(basename "$url")…"
  fetch "$url" "$tmp"
  verify "$tmp"
  log "Installing the .deb package (sudo required)…"
  sudo apt-get install -y "$tmp"
  rm -rf "$(dirname "$tmp")"
  log "Done. Launch $APP_NAME from your applications menu."
}

install_rpm() {
  url="$(latest_asset rpm)"
  [ -n "$url" ] || die "No .rpm in the latest release — see https://github.com/$REPO/releases"
  tmp="$(mktemp -d)/$(basename "$url")"
  log "Downloading $(basename "$url")…"
  fetch "$url" "$tmp"
  verify "$tmp"
  log "Installing the .rpm package (sudo required)…"
  if command -v dnf >/dev/null 2>&1; then sudo dnf install -y "$tmp"
  else sudo zypper --non-interactive install --allow-unsigned-rpm "$tmp"; fi
  rm -rf "$(dirname "$tmp")"
  log "Done. Launch $APP_NAME from your applications menu."
}

install_appimage() {
  url="$(latest_asset AppImage)"
  [ -n "$url" ] || die "No .AppImage in the latest release — see https://github.com/$REPO/releases"

  bin_dir="$HOME/.local/bin"
  desktop_dir="$HOME/.local/share/applications"
  icon_dir="$HOME/.local/share/icons/hicolor/$ICON_SIZE/apps"
  mkdir -p "$bin_dir" "$desktop_dir" "$icon_dir"

  target="$bin_dir/$APP_SLUG.AppImage"
  log "Downloading $(basename "$url")…"
  fetch "$url" "$target"
  verify "$target"
  chmod +x "$target"

  fetch "$ICON_URL" "$icon_dir/$APP_SLUG.png" 2>/dev/null || true

  cat > "$desktop_dir/$APP_SLUG.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$APP_NAME
Comment=$APP_COMMENT
Exec=$target
Icon=$APP_SLUG
Terminal=false
Categories=$CATEGORIES
StartupWMClass=$APP_NAME
EOF

  update-desktop-database "$desktop_dir" 2>/dev/null || true

  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) log "Note: $bin_dir is not in your PATH — add it to your shell profile to launch from a terminal." ;;
  esac
  log "Done. Installed to $target — launch $APP_NAME from your applications menu."
}

echo "$APP_NAME installer"

case "$(uname -s)" in
  Darwin)
    install_macos
    ;;
  Linux)
    install_runtime_deps
    if command -v apt-get >/dev/null 2>&1; then
      install_deb
    elif command -v dnf >/dev/null 2>&1 || command -v zypper >/dev/null 2>&1; then
      install_rpm
    else
      install_appimage
    fi
    ;;
  *)
    die "Unsupported platform: $(uname -s). Download manually from https://github.com/$REPO/releases"
    ;;
esac
