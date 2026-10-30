import { expect, test } from '@playwright/test'
import { callsOf, openFixture } from './tauri-mock'

test.describe('Adjustments', () => {
  test.beforeEach(async ({ page }) => {
    await openFixture(page)
    await page.getByRole('button', { name: /^adjustments$/i }).click()
    await page.getByRole('button', { name: 'Exposure' }).click()
  })

  async function drag(page: import('@playwright/test').Page, value: string) {
    const slider = page.getByRole('slider', { name: 'Exposure' })
    await slider.fill(value)
    await slider.dispatchEvent('pointerup')
  }

  test('previews with the backend while dragging, and applies on release', async ({ page }) => {
    const slider = page.getByRole('slider', { name: 'Exposure' })
    await slider.fill('1')

    await expect(page.getByTestId('canvas-preview')).toBeVisible()
    expect(await callsOf(page, 'apply_command')).toHaveLength(0)

    await slider.dispatchEvent('pointerup')
    await expect.poll(async () => (await callsOf(page, 'apply_command')).length).toBe(1)
    const [call] = await callsOf(page, 'apply_command')
    expect(call.args).toMatchObject({
      tabId: 't1',
      command: { type: 'exposure', exposure: 1 },
      replace: false,
    })
  })

  test('a second adjustment replaces the first instead of stacking on it', async ({ page }) => {
    await drag(page, '1')
    await expect.poll(async () => (await callsOf(page, 'apply_command')).length).toBe(1)

    await drag(page, '2')
    await expect.poll(async () => (await callsOf(page, 'apply_command')).length).toBe(2)

    const calls = await callsOf(page, 'apply_command')
    expect(calls[1].args).toMatchObject({
      command: { type: 'exposure', exposure: 2 },
      replace: true,
    })
  })

  test('releasing the slider without moving it applies nothing', async ({ page }) => {
    await page.getByRole('slider', { name: 'Exposure' }).dispatchEvent('pointerup')

    expect(await callsOf(page, 'apply_command')).toHaveLength(0)
  })

  test('Ctrl+Z undoes even though the slider still has the focus', async ({ page }) => {
    await drag(page, '1')
    await expect.poll(async () => (await callsOf(page, 'apply_command')).length).toBe(1)

    await page.keyboard.press('Control+z')

    await expect.poll(async () => (await callsOf(page, 'undo_image')).length).toBe(1)
  })
})
