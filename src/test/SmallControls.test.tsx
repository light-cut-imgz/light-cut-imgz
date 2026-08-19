import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CropControls } from '../components/CropControls'
import { TabBar } from '../components/TabBar'
import { AboutDialog } from '../components/AboutDialog'
import { InpaintingControls } from '../components/InpaintingControls'
import { LangProvider } from '../lib/locale'
import type { Tab } from '../types'

describe('CropControls', () => {
  function setup(props: Partial<Parameters<typeof CropControls>[0]> = {}) {
    const onApply = vi.fn()
    const onCancel = vi.fn()
    render(
      <CropControls
        cropRect={{ x: 0, y: 0, width: 320, height: 200 }}
        isLoading={false}
        onApply={onApply}
        onCancel={onCancel}
        {...props}
      />,
    )
    return { onApply, onCancel }
  }

  it('shows the crop size', () => {
    setup()
    expect(screen.getByText('320 × 200')).toBeInTheDocument()
  })

  it('applies and cancels', async () => {
    const { onApply, onCancel } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('blocks apply for a degenerate rectangle', () => {
    setup({ cropRect: { x: 0, y: 0, width: 0, height: 200 } })
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('blocks apply for a zero-height rectangle', () => {
    setup({ cropRect: { x: 0, y: 0, width: 320, height: 0 } })
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('disables both buttons while busy', () => {
    setup({ isLoading: true })
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('honours the French locale', () => {
    render(
      <LangProvider lang="fr">
        <CropControls
          cropRect={{ x: 0, y: 0, width: 10, height: 10 }}
          isLoading={false}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      </LangProvider>,
    )
    expect(screen.getByRole('button', { name: 'Appliquer' })).toBeInTheDocument()
  })
})

describe('TabBar', () => {
  const tabs: Tab[] = [
    { id: 'a', label: 'first.png' },
    { id: 'b', label: 'second.jpg' },
  ] as Tab[]

  it('renders nothing without tabs', () => {
    const { container } = render(
      <TabBar tabs={[]} activeTabId={null} onSelect={vi.fn()} onClose={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('lists every tab label', () => {
    render(<TabBar tabs={tabs} activeTabId="a" onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('first.png')).toBeInTheDocument()
    expect(screen.getByText('second.jpg')).toBeInTheDocument()
  })

  it('selects a tab when its label is clicked', async () => {
    const onSelect = vi.fn()
    render(<TabBar tabs={tabs} activeTabId="a" onSelect={onSelect} onClose={vi.fn()} />)

    await userEvent.click(screen.getByText('second.jpg'))

    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('closes a tab without selecting it', async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<TabBar tabs={tabs} activeTabId="a" onSelect={onSelect} onClose={onClose} />)

    await userEvent.click(screen.getByLabelText('Close second.jpg'))

    expect(onClose).toHaveBeenCalledWith('b')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('marks the active tab', () => {
    render(<TabBar tabs={tabs} activeTabId="b" onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('second.jpg').parentElement?.className).toContain('bg-slate-800')
  })
})

describe('AboutDialog', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<AboutDialog open={false} version="0.6.0" onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the version and tagline when open', () => {
    render(<AboutDialog open version="0.6.0" onClose={vi.fn()} />)
    expect(screen.getByText('Version 0.6.0')).toBeInTheDocument()
    expect(screen.getByText(/Fast desktop image editor/)).toBeInTheDocument()
  })

  it('closes from the button', async () => {
    const onClose = vi.fn()
    render(<AboutDialog open version="0.6.0" onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the backdrop is clicked', async () => {
    const onClose = vi.fn()
    const { container } = render(<AboutDialog open version="0.6.0" onClose={onClose} />)

    await userEvent.click(container.firstChild as Element)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open when the panel itself is clicked', async () => {
    const onClose = vi.fn()
    render(<AboutDialog open version="0.6.0" onClose={onClose} />)

    await userEvent.click(screen.getByText(/Fast desktop image editor/))

    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('InpaintingControls', () => {
  function setup(props: Partial<Parameters<typeof InpaintingControls>[0]> = {}) {
    const handlers = {
      onBrushSizeChange: vi.fn(),
      onClear: vi.fn(),
      onCancel: vi.fn(),
      onApply: vi.fn(),
    }
    render(<InpaintingControls brushSize={40} isLoading={false} {...handlers} {...props} />)
    return handlers
  }

  it('shows the current brush size', () => {
    setup()
    expect(screen.getByRole('slider')).toHaveValue('40')
    expect(screen.getByText('40')).toBeInTheDocument()
  })

  it('reports a new brush size as a number', () => {
    const { onBrushSizeChange } = setup()

    fireEvent.change(screen.getByRole('slider'), { target: { value: '120' } })

    expect(onBrushSizeChange).toHaveBeenCalledWith(120)
  })

  it('wires up clear, cancel and apply', async () => {
    const { onClear, onCancel, onApply } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Clear mask' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('shows a busy label and disables everything while filling', () => {
    setup({ isLoading: true })

    expect(screen.getByRole('button', { name: 'Filling…' })).toBeDisabled()
    expect(screen.getByRole('slider')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear mask' })).toBeDisabled()
  })
})
