import { useT } from '../lib/langContext'
import { Modal } from './ui/Modal'

interface Props {
  open: boolean
  version: string
  onClose: () => void
}

/** « À propos » : la même carte que dans LightCutVidz et LightCutSoundz. */
export function AboutDialog({ open, version, onClose }: Props) {
  const t = useT()
  if (!open) return null

  return (
    <Modal title={t('about.title')} className="cl-card about-card" onClose={onClose}>
      <div className="cl-title">{t('about.title')}</div>
      <div className="about-tagline">{t('about.tagline')}</div>
      <div className="about-version">{t('about.version', { v: version })}</div>
      <div className="about-licenses">{t('about.licenses')}</div>
      <button className="btn-primary about-close" onClick={onClose} autoFocus>
        {t('about.close')}
      </button>
    </Modal>
  )
}
