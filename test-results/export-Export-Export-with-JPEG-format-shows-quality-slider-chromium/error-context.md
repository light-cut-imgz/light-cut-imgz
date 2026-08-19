# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: export.spec.ts >> Export >> Export with JPEG format shows quality slider
- Location: e2e/tests/export.spec.ts:44:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /export/i })
    - locator resolved to <button disabled title="Export" aria-label="Export" class="w-full flex flex-col items-center gap-1 py-2 px-1 rounded transition-colors opacity-30 cursor-not-allowed">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    56 × waiting for element to be visible, enabled and stable
       - element is not enabled
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e5]: Z
    - button "Crop" [disabled] [ref=e6]:
      - img [ref=e7]
      - generic [ref=e12]: Crop
    - button "Rotate" [disabled] [ref=e13]:
      - img [ref=e14]
      - generic [ref=e17]: Rotate
    - button "Flip" [disabled] [ref=e18]:
      - img [ref=e19]
      - generic [ref=e24]: Flip
    - button "Resize image" [disabled] [ref=e25]:
      - img [ref=e26]
      - generic [ref=e28]: Resize
    - button "Canvas resize" [disabled] [ref=e29]:
      - img [ref=e30]
      - generic [ref=e33]: Canvas
    - button "Color picker" [disabled] [ref=e34]:
      - img [ref=e35]
      - generic [ref=e39]: Picker
    - button "Remove object / inpaint" [disabled] [ref=e40]:
      - img [ref=e41]
      - generic [ref=e46]: Remove
    - button "Adjustments" [disabled] [ref=e47]:
      - img [ref=e48]
      - generic [ref=e52]: Adjust
    - button "Filters" [disabled] [ref=e53]:
      - img [ref=e54]
      - generic [ref=e58]: Filters
    - button "Copy to clipboard" [disabled] [ref=e59]:
      - img [ref=e60]
      - generic [ref=e63]: Copy
    - button "Toggle grid" [disabled] [ref=e64]:
      - img [ref=e65]
      - generic [ref=e67]: Grid
    - button "EXIF metadata" [disabled] [ref=e68]:
      - img [ref=e69]
      - generic [ref=e71]: EXIF
    - button "Preferences" [ref=e72]:
      - img [ref=e73]
      - generic [ref=e76]: Prefs
    - button "Export" [disabled] [ref=e77]:
      - img [ref=e78]
      - generic [ref=e81]: Export
  - generic [ref=e82]:
    - generic [ref=e83]:
      - generic [ref=e84]: "TypeError: results.map is not a function"
      - button "Dismiss error" [ref=e85]: ✕
    - button "Open image" [ref=e88] [cursor=pointer]:
      - img [ref=e89]
      - paragraph [ref=e93]: Open an image to get started
      - paragraph [ref=e94]: Click here or use File → Open
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test'
  2  | 
  3  | const FIXTURE_IMAGE = {
  4  |   width: 800,
  5  |   height: 600,
  6  |   format: 'png',
  7  |   preview:
  8  |     'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  9  | }
  10 | 
  11 | async function loadImage(page: import('@playwright/test').Page) {
  12 |   let lastCmd = ''
  13 |   let lastArgs: unknown = null
  14 |   await page.exposeFunction('__tauriInvoke', async (cmd: string, args: unknown) => {
  15 |     lastCmd = cmd
  16 |     lastArgs = args
  17 |     if (cmd === 'open_image') return FIXTURE_IMAGE
  18 |     if (cmd === 'export_image') return undefined
  19 |     return FIXTURE_IMAGE
  20 |   })
  21 |   await page.evaluate(() => {
  22 |     ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  23 |       invoke: (cmd: string, args: unknown) =>
  24 |         (window as unknown as Record<string, (...a: unknown[]) => unknown>).__tauriInvoke(
  25 |           cmd,
  26 |           args,
  27 |         ),
  28 |     }
  29 |   })
  30 |   return { getLastCmd: () => lastCmd, getLastArgs: () => lastArgs }
  31 | }
  32 | 
  33 | test.describe('Export', () => {
  34 |   test('Export dialog opens after loading an image', async ({ page }) => {
  35 |     await page.goto('/')
  36 |     await loadImage(page)
  37 |     // Click Open to trigger mock (in real flow this opens a dialog; here invoke returns directly)
  38 |     await page.getByRole('button', { name: /open image/i }).click()
  39 |     await expect(page.getByTestId('canvas-image')).toBeVisible()
  40 |     await page.getByRole('button', { name: /export/i }).click()
  41 |     await expect(page.getByText('Export Image')).toBeVisible()
  42 |   })
  43 | 
  44 |   test('Export with JPEG format shows quality slider', async ({ page }) => {
  45 |     await page.goto('/')
  46 |     await loadImage(page)
  47 |     await page.getByRole('button', { name: /open image/i }).click()
> 48 |     await page.getByRole('button', { name: /export/i }).click()
     |                                                         ^ Error: locator.click: Test timeout of 30000ms exceeded.
  49 |     await page.getByRole('radio', { name: /jpeg/i }).click()
  50 |     await expect(page.getByTestId('quality-slider')).toBeVisible()
  51 |   })
  52 | 
  53 |   test('Export with PNG format hides quality slider', async ({ page }) => {
  54 |     await page.goto('/')
  55 |     await loadImage(page)
  56 |     await page.getByRole('button', { name: /open image/i }).click()
  57 |     await page.getByRole('button', { name: /export/i }).click()
  58 |     await expect(page.getByTestId('quality-slider')).not.toBeVisible()
  59 |   })
  60 | })
  61 | 
```