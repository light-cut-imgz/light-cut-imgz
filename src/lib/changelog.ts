// Le changelog, lu par l'application : la boîte « Nouveautés » et les notes affichées
// avant une mise à jour. Sans accès au DOM, pour être testé sans navigateur.

export interface ChangelogSection {
  title: string
  items: string[]
}

export interface ChangelogEntry {
  version: string
  date: string | null
  sections: ChangelogSection[]
}

/** Liens et gras retirés ; les accents graves sont laissés au rendu. */
function plainMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .trim()
}

/**
 * Les titres `### Titre` et les lignes `- élément` qui les suivent. Une ligne qui n'est ni
 * l'un ni l'autre est prise pour un élément, pour qu'une note écrite en texte simple ne
 * se perde pas.
 */
export function parseSections(markdown: string): ChangelogSection[] {
  const sections: ChangelogSection[] = []
  let current: ChangelogSection | null = null
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const heading = /^#{3,}\s+(.*)$/.exec(line)
    if (heading) {
      current = { title: plainMarkdown(heading[1]), items: [] }
      sections.push(current)
      continue
    }
    if (!current) {
      current = { title: '', items: [] }
      sections.push(current)
    }
    current.items.push(plainMarkdown(line.replace(/^[-*]\s+/, '')))
  }
  return sections
}

/**
 * Un fichier de changelog en `[{ version, date, sections }]`, dans l'ordre où il est écrit
 * (le plus récent d'abord). Les entrées sont les titres `## [version] - date` ; ce qui
 * précède le premier (titre, introduction) est ignoré.
 */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let current: { version: string; date: string | null } | null = null
  let body: string[] = []
  const flush = () => {
    if (current) entries.push({ ...current, sections: parseSections(body.join('\n')) })
    body = []
  }
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^##\s+\[([^\]]+)\](?:\s*-\s*(\S+))?/.exec(line)
    if (heading) {
      flush()
      current = { version: heading[1], date: heading[2] ?? null }
    } else if (current) {
      body.push(line)
    }
  }
  flush()
  return entries
}

/**
 * Les sections des notes d'une version dans la langue `lang`. Les notes viennent de
 * l'updater en un bloc par langue, introduit par `<!-- en -->` / `<!-- fr -->` ; sans
 * marqueur, tout le texte est pris, et une langue absente retombe sur le premier bloc.
 * Tout ce qui suit une ligne `---` (le tableau de téléchargement que la page de release
 * ajoute) est écarté.
 */
export function releaseNotesSections(notes: unknown, lang: string): ChangelogSection[] {
  if (typeof notes !== 'string' || !notes.trim()) return []
  const parts = notes.split(/<!--\s*([a-z]{2})\s*-->/i)
  let text = notes
  if (parts.length > 1) {
    const blocks: Record<string, string> = {}
    for (let i = 1; i < parts.length; i += 2) blocks[parts[i].toLowerCase()] = parts[i + 1]
    text = blocks[lang] ?? blocks.en ?? Object.values(blocks)[0]
  }
  return parseSections(text.split(/^\s*---+\s*$/m)[0])
}
