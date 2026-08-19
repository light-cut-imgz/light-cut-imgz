import { useEffect, useState } from 'react'
import type { Anchor } from '../lib/tauri'
import { useT } from '../lib/locale'

interface Props {
  open: boolean
  originalWidth: number
  originalHeight: number
  isLoading: boolean
  onResize: (
    width: number,
    height: number,
    anchor: Anchor,
    fill: [number, number, number, number],
  ) => void
  onClose: () => void
}

const ANCHORS: Anchor[][] = [
  ['top-left', 'top-center', 'top-right'],
  ['middle-left', 'center', 'middle-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
]

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function UnlockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  )
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function CanvasResizeDialog({
  open,
  originalWidth,
  originalHeight,
  isLoading,
  onResize,
  onClose,
}: Props) {
  const [width, setWidth] = useState(originalWidth)
  const [height, setHeight] = useState(originalHeight)
  const [lockRatio, setLockRatio] = useState(false)
  const [anchor, setAnchor] = useState<Anchor>('center')
  const [fillHex, setFillHex] = useState('#ffffff')
  const [transparent, setTransparent] = useState(false)

  useEffect(() => {
    if (open) {
      setWidth(originalWidth)
      setHeight(originalHeight)
      setLockRatio(false)
      setAnchor('center')
      setFillHex('#ffffff')
      setTransparent(false)
    }
  }, [open, originalWidth, originalHeight])

  const ratio = originalWidth / (originalHeight || 1)

  const handleWidthChange = (raw: number) => {
    if (isNaN(raw)) return
    setWidth(raw)
    if (lockRatio && raw > 0) setHeight(Math.round(raw / ratio))
  }

  const handleWidthBlur = () => {
    const w = Math.max(originalWidth, width || originalWidth)
    setWidth(w)
    if (lockRatio) setHeight(Math.max(originalHeight, Math.round(w / ratio)))
  }

  const handleHeightChange = (raw: number) => {
    if (isNaN(raw)) return
    setHeight(raw)
    if (lockRatio && raw > 0) setWidth(Math.round(raw * ratio))
  }

  const handleHeightBlur = () => {
    const h = Math.max(originalHeight, height || originalHeight)
    setHeight(h)
    if (lockRatio) setWidth(Math.max(originalWidth, Math.round(h * ratio)))
  }

  const t = useT()

  if (!open) return null

  const valid = width >= originalWidth && height >= originalHeight && width >= 1 && height >= 1

  const handleConfirm = () => {
    if (!valid) return
    const [r, g, b] = hexToRgb(fillHex)
    const a = transparent ? 0 : 255
    onResize(width, height, anchor, [r, g, b, a])
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-6 w-96 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-white font-semibold text-base">{t('cvs.title')}</h2>
        <p className="text-slate-400 text-xs -mt-2">
          {t('cvs.hint', { w: String(originalWidth), h: String(originalHeight) })}
        </p>

        {/* Size inputs */}
        <div className="flex gap-2 items-center">
          <div className="flex flex-col gap-3 flex-1">
            <label className="flex items-center justify-between gap-3">
              <span className="text-slate-300 text-sm w-16">{t('cvs.width')}</span>
              <div className="flex items-center gap-1 flex-1">
                <input
                  type="number"
                  min={originalWidth}
                  value={width}
                  onChange={(e) => handleWidthChange(parseInt(e.target.value))}
                  onBlur={handleWidthBlur}
                  className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded px-2 py-1.5 text-right"
                />
                <span className="text-slate-400 text-xs w-5">px</span>
              </div>
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-slate-300 text-sm w-16">{t('cvs.height')}</span>
              <div className="flex items-center gap-1 flex-1">
                <input
                  type="number"
                  min={originalHeight}
                  value={height}
                  onChange={(e) => handleHeightChange(parseInt(e.target.value))}
                  onBlur={handleHeightBlur}
                  className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded px-2 py-1.5 text-right"
                />
                <span className="text-slate-400 text-xs w-5">px</span>
              </div>
            </label>
          </div>

          {/* Lock ratio */}
          <button
            type="button"
            onClick={() => setLockRatio((l) => !l)}
            title={lockRatio ? t('cvs.unlock') : t('cvs.lock')}
            className={`w-7 h-7 rounded flex items-center justify-center transition-colors shrink-0
              ${lockRatio ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
          >
            {lockRatio ? <LockIcon /> : <UnlockIcon />}
          </button>
        </div>

        {/* Anchor picker */}
        <div className="flex items-center gap-4">
          <span className="text-slate-300 text-sm w-16 shrink-0">{t('cvs.anchor')}</span>
          <div className="grid grid-cols-3 gap-1">
            {ANCHORS.map((row) =>
              row.map((a) => (
                <button
                  key={a}
                  onClick={() => setAnchor(a)}
                  title={a}
                  className={`w-7 h-7 rounded flex items-center justify-center transition-colors
                    ${anchor === a ? 'bg-indigo-600' : 'bg-slate-700 hover:bg-slate-600'}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${anchor === a ? 'bg-white' : 'bg-slate-400'}`}
                  />
                </button>
              )),
            )}
          </div>
          <span className="text-slate-400 text-xs">{anchor.replace('-', ' ')}</span>
        </div>

        {/* Fill color */}
        <div className="flex items-center gap-4">
          <span className="text-slate-300 text-sm w-16 shrink-0">{t('cvs.fill')}</span>
          <input
            type="color"
            value={fillHex}
            disabled={transparent}
            onChange={(e) => setFillHex(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border border-slate-600 disabled:opacity-30"
          />
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
              className="accent-indigo-500"
            />
            {t('cvs.transparent')}
          </label>
        </div>

        <div className="flex gap-2 justify-end mt-1">
          <button onClick={onClose} className="toolbar-btn px-4 py-1.5 text-sm">
            {t('cvs.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!valid || isLoading}
            className="toolbar-btn toolbar-btn--primary px-4 py-1.5 text-sm"
          >
            {isLoading ? t('cvs.applying') : t('cvs.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
