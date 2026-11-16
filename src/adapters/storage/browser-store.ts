import type { Backup, BackupStore } from '../../app/ports'

function isBackup(value: unknown): value is Backup {
  if (!value || typeof value !== 'object') return false
  const b = value as Partial<Backup>
  return typeof b.review === 'string' && Number.isInteger(b.revision) && b.revision! >= 0
    && typeof b.saved === 'boolean' && typeof b.dirty === 'boolean' && typeof b.at === 'string'
    && (b.pending === null || (typeof b.pending === 'object' && b.pending !== undefined
      && typeof b.pending.body === 'string' && Number.isInteger(b.pending.revision) && b.pending.revision >= 0))
}

export function createBrowserStore(shareToken: string): BackupStore {
  const base = location.pathname.replace(/\/$/, '')
  const backupKey = (key: string) => `gloss-review:${shareToken}:${key}`
  const get = (key: string): string | null => {
    try { return localStorage.getItem(key) } catch { return null }
  }
  const put = (key: string, value: string): boolean => {
    try { localStorage.setItem(key, value); return true } catch { return false }
  }
  const preference = (prefix: string): string | null => {
    const key = prefix + shareToken, current = get(key)
    if (current !== null) return current
    if (!base.endsWith('/' + shareToken)) return null
    const legacy = get(prefix + base)
    if (legacy !== null && put(key, legacy)) {
      try { localStorage.removeItem(prefix + base) } catch { /* Token preference is already stored. */ }
    }
    return legacy
  }
  const read = (key: string): Backup | null => {
    try {
      const value: unknown = JSON.parse(get(key) ?? 'null')
      if (!isBackup(value)) return null
      const { refusal: _ignored, ...backup } = value as Backup & { refusal?: unknown }
      return backup
    } catch { return null }
  }
  return {
    rememberedKey: () => preference('gloss-review-id:'),
    remember: key => { put('gloss-review-id:' + shareToken, key) },
    read: key => read(backupKey(key)),
    write: (key, backup) => put(backupKey(key), JSON.stringify(backup)),
    keepConflict: (key, backup) => { put(backupKey(key) + ':conflict', JSON.stringify(backup)) },
    readConflict: key => read(backupKey(key) + ':conflict'),
    view() {
      const value = preference('gloss-review-view:')
      return value === 'editor' || value === 'pdf' || value === 'both' ? value : null
    },
    setView: view => { put('gloss-review-view:' + shareToken, view) },
    pdfLook() {
      const value = preference('gloss-review-pdf-look:')
      return value === 'original' || value === 'changes' || value === 'new' ? value : null
    },
    setPdfLook: look => { put('gloss-review-pdf-look:' + shareToken, look) },
  }
}
