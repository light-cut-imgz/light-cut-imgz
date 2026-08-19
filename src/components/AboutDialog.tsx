import { useT } from '../lib/locale'

interface Props {
  open: boolean
  version: string
  onClose: () => void
}

export function AboutDialog({ open, version, onClose }: Props) {
  const t = useT()
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-8 w-80 flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-2xl font-bold tracking-tight text-white">
          light-cut-img<span className="text-blue-400">Z</span>
        </div>

        <div className="text-slate-400 text-sm text-center">
          {t('about.tagline')}
          <br />
          {t('about.features')}
        </div>

        <div className="text-slate-500 text-xs">{t('about.version', { v: version })}</div>

        <button onClick={onClose} className="mt-2 toolbar-btn px-5 py-1.5 text-sm" autoFocus>
          {t('about.close')}
        </button>
      </div>
    </div>
  )
}
