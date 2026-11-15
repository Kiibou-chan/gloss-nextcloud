// R41: capture the spike once, before S11b removes its implementation.
// Inputs are synthetic, and the fixed seed makes regeneration reproducible.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
const context = vm.createContext({ window: {} })
for (const file of ['js/diff.js', 'js/typst-view.js', 'js/pdf-view.js']) {
  vm.runInContext(readFileSync(new URL(file, root), 'utf8'), context, { filename: file })
}

// Extract declarations rather than executing the DOM-dependent review IIFE.
const review = ts.createSourceFile('review.js', readFileSync(new URL('js/review.js', root), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const wanted = new Set(['shown', 'sorted', 'toApplied', 'fromApplied'])
const declarations = new Map()
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && wanted.has(node.name.text)) {
    assert(!declarations.has(node.name.text), `Duplicate declaration: ${node.name.text}`)
    declarations.set(node.name.text, `const ${node.getText(review)};`)
  }
  ts.forEachChild(node, visit)
}
visit(review)
assert.equal(declarations.size, wanted.size, 'The spike declarations have changed')
vm.runInContext(`let proposals = []; ${[...wanted].map(name => declarations.get(name)).join('\n')}`, context)
const evaluate = (expression, input) => {
  context.input = input
  // Round-trip so only JSON values, and no VM objects, leave the oracle.
  return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context))
}

const seed = 0x5312026
let state = seed
const random = n => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0
  return state % n
}
const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta']
const word = () => words[random(words.length)]
const write = (name, cases) => writeFileSync(new URL(`test/fixtures/spike/${name}.json`, root), JSON.stringify({ seed, cases }, null, 2) + '\n')
mkdirSync(new URL('test/fixtures/spike/', root), { recursive: true })

const pairs = [
  ['', ''], ['', 'alpha'], ['alpha', ''], ['alpha beta', 'gamma beta'],
  ['alpha beta', 'alpha gamma beta'], ['alpha beta', 'alpha'],
  ['alpha beta gamma', 'delta beta epsilon'], ['alpha beta', 'gamma delta'],
  ['Grüsse für αλφα 123.', 'Grüsse für βητα 123!'],
  ['alpha\nbeta\ngamma', 'alpha\ndelta\ngamma'],
]
write('diff', pairs.map(([a, b]) => ({ input: { a, b }, expected: evaluate('window.GlossDiff.changes(input.a, input.b)', { a, b }) })))

const applied = []
for (let n = 0; n < 200; n++) {
  const draft = Array.from({ length: 20 }, word).join(' ')
  const proposals = []
  let pos = 0
  const count = n % 9
  for (let i = 0; i < count; i++) {
    const from = pos + random(4)
    const to = from + (n + i) % 5
    const text = (n + i) % 3 === 0 ? '' : word()
    proposals.push({ id: `p${i}`, from, to, text })
    pos = to + 1 + random(3)
  }
  // Unsorted inputs also freeze the spike's sort behaviour.
  if (n % 2) proposals.reverse()
  const sorted = [...proposals].sort((a, b) => a.from - b.from)
  const editedLength = draft.length + proposals.reduce((sum, p) => sum + p.text.length - (p.to - p.from), 0)
  const input = { draft, proposals, sourceOffsets: Array.from({ length: draft.length + 1 }, (_, i) => i), appliedOffsets: Array.from({ length: editedLength + 1 }, (_, i) => i) }
  assert(sorted.every((p, i) => p.to <= draft.length && (!i || p.from > sorted[i - 1].to)))
  const expected = evaluate('(() => { proposals = input.proposals; return { toApplied: input.sourceOffsets.map(toApplied), fromApplied: input.appliedOffsets.map(fromApplied) }; })()', input)
  applied.push({ input, expected })
}
write('applied', applied)

const sources = [
  'Alpha beta gamma.\n',
  '= Alpha heading\n\nBeta paragraph.\n',
  'Alpha *strong beta* and _quiet gamma_.\n',
  '- Alpha item\n+ Beta item\n1. Gamma item\n',
  '#set text(lang: "en")\nAlpha beta.\n',
  'Alpha // synthetic comment\nbeta /* hidden */ gamma.\n',
  'Alpha `raw beta` and $x + y$ gamma.\n',
  '<alpha-label>\nAlpha @beta and #cite(<gamma>).\n',
  '#let synthetic(x) = (\n  "hidden",\n)\n#strong[Alpha beta] gamma.\n',
  '= Grüsse αλφα\n\nAlpha \\* beta.\n#figure("synthetic.svg")\n',
]
const typst = sources.map(text => ({ input: { text }, expected: evaluate('window.GlossTypst.parse(input.text)', { text }) }))
write('typst', typst)
const shown = []
for (let n = 0; n < 200; n++) {
  const source = typst[n % typst.length]
  const a = random(source.input.text.length + 1)
  const b = random(source.input.text.length + 1)
  const input = { text: source.input.text, ops: source.expected, from: Math.min(a, b), to: Math.max(a, b) }
  shown.push({ input, expected: evaluate('shown(input.text, input.ops, input.from, input.to)', input) })
}
write('shown', shown)

const pdfInputs = [
  { name: 'ligature', text: 'Alpha ﬁnite beta.', selected: 'finite', fraction: 0.5 },
  { name: 'line-end hyphen', text: 'Alpha hyphenated beta.', selected: 'hyphen-\nated', fraction: 0.5 },
  { name: 'markup between words', text: 'Alpha *beta* gamma.', selected: 'Alpha beta gamma', fraction: 0.5 },
  { name: 'repeated words on different pages', text: 'Alpha beta. Gamma delta. Alpha beta.', selected: 'Alpha beta', fraction: 0.9 },
]
write('pdf', pdfInputs.map(input => {
  const ops = evaluate('window.GlossTypst.parse(input.text)', input)
  const completeInput = { ...input, ops }
  const expected = evaluate('(() => { const sourceKey = window.GlossPdf.sourceKey(input.text, input.ops); return { sourceKey, selectionKey: window.GlossPdf.keyOf([...input.selected].map(c => [c, 0])), toSource: window.GlossPdf.toSource(sourceKey, input.selected, input.fraction) }; })()', completeInput)
  assert(expected.toSource, `PDF case must match: ${input.name}`)
  return { input: completeInput, expected }
}))
console.log(`Recorded diff=10, applied=200, shown=200, typst=10, pdf=4 in ${fileURLToPath(new URL('test/fixtures/spike/', root))}`)
