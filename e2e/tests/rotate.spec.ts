import { expect, test } from '@playwright/test'
import { callsOf, openFixture } from './tauri-mock'

test.describe('Rotate', () => {
  test.beforeEach(async ({ page }) => {
    await openFixture(page)
    await page.getByRole('button', { name: /^rotate$/i }).click()
  })

  test('shows the rotation controls', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^rotate 90° clockwise/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /counter-clockwise/i })).toBeVisible()
  })

  test('+90 rotates by a quarter turn clockwise', async ({ page }) => {
    await page.getByRole('button', { name: /^rotate 90° clockwise/i }).click()

    await expect.poll(async () => (await callsOf(page, 'rotate_image')).length).toBe(1)
    const [call] = await callsOf(page, 'rotate_image')
    expect(call.args).toMatchObject({ tabId: 't1', degrees: 90 })
  })

  test('−90 rotates counter-clockwise', async ({ page }) => {
    await page.getByRole('button', { name: /counter-clockwise/i }).click()

    await expect.poll(async () => (await callsOf(page, 'rotate_image')).length).toBe(1)
    expect((await callsOf(page, 'rotate_image'))[0].args.degrees).toBe(-90)
  })

  test('moving the angle rotates the image live without calling the backend', async ({ page }) => {
    await page.getByLabel('Rotation degrees').fill('30')

    await expect(page.getByTestId('canvas-image')).toHaveCSS('transform', /matrix/)
    expect(await callsOf(page, 'apply_command')).toHaveLength(0)
    expect(await callsOf(page, 'preview_command')).toHaveLength(0)
  })

  test('the angle is applied on Enter, and the next one replaces it', async ({ page }) => {
    const angle = page.getByLabel('Rotation degrees')

    await angle.fill('30')
    await angle.press('Enter')
    await expect.poll(async () => (await callsOf(page, 'apply_command')).length).toBe(1)

    await angle.fill('45')
    await angle.press('Enter')
    await expect.poll(async () => (await callsOf(page, 'apply_command')).length).toBe(2)

    const [first, second] = await callsOf(page, 'apply_command')
    expect(first.args).toMatchObject({ command: { type: 'rotate', degrees: 30 }, replace: false })
    expect(second.args).toMatchObject({ command: { type: 'rotate', degrees: 45 }, replace: true })
  })
})
