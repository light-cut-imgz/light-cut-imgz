import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RotationControls } from '../components/RotationControls'

function renderControls(props: Partial<Parameters<typeof RotationControls>[0]> = {}) {
  const defaults = {
    onRotate: vi.fn(),
    onCancel: vi.fn(),
    isLoading: false,
  }
  return render(<RotationControls {...defaults} {...props} />)
}

describe('RotationControls', () => {
  it('CCW button calls onRotate with -90', async () => {
    const onRotate = vi.fn()
    renderControls({ onRotate })
    await userEvent.click(screen.getByRole('button', { name: /counter-clockwise/i }))
    expect(onRotate).toHaveBeenCalledWith(-90)
  })

  it('CW button calls onRotate with +90', async () => {
    const onRotate = vi.fn()
    renderControls({ onRotate })
    await userEvent.click(screen.getByRole('button', { name: /rotate 90° clockwise$/i }))
    expect(onRotate).toHaveBeenCalledWith(90)
  })

  it('Apply button is disabled when degrees is 0', () => {
    renderControls()
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled()
  })

  it('Degree input and slider stay in sync', async () => {
    renderControls()
    const input = screen.getByRole('spinbutton', { name: /rotation degrees/i })
    await userEvent.clear(input)
    await userEvent.type(input, '45')
    const slider = screen.getByRole('slider', { name: /rotation angle slider/i })
    expect(slider).toHaveValue('45')
  })

  it('Apply calls onRotate with the current degree value', async () => {
    const onRotate = vi.fn()
    renderControls({ onRotate })
    const input = screen.getByRole('spinbutton', { name: /rotation degrees/i })
    await userEvent.clear(input)
    await userEvent.type(input, '30')
    await userEvent.click(screen.getByRole('button', { name: /apply/i }))
    expect(onRotate).toHaveBeenCalledWith(30)
  })

  it('Cancel button calls onCancel', async () => {
    const onCancel = vi.fn()
    renderControls({ onCancel })
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('All buttons are disabled while loading', () => {
    renderControls({ isLoading: true })
    const buttons = screen.getAllByRole('button')
    buttons.forEach((btn) => expect(btn).toBeDisabled())
  })
})
