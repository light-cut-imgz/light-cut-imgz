import type { Page } from '@playwright/test'

export interface Call {
  cmd: string
  args: Record<string, unknown>
}

/**
 * Remplace le pont Tauri **avant** le chargement de la page (`addInitScript`) : l'application
 * démarre alors comme dans la vraie fenêtre. Le faux backend tient un historique comme le Rust
 * (empilement, annulation, remplacement de la dernière étape) et note chaque appel.
 */
export async function mockTauri(page: Page) {
  await page.addInitScript(() => {
    const PNG =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const w = window as unknown as Record<string, unknown>
    const calls: unknown[] = []
    const state = { len: 1, index: 0, dirty: false }
    const meta = () => ({
      width: 800,
      height: 600,
      format: 'png',
      preview: PNG,
      thumbnail: PNG,
      can_undo: state.index > 0,
      can_redo: state.index < state.len - 1,
      history_len: state.len,
      history_index: state.index,
      filename: 'photo.png',
      path: '/tmp/photo.png',
    })
    const push = (replace: boolean) => {
      if (replace && state.index > 0) state.index--
      state.len = state.index + 2
      state.index = state.len - 1
      return meta()
    }
    const EDITS = [
      'crop_image',
      'rotate_image',
      'flip_image',
      'resize_image',
      'canvas_resize_image',
      'inpaint_image',
    ]
    let nextCallback = 1
    w.__calls = calls
    w.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main', windowLabel: 'main' },
      },
      transformCallback: () => nextCallback++,
      unregisterCallback: () => {},
      invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
        calls.push({ cmd, args })
        if (cmd === 'open_images' || cmd === 'open_images_by_paths') {
          return { opened: [{ tab_id: 't1', meta: meta() }], failed: [] }
        }
        if (cmd === 'apply_command') return push(args.replace === true)
        if (EDITS.includes(cmd)) return push(false)
        if (cmd === 'undo_image') {
          state.index--
          return meta()
        }
        if (cmd === 'redo_image') {
          state.index++
          return meta()
        }
        if (cmd === 'preview_command') return PNG
        if (cmd === 'export_image' || cmd === 'plugin:dialog|ask') return true
        if (cmd === 'get_exif') return []
        return null
      },
    }
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
  })
}

export async function callsOf(page: Page, cmd: string): Promise<Call[]> {
  const all = (await page.evaluate(
    () => (window as unknown as { __calls: Call[] }).__calls,
  )) as Call[]
  return all.filter((c) => c.cmd === cmd)
}

/** Ouvre la page avec le faux backend et charge une image. */
export async function openFixture(page: Page) {
  await mockTauri(page)
  await page.goto('/')
  await page.getByRole('button', { name: /browse files/i }).click()
  await page.getByTestId('canvas-image').waitFor()
}
