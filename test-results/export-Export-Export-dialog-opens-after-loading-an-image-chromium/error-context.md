# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: export.spec.ts >> Export >> Export dialog opens after loading an image
- Location: e2e/tests/export.spec.ts:34:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('canvas-image')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('canvas-image')

```

```yaml
- complementary:
  - text: Z
  - button "Crop" [disabled]:
    - img
    - text: Crop
  - button "Rotate" [disabled]:
    - img
    - text: Rotate
  - button "Flip" [disabled]:
    - img
    - text: Flip
  - button "Resize image" [disabled]:
    - img
    - text: Resize
  - button "Canvas resize" [disabled]:
    - img
    - text: Canvas
  - button "Color picker" [disabled]:
    - img
    - text: Picker
  - button "Remove object / inpaint" [disabled]:
    - img
    - text: Remove
  - button "Adjustments" [disabled]:
    - img
    - text: Adjust
  - button "Filters" [disabled]:
    - img
    - text: Filters
  - button "Copy to clipboard" [disabled]:
    - img
    - text: Copy
  - button "Toggle grid" [disabled]:
    - img
    - text: Grid
  - button "EXIF metadata" [disabled]:
    - img
    - text: EXIF
  - button "Preferences":
    - img
    - text: Prefs
  - button "Export" [disabled]:
    - img
    - text: Export
- text: "TypeError: results.map is not a function"
- button "Dismiss error": ✕
- button "Open image":
  - img
  - paragraph: Open an image to get started
  - paragraph: Click here or use File → Open
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
> 39 |     await expect(page.getByTestId('canvas-image')).toBeVisible()
     |                                                    ^ Error: expect(locator).toBeVisible() failed
  40 |     await page.getByRole('button', { name: /export/i }).click()
  41 |     await expect(page.getByText('Export Image')).toBeVisible()
  42 |   })
  43 | 
  44 |   test('Export with JPEG format shows quality slider', async ({ page }) => {
  45 |     await page.goto('/')
  46 |     await loadImage(page)
  47 |     await page.getByRole('button', { name: /open image/i }).click()
  48 |     await page.getByRole('button', { name: /export/i }).click()
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