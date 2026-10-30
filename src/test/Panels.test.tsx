import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ExifPanel } from '../components/ExifPanel'
import { HistoryPanel } from '../components/HistoryPanel'
import { PrefsDialog } from '../components/PrefsDialog'
import * as recentFiles from '../lib/recentFiles'
import type { ExifField } from '../lib/tauri'
import type { HistoryEntry } from '../types'
import type { Prefs } from '../lib/prefs'
import { LangProvider } from '../lib/locale'

const fields: ExifField[] = [
  { tag: 'Make', value: 'Canon' },
  { tag: 'Model', value: 'EOS R6' },
] as ExifField[]

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('ExifPanel — states', () => {
  it('shows a loading message', () => {
    render(<ExifPanel tabId="t1" fields={[]} isLoading onStrip={vi.fn()} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('says when there is no EXIF data', () => {
    render(<ExifPanel tabId="t1" fields={[]} isLoading={false} onStrip={vi.fn()} />)
    expect(screen.getByText('No EXIF data')).toBeInTheDocument()
  })

  it('lists every field', () => {
    render(<ExifPanel tabId="t1" fields={fields} isLoading={false} onStrip={vi.fn()} />)
    expect(screen.getByText('Make')).toBeInTheDocument()
    expect(screen.getByText('Canon')).toBeInTheDocument()
    expect(screen.getByText('Model')).toBeInTheDocument()
  })
})

describe('ExifPanel — read-only list', () => {
  it('offers no per-field removal: stripping removes everything', () => {
    render(<ExifPanel tabId="t1" fields={fields} isLoading={false} onStrip={vi.fn()} />)

    expect(screen.queryByTitle('Mark for removal')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hide all' })).toBeNull()
  })

  it('lists a tag twice if the file does (no duplicate-key collapse)', () => {
    const dup = [
      { tag: 'Make', value: 'A' },
      { tag: 'Make', value: 'B' },
    ] as ExifField[]
    render(<ExifPanel tabId="t1" fields={dup} isLoading={false} onStrip={vi.fn()} />)

    expect(screen.getAllByText('Make')).toHaveLength(2)
  })
})

describe('ExifPanel — stripping', () => {
  it('runs the strip and shows a busy label meanwhile', async () => {
    let release: () => void = () => {}
    const onStrip = vi.fn(
      () =>
        new Promise<void>((res) => {
          release = res
        }),
    )
    render(<ExifPanel tabId="t1" fields={fields} isLoading={false} onStrip={onStrip} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save without EXIF…' }))

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    release()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save without EXIF…' })).toBeEnabled(),
    )
    expect(onStrip).toHaveBeenCalledTimes(1)
  })

  it('re-enables the button even when stripping fails', async () => {
    const onStrip = vi.fn().mockRejectedValue(new Error('write failed'))
    render(<ExifPanel tabId="t1" fields={fields} isLoading={false} onStrip={onStrip} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save without EXIF…' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save without EXIF…' })).toBeEnabled(),
    )
  })

  it('cannot strip without an open tab', async () => {
    const onStrip = vi.fn()
    render(<ExifPanel tabId={null} fields={fields} isLoading={false} onStrip={onStrip} />)

    const button = screen.getByRole('button', { name: 'Save without EXIF…' })
    expect(button).toBeDisabled()
    fireEvent.click(button)

    expect(onStrip).not.toHaveBeenCalled()
  })
})

describe('HistoryPanel', () => {
  const history: HistoryEntry[] = [
    { key: 'hist.open' },
    { key: 'hist.crop', params: { w: '100', h: '100' } },
    { key: 'hist.rotate', params: { deg: '+90' } },
  ]

  function setup(props: Partial<Parameters<typeof HistoryPanel>[0]> = {}) {
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    render(
      <HistoryPanel
        history={history}
        currentIndex={1}
        canUndo
        canRedo
        onUndo={onUndo}
        onRedo={onRedo}
        isLoading={false}
        {...props}
      />,
    )
    return { onUndo, onRedo }
  }

  it('says when nothing has happened yet', () => {
    setup({ history: [] })
    expect(screen.getByText('No actions yet')).toBeInTheDocument()
  })

  it('lists each action', () => {
    setup()
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Crop 100×100')).toBeInTheDocument()
    expect(screen.getByText('Rotate +90°')).toBeInTheDocument()
  })

  it('highlights the current step and dims the redo-able ones', () => {
    setup({ currentIndex: 1 })
    expect(screen.getByText('Crop 100×100').closest('button')?.className).toContain(
      'bg-indigo-900/60',
    )
    expect(screen.getByText('Rotate +90°').closest('button')?.className).toContain('text-slate-600')
  })

  it('translates the entries in the active language', () => {
    render(
      <LangProvider lang="fr">
        <HistoryPanel
          history={history}
          currentIndex={0}
          canUndo={false}
          canRedo
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          isLoading={false}
        />
      </LangProvider>,
    )

    expect(screen.getByText('Ouverture')).toBeInTheDocument()
    expect(screen.getByText('Recadrage 100×100')).toBeInTheDocument()
  })

  it('jumps to a step when it is clicked', async () => {
    const onJump = vi.fn()
    setup({ onJump, currentIndex: 1 })

    await userEvent.click(screen.getByText('Rotate +90°'))
    await userEvent.click(screen.getByText('Open'))

    expect(onJump).toHaveBeenNthCalledWith(1, 2)
    expect(onJump).toHaveBeenNthCalledWith(2, 0)
  })

  it('does not jump to the step it is already on', async () => {
    const onJump = vi.fn()
    setup({ onJump, currentIndex: 1 })

    await userEvent.click(screen.getByText('Crop 100×100'))

    expect(onJump).not.toHaveBeenCalled()
  })

  it('undoes and redoes', async () => {
    const { onUndo, onRedo } = setup()

    await userEvent.click(screen.getByLabelText('Undo'))
    await userEvent.click(screen.getByLabelText('Redo'))

    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).toHaveBeenCalledTimes(1)
  })

  it('disables undo and redo when they are unavailable', () => {
    setup({ canUndo: false, canRedo: false })
    expect(screen.getByLabelText('Undo')).toBeDisabled()
    expect(screen.getByLabelText('Redo')).toBeDisabled()
  })

  it('disables both while an operation is running', () => {
    setup({ isLoading: true })
    expect(screen.getByLabelText('Undo')).toBeDisabled()
    expect(screen.getByLabelText('Redo')).toBeDisabled()
  })
})

describe('PrefsDialog', () => {
  const prefs: Prefs = { defaultExportFormat: 'png', defaultJpegQuality: 90, gridSize: 25 }

  function setup(props: Partial<Parameters<typeof PrefsDialog>[0]> = {}) {
    const onSave = vi.fn()
    const onClose = vi.fn()
    const view = render(
      <PrefsDialog open prefs={prefs} onSave={onSave} onClose={onClose} {...props} />,
    )
    return { onSave, onClose, ...view }
  }

  it('renders nothing while closed', () => {
    const { container } = setup({ open: false })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the current preferences', () => {
    setup()
    expect(screen.getByText('Preferences')).toBeInTheDocument()
    expect(screen.getByText('Default JPEG quality: 90%')).toBeInTheDocument()
  })

  it('saves a changed export format', async () => {
    const { onSave } = setup()

    await userEvent.click(screen.getByText('WebP'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ defaultExportFormat: 'webp' }), {
      clearRecent: false,
    })
  })

  it('saves a changed JPEG quality', async () => {
    const { onSave } = setup()

    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } })
    expect(screen.getByText('Default JPEG quality: 60%')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ defaultJpegQuality: 60 }), {
      clearRecent: false,
    })
  })

  it('leaves the grid size to the View menu', async () => {
    const { onSave } = setup()

    expect(screen.queryByText('Grid size')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    // What was chosen in the menu goes through the dialog untouched.
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ gridSize: 25 }), {
      clearRecent: false,
    })
  })

  it('discards edits when cancelled', async () => {
    const { onSave, onClose } = setup()

    await userEvent.click(screen.getByText('BMP'))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('closes from the backdrop but not from the panel', async () => {
    const { onClose, container } = setup()

    await userEvent.click(screen.getByText('Preferences'))
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.click(container.firstChild as Element)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('only clears the recent files when the dialog is saved', async () => {
    const spy = vi.spyOn(recentFiles, 'clearRecentFiles')
    const { onSave } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(spy).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(expect.anything(), { clearRecent: true })
  })

  it('drops a pending clear when the dialog is cancelled', async () => {
    const { onSave, onClose } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('starts again from the current preferences each time it opens', async () => {
    const onSave = vi.fn()
    const { rerender } = render(
      <PrefsDialog open prefs={prefs} onSave={onSave} onClose={vi.fn()} />,
    )
    await userEvent.click(screen.getByLabelText('JPEG'))
    rerender(<PrefsDialog open={false} prefs={prefs} onSave={onSave} onClose={vi.fn()} />)

    // Les préférences ont changé ailleurs (ex. la langue, via le menu) pendant ce temps.
    const changed: Prefs = { ...prefs, language: 'fr', defaultExportFormat: 'bmp' }
    rerender(<PrefsDialog open prefs={changed} onSave={onSave} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'fr', defaultExportFormat: 'bmp' }),
      { clearRecent: false },
    )
  })

  it('closes on Escape', async () => {
    const { onClose } = setup()

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
