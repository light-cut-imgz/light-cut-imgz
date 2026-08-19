import type { ExportFormat } from '../types'
import type { Lang } from './i18n'

export interface Prefs {
  defaultExportFormat: ExportFormat
  defaultJpegQuality: number
  gridSize: number
  language?: Lang
}

const KEY = 'lciz-prefs'
const DEFAULTS: Prefs = {
  defaultExportFormat: 'png',
  defaultJpegQuality: 90,
  gridSize: 50,
  language: 'en',
}

export function loadPrefs(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

export function savePrefs(prefs: Prefs): void {
  localStorage.setItem(KEY, JSON.stringify(prefs))
}
