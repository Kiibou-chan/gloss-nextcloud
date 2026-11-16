import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// Existing large files are capped at their current size until their own refactors.
const baseline: Record<string, { lines: number; reason: string }> = {
  'src/domain/review/draft-review.ts': { lines: 154, reason: 'Domain implementation; outside the session split.' },
  'src/domain/source/typst-parse.ts': { lines: 164, reason: 'Domain implementation; outside the session split.' },
  'src/adapters/pdfjs/pdf-view.ts': { lines: 192, reason: 'Adapter implementation; outside the session split.' },
}
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`
    return entry.isDirectory() ? sources(path) : [path]
  })
}
test('source files stay within 150 lines or their documented baseline', () => {
  const oversized = sources('src').flatMap(path => {
    const text = readFileSync(path, 'utf8')
    const lines = text.split('\n').length - Number(text.endsWith('\n'))
    return lines > (baseline[path]?.lines ?? 150) ? [`${path}: ${lines} lines`] : []
  })
  expect(oversized).toEqual([])
})
