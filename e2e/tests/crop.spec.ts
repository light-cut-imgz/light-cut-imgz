import { expect, test } from '@playwright/test'
import { callsOf, openFixture } from './tauri-mock'

test.describe('Crop', () => {
  test.beforeEach(async ({ page }) => {
    await openFixture(page)
    await page.getByRole('button', { name: /^crop$/i }).click()
  })

  test('shows the crop overlay and its controls', async ({ page }) => {
    await expect(page.getByLabel(/crop selection/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /apply/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible()
  })

  test('Apply crops the selection in image pixels and leaves crop mode', async ({ page }) => {
    await page.getByRole('button', { name: /apply/i }).click()

    await expect(page.getByLabel(/crop selection/i)).not.toBeVisible()
    const [call] = await callsOf(page, 'crop_image')
    expect(call.args).toMatchObject({ tabId: 't1', x: 80, y: 60, width: 640, height: 480 })
  })

  test('Cancel leaves crop mode without cropping', async ({ page }) => {
    await page.getByRole('button', { name: /cancel/i }).click()

    await expect(page.getByLabel(/crop selection/i)).not.toBeVisible()
    expect(await callsOf(page, 'crop_image')).toHaveLength(0)
  })

  test('Escape cancels and Enter applies', async ({ page }) => {
    await page.keyboard.press('Enter')
    await expect(page.getByLabel(/crop selection/i)).not.toBeVisible()
    expect(await callsOf(page, 'crop_image')).toHaveLength(1)
  })

  test('imposing a 1:1 ratio makes the selection square', async ({ page }) => {
    await page.getByLabel('Aspect ratio').selectOption('1:1')

    await expect(page.getByLabel('Width')).toHaveValue('480')
    await expect(page.getByLabel('Height')).toHaveValue('480')
    await page.getByRole('button', { name: /apply/i }).click()
    const [call] = await callsOf(page, 'crop_image')
    expect(call.args.width).toBe(call.args.height)
  })

  test('the arrow keys move the selection', async ({ page }) => {
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowUp')
    await page.getByRole('button', { name: /apply/i }).click()

    const [call] = await callsOf(page, 'crop_image')
    expect(call.args).toMatchObject({ x: 79, y: 59 })
  })

  test('typing a width in the bar resizes the selection', async ({ page }) => {
    await page.getByLabel('Width').fill('300')

    await expect(page.getByLabel('Width')).toHaveValue('300')
    await expect(page.getByLabel('Height')).toHaveValue('480')
  })
})
