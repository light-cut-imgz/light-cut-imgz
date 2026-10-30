import { useState } from 'react'
import { releaseNotesSections } from '../lib/changelog'
import type { Lang } from '../lib/i18n'
import { useT } from '../lib/langContext'
import { ChangelogSections } from './ChangelogSections'

export interface PendingUpdate {
  version: string
  /** Notes de la version : un bloc par langue, `<!-- en -->` / `<!-- fr -->`. */
  notes: string | undefined
}

interface Props {
  update: PendingUpdate
  lang: Lang
  onInstall: () => void
  onLater: () => void
}

/**
 * Une mise à jour disponible, avec ses notes dans la langue de l'interface avant qu'on
 * l'installe : les installer d'emblée ne laisserait pas voir ce qu'elles changent.
 */
export function UpdateBanner({ update, lang, onInstall, onLater }: Props) {
  const t = useT()
  const [showNotes, setShowNotes] = useState(false)
  const sections = releaseNotesSections(update.notes, lang)

  return (
    <div
      role="status"
      className="px-4 py-2 bg-indigo-900/60 border-b border-indigo-500 text-slate-100 text-sm"
    >
      <div className="flex items-center gap-3">
        <span className="flex-1">{t('update.available', { v: update.version })}</span>
        {sections.length > 0 && (
          <button
            className="toolbar-btn"
            aria-expanded={showNotes}
            onClick={() => setShowNotes((v) => !v)}
          >
            {showNotes ? t('update.hide-notes') : t('update.notes')}
          </button>
        )}
        <button className="toolbar-btn toolbar-btn--primary" onClick={onInstall}>
          {t('update.install')}
        </button>
        <button className="toolbar-btn" onClick={onLater}>
          {t('update.later')}
        </button>
      </div>
      {showNotes && sections.length > 0 && (
        <div className="cl-entry mt-2 max-h-56 overflow-y-auto pt-2 border-t border-slate-600 text-sm">
          <ChangelogSections sections={sections} />
        </div>
      )}
    </div>
  )
}
