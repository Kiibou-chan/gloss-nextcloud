import type { Ids } from '../../app/ports'

function randomId(alphabet: string, length: number): string {
  const limit = 256 - (256 % alphabet.length)
  let id = ''
  while (id.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length))
    for (const byte of bytes) {
      if (byte < limit) id += alphabet[byte % alphabet.length]!
      if (id.length === length) break
    }
  }
  return id
}
export const browserIds: Ids = {
  item: () => randomId('abcdefghijklmnopqrstuvwxyz0123456789', 10),
  key: () => randomId('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 16),
}
