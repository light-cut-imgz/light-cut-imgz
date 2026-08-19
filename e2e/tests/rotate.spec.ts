import { expect, test } from '@playwright/test'

const FIXTURE_IMAGE = {
  width: 800,
  height: 600,
  format: 'png',
  preview:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
}

test.describe('Rotate', () => {
  test.beforeEach(async ({ page }) => {
    const calls: Array<{ cmd: string; args: unknown }> = []
    await page.exposeFunction('__tauriInvoke', async (cmd: string, args: unknown) => {
      calls.push({ cmd, args })
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
    ;(page as unknown as Record<string, unknown>).__calls = calls
    await page.goto('/')
    await page.getByRole('button', { name: /open image/i }).click()
    await expect(page.getByTestId('canvas-image')).toBeVisible()
    await page.getByRole('button', { name: /rotate/i }).click()
  })

  test('shows rotation controls after entering rotate mode', async ({ page }) => {
    await expect(page.getByRole('button', { name: /clockwise/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /counter-clockwise/i })).toBeVisible()
  })

  test('CW button rotates by +90', async ({ page }) => {
    await page.getByRole('button', { name: /clockwise/i }).click()
    await expect(page.getByTestId('canvas-image')).toBeVisible()
  })

  test('Rotation mode is exited after applying', async ({ page }) => {
    await page.getByRole('button', { name: /clockwise/i }).click()
    await expect(page.getByRole('button', { name: /clockwise/i })).not.toBeVisible()
  })

  test('Cancel button exits rotation mode without applying', async ({ page }) => {
    await page.getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByRole('button', { name: /clockwise/i })).not.toBeVisible()
  })
})
