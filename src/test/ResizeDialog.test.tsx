import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ResizeDialog } from '../components/ResizeDialog'

function setup(props: Partial<Parameters<typeof ResizeDialog>[0]> = {}) {
  const onResize = vi.fn()
  const onClose = vi.fn()
  const view = render(
    <ResizeDialog
      open
      originalWidth={800}
      originalHeight={400}
      isLoading={false}
      onResize={onResize}
      onClose={onClose}
      {...props}
    />,
  )
  return { onResize, onClose, ...view }
}

const widthBox = () => screen.getAllByRole('spinbutton')[0]
const heightBox = () => screen.getAllByRole('spinbutton')[1]

describe('ResizeDialog — rendering', () => {
  it('renders nothing while closed', () => {
    const { container } = setup({ open: false })
    expect(container).toBeEmptyDOMElement()
  })

  it('starts from the original dimensions', () => {
    setup()
    expect(screen.getByText('Original: 800 × 400 px')).toBeInTheDocument()
    expect(widthBox()).toHaveValue(800)
    expect(heightBox()).toHaveValue(400)
  })

  it('re-seeds the fields when reopened on another image', () => {
    const { rerender } = setup()
    fireEvent.change(widthBox(), { target: { value: '1000' } })

    rerender(
      <ResizeDialog
        open
        originalWidth={640}
        originalHeight={480}
        isLoading={false}
        onResize={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(widthBox()).toHaveValue(640)
    expect(heightBox()).toHaveValue(480)
  })
})

describe('ResizeDialog — aspect ratio', () => {
  it('keeps the ratio when the width changes', () => {
    setup()

    fireEvent.change(widthBox(), { target: { value: '400' } })

    expect(heightBox()).toHaveValue(200)
  })

  it('keeps the ratio when the height changes', () => {
    setup()

    fireEvent.change(heightBox(), { target: { value: '100' } })

    expect(widthBox()).toHaveValue(200)
  })

  it('lets the two sides move freely once unlocked', async () => {
    setup()

    await userEvent.click(screen.getByRole('button', { name: 'Ratio locked' }))
    fireEvent.change(widthBox(), { target: { value: '400' } })

    expect(heightBox()).toHaveValue(400)
    expect(screen.getByRole('button', { name: 'Free' })).toBeInTheDocument()
  })

  it('never lets a linked side fall below one pixel', () => {
    setup({ originalWidth: 1000, originalHeight: 10 })

    fireEvent.change(widthBox(), { target: { value: '1' } })

    expect(heightBox()).toHaveValue(1)
  })

  it('clamps a cleared field to one pixel', () => {
    setup()

    fireEvent.change(widthBox(), { target: { value: '' } })

    expect(widthBox()).toHaveValue(1)
  })

  it('clamps a negative width to one pixel', () => {
    setup()

    fireEvent.change(widthBox(), { target: { value: '-50' } })

    expect(widthBox()).toHaveValue(1)
  })
})

describe('ResizeDialog — actions', () => {
  it('reports the chosen size', async () => {
    const { onResize } = setup()

    fireEvent.change(widthBox(), { target: { value: '400' } })
    await userEvent.click(screen.getByRole('button', { name: 'Resize' }))

    expect(onResize).toHaveBeenCalledWith(400, 200)
  })

  it('cancels without resizing', async () => {
    const { onResize, onClose } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onResize).not.toHaveBeenCalled()
  })

  it('shows a busy label and blocks the action while resizing', () => {
    setup({ isLoading: true })
    expect(screen.getByRole('button', { name: 'Resizing…' })).toBeDisabled()
  })

  it('closes from the backdrop but not from the panel', async () => {
    const { onClose, container } = setup()

    await userEvent.click(screen.getByText('Resize image'))
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.click(container.firstChild as Element)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
