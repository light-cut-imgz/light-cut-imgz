# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: crop.spec.ts >> Crop >> Apply button applies the crop and exits crop mode
- Location: e2e/tests/crop.spec.ts:37:3

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
  11 | test.describe('Crop', () => {
  12 |   test.beforeEach(async ({ page }) => {
  13 |     await page.exposeFunction('__tauriInvoke', async () => {
  14 |       return FIXTURE_IMAGE
  15 |     })
  16 |     await page.evaluate(() => {
  17 |       ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  18 |         invoke: (cmd: string, args: unknown) =>
  19 |           (window as unknown as Record<string, (...a: unknown[]) => unknown>).__tauriInvoke(
  20 |             cmd,
  21 |             args,
  22 |           ),
  23 |       }
  24 |     })
  25 |     await page.goto('/')
  26 |     await page.getByRole('button', { name: /open image/i }).click()
> 27 |     await expect(page.getByTestId('canvas-image')).toBeVisible()
     |                                                    ^ Error: expect(locator).toBeVisible() failed
  28 |     await page.getByRole('button', { name: /crop/i }).click()
  29 |   })
  30 | 
  31 |   test('shows crop overlay after entering crop mode', async ({ page }) => {
  32 |     await expect(page.getByLabel(/crop selection/i)).toBeVisible()
  33 |     await expect(page.getByRole('button', { name: /apply/i })).toBeVisible()
  34 |     await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible()
  35 |   })
  36 | 
  37 |   test('Apply button applies the crop and exits crop mode', async ({ page }) => {
  38 |     await page.getByRole('button', { name: /apply/i }).click()
  39 |     await expect(page.getByLabel(/crop selection/i)).not.toBeVisible()
  40 |     await expect(page.getByTestId('canvas-image')).toBeVisible()
  41 |   })
  42 | 
  43 |   test('Cancel exits crop mode without applying', async ({ page }) => {
  44 |     await page.getByRole('button', { name: /cancel/i }).click()
  45 |     await expect(page.getByLabel(/crop selection/i)).not.toBeVisible()
  46 |   })
  47 | 
  48 |   test('dimensions badge is visible during cropping', async ({ page }) => {
  49 |     // The dimensions badge shows WxH in the overlay
  50 |     const badge = page.locator('span').filter({ hasText: /\d+ × \d+/ })
  51 |     await expect(badge).toBeVisible()
  52 |   })
  53 | })
  54 | 
```