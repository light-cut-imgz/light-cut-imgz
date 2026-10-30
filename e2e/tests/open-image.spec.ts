import { expect, test } from '@playwright/test'
import { callsOf, mockTauri, openFixture } from './tauri-mock'

test.describe('Open image', () => {
  test('shows the empty state before any image is opened', async ({ page }) => {
    await mockTauri(page)
    await page.goto('/')

    await expect(page.getByText('LightCutImgz')).toBeVisible()
    await expect(page.getByText('Drop an image here')).toBeVisible()
    await expect(page.getByTestId('canvas-image')).not.toBeVisible()
  })

  test('the open button is always enabled', async ({ page }) => {
    await mockTauri(page)
    await page.goto('/')

    await expect(page.getByRole('button', { name: /browse files/i })).toBeEnabled()
  })

  test('shows none of the editing tools before opening', async ({ page }) => {
    await mockTauri(page)
    await page.goto('/')

    for (const name of [/^crop$/i, /^rotate$/i, /^export$/i]) {
      await expect(page.getByRole('button', { name })).toHaveCount(0)
    }
  })

  test('opening an image shows it with its size and format', async ({ page }) => {
    await openFixture(page)

    await expect(page.getByTestId('canvas-image')).toBeVisible()
    await expect(page.getByText('800 × 600 px', { exact: true })).toBeVisible()
    await expect(page.getByText('PNG', { exact: true }).first()).toBeVisible()
    expect(await callsOf(page, 'open_images')).toHaveLength(1)
  })

  test('enables the tools once an image is open', async ({ page }) => {
    await openFixture(page)

    await expect(page.getByRole('button', { name: /^crop$/i })).toBeEnabled()
    await expect(page.getByRole('button', { name: /^export$/i })).toBeEnabled()
  })

  test('fits an image that is larger than the window', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 500 })
    await openFixture(page)

    // Les dimensions affichées sont celles de l'attribut : l'image factice de 1×1 px ne
    // donne pas le bon rapport au rendu.
    const img = page.getByTestId('canvas-image')
    const shown = await img.evaluate((el) => {
      const area = el.closest('.overflow-auto') as HTMLElement
      return {
        w: Number(el.getAttribute('width')),
        h: Number(el.getAttribute('height')),
        areaW: area.clientWidth,
        areaH: area.clientHeight,
      }
    })
    expect(shown.w).toBeLessThan(800)
    expect(shown.w).toBeLessThanOrEqual(shown.areaW)
    expect(shown.h).toBeLessThanOrEqual(shown.areaH)
  })
})
