import '@testing-library/jest-dom'
import { vi } from 'vitest'

// jsdom ships no 2D context, and the components that draw only need the calls to
// be harmless. Stub just enough of the API for them to run without warnings.
const context2d = {
  canvas: null as unknown as HTMLCanvasElement,
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  drawImage: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  setTransform: vi.fn(),
  putImageData: vi.fn(),
  createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) })),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  lineCap: 'butt',
  lineJoin: 'miter',
}

HTMLCanvasElement.prototype.getContext = vi.fn(
  () => context2d,
) as unknown as HTMLCanvasElement['getContext']

HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,AAA')

// jsdom implements <dialog> but not its modal methods.
HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
  this.open = true
})
HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
  this.open = false
})
