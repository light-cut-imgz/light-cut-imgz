import React, { createContext, useContext } from 'react'
import type { Lang } from './i18n'
import { getT } from './i18n'

const LangCtx = createContext<Lang>('en')

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangCtx.Provider value={lang}>{children}</LangCtx.Provider>
}

export function useT() {
  return getT(useContext(LangCtx))
}
