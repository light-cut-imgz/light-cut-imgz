# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rotate.spec.ts >> Rotate >> shows rotation controls after entering rotate mode
- Location: e2e/tests/rotate.spec.ts:34:3

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
- text: "TypeError: Cannot read properties of undefined (reading 'invoke')"
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
  11 | test.describe('Rotate', () => {
  12 |   test.beforeEach(async ({ page }) => {
  13 |     const calls: Array<{ cmd: string; args: unknown }> = []
  14 |     await page.exposeFunction('__tauriInvoke', async (cmd: string, args: unknown) => {
  15 |       calls.push({ cmd, args })
  16 |       return FIXTURE_IMAGE
  17 |     })
  18 |     await page.evaluate(() => {
  19 |       ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  20 |         invoke: (cmd: string, args: unknown) =>
  21 |           (window as unknown as Record<string, (...a: unknown[]) => unknown>).__tauriInvoke(
  22 |             cmd,
  23 |             args,
  24 |           ),
  25 |       }
  26 |     })
  27 |     ;(page as unknown as Record<string, unknown>).__calls = calls
  28 |     await page.goto('/')
  29 |     await page.getByRole('button', { name: /open image/i }).click()
> 30 |     await expect(page.getByTestId('canvas-image')).toBeVisible()
     |                                                    ^ Error: expect(locator).toBeVisible() failed
  31 |     await page.getByRole('button', { name: /rotate/i }).click()
  32 |   })
  33 | 
  34 |   test('shows rotation controls after entering rotate mode', async ({ page }) => {
  35 |     await expect(page.getByRole('button', { name: /clockwise/i })).toBeVisible()
  36 |     await expect(page.getByRole('button', { name: /counter-clockwise/i })).toBeVisible()
  37 |   })
  38 | 
  39 |   test('CW button rotates by +90', async ({ page }) => {
  40 |     await page.getByRole('button', { name: /clockwise/i }).click()
  41 |     await expect(page.getByTestId('canvas-image')).toBeVisible()
  42 |   })
  43 | 
  44 |   test('Rotation mode is exited after applying', async ({ page }) => {
  45 |     await page.getByRole('button', { name: /clockwise/i }).click()
  46 |     await expect(page.getByRole('button', { name: /clockwise/i })).not.toBeVisible()
  47 |   })
  48 | 
  49 |   test('Cancel button exits rotation mode without applying', async ({ page }) => {
  50 |     await page.getByRole('button', { name: /cancel/i }).click()
  51 |     await expect(page.getByRole('button', { name: /clockwise/i })).not.toBeVisible()
  52 |   })
  53 | })
  54 | 
```