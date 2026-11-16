import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

test('built page scripts and the PDF worker contain no runtime code generation', () => {
  const folder = resolve('js')
  const scripts = readdirSync(folder).filter(file => file.endsWith('.js'))
  expect(scripts.length).toBeGreaterThan(0)
  for (const script of scripts) {
    expect(readFileSync(resolve(folder, script), 'utf8'), script)
      .not.toMatch(/\bnew\s+Function\s*\(|\beval\s*\(/)
  }
})

test('the Typst worker and its wasm are built', () => {
  expect(readdirSync(resolve('js'))).toEqual(expect.arrayContaining(['typst.worker.js', 'typst-compiler.wasm']))
})

// The build helper is JavaScript, so load it by URL without adding a TS declaration file.
const helperUrl = new URL('../../scripts/text-layer-css.mjs', import.meta.url).href

test('text layer extraction keeps nested rules and omits annotation image references', async () => {
  const { textLayerCss } = await import(helperUrl)
  expect(textLayerCss('.other { color: red; }\n.textLayer { span { color: transparent; } }\n.textLayer { background: url(toolbar.svg); }', { rotations: false }))
    .toBe('.textLayer { span { color: transparent; } }\n')
})

test('text layer extraction requires rotation rules by default', async () => {
  const { textLayerCss } = await import(helperUrl)
  expect(() => textLayerCss('.textLayer {}')).toThrow(/rotation/)
})

test('the installed viewer CSS supplies all three safe text layer rotations', async () => {
  const { textLayerCss } = await import(helperUrl)
  const css = textLayerCss(readFileSync('node_modules/pdfjs-dist/web/pdf_viewer.css', 'utf8'))
  for (const rotation of [90, 180, 270]) {
    expect(css).toContain(`[data-main-rotation="${rotation}"]`)
  }
  expect(css).not.toMatch(/url\s*\(|annotation|toolbar/i)
})

test.each([90, 180, 270])('text layer extraction refuses a missing %i degree rotation', async rotation => {
  const { textLayerCss } = await import(helperUrl)
  const css = readFileSync('node_modules/pdfjs-dist/web/pdf_viewer.css', 'utf8')
  const rule = new RegExp(`^\\[data-main-rotation="${rotation}"\\] \\{[^}]*\\}`, 'm')
  expect(() => textLayerCss(css.replace(rule, ''))).toThrow(/rotation/)
})

test.each([90, 180, 270])('text layer extraction refuses URLs in the %i degree rotation', async rotation => {
  const { textLayerCss } = await import(helperUrl)
  const css = readFileSync('node_modules/pdfjs-dist/web/pdf_viewer.css', 'utf8')
  const rule = new RegExp(`^\\[data-main-rotation="${rotation}"\\] \\{`, 'm')
  expect(() => textLayerCss(css.replace(rule, '$& background: url(unexpected.svg);'))).toThrow(/url/)
})

test('text layer extraction refuses missing or incomplete core CSS', async () => {
  const { textLayerCss } = await import(helperUrl)
  expect(() => textLayerCss('.other {}')).toThrow(/textLayer/)
  expect(() => textLayerCss('.textLayer { span {}')).toThrow(/textLayer/)
})

test('text layer extraction refuses external image references in the core block', async () => {
  const { textLayerCss } = await import(helperUrl)
  expect(() => textLayerCss('.textLayer { background: url(unexpected.svg); }')).toThrow(/url/)
})
