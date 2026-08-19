import { useState } from 'react'
import { useT } from '../lib/locale'

interface RotationControlsProps {
  onRotate: (degrees: number) => void
  onCancel: () => void
  isLoading: boolean
}

export function RotationControls({ onRotate, onCancel, isLoading }: RotationControlsProps) {
  const t = useT()
  const [degrees, setDegrees] = useState(0)

  const handleDegreeChange = (value: number) => {
    setDegrees(Math.max(-180, Math.min(180, value)))
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-slate-800 border-t border-slate-700">
      <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
        {t('toolbar.rotate')}
      </span>

      <button
        onClick={() => onRotate(-90)}
        disabled={isLoading}
        className="toolbar-btn"
        title={t('rot.ccw')}
        aria-label={t('rot.ccw')}
      >
        <RotateCcwIcon />
        −90°
      </button>

      <button
        onClick={() => onRotate(90)}
        disabled={isLoading}
        className="toolbar-btn"
        title={t('rot.cw')}
        aria-label={t('rot.cw')}
      >
        <RotateCwIcon />
        +90°
      </button>

      <div className="w-px h-5 bg-slate-600" />

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <span>{t('rot.angle')}</span>
        <input
          type="range"
          min="-180"
          max="180"
          step="1"
          value={degrees}
          onChange={(e) => handleDegreeChange(Number(e.target.value))}
          className="w-32 accent-indigo-500"
          aria-label="Rotation angle slider"
        />
        <input
          type="number"
          min="-180"
          max="180"
          value={degrees}
          onChange={(e) => handleDegreeChange(Number(e.target.value))}
          className="w-16 px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white text-center"
          aria-label="Rotation degrees"
        />
        <span className="text-slate-400">°</span>
      </label>

      <button
        onClick={() => onRotate(degrees)}
        disabled={isLoading || degrees === 0}
        className="toolbar-btn toolbar-btn--primary"
      >
        {t('rot.apply')}
      </button>

      <button onClick={onCancel} disabled={isLoading} className="toolbar-btn">
        {t('rot.cancel')}
      </button>
    </div>
  )
}

function RotateCcwIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  )
}

function RotateCwIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}
