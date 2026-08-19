import { useState } from 'react'
import type { ExifField } from '../lib/tauri'
import { useT } from '../lib/locale'

interface Props {
  tabId: string | null
  fields: ExifField[]
  isLoading: boolean
  onStrip: () => Promise<void>
}

export function ExifPanel({ tabId, fields, isLoading, onStrip }: Props) {
  const t = useT()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [stripping, setStripping] = useState(false)

  const toggleHide = (tag: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const hideAll = () => setHidden(new Set(fields.map((f) => f.tag)))
  const showAll = () => setHidden(new Set())

  const handleStrip = async () => {
    if (!tabId || stripping) return
    setStripping(true)
    try {
      // onClick can't await us, so a rejection here would escape as an
      // unhandled rejection. The parent already surfaces the error.
      await onStrip()
    } catch {
      /* reported upstream */
    } finally {
      setStripping(false)
    }
  }

  if (isLoading) {
    return (
      <div className="w-56 border-l border-slate-700 bg-slate-900 flex items-center justify-center text-slate-500 text-xs">
        {t('exif.loading')}
      </div>
    )
  }

  if (fields.length === 0) {
    return (
      <div className="w-56 border-l border-slate-700 bg-slate-900 flex items-center justify-center text-slate-500 text-xs px-4 text-center">
        {t('exif.empty')}
      </div>
    )
  }

  const allHidden = hidden.size === fields.length

  return (
    <div className="w-56 border-l border-slate-700 bg-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-700 flex items-center gap-1">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex-1">
          EXIF
        </span>
        <button
          onClick={allHidden ? showAll : hideAll}
          title={allHidden ? t('exif.showall') : t('exif.hideall')}
          className="text-slate-500 hover:text-slate-300 text-xs px-1 transition-colors"
        >
          {allHidden ? t('exif.showall') : t('exif.hideall')}
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto">
        {fields.map((f) => {
          const isHidden = hidden.has(f.tag)
          return (
            <div
              key={f.tag}
              className={`px-3 py-1.5 border-b border-slate-800 last:border-0 flex gap-1 items-start group
                ${isHidden ? 'opacity-40' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div
                  className={`text-slate-400 text-xs leading-tight ${isHidden ? 'line-through' : ''}`}
                >
                  {f.tag}
                </div>
                <div
                  className={`text-slate-200 text-xs leading-snug break-words ${isHidden ? 'line-through' : ''}`}
                >
                  {f.value}
                </div>
              </div>
              <button
                onClick={() => toggleHide(f.tag)}
                title={isHidden ? t('exif.restore') : t('exif.mark')}
                className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all text-xs w-4 h-4 flex items-center justify-center"
              >
                {isHidden ? '↩' : '×'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-700 px-3 py-2 flex flex-col gap-1.5">
        <p className="text-slate-500 text-xs leading-snug">{t('exif.lossless')}</p>
        <button
          onClick={handleStrip}
          disabled={!tabId || stripping}
          className="toolbar-btn toolbar-btn--primary w-full py-1.5 text-xs justify-center"
        >
          {stripping ? t('exif.saving') : t('exif.strip')}
        </button>
      </div>
    </div>
  )
}
