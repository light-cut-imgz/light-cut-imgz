<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="LightCutImgz" width="128" />
</p>

# LightCutImgz

Crop, rotate and export your images — locally, no cloud, no account.

![license](https://img.shields.io/badge/license-MIT-blue) ![platforms](https://img.shields.io/badge/platforms-Linux%20%7C%20macOS-lightgrey)

---

## Features

- **Crop** — interactive 8-point crop selection with a rule-of-thirds grid, fixed aspect ratios, numeric entry and arrow-key nudging
- **Rotate** — 90° quick buttons plus an arbitrary angle (canvas grows to the bounding box, live preview)
- **Export** — PNG, JPEG, WebP (lossless), BMP and TIFF, with configurable JPEG quality and the original ICC colour profile kept
- **Non-destructive adjustments** — sliders are previewed live by the same code that renders the result, and re-adjusting replaces the step instead of stacking on it
- **Local only** — every image stays on your machine; nothing is uploaded anywhere

---

## Install

One command, identical on macOS and Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/light-cut-imgz/light-cut-imgz/main/install.sh | bash
```

| Platform                    | What it installs                                                    |
| --------------------------- | ------------------------------------------------------------------- |
| macOS                       | Homebrew cask `light-cut-imgz/tap/light-cut-imgz`                   |
| Linux — Debian / Ubuntu     | `.deb` package                                                      |
| Linux — Fedora / openSUSE   | `.rpm` package                                                      |
| Linux — other distributions | `.AppImage` in `~/.local/bin`, registered in your applications menu |

Re-run the exact same command to upgrade to the latest release. Downloads are checked against the `SHA256SUMS` published with each release.

### Manual install

**macOS — Homebrew**

```bash
brew install --cask light-cut-imgz/tap/light-cut-imgz
```

**Linux — Debian / Ubuntu**

Download the `.deb` from the [latest release](https://github.com/light-cut-imgz/light-cut-imgz/releases/latest), then:

```bash
sudo apt install ./LightCutImgz_*_amd64.deb
```

**Linux — other distributions**

Download the `.AppImage` from the [latest release](https://github.com/light-cut-imgz/light-cut-imgz/releases/latest), then:

```bash
chmod +x LightCutImgz_*_amd64.AppImage
./LightCutImgz_*_amd64.AppImage
```

---

## Uninstall

**macOS — Homebrew**

```bash
brew uninstall --cask light-cut-imgz
brew untap light-cut-imgz/tap
```

Add `--zap` to also remove settings, caches and application data:

```bash
brew uninstall --zap --cask light-cut-imgz
```

**Linux — Debian / Ubuntu**

```bash
sudo apt remove light-cut-imgz
```

**Linux — AppImage**

```bash
rm ~/.local/bin/light-cut-imgz.AppImage
rm ~/.local/share/applications/light-cut-imgz.desktop
rm ~/.local/share/icons/hicolor/256x256/apps/light-cut-imgz.png
update-desktop-database ~/.local/share/applications
```

---

## Development

### Prerequisites

- [Rust](https://rustup.rs) stable
- [Node.js](https://nodejs.org) 22+
- Linux: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`

### Setup

```bash
git clone https://github.com/light-cut-imgz/light-cut-imgz.git
cd light-cut-imgz
npm install
```

### Run in dev mode

```bash
npm run tauri dev
```

### Build the packaged app

```bash
npm run tauri build
```

### Tests

```bash
npm run test:run        # frontend unit tests (Vitest)
npm run test:e2e        # E2E tests (Playwright, mocked Tauri bridge)
cd src-tauri && cargo test   # Rust unit tests
```

### Lint

```bash
npm run lint
npm run format:check
cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo fmt --check
```

---

## Changelog

[CHANGELOG.md](CHANGELOG.md) (English) and [CHANGELOG.fr.md](CHANGELOG.fr.md) (French) list the changes of every version and follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Keep both in step.

---

## License

MIT — see [LICENSE](LICENSE).
