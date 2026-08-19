import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { useCrop } from '../hooks/useCrop'

const IMAGE_W = 800
const IMAGE_H = 600

/**
 * A canvas whose CSS size matches the image, so image pixels and client pixels
 * line up one to one and the arithmetic in the test stays readable.
 */
function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  Object.defineProperty(canvas, 'offsetWidth', { value: IMAGE_W, configurable: true })
  Object.defineProperty(canvas, 'offsetHeight', { value: IMAGE_H, configurable: true })
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect
  canvas.setPointerCapture = () => {}
  return canvas
}

let canvas: HTMLCanvasElement

function pointerEvent(clientX: number, clientY: number) {
  return {
    currentTarget: canvas,
    clientX,
    clientY,
    pointerId: 1,
  } as unknown as React.PointerEvent<HTMLCanvasElement>
}

beforeEach(() => {
  canvas = makeCanvas()
})

describe('useCrop — initial rectangle', () => {
  it('starts at the middle 80% of the image', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))
    expect(result.current.cropRect).toEqual({ x: 80, y: 60, width: 640, height: 480 })
  })

  it('can be replaced wholesale', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))

    act(() => result.current.setCropRect({ x: 1, y: 2, width: 3, height: 4 }))

    expect(result.current.cropRect).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })
})

describe('useCrop — moving the whole rectangle', () => {
  it('drags from inside the rectangle', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))

    act(() => result.current.onPointerDown(pointerEvent(400, 300)))
    act(() => result.current.onPointerMove(pointerEvent(450, 340)))

    expect(result.current.cropRect).toMatchObject({ x: 130, y: 100, width: 640, height: 480 })
  })

  it('never leaves the image on the top-left', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))

    act(() => result.current.onPointerDown(pointerEvent(400, 300)))
    act(() => result.current.onPointerMove(pointerEvent(0, 0)))

    expect(result.current.cropRect).toMatchObject({ x: 0, y: 0 })
  })

  it('never leaves the image on the bottom-right', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))

    act(() => result.current.onPointerDown(pointerEvent(400, 300)))
    act(() => result.current.onPointerMove(pointerEvent(800, 600)))

    expect(result.current.cropRect).toMatchObject({ x: 160, y: 120 })
  })

  it('ignores a drag started outside the rectangle', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))
    const before = result.current.cropRect

    act(() => result.current.onPointerDown(pointerEvent(5, 5)))
    act(() => result.current.onPointerMove(pointerEvent(300, 300)))

    expect(result.current.cropRect).toEqual(before)
  })

  it('ignores a move with no drag in progress', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))
    const before = result.current.cropRect

    act(() => result.current.onPointerMove(pointerEvent(300, 300)))

    expect(result.current.cropRect).toEqual(before)
  })

  it('stops tracking after the pointer is released', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))
    act(() => result.current.onPointerDown(pointerEvent(400, 300)))
    act(() => result.current.onPointerUp(pointerEvent(400, 300)))
    const after = result.current.cropRect

    act(() => result.current.onPointerMove(pointerEvent(500, 400)))

    expect(result.current.cropRect).toEqual(after)
  })
})

describe('useCrop — resizing from the handles', () => {
  // The initial rectangle is x:80 y:60 w:640 h:480, so its corners sit at
  // (80,60), (720,60), (80,540) and (720,540).

  it('drags the left edge', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))

    act(() => result.current.onPointerDown(pointerEvent(80, 300)))
    act(() => result.current.onPointerMove(pointerEvent(180, 300)))

    expect(result.current.cropRect).toMatchObject({ x: 180, width: 540 })
  })

  it('drags the right edge', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))

    act(() => result.current.onPointerDown(pointerEvent(720, 300)))
    act(() => result.current.onPointerMove(pointerEvent(620, 300)))

    expect(result.current.cropRect).toMatchObject({ x: 80, width: 540 })
  })

  it('drags the top edge', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))

    act(() => result.current.onPointerDown(pointerEvent(400, 60)))
    act(() => result.current.onPointerMove(pointerEvent(400, 160)))

    expect(result.current.cropRect).toMatchObject({ y: 160, height: 380 })
  })

  it('drags the bottom edge', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))

    act(() => result.current.onPointerDown(pointerEvent(400, 540)))
    act(() => result.current.onPointerMove(pointerEvent(440, 440)))

    expect(result.current.cropRect).toMatchObject({ y: 60, height: 380 })
  })

  it('drags a corner in both directions at once', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))

    act(() => result.current.onPointerDown(pointerEvent(80, 60)))
    act(() => result.current.onPointerMove(pointerEvent(180, 160)))

    expect(result.current.cropRect).toMatchObject({ x: 180, y: 160, width: 540, height: 380 })
  })

  it('keeps the left edge left of the right edge', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))

    act(() => result.current.onPointerDown(pointerEvent(80, 300)))
    act(() => result.current.onPointerMove(pointerEvent(900, 300)))

    expect(result.current.cropRect.x).toBe(719)
    expect(result.current.cropRect.width).toBe(1)
  })

  it('keeps the top edge above the bottom edge', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))

    act(() => result.current.onPointerDown(pointerEvent(400, 60)))
    act(() => result.current.onPointerMove(pointerEvent(400, 900)))

    expect(result.current.cropRect.y).toBe(539)
    expect(result.current.cropRect.height).toBe(1)
  })

  it('never lets the right edge run past the image', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))

    act(() => result.current.onPointerDown(pointerEvent(720, 300)))
    act(() => result.current.onPointerMove(pointerEvent(2000, 300)))

    expect(result.current.cropRect.x + result.current.cropRect.width).toBe(IMAGE_W)
  })

  it('never lets the bottom edge run past the image', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))

    act(() => result.current.onPointerDown(pointerEvent(400, 540)))
    act(() => result.current.onPointerMove(pointerEvent(400, 2000)))

    expect(result.current.cropRect.y + result.current.cropRect.height).toBe(IMAGE_H)
  })

  it('keeps a minimum width of one pixel when shrinking from the right', () => {
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))

    act(() => result.current.onPointerDown(pointerEvent(720, 300)))
    act(() => result.current.onPointerMove(pointerEvent(-500, 300)))

    expect(result.current.cropRect.width).toBe(1)
  })
})

describe('useCrop — scaling between canvas and image pixels', () => {
  it('converts client pixels through the canvas scale', () => {
    // Canvas displayed at half the image size: 1 client px = 2 image px.
    Object.defineProperty(canvas, 'offsetWidth', { value: IMAGE_W / 2, configurable: true })
    Object.defineProperty(canvas, 'offsetHeight', { value: IMAGE_H / 2, configurable: true })
    const { result } = renderHook(() => useCrop(IMAGE_W, IMAGE_H))

    // The rectangle body now sits around (200, 150) in client pixels.
    act(() => result.current.onPointerDown(pointerEvent(200, 150)))
    act(() => result.current.onPointerMove(pointerEvent(230, 150)))

    // 30 client px → 60 image px.
    expect(result.current.cropRect.x).toBe(140)
  })
})
