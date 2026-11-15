import type { Clipboard } from '../../app/ports'
export const browserClipboard: Clipboard = {
  async write(text) {
    try { await navigator.clipboard.writeText(text); return true } catch { return false }
  },
}
