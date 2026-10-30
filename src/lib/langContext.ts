import { createContext, useContext } from 'react'
import type { Lang } from './i18n'
import { getT } from './i18n'

export const LangCtx = createContext<Lang>('en')

export function useT() {
  return getT(useContext(LangCtx))
}
