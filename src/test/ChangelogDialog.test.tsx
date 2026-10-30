import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChangelogDialog } from '../components/ChangelogDialog'
import { LangProvider } from '../lib/locale'
import type { Lang } from '../lib/i18n'

function renderDialog(lang: Lang, open = true, onClose = vi.fn()) {
  render(
    <LangProvider lang={lang}>
      <ChangelogDialog open={open} lang={lang} onClose={onClose} />
    </LangProvider>,
  )
  return { onClose }
}

describe('ChangelogDialog', () => {
  it('shows nothing while closed', () => {
    renderDialog('en', false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lists the versions in English, the newest first', () => {
    renderDialog('en')

    expect(screen.getByRole('dialog', { name: 'What’s new' })).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    // « Coming next » n'apparaît que s'il y a des changements en attente.
    expect(headings[0]).toMatch(/^(Coming next|v\d)/)
    expect(headings.some((h) => h?.startsWith('v1.0.0'))).toBe(true)
    expect(screen.getAllByText('Added').length).toBeGreaterThan(0)
  })

  it('speaks French when the interface does', () => {
    renderDialog('fr')

    expect(screen.getByRole('dialog', { name: 'Nouveautés' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 })[0]).toHaveTextContent(/^(À venir|v\d)/)
    expect(screen.getAllByText('Ajouté').length).toBeGreaterThan(0)
  })

  it('has the structure of the other apps: a title, a cross, the versions, a close button', () => {
    renderDialog('en')

    const dialog = screen.getByRole('dialog', { name: 'What’s new' })
    expect(dialog).toHaveClass('cl-card')
    expect(dialog.querySelector('.cl-header .cl-title')).toHaveTextContent('What’s new')
    expect(dialog.querySelector('.cl-header .cl-close')).toHaveTextContent('×')
    expect(dialog.querySelectorAll('.cl-body .cl-entry').length).toBeGreaterThanOrEqual(1)
    expect(dialog.querySelector('.cl-actions .btn-primary')).toHaveTextContent('Close')
  })

  it('shows the date of each released version next to it', () => {
    renderDialog('en')

    expect(screen.getByText('2026-10-30')).toHaveClass('cl-date')
  })

  it('closes with its cross, its button and Escape', async () => {
    const { onClose } = renderDialog('en')

    await userEvent.click(document.querySelector('.cl-close') as Element)
    await userEvent.click(document.querySelector('.cl-actions .btn-primary') as Element)
    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
