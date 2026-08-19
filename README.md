# LightCutImgz

Crop, rotate and export your images — locally, no cloud, no account.

![CI](https://github.com/light-cut-imgz/light-cut-imgz/actions/workflows/ci.yml/badge.svg) ![license](https://img.shields.io/badge/license-MIT-blue) ![platforms](https://img.shields.io/badge/platforms-Linux%20%7C%20macOS-lightgrey)

**Website** — <https://light-cut-imgz.github.io/light-cut-imgz/>

---

## Features

- **Crop** — interactive 8-point crop selection with a rule-of-thirds grid
- **Rotate** — 90° quick buttons plus an arbitrary angle with bilinear interpolation
- **Export** — PNG, JPEG, WebP, BMP and TIFF, with configurable quality for lossy formats
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
| Linux — other distributions | `.AppImage` in `~/.local/bin`, registered in your applications menu |

Re-run the exact same command to upgrade to the latest release.

### Manual install

**macOS — Homebrew**

```bash
brew install --cask light-cut-imgz/tap/light-cut-imgz
```

**Linux — Debian / Ubuntu**

Download the `.deb` from the [latest release](https://github.com/light-cut-imgz/light-cut-imgz/releases/latest), then:

```bash
sudo apt install ./light-cut-imgz_*_amd64.deb
```

**Linux — other distributions**

Download the `.AppImage` from the [latest release](https://github.com/light-cut-imgz/light-cut-imgz/releases/latest), then:

```bash
chmod +x light-cut-imgz_*_amd64.AppImage
./light-cut-imgz_*_amd64.AppImage
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
sudo apt remove light-cut-img-z
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
npm run test:e2e        # E2E tests (Playwright, browser mode)
cd src-tauri && cargo test   # Rust unit tests
```

### Lint

```bash
npm run lint
npm run format:check
cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo fmt --check
```

---

## CI / CD

- **CI** runs on every push/PR to `main`: lint, type-check, Vitest, Clippy, `cargo test` and Playwright E2E — on both Ubuntu and macOS.
- **Release** is triggered by pushing a `v*.*.*` tag: builds the AppImage + `.deb` (Linux) and the app archive (macOS arm64 + x86_64) via `tauri-action`, then creates a draft GitHub release.
- **Pages** deploys `docs/` to GitHub Pages on every push to `main`.
- **Homebrew tap** is updated when a release is _published_: the `update-homebrew-tap` workflow recomputes the archive checksums and bumps the cask in [light-cut-imgz/homebrew-tap](https://github.com/light-cut-imgz/homebrew-tap). It needs a `HOMEBREW_TAP_TOKEN` secret (a PAT with `contents: write` on the tap repository).

```bash
# To cut a release:
git tag v0.1.0
git push origin v0.1.0
# then publish the draft release on GitHub — this bumps the Homebrew cask
```

---

## License

MIT — see [LICENSE](LICENSE).
