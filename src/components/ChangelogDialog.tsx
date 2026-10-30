import { useMemo } from 'react'
import changelogEn from '../../CHANGELOG.md?raw'
import changelogFr from '../../CHANGELOG.fr.md?raw'
import { parseChangelog } from '../lib/changelog'
import type { Lang } from '../lib/i18n'
import { useT } from '../lib/langContext'
import { ChangelogSections } from './ChangelogSections'
import { Modal } from './ui/Modal'

interface Props {
  open: boolean
  lang: Lang
  onClose: () => void
}

/**
 * « Nouveautés » : la même fenêtre que dans LightCutVidz et LightCutSoundz — le titre au
 * centre, une croix, les versions de la plus récente à la plus ancienne dans la langue de
 * l'interface, et un bouton Fermer.
 */
export function ChangelogDialog({ open, lang, onClose }: Props) {
  const t = useT()
  const entries = useMemo(
    () =>
      parseChangelog(lang === 'fr' ? changelogFr : changelogEn)
        // Une rubrique « à venir » vide n'a rien à montrer.
        .filter((e) => e.sections.some((s) => s.items.length > 0)),
    [lang],
  )
  if (!open) return null

  return (
    <Modal title={t('changelog.title')} className="cl-card changelog-card" onClose={onClose}>
      <div className="cl-header">
        <div className="cl-title">{t('changelog.title')}</div>
        <button className="cl-close" onClick={onClose} aria-label={t('about.close')}>
          ×
        </button>
      </div>
      <div className="cl-body" data-testid="changelog-body">
        {entries.length === 0 && <p className="cl-empty">{t('changelog.empty')}</p>}
        {entries.map((entry) => (
          <section key={entry.version} className="cl-entry">
            <h3>
              {entry.version === 'Unreleased' ? t('changelog.unreleased') : `v${entry.version}`}
              {entry.date && <small className="cl-date">{entry.date}</small>}
            </h3>
            <ChangelogSections sections={entry.sections} />
          </section>
        ))}
      </div>
      <div className="cl-actions">
        <button className="btn-primary" onClick={onClose} autoFocus>
          {t('about.close')}
        </button>
      </div>
    </Modal>
  )
}
