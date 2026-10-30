import { expect, test } from '@playwright/test'
import { callsOf, openFixture } from './tauri-mock'

test.describe('Export', () => {
  test.beforeEach(async ({ page }) => {
    await openFixture(page)
    await page.getByRole('button', { name: /^export$/i }).click()
  })

  test('opens the export dialog', async ({ page }) => {
    await expect(page.getByText('Export Image')).toBeVisible()
  })

  test('JPEG shows the quality slider', async ({ page }) => {
    await page.getByRole('radio', { name: /jpeg/i }).click({ force: true })
    await expect(page.getByTestId('quality-slider')).toBeVisible()
  })

  test('PNG hides the quality slider', async ({ page }) => {
    await expect(page.getByTestId('quality-slider')).not.toBeVisible()
  })

  test('WebP is lossless: no slider, and the dialog says so', async ({ page }) => {
    await page.getByRole('radio', { name: /webp/i }).click({ force: true })

    await expect(page.getByTestId('quality-slider')).not.toBeVisible()
    await expect(page.getByText(/without loss/i)).toBeVisible()
  })

  test('exports in the chosen format and quality', async ({ page }) => {
    await page.getByRole('radio', { name: /jpeg/i }).click({ force: true })
    await page.getByTestId('quality-slider').fill('70')
    await page.getByTestId('export-button').click()

    await expect.poll(async () => (await callsOf(page, 'export_image')).length).toBe(1)
    const [call] = await callsOf(page, 'export_image')
    expect(call.args).toMatchObject({ tabId: 't1', format: 'jpeg', quality: 70 })
  })

  test('closes on Escape', async ({ page }) => {
    await page.keyboard.press('Escape')
    await expect(page.getByText('Export Image')).not.toBeVisible()
  })
})
