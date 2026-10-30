import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { listen } from '@tauri-apps/api/event'
import { ask } from '@tauri-apps/plugin-dialog'
import { previewCommand, setMenuLanguage } from '../lib/tauri'
import App from '../App'
import { useImageEditor } from '../hooks/useImageEditor'
import type { EditorMode, Tab } from '../types'
import { editorStub, meta } from './editorStub'
import type { Editor } from './editorStub'

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn() }))
vi.mock('../hooks/useImageEditor')
vi.mock('../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../lib/tauri')>('../lib/tauri')
  return {
    ...actual,
    setMenuLanguage: vi.fn(),
    previewCommand: vi.fn(),
  }
})

const mockAsk = vi.mocked(ask)
const mockUseImageEditor = vi.mocked(useImageEditor)
let menu: Record<string, (e: { payload: unknown }) => void>

const tab = (over: Partial<Tab> = {}): Tab => ({
  id: 't1',
  label: 'photo.png',
  image: meta(),
  history: [{ key: 'hist.open' }, { key: 'hist.flip-h' }],
  historyIndex: 1,
  savedIndex: 0, // modifié depuis la dernière sauvegarde
  zoom: 1,
  ...over,
})

async function renderApp(over: Partial<Editor> = {}) {
  const editor = editorStub(over)
  mockUseImageEditor.mockReturnValue(editor)
  const view = render(<App />)
  await act(async () => {})
  return { editor, ...view }
}

const press = (init: KeyboardEventInit, target: EventTarget = window) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  menu = {}
  mockAsk.mockResolvedValue(true)
  vi.mocked(setMenuLanguage).mockResolvedValue(undefined)
  vi.mocked(previewCommand).mockResolvedValue('data:image/png;base64,PREVIEW')
  vi.mocked(listen).mockImplementation(((event: string, handler: unknown) => {
    menu[event] = handler as (e: { payload: unknown }) => void
    return Promise.resolve(() => {})
  }) as typeof listen)
})

describe('keyboard shortcuts', () => {
  it('redoes with a real Ctrl+Shift+Z (the browser reports an upper-case Z)', async () => {
    const { editor } = await renderApp()

    press({ key: 'Z', ctrlKey: true, shiftKey: true })

    expect(editor.handleRedo).toHaveBeenCalledTimes(1)
    expect(editor.handleUndo).not.toHaveBeenCalled()
  })

  it('uses Cmd as the modifier on macOS', async () => {
    const { editor } = await renderApp()

    press({ key: 'z', metaKey: true })
    press({ key: 'Z', metaKey: true, shiftKey: true })
    press({ key: '0', metaKey: true })

    expect(editor.handleUndo).toHaveBeenCalledTimes(1)
    expect(editor.handleRedo).toHaveBeenCalledTimes(1)
    expect(editor.setZoom).toHaveBeenCalledWith(1)
  })

  it('leaves Ctrl+Z, Ctrl+C and Ctrl+Y to a text field', async () => {
    const { editor } = await renderApp()
    const input = document.createElement('input')
    document.body.appendChild(input)

    for (const key of ['z', 'y', 'c']) press({ key, ctrlKey: true }, input)

    expect(editor.handleUndo).not.toHaveBeenCalled()
    expect(editor.handleRedo).not.toHaveBeenCalled()
    expect(editor.handleCopyToClipboard).not.toHaveBeenCalled()
    input.remove()
  })

  it('does not cancel the default of a key it ignores', async () => {
    await renderApp()
    const input = document.createElement('input')
    document.body.appendChild(input)
    const ev = new KeyboardEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })

    act(() => {
      input.dispatchEvent(ev)
    })

    expect(ev.defaultPrevented).toBe(false)
    input.remove()
  })

  it('still undoes after a slider has taken the focus', async () => {
    const { editor } = await renderApp()
    const range = document.createElement('input')
    range.type = 'range'
    document.body.appendChild(range)

    press({ key: 'z', ctrlKey: true }, range)

    expect(editor.handleUndo).toHaveBeenCalledTimes(1)
    range.remove()
  })

  it('keeps Ctrl+C for selected text instead of copying the image', async () => {
    const { editor } = await renderApp()
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'EOS R6' } as Selection)

    press({ key: 'c', ctrlKey: true })

    expect(editor.handleCopyToClipboard).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('copies the image with Ctrl+C when nothing is selected', async () => {
    const { editor } = await renderApp()

    press({ key: 'c', ctrlKey: true })

    expect(editor.handleCopyToClipboard).toHaveBeenCalledTimes(1)
  })

  it('stays silent while typing in a field of a tool panel', async () => {
    const { editor } = await renderApp()
    await userEvent.click(screen.getByLabelText('Canvas resize'))
    const width = screen.getByRole('spinbutton', { name: /width/i })

    fireEvent.keyDown(width, { key: 'z', ctrlKey: true })

    expect(editor.handleUndo).not.toHaveBeenCalled()
  })

  it('leaves the rotation mode on Escape', async () => {
    const { editor } = await renderApp({ mode: 'rotating' as EditorMode })

    press({ key: 'Escape' })

    expect(editor.exitRotateMode).toHaveBeenCalled()
  })

  it('registers the global listeners once, however often the editor state changes', async () => {
    const { editor, rerender } = await renderApp()
    const registrations = vi.mocked(listen).mock.calls.length

    mockUseImageEditor.mockReturnValue({ ...editor, historyIndex: 3, zoom: 2 })
    rerender(<App />)
    await act(async () => {})

    expect(vi.mocked(listen).mock.calls.length).toBe(registrations)
  })
})

describe('closing with unexported changes', () => {
  it('asks before closing a modified tab, and closes it when confirmed', async () => {
    const { editor } = await renderApp({ tabs: [tab()] })

    await act(async () => {
      menu['menu-close-tab']?.({ payload: null })
    })

    expect(mockAsk).toHaveBeenCalledWith(expect.stringContaining('photo.png'), expect.anything())
    expect(editor.handleCloseTab).toHaveBeenCalledWith('t1')
  })

  it('keeps the tab when the user declines', async () => {
    mockAsk.mockResolvedValue(false)
    const { editor } = await renderApp({ tabs: [tab()] })

    await act(async () => {
      menu['menu-close-tab']?.({ payload: null })
    })

    expect(editor.handleCloseTab).not.toHaveBeenCalled()
  })

  it('does not ask for a tab that was exported or never changed', async () => {
    const { editor } = await renderApp({ tabs: [tab({ savedIndex: 1 })] })

    await act(async () => {
      menu['menu-close-tab']?.({ payload: null })
    })

    expect(mockAsk).not.toHaveBeenCalled()
    expect(editor.handleCloseTab).toHaveBeenCalled()
  })

  it('asks once for "close all" when any tab is modified', async () => {
    const { editor } = await renderApp({ tabs: [tab(), tab({ id: 't2', savedIndex: 1 })] })

    await act(async () => {
      menu['menu-close-all']?.({ payload: null })
    })

    expect(mockAsk).toHaveBeenCalledTimes(1)
    expect(editor.handleCloseAllTabs).toHaveBeenCalled()
  })

  it('only counts the other tabs for "close others"', async () => {
    // L'onglet actif est modifié mais reste ouvert : aucune question.
    const { editor } = await renderApp({
      tabs: [tab(), tab({ id: 't2', savedIndex: 1 })],
      activeTabId: 't1',
    })

    await act(async () => {
      menu['menu-close-others']?.({ payload: null })
    })

    expect(mockAsk).not.toHaveBeenCalled()
    expect(editor.handleCloseOtherTabs).toHaveBeenCalled()
  })

  it('marks a modified tab with a dot', async () => {
    await renderApp({ tabs: [tab()] })

    expect(screen.getByText('•')).toBeInTheDocument()
  })

  it('shows no dot on a clean tab', async () => {
    await renderApp({ tabs: [tab({ savedIndex: 1 })] })

    expect(screen.queryByText('•')).not.toBeInTheDocument()
  })
})

describe('messages', () => {
  it('shows a backend error in the active language', async () => {
    await renderApp({ error: 'Nothing to undo' })

    expect(screen.getByText('Nothing to undo.')).toBeInTheDocument()
  })

  it('lists the files that could not be opened, with the reason', async () => {
    await renderApp({
      openFailures: [{ path: '/home/me/broken.png', error: 'bad header' }],
    })

    expect(
      screen.getByText(/1 file\(s\) could not be opened: broken\.png \(bad header\)/),
    ).toBeInTheDocument()
  })

  it('forgets a recent file that can no longer be opened', async () => {
    localStorage.setItem('lciz-recent', JSON.stringify(['/gone.png', '/kept.png']))

    await renderApp({
      image: null,
      tabs: [],
      activeTabId: null,
      openFailures: [{ path: '/gone.png', error: 'No such file' }],
    })

    expect(JSON.parse(localStorage.getItem('lciz-recent') ?? '[]')).toEqual(['/kept.png'])
    expect(screen.queryByText('gone.png', { selector: 'span' })).not.toBeInTheDocument()
  })

  it('dismisses the open-failure banner', async () => {
    const { editor } = await renderApp({ openFailures: [{ path: '/x.png', error: 'e' }] })

    await userEvent.click(screen.getByLabelText('Dismiss'))

    expect(editor.clearOpenFailures).toHaveBeenCalled()
  })
})

describe('panels', () => {
  it('sends adjustments straight to the editor as commands, remembering how to replace', async () => {
    const { editor } = await renderApp()
    await userEvent.click(screen.getByLabelText('Adjustments'))
    await userEvent.click(screen.getByRole('button', { name: 'Exposure' }))
    const slider = screen.getByRole('slider', { name: 'Exposure' })

    fireEvent.change(slider, { target: { value: '1' } })
    fireEvent.pointerUp(slider)
    await waitFor(() => expect(editor.handleCommand).toHaveBeenCalledTimes(1))
    fireEvent.change(slider, { target: { value: '2' } })
    fireEvent.pointerUp(slider)
    await waitFor(() => expect(editor.handleCommand).toHaveBeenCalledTimes(2))

    expect(editor.handleCommand).toHaveBeenNthCalledWith(1, { type: 'exposure', exposure: 1 })
    expect(editor.handleCommand).toHaveBeenNthCalledWith(
      2,
      { type: 'exposure', exposure: 2 },
      { replace: true },
    )
  })

  it('shows the backend preview over the image while a slider moves', async () => {
    await renderApp()
    await userEvent.click(screen.getByLabelText('Adjustments'))
    await userEvent.click(screen.getByRole('button', { name: 'Exposure' }))

    await act(async () => {
      fireEvent.change(screen.getByRole('slider', { name: 'Exposure' }), { target: { value: '1' } })
    })

    expect(previewCommand).toHaveBeenCalledWith('t1', { type: 'exposure', exposure: 1 }, 1024)
    expect(await screen.findByTestId('canvas-preview')).toHaveAttribute(
      'src',
      'data:image/png;base64,PREVIEW',
    )
  })

  it('asks before reverting to the original, and does it only when confirmed', async () => {
    const { editor } = await renderApp({ historyIndex: 2 })
    await userEvent.click(screen.getByLabelText('Adjustments'))

    mockAsk.mockResolvedValueOnce(false)
    await userEvent.click(screen.getByLabelText('Reset'))
    expect(editor.handleResetToOriginal).not.toHaveBeenCalled()

    mockAsk.mockResolvedValueOnce(true)
    await userEvent.click(screen.getByLabelText('Reset'))
    await waitFor(() => expect(editor.handleResetToOriginal).toHaveBeenCalledTimes(1))
  })

  it('rotates live with the slider and applies the angle when it is released', async () => {
    const { editor } = await renderApp({ mode: 'rotating' as EditorMode })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Rotation degrees'), { target: { value: '30' } })
    })
    expect(previewCommand).not.toHaveBeenCalled()

    fireEvent.pointerUp(screen.getByLabelText('Rotation angle slider'))
    expect(editor.handleCommand).toHaveBeenCalledWith(
      { type: 'rotate', degrees: 30 },
      { replace: false },
    )
  })

  it('jumps to a step of the history when it is clicked', async () => {
    const { editor } = await renderApp({
      history: [{ key: 'hist.open' }, { key: 'hist.flip-h' }, { key: 'hist.flip-v' }],
      historyIndex: 2,
    })
    await act(async () => {
      menu['menu-toggle-history']?.({ payload: null })
    })

    await userEvent.click(await screen.findByText('Flip horizontal'))

    expect(editor.handleGotoHistory).toHaveBeenCalledWith(1)
  })
})

describe('zoom controls', () => {
  it('offers a fit-to-window button', async () => {
    await renderApp()

    expect(screen.getByLabelText('Fit to window')).toBeInTheDocument()
  })

  it('shows the Ctrl shortcut in the tooltips', async () => {
    await renderApp()

    expect(screen.getByLabelText('Zoom in')).toHaveAttribute('title', 'Zoom in (Ctrl+=)')
  })
})
