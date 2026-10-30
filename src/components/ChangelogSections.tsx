import type { ReactNode } from 'react'
import type { ChangelogSection } from '../lib/changelog'

/** Les accents graves deviennent du code ; rien d'autre n'est interprété, jamais de HTML. */
function inline(text: string): ReactNode[] {
  return text
    .split(/(`[^`]+`)/g)
    .filter(Boolean)
    .map((part, i) =>
      part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
        <code key={i}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    )
}

/** Les sections d'une version ; la mise en forme est celle de `.cl-entry` (styles.css). */
export function ChangelogSections({ sections }: { sections: ChangelogSection[] }) {
  return (
    <>
      {sections.map((section, i) => (
        <div key={i}>
          {section.title && <h4>{section.title}</h4>}
          <ul>
            {section.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}
