import { useState } from 'react'
import { clearRecentFiles } from '../lib/recentFiles'
import type { Prefs } from '../lib/prefs'
import type { ExportFormat } from '../types'
import { useT } from '../lib/locale'

interface Props {
  open: boolean
  prefs: Prefs
  onSave: (p: Prefs) => void
  onClose: () => void
}

const FORMATS: Array<{ value: ExportFormat; label: string }> = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
  { value: 'bmp', label: 'BMP' },
  { value: 'tiff', label: 'TIFF' },
]

const GRID_SIZES = [10, 25, 50, 100]

export function PrefsDialog({ open, prefs, onSave, onClose }: Props) {
  const t = useT()
  const [local, setLocal] = useState<Prefs>(prefs)

  if (!open) return null

  const handleSave = () => {
    onSave(local)
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
        <h2 className="text-white font-semibold text-base">{t('pref.title')}</h2>

        {/* Default export format */}
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">{t('pref.format')}</p>
          <div className="grid grid-cols-5 gap-1.5">
            {FORMATS.map((f) => (
              <label
                key={f.value}
                className={`cursor-pointer text-center py-1.5 rounded text-sm border transition-colors ${
                  local.defaultExportFormat === f.value
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name="pref-format"
                  value={f.value}
                  checked={local.defaultExportFormat === f.value}
                  onChange={() => setLocal((p) => ({ ...p, defaultExportFormat: f.value }))}
                  className="sr-only"
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        {/* Default JPEG quality */}
        <div>
          <label className="text-xs text-slate-400 uppercase tracking-wider block mb-2">
            {t('pref.quality', { n: String(local.defaultJpegQuality) })}
          </label>
          <input
            type="range"
            min="1"
            max="100"
            value={local.defaultJpegQuality}
            onChange={(e) =>
              setLocal((p) => ({ ...p, defaultJpegQuality: Number(e.target.value) }))
            }
            className="w-full accent-indigo-500"
          />
        </div>

        {/* Grid size */}
        <div className="flex items-center gap-3">
          <span className="text-slate-300 text-sm w-24 shrink-0">{t('pref.grid')}</span>
          <select
            value={local.gridSize}
            onChange={(e) => setLocal((p) => ({ ...p, gridSize: Number(e.target.value) }))}
            className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded px-2 py-1.5"
          >
            {GRID_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} px
              </option>
            ))}
          </select>
        </div>

        {/* Clear recent files */}
        <div className="flex items-center gap-3">
          <span className="text-slate-300 text-sm flex-1">{t('pref.recent')}</span>
          <button
            onClick={() => clearRecentFiles()}
            className="toolbar-btn px-3 py-1 text-xs text-red-400 hover:text-red-300"
          >
            {t('pref.clear')}
          </button>
        </div>

        <div className="flex gap-2 justify-end mt-1">
          <button onClick={onClose} className="toolbar-btn px-4 py-1.5 text-sm">
            {t('pref.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="toolbar-btn toolbar-btn--primary px-4 py-1.5 text-sm"
          >
            {t('pref.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
