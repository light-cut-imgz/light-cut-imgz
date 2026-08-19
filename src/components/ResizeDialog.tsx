import { useEffect, useState } from 'react'
import { useT } from '../lib/locale'

interface Props {
  open: boolean
  originalWidth: number
  originalHeight: number
  isLoading: boolean
  onResize: (width: number, height: number) => void
  onClose: () => void
}

export function ResizeDialog({
  open,
  originalWidth,
  originalHeight,
  isLoading,
  onResize,
  onClose,
}: Props) {
  const [width, setWidth] = useState(originalWidth)
  const [height, setHeight] = useState(originalHeight)
  const [lockRatio, setLockRatio] = useState(true)

  useEffect(() => {
    if (open) {
      setWidth(originalWidth)
      setHeight(originalHeight)
      setLockRatio(true)
    }
  }, [open, originalWidth, originalHeight])

  const t = useT()

  if (!open) return null

  const ratio = originalWidth / originalHeight

  const handleWidthChange = (v: number) => {
    setWidth(v)
    if (lockRatio) setHeight(Math.max(1, Math.round(v / ratio)))
  }

  const handleHeightChange = (v: number) => {
    setHeight(v)
    if (lockRatio) setWidth(Math.max(1, Math.round(v * ratio)))
  }

  const valid = width >= 1 && height >= 1 && Number.isFinite(width) && Number.isFinite(height)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-6 w-80 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-white font-semibold text-base">{t('rsz.title')}</h2>

        <p className="text-slate-400 text-xs -mt-2">
          {t('rsz.original', { w: String(originalWidth), h: String(originalHeight) })}
        </p>

        <div className="flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3">
            <span className="text-slate-300 text-sm w-16">{t('rsz.width')}</span>
            <div className="flex items-center gap-1 flex-1">
              <input
                type="number"
                min={1}
                value={width}
                onChange={(e) => handleWidthChange(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded px-2 py-1.5 text-right"
              />
              <span className="text-slate-400 text-xs w-5">px</span>
            </div>
          </label>

          <div className="flex items-center justify-between gap-3">
            <span className="w-16" />
            <button
              onClick={() => setLockRatio((v) => !v)}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors
                ${lockRatio ? 'text-indigo-400 bg-indigo-950/50' : 'text-slate-500 hover:text-slate-300'}`}
              title={lockRatio ? t('rsz.locked') : t('rsz.free')}
            >
              {lockRatio ? <LockIcon /> : <UnlockIcon />}
              {lockRatio ? t('rsz.locked') : t('rsz.free')}
            </button>
          </div>

          <label className="flex items-center justify-between gap-3">
            <span className="text-slate-300 text-sm w-16">{t('rsz.height')}</span>
            <div className="flex items-center gap-1 flex-1">
              <input
                type="number"
                min={1}
                value={height}
                onChange={(e) => handleHeightChange(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded px-2 py-1.5 text-right"
              />
              <span className="text-slate-400 text-xs w-5">px</span>
            </div>
          </label>
        </div>

        <div className="flex gap-2 justify-end mt-1">
          <button onClick={onClose} className="toolbar-btn px-4 py-1.5 text-sm">
            {t('rsz.cancel')}
          </button>
          <button
            onClick={() => valid && onResize(width, height)}
            disabled={!valid || isLoading}
            className="toolbar-btn toolbar-btn--primary px-4 py-1.5 text-sm"
          >
            {isLoading ? t('rsz.resizing') : t('rsz.resize')}
          </button>
        </div>
      </div>
    </div>
  )
}

function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function UnlockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  )
}
