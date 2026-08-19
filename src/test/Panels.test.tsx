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

describe('ExifPanel — marking fields', () => {
  it('marks a single field and lets it be restored', async () => {
    render(<ExifPanel tabId="t1" fields={fields} isLoading={false} onStrip={vi.fn()} />)

    await userEvent.click(screen.getAllByTitle('Mark for removal')[0])
    expect(screen.getByTitle('Restore')).toBeInTheDocument()

    await userEvent.click(screen.getByTitle('Restore'))
    expect(screen.getAllByTitle('Mark for removal')).toHaveLength(2)
  })

  it('marks everything at once, then restores everything', async () => {
    render(<ExifPanel tabId="t1" fields={fields} isLoading={false} onStrip={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Hide all' }))
    expect(screen.getAllByTitle('Restore')).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(screen.getAllByTitle('Mark for removal')).toHaveLength(2)
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
  const history = [
    { label: 'Open' },
    { label: 'Crop 100×100' },
    { label: 'Rotate 90°' },
  ] as HistoryEntry[]

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
    expect(screen.getByText('Rotate 90°')).toBeInTheDocument()
  })

  it('highlights the current step and dims the redo-able ones', () => {
    setup({ currentIndex: 1 })
    expect(screen.getByText('Crop 100×100').closest('li')?.className).toContain('bg-indigo-900/60')
    expect(screen.getByText('Rotate 90°').closest('li')?.className).toContain('text-slate-600')
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
    expect(screen.getByRole('combobox')).toHaveValue('25')
  })

  it('saves a changed export format', async () => {
    const { onSave } = setup()

    await userEvent.click(screen.getByText('WebP'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ defaultExportFormat: 'webp' }))
  })

  it('saves a changed JPEG quality', async () => {
    const { onSave } = setup()

    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } })
    expect(screen.getByText('Default JPEG quality: 60%')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ defaultJpegQuality: 60 }))
  })

  it('saves a changed grid size as a number', async () => {
    const { onSave } = setup()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '100' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ gridSize: 100 }))
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

  it('clears the recent-file list on demand', async () => {
    const spy = vi.spyOn(recentFiles, 'clearRecentFiles')
    setup()

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(spy).toHaveBeenCalledTimes(1)
  })
})
