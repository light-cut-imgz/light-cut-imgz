import { expect, test } from '@playwright/test'

test.describe('Open image', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Inject Tauri mock
    await page.evaluate(() => {
      ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string) => {
          if (cmd === 'open_image') {
            return {
              width: 800,
              height: 600,
              format: 'png',
              preview:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            }
          }
          return null
        },
      }
    })
  })

  test('shows empty state before any image is opened', async ({ page }) => {
    await expect(page.getByText(/open an image/i)).toBeVisible()
    await expect(page.getByTestId('canvas-image')).not.toBeVisible()
  })

  test('Open button is always enabled', async ({ page }) => {
    await expect(page.getByRole('button', { name: /open image/i })).toBeEnabled()
  })

  test('Crop, Rotate, Export are disabled before opening', async ({ page }) => {
    await expect(page.getByRole('button', { name: /crop/i })).toBeDisabled()
    await expect(page.getByRole('button', { name: /rotate/i })).toBeDisabled()
    await expect(page.getByRole('button', { name: /export/i })).toBeDisabled()
  })
})
