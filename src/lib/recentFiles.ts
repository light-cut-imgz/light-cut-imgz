const KEY = 'lciz-recent'
const MAX = 10

export function getRecentFiles(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function addRecentFile(path: string): void {
  const list = getRecentFiles().filter((p) => p !== path)
  list.unshift(path)
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
}

export function clearRecentFiles(): void {
  localStorage.removeItem(KEY)
}
