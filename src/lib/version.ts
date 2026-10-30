import pkg from '../../package.json'

/** La version de l'application, celle de `package.json` (alignée sur les manifestes Tauri). */
export const APP_VERSION: string = pkg.version

/** Dernière version dont l'utilisateur a vu les nouveautés. */
export const LAST_SEEN_KEY = 'lciz-last-seen-version'
