import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const capabilities = JSON.parse(readFileSync('src-tauri/capabilities/default.json', 'utf8')) as {
  permissions: string[]
}
const app = readFileSync('src/App.tsx', 'utf8')

describe('Tauri capabilities', () => {
  it('lets the close guard destroy the window, or the close button does nothing', () => {
    // `onCloseRequested` ends by calling `window.destroy()`, which `core:default` does not allow.
    expect(app).toContain('onCloseRequested')
    expect(capabilities.permissions).toContain('core:window:allow-destroy')
  })

  it('lets File ▸ Quit close the window, or Quit does nothing', () => {
    // The menu asks the front, which calls `getCurrentWindow().close()`; `core:default` does not allow it.
    expect(app).toContain("listen('menu-quit'")
    expect(capabilities.permissions).toContain('core:window:allow-close')
  })

  it('allows the confirmation dialog shown by the close guard', () => {
    expect(capabilities.permissions).toContain('dialog:allow-ask')
  })
})
