/** UTF-8 encoding replaces lone surrogates with the three-byte replacement character. */
export function utf8Length(text: string): number {
  let bytes = 0
  for (const character of text) {
    const point = character.codePointAt(0)!
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4
  }
  return bytes
}

/** URLSearchParams form encoding: spaces and safe ASCII use one byte; other bytes use %HH. */
export function reviewUploadLength(key: string, review: string, baseRevision: number): number {
  const formLength = (value: string) => {
    let length = 0
    for (const c of value) length += /^[a-zA-Z0-9*_. -]$/.test(c) ? 1 : utf8Length(c) * 3
    return length
  }
  return 26 + formLength(key) + formLength(review) + formLength(String(baseRevision))
}
