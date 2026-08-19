import type { CropRect } from '../types'
import { useT } from '../lib/locale'

interface CropControlsProps {
  cropRect: CropRect
  isLoading: boolean
  onApply: () => void
  onCancel: () => void
}

export function CropControls({ cropRect, isLoading, onApply, onCancel }: CropControlsProps) {
  const t = useT()
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-slate-800 border-b border-slate-700 shrink-0">
      <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
        {t('toolbar.crop')}
      </span>
      <span className="text-xs text-slate-500 bg-slate-700/60 px-2 py-0.5 rounded font-mono">
        {cropRect.width} × {cropRect.height}
      </span>
      <span className="text-xs text-slate-600">{t('crop.hint')}</span>
      <div className="flex-1" />
      <button onClick={onCancel} disabled={isLoading} className="toolbar-btn">
        {t('crop.cancel')}
      </button>
      <button
        onClick={onApply}
        disabled={isLoading || cropRect.width < 1 || cropRect.height < 1}
        className="toolbar-btn toolbar-btn--primary"
      >
        {t('crop.apply')}
      </button>
    </div>
  )
}
