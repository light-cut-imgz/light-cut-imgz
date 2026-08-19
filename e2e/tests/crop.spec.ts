import { expect, test } from '@playwright/test'

const FIXTURE_IMAGE = {
  width: 800,
  height: 600,
  format: 'png',
  preview:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
}

test.describe('Crop', () => {
  test.beforeEach(async ({ page }) => {
    await page.exposeFunction('__tauriInvoke', async () => {
      return FIXTURE_IMAGE
    })
    await page.evaluate(() => {
      ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
        invoke: (cmd: string, args: unknown) =>
          (window as unknown as Record<string, (...a: unknown[]) => unknown>).__tauriInvoke(
            cmd,
            args,
          ),
      }
    })
    await page.goto('/')
    await page.getByRole('button', { name: /open image/i }).click()
    await expect(page.getByTestId('canvas-image')).toBeVisible()
    await page.getByRole('button', { name: /crop/i }).click()
  })

  test('shows crop overlay after entering crop mode', async ({ page }) => {
    await expect(page.getByLabel(/crop selection/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /apply/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible()
  })

  test('Apply button applies the crop and exits crop mode', async ({ page }) => {
    await page.getByRole('button', { name: /apply/i }).click()
    await expect(page.getByLabel(/crop selection/i)).not.toBeVisible()
    await expect(page.getByTestId('canvas-image')).toBeVisible()
  })

  test('Cancel exits crop mode without applying', async ({ page }) => {
    await page.getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByLabel(/crop selection/i)).not.toBeVisible()
  })

  test('dimensions badge is visible during cropping', async ({ page }) => {
    // The dimensions badge shows WxH in the overlay
    const badge = page.locator('span').filter({ hasText: /\d+ × \d+/ })
    await expect(badge).toBeVisible()
  })
})
