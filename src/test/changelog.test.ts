import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseChangelog, parseSections, releaseNotesSections } from '../lib/changelog'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('parseSections', () => {
  it('reads titles and the items under them', () => {
    expect(parseSections('### Added\n\n- One\n- Two\n\n### Fixed\n- Three')).toEqual([
      { title: 'Added', items: ['One', 'Two'] },
      { title: 'Fixed', items: ['Three'] },
    ])
  })

  it('takes a plain line as an item of its own, under no title', () => {
    expect(parseSections('Just a note')).toEqual([{ title: '', items: ['Just a note'] }])
  })

  it('removes links and bold but keeps code', () => {
    expect(parseSections('- **Bold** and [a link](https://x.y) and `code`')[0].items).toEqual([
      'Bold and a link and `code`',
    ])
  })

  it('ignores empty input', () => {
    expect(parseSections('')).toEqual([])
    expect(parseSections('\n\n')).toEqual([])
  })
})

describe('parseChangelog', () => {
  const md =
    '# Changelog\n\nIntro\n\n## [Unreleased]\n\n## [1.2.0] - 2026-10-27\n\n### Added\n- A\n\n## [1.1.0] - 2026-10-01\n- B\n'

  it('reads the versions, their dates and their sections, as written', () => {
    expect(parseChangelog(md)).toEqual([
      { version: 'Unreleased', date: null, sections: [] },
      { version: '1.2.0', date: '2026-10-27', sections: [{ title: 'Added', items: ['A'] }] },
      { version: '1.1.0', date: '2026-10-01', sections: [{ title: '', items: ['B'] }] },
    ])
  })

  it('ignores what comes before the first version', () => {
    expect(parseChangelog('# Changelog\n\nOnly an intro')).toEqual([])
  })
})

describe('releaseNotesSections', () => {
  const notes =
    '<!-- en -->\n### Added\n- Hello\n\n<!-- fr -->\n### Ajouté\n- Bonjour\n\n---\n## Install\nstuff'

  it('picks the block of the language', () => {
    expect(releaseNotesSections(notes, 'fr')).toEqual([{ title: 'Ajouté', items: ['Bonjour'] }])
    expect(releaseNotesSections(notes, 'en')).toEqual([{ title: 'Added', items: ['Hello'] }])
  })

  it('falls back to English, then to the first block, for an unknown language', () => {
    expect(releaseNotesSections(notes, 'de')[0].items).toEqual(['Hello'])
    expect(releaseNotesSections('<!-- fr -->\n- Salut', 'de')[0].items).toEqual(['Salut'])
  })

  it('takes the whole text when there is no marker, and drops the download table', () => {
    expect(releaseNotesSections('- Plain\n\n---\n- table', 'en')).toEqual([
      { title: '', items: ['Plain'] },
    ])
  })

  it('has nothing to show without notes', () => {
    expect(releaseNotesSections(undefined, 'en')).toEqual([])
    expect(releaseNotesSections('   ', 'en')).toEqual([])
    expect(releaseNotesSections(42, 'en')).toEqual([])
  })
})

describe('the changelog files', () => {
  const en = parseChangelog(read('CHANGELOG.md'))
  const fr = parseChangelog(read('CHANGELOG.fr.md'))

  it('list the same versions, in the same order, on the same dates', () => {
    expect(fr.map((e) => [e.version, e.date])).toEqual(en.map((e) => [e.version, e.date]))
  })

  it('have as many sections and items in each language', () => {
    for (const [i, entry] of en.entries()) {
      expect(
        fr[i].sections.map((s) => s.items.length),
        entry.version,
      ).toEqual(entry.sections.map((s) => s.items.length))
    }
  })

  it('have something to say for every released version', () => {
    for (const entry of [...en, ...fr].filter((e) => e.version !== 'Unreleased')) {
      expect(
        entry.sections.some((s) => s.items.length > 0),
        entry.version,
      ).toBe(true)
      expect(entry.date, entry.version).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('open with the version of the app or with what is coming next', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string }
    expect(['Unreleased', pkg.version]).toContain(en[0].version)
    expect(en.map((e) => e.version)).toContain(pkg.version)
  })
})
