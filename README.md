# light-cut-imgZ

A fast, native desktop image editor built with [Tauri](https://tauri.app) and React. Crop, rotate, and export images — locally, no cloud.

**Platforms:** Linux · macOS

---

## Features

- **Crop** — Interactive 8-point crop selection with rule-of-thirds grid
- **Rotate** — 90° quick buttons + arbitrary angle with bilinear interpolation
- **Export** — PNG, JPEG, WebP, BMP, TIFF with configurable quality for lossy formats

---

## Install

### macOS (Homebrew)

```sh
brew install --cask light-cut-imgz/tap/light-cut-imgz
```

### Linux (AppImage)

```sh
mkdir -p ~/Applications && \
curl -fsSL https://github.com/light-cut-imgz/light-cut-imgz/releases/latest/download/light-cut-imgZ_amd64.AppImage \
  -o ~/Applications/light-cut-imgZ.AppImage && \
chmod +x ~/Applications/light-cut-imgZ.AppImage && \
~/Applications/light-cut-imgZ.AppImage
```

### macOS (Apple Silicon)

```sh
curl -fsSL https://github.com/light-cut-imgz/light-cut-imgz/releases/latest/download/light-cut-imgZ_aarch64.dmg \
  -o /tmp/light-cut-imgZ.dmg && open /tmp/light-cut-imgZ.dmg
```

### macOS (Intel)

```sh
curl -fsSL https://github.com/light-cut-imgz/light-cut-imgz/releases/latest/download/light-cut-imgZ_x64.dmg \
  -o /tmp/light-cut-imgZ.dmg && open /tmp/light-cut-imgZ.dmg
```

### Uninstall

```sh
# Linux
rm ~/Applications/light-cut-imgZ.AppImage

# macOS (Homebrew)
brew uninstall --cask light-cut-imgz

# macOS (manual install)
rm -rf /Applications/light-cut-imgZ.app
```

---

## Development

### Prerequisites

- [Rust](https://rustup.rs) stable
- [Node.js](https://nodejs.org) 22+
- Linux: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`

### Setup

```sh
npm install
```

### Dev server

```sh
npm run tauri dev
```

### Build

```sh
npm run tauri build
```

---

## Tests

```sh
# Frontend unit tests (Vitest)
npm run test:run

# E2E tests (Playwright, browser mode)
npm run test:e2e

# Rust unit tests
cd src-tauri && cargo test
```

---

## Lint

```sh
# Frontend
npm run lint
npm run format:check

# Rust
cd src-tauri
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

---

## CI / Release

- **CI** runs on every push/PR to `main`: lint, type-check, Vitest, Clippy, `cargo test`, Playwright E2E — on both Ubuntu and macOS.
- **Release** is triggered by pushing a tag `v*.*.*`: builds AppImage + .deb (Linux) and .dmg (macOS arm64 + x86_64) via `tauri-action`, creates a draft GitHub Release.
- **Docs** are deployed to GitHub Pages from `docs/` on every push to `main`.
- **Homebrew tap** is updated when a release is _published_: the `update-homebrew-tap` workflow
  recomputes the `.dmg` checksums and bumps the cask in
  [light-cut-imgz/homebrew-tap](https://github.com/light-cut-imgz/homebrew-tap).
  It needs a `HOMEBREW_TAP_TOKEN` secret (a PAT with `contents: write` on the tap repository).

```sh
# To cut a release:
git tag v0.1.0
git push origin v0.1.0
# then publish the draft release on GitHub — this bumps the Homebrew cask
```

---

## License

MIT
