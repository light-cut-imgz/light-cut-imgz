import { useCallback, useEffect, useRef, useState } from 'react'
import { CropOverlay } from './CropOverlay'
import type { CropRect, EditorMode, ImageMeta } from '../types'
import { useT } from '../lib/locale'

interface PickedColor {
  r: number
  g: number
  b: number
  a: number
}

interface CanvasProps {
  image: ImageMeta | null
  mode: EditorMode
  zoom: number
  showGrid?: boolean
  gridSize?: number
  recentFiles?: string[]
  isLoading?: boolean
  brushSize?: number
  maskClearSignal?: number
  onCropApply: (rect: CropRect) => void
  onCropCancel: () => void
  onCropRectChange?: (rect: CropRect) => void
  onZoomChange: (z: number | ((prev: number) => number)) => void
  onOpen: () => void
  onOpenByPaths?: (paths: string[]) => void
  onColorPick?: (color: PickedColor | null) => void
  onColorPickConfirm?: (color: PickedColor) => void
  onImageRef?: (el: HTMLImageElement | null) => void
  onMaskCanvasRef?: (canvas: HTMLCanvasElement | null) => void
}

const ZOOM_STEP = 1.15

// Magnifier constants
const MAG_GRID = 13 // pixels shown (odd so center is clear)
const MAG_CELL = 10 // display px per pixel
const MAG_SIZE = MAG_GRID * MAG_CELL // = 130

export function Canvas({
  image,
  mode,
  zoom,
  showGrid = false,
  gridSize = 50,
  recentFiles = [],
  isLoading = false,
  brushSize = 30,
  maskClearSignal,
  onCropApply,
  onCropCancel,
  onCropRectChange,
  onZoomChange,
  onOpen,
  onOpenByPaths,
  onColorPick,
  onColorPickConfirm,
  onImageRef,
  onMaskCanvasRef,
}: CanvasProps) {
  const t = useT()
  const [loadingPath, setLoadingPath] = useState<string | null>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const magnifierRef = useRef<HTMLCanvasElement | null>(null)
  const lastPickedRef = useRef<PickedColor | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDrawingRef = useRef(false)

  useEffect(() => {
    if (!isLoading) setLoadingPath(null)
  }, [isLoading])

  const onImageRefStable = useRef(onImageRef)
  onImageRefStable.current = onImageRef
  const imgCallbackRef = useCallback((el: HTMLImageElement | null) => {
    onImageRefStable.current?.(el)
  }, [])

  const onMaskCanvasRefStable = useRef(onMaskCanvasRef)
  onMaskCanvasRefStable.current = onMaskCanvasRef
  const maskCallbackRef = useCallback((el: HTMLCanvasElement | null) => {
    maskCanvasRef.current = el
    onMaskCanvasRefStable.current?.(el)
  }, [])

  // Build offscreen canvas from preview data URL for pixel reading
  useEffect(() => {
    if (!image?.preview) {
      offscreenRef.current = null
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new window.Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0)
      offscreenRef.current = canvas
    }
    img.src = image.preview
  }, [image?.preview, image?.width, image?.height])

  // Clear mask when image changes (new image loaded)
  useEffect(() => {
    if (!maskCanvasRef.current) return
    const ctx = maskCanvasRef.current.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height)
  }, [image?.preview])

  // Clear mask on demand (from InpaintingControls "clear" button)
  useEffect(() => {
    if (maskClearSignal === undefined || !maskCanvasRef.current || !image) return
    const ctx = maskCanvasRef.current.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, image.width, image.height)
  }, [maskClearSignal, image])

  // Hide magnifier when leaving eyedropper mode
  useEffect(() => {
    if (mode !== 'eyedropper' && magnifierRef.current) {
      magnifierRef.current.style.display = 'none'
    }
  }, [mode])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!image) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      onZoomChange((prev) => prev * delta)
    },
    [image, onZoomChange],
  )

  // ── eyedropper ────────────────────────────────────────────────────────────────

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (mode !== 'eyedropper' || !image) return
      const rect = e.currentTarget.getBoundingClientRect()
      const containerX = e.clientX - rect.left
      const containerY = e.clientY - rect.top
      const imgX = Math.floor(containerX / zoom)
      const imgY = Math.floor(containerY / zoom)

      const displayWidth = Math.round(image.width * zoom)
      const displayHeight = Math.round(image.height * zoom)

      const magCanvas = magnifierRef.current
      if (magCanvas) {
        const ctx = magCanvas.getContext('2d')
        const offscreen = offscreenRef.current
        if (ctx) {
          magCanvas.width = MAG_SIZE
          magCanvas.height = MAG_SIZE
          ctx.imageSmoothingEnabled = false

          if (offscreen) {
            const srcX = imgX - Math.floor(MAG_GRID / 2)
            const srcY = imgY - Math.floor(MAG_GRID / 2)
            ctx.drawImage(offscreen, srcX, srcY, MAG_GRID, MAG_GRID, 0, 0, MAG_SIZE, MAG_SIZE)
          } else {
            ctx.fillStyle = '#1e293b'
            ctx.fillRect(0, 0, MAG_SIZE, MAG_SIZE)
          }

          ctx.strokeStyle = 'rgba(0,0,0,0.25)'
          ctx.lineWidth = 0.5
          for (let i = 1; i < MAG_GRID; i++) {
            ctx.beginPath()
            ctx.moveTo(i * MAG_CELL, 0)
            ctx.lineTo(i * MAG_CELL, MAG_SIZE)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(0, i * MAG_CELL)
            ctx.lineTo(MAG_SIZE, i * MAG_CELL)
            ctx.stroke()
          }

          const cx = Math.floor(MAG_GRID / 2) * MAG_CELL
          const cy = Math.floor(MAG_GRID / 2) * MAG_CELL
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'
          ctx.lineWidth = 1.5
          ctx.strokeRect(cx + 0.5, cy + 0.5, MAG_CELL - 1, MAG_CELL - 1)
        }

        const gapX = 20
        const gapY = 20
        const rightX = containerX + gapX
        const leftX = containerX - MAG_SIZE - gapX
        const belowY = containerY + gapY
        const aboveY = containerY - MAG_SIZE - gapY
        const posX = rightX + MAG_SIZE <= displayWidth ? rightX : Math.max(0, leftX)
        const posY = belowY + MAG_SIZE <= displayHeight ? belowY : Math.max(0, aboveY)

        magCanvas.style.left = `${posX}px`
        magCanvas.style.top = `${posY}px`
        magCanvas.style.display = 'block'
      }

      if (imgX < 0 || imgY < 0 || imgX >= image.width || imgY >= image.height) {
        onColorPick?.(null)
        return
      }
      const offscreen = offscreenRef.current
      if (!offscreen) {
        onColorPick?.(null)
        return
      }
      const ctx = offscreen.getContext('2d')
      if (!ctx) {
        onColorPick?.(null)
        return
      }
      const [r, g, b, a] = ctx.getImageData(imgX, imgY, 1, 1).data
      const color: PickedColor = { r, g, b, a }
      lastPickedRef.current = color
      onColorPick?.(color)
    },
    [mode, zoom, image, onColorPick],
  )

  const handleMouseLeave = useCallback(() => {
    if (mode === 'eyedropper') {
      onColorPick?.(null)
      if (magnifierRef.current) magnifierRef.current.style.display = 'none'
    }
  }, [mode, onColorPick])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (mode !== 'eyedropper' || !image) return
      const rect = e.currentTarget.getBoundingClientRect()
      const imgX = Math.floor((e.clientX - rect.left) / zoom)
      const imgY = Math.floor((e.clientY - rect.top) / zoom)
      if (imgX < 0 || imgY < 0 || imgX >= image.width || imgY >= image.height) return

      const offscreen = offscreenRef.current
      if (offscreen) {
        const ctx = offscreen.getContext('2d')
        if (ctx) {
          const [r, g, b, a] = ctx.getImageData(imgX, imgY, 1, 1).data
          onColorPickConfirm?.({ r, g, b, a })
          return
        }
      }
      if (lastPickedRef.current) {
        onColorPickConfirm?.(lastPickedRef.current)
      }
    },
    [mode, zoom, image, onColorPickConfirm],
  )

  // ── inpainting mask brush ─────────────────────────────────────────────────────

  const paintOnMask = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!image || !maskCanvasRef.current) return
      const canvas = maskCanvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const rect = canvas.getBoundingClientRect()
      // Convert screen coords → image pixel coords
      const imgX = (e.clientX - rect.left) / zoom
      const imgY = (e.clientY - rect.top) / zoom
      ctx.fillStyle = 'rgba(255, 60, 60, 0.7)'
      ctx.beginPath()
      ctx.arc(imgX, imgY, brushSize / 2, 0, Math.PI * 2)
      ctx.fill()
    },
    [image, zoom, brushSize],
  )

  const handleMaskMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      isDrawingRef.current = true
      paintOnMask(e)
    },
    [paintOnMask],
  )

  const handleMaskMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return
      paintOnMask(e)
    },
    [paintOnMask],
  )

  const handleMaskMouseUp = useCallback(() => {
    isDrawingRef.current = false
  }, [])

  // ── empty state ───────────────────────────────────────────────────────────────

  if (!image) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500 select-none">
        <div
          className="flex flex-col items-center gap-4 cursor-pointer hover:text-slate-400 transition-colors"
          onClick={onOpen}
          role="button"
          aria-label="Open image"
        >
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="opacity-30"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <p className="text-sm">{t('canvas.open')}</p>
          <p className="text-xs opacity-50">{t('canvas.hint')}</p>
        </div>

        {recentFiles.length > 0 && (
          <div className="mt-2 w-72">
            <p className="text-xs text-slate-600 mb-2 text-center uppercase tracking-wider">
              {t('canvas.recent')}
            </p>
            <div className="flex flex-col gap-0.5">
              {recentFiles.map((path) => {
                const loading = loadingPath === path
                return (
                  <button
                    key={path}
                    onClick={() => {
                      setLoadingPath(path)
                      onOpenByPaths?.([path])
                    }}
                    disabled={isLoading}
                    className="text-left text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 px-3 py-1.5 rounded transition-colors truncate flex items-center gap-2 disabled:opacity-50 disabled:cursor-wait"
                    title={path}
                  >
                    {loading ? (
                      <svg
                        className="animate-spin w-3 h-3 shrink-0 text-indigo-400"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : null}
                    <span className="truncate">
                      {path.split('/').pop()}
                      <span className="text-slate-700 ml-2">{path.replace(/\/[^/]+$/, '')}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  const displayWidth = Math.round(image.width * zoom)
  const displayHeight = Math.round(image.height * zoom)
  const isEyedropper = mode === 'eyedropper'
  const isInpainting = mode === 'inpainting'

  return (
    <div
      className="flex-1 overflow-auto flex items-start justify-start bg-slate-800/50"
      style={{ cursor: 'default' }}
      onWheel={handleWheel}
    >
      <div
        className="relative m-auto"
        style={{
          width: displayWidth,
          height: displayHeight,
          flexShrink: 0,
          cursor: isEyedropper ? 'crosshair' : 'default',
        }}
        onMouseMove={isEyedropper ? handleMouseMove : undefined}
        onMouseLeave={isEyedropper ? handleMouseLeave : undefined}
        onClick={isEyedropper ? handleClick : undefined}
      >
        <img
          src={image.preview}
          alt="Editing canvas"
          width={displayWidth}
          height={displayHeight}
          className="block"
          draggable={false}
          data-testid="canvas-image"
          ref={imgCallbackRef}
          style={{ imageRendering: zoom >= 3 ? 'pixelated' : 'auto' }}
        />

        {showGrid && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: [
                'linear-gradient(rgba(128,128,128,0.25) 1px, transparent 1px)',
                'linear-gradient(90deg, rgba(128,128,128,0.25) 1px, transparent 1px)',
              ].join(','),
              backgroundSize: `${gridSize * zoom}px ${gridSize * zoom}px`,
            }}
          />
        )}

        {mode === 'cropping' && (
          <CropOverlay
            imageWidth={image.width}
            imageHeight={image.height}
            onApply={onCropApply}
            onCancel={onCropCancel}
            onCropRectChange={onCropRectChange}
          />
        )}

        {/* Inpainting mask brush canvas */}
        {isInpainting && (
          <canvas
            ref={maskCallbackRef}
            width={image.width}
            height={image.height}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: displayWidth,
              height: displayHeight,
              cursor: 'crosshair',
              touchAction: 'none',
            }}
            onMouseDown={handleMaskMouseDown}
            onMouseMove={handleMaskMouseMove}
            onMouseUp={handleMaskMouseUp}
            onMouseLeave={handleMaskMouseUp}
          />
        )}

        {/* Inpainting loading overlay */}
        {isInpainting && isLoading && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-40 select-none">
            <svg className="animate-spin w-12 h-12 text-white mb-3" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-white text-sm font-medium">{t('inp.applying')}</span>
          </div>
        )}

        {/* Magnifier — always in DOM when image loaded, shown imperatively in eyedropper mode */}
        <canvas
          ref={magnifierRef}
          className="absolute pointer-events-none z-20 rounded overflow-hidden border border-white/25 shadow-xl"
          style={{ display: 'none', imageRendering: 'pixelated' }}
        />
      </div>
    </div>
  )
}
