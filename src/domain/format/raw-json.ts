import type { Item } from '../review/model'

const originals = new WeakMap<Item, string>()

/** Split a validated JSON container without re-encoding its values. */
export function rawValues(json: string): { key: string; raw: string }[] {
  const values: { key: string; raw: string }[] = []
  let i = 0
  const space = () => { while (/\s/.test(json[i] ?? '') && i < json.length) i++ }
  const end = () => {
    const start = i
    let depth = 0, quoted = false, escaped = false
    for (; i < json.length; i++) {
      const c = json[i]!
      if (quoted) {
        if (escaped) escaped = false
        else if (c === '\\') escaped = true
        else if (c === '"') quoted = false
      } else if (c === '"') quoted = true
      else if (c === '{' || c === '[') depth++
      else if (c === '}' || c === ']') { if (!depth) break; depth-- }
      else if ((c === ',' || c === ':') && !depth) break
    }
    return json.slice(start, i).trimEnd()
  }
  space()
  const object = json[i++] === '{'
  for (;;) {
    space()
    if (i >= json.length || json[i] === '}' || json[i] === ']') break
    const key = object ? JSON.parse(end()) as string : String(values.length)
    if (object) { i++; space() }
    values.push({ key, raw: end() })
    if (json[i] !== ',') break
    i++
  }
  return values
}

export function rememberItems(json: string, items: readonly Item[]): void {
  const array = rawValues(json).find(v => v.key === 'items')?.raw
  if (array) rawValues(array).forEach((v, i) => { if (items[i]) originals.set(items[i]!, v.raw) })
}
export function originalItem(item: Item): string { return originals.get(item) ?? JSON.stringify(item) }
