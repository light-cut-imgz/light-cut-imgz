import { useCallback, useRef, useState } from 'react'
import type { CropRect } from '../types'

type HandleId = 'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br'
type DragTarget = HandleId | 'body' | null

interface DragState {
  target: DragTarget
  startX: number
  startY: number
  startRect: CropRect
}

interface UseCropReturn {
  cropRect: CropRect
  setCropRect: (rect: CropRect) => void
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void
}

const HANDLE_SIZE = 8

function getHandleAt(
  px: number,
  py: number,
  rect: CropRect,
  scaleX: number,
  scaleY: number,
): HandleId | null {
  const x = rect.x * scaleX
  const y = rect.y * scaleY
  const w = rect.width * scaleX
  const h = rect.height * scaleY

  const handles: Array<[HandleId, number, number]> = [
    ['tl', x, y],
    ['tc', x + w / 2, y],
    ['tr', x + w, y],
    ['ml', x, y + h / 2],
    ['mr', x + w, y + h / 2],
    ['bl', x, y + h],
    ['bc', x + w / 2, y + h],
    ['br', x + w, y + h],
  ]

  for (const [id, hx, hy] of handles) {
    if (Math.abs(px - hx) <= HANDLE_SIZE && Math.abs(py - hy) <= HANDLE_SIZE) {
      return id
    }
  }
  return null
}

function isInsideRect(
  px: number,
  py: number,
  rect: CropRect,
  scaleX: number,
  scaleY: number,
): boolean {
  const x = rect.x * scaleX
  const y = rect.y * scaleY
  const w = rect.width * scaleX
  const h = rect.height * scaleY
  return px >= x && px <= x + w && py >= y && py <= y + h
}

export function useCrop(imageWidth: number, imageHeight: number): UseCropReturn {
  const [cropRect, setCropRect] = useState<CropRect>({
    x: Math.round(imageWidth * 0.1),
    y: Math.round(imageHeight * 0.1),
    width: Math.round(imageWidth * 0.8),
    height: Math.round(imageHeight * 0.8),
  })

  const dragRef = useRef<DragState | null>(null)

  const getScale = useCallback(
    (canvas: HTMLCanvasElement) => ({
      scaleX: imageWidth / canvas.offsetWidth,
      scaleY: imageHeight / canvas.offsetHeight,
    }),
    [imageWidth, imageHeight],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = e.currentTarget
      canvas.setPointerCapture(e.pointerId)
      const { scaleX, scaleY } = getScale(canvas)
      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top

      const handle = getHandleAt(px, py, cropRect, 1 / scaleX, 1 / scaleY)
      const target: DragTarget =
        handle ?? (isInsideRect(px, py, cropRect, 1 / scaleX, 1 / scaleY) ? 'body' : null)

      if (target === null) return

      dragRef.current = {
        target,
        startX: px,
        startY: py,
        startRect: { ...cropRect },
      }
    },
    [cropRect, getScale],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragRef.current) return
      const canvas = e.currentTarget
      const { scaleX, scaleY } = getScale(canvas)
      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top

      const dx = (px - dragRef.current.startX) * scaleX
      const dy = (py - dragRef.current.startY) * scaleY
      const s = dragRef.current.startRect
      const { target } = dragRef.current
      if (!target) return

      let { x, y, width, height } = s

      if (target === 'body') {
        x = Math.max(0, Math.min(s.x + dx, imageWidth - s.width))
        y = Math.max(0, Math.min(s.y + dy, imageHeight - s.height))
      } else {
        const right = s.x + s.width
        const bottom = s.y + s.height

        if (target.includes('l')) {
          x = Math.max(0, Math.min(s.x + dx, right - 1))
          width = right - x
        }
        if (target.includes('r')) {
          width = Math.max(1, Math.min(s.width + dx, imageWidth - s.x))
        }
        if (target.includes('t')) {
          y = Math.max(0, Math.min(s.y + dy, bottom - 1))
          height = bottom - y
        }
        if (target.includes('b')) {
          height = Math.max(1, Math.min(s.height + dy, imageHeight - s.y))
        }
      }

      setCropRect({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
      })
    },
    [getScale, imageWidth, imageHeight],
  )

  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  return { cropRect, setCropRect, onPointerDown, onPointerMove, onPointerUp }
}
