import { expect, test } from '@playwright/test'

const FIXTURE_IMAGE = {
  width: 800,
  height: 600,
  format: 'png',
  preview:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
}

async function loadImage(page: import('@playwright/test').Page) {
  let lastCmd = ''
  let lastArgs: unknown = null
  await page.exposeFunction('__tauriInvoke', async (cmd: string, args: unknown) => {
    lastCmd = cmd
    lastArgs = args
    if (cmd === 'open_image') return FIXTURE_IMAGE
    if (cmd === 'export_image') return undefined
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
  return { getLastCmd: () => lastCmd, getLastArgs: () => lastArgs }
}

test.describe('Export', () => {
  test('Export dialog opens after loading an image', async ({ page }) => {
    await page.goto('/')
    await loadImage(page)
    // Click Open to trigger mock (in real flow this opens a dialog; here invoke returns directly)
    await page.getByRole('button', { name: /open image/i }).click()
    await expect(page.getByTestId('canvas-image')).toBeVisible()
    await page.getByRole('button', { name: /export/i }).click()
    await expect(page.getByText('Export Image')).toBeVisible()
  })

  test('Export with JPEG format shows quality slider', async ({ page }) => {
    await page.goto('/')
    await loadImage(page)
    await page.getByRole('button', { name: /open image/i }).click()
    await page.getByRole('button', { name: /export/i }).click()
    await page.getByRole('radio', { name: /jpeg/i }).click()
    await expect(page.getByTestId('quality-slider')).toBeVisible()
  })

  test('Export with PNG format hides quality slider', async ({ page }) => {
    await page.goto('/')
    await loadImage(page)
    await page.getByRole('button', { name: /open image/i }).click()
    await page.getByRole('button', { name: /export/i }).click()
    await expect(page.getByTestId('quality-slider')).not.toBeVisible()
  })
})
