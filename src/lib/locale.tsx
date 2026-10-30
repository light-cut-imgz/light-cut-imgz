import React from 'react'
import type { Lang } from './i18n'
import { LangCtx } from './langContext'

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangCtx.Provider value={lang}>{children}</LangCtx.Provider>
}
