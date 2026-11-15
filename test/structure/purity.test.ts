import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, matchesGlob } from 'node:path'
import config from '../../vitest.config'
import ts from 'typescript'
import { expect, test } from 'vitest'

function sources(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? sources(path) : /\.tsx?$/.test(path) ? [path] : []
  })
}

function violationsIn(file: string, text: string): string[] {
  const violations: string[] = []
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  // Bind local names without ambient libraries, so unresolved service names are globals.
  const host = ts.createCompilerHost({})
  host.getSourceFile = path => path === file ? source : undefined
  const program = ts.createProgram([file], { noLib: true, noResolve: true, types: [] }, host)
  const checker = program.getTypeChecker()
  const forbiddenNames = /^(Date|crypto|setTimeout|localStorage|window|document)$/
  const global = (node: ts.Expression, name: string): boolean =>
    ts.isIdentifier(node) && node.text === name && !checker.getSymbolAtLocation(node)?.declarations?.length
  function visit(node: ts.Node): void {
    const parent = node.parent
    const propertyName = parent && (
      (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
      (ts.isPropertyAssignment(parent) && parent.name === node)
    )
    const symbol = ts.isIdentifier(node) && parent && ts.isShorthandPropertyAssignment(parent)
      ? checker.getShorthandAssignmentValueSymbol(parent)
      : checker.getSymbolAtLocation(node)
    const forbidden = ts.isIdentifier(node) && forbiddenNames.test(node.text) && !propertyName && !symbol?.declarations?.length
    const access = ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) ? node : undefined
    const name = access && (ts.isPropertyAccessExpression(access) ? access.name.text
      : ts.isStringLiteral(access.argumentExpression) ? access.argumentExpression.text : undefined)
    const globalProperty = access && name && forbiddenNames.test(name) && global(access.expression, 'globalThis')
    const random = access && name === 'random' && global(access.expression, 'Math')
    if (forbidden || globalProperty || random) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
      violations.push(`${file}:${line + 1}: ${node.getText(source)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return violations
}

test('domain and app receive time, randomness, and browser services as parameters', () => {
  const violations = ['src/domain', 'src/app'].flatMap(sources).flatMap(file => violationsIn(file, readFileSync(file, 'utf8')))
  expect(violations, violations.join('\n')).toEqual([])
})

test('purity distinguishes global services from local names and document fields', () => {
  expect(violationsIn('hit.ts', 'Date.now(); globalThis.crypto; Math.random();')).toHaveLength(3)
  expect(violationsIn('local.ts', `
    type document = { document: string }
    function words(window: document) { return window.document }
    const item = { document: 'alpha', window: 'beta' }
    const document = item.document
    const { window } = item
    function local(Date: { now(): number }, Math: { random(): number }) {
      return [Date.now(), Math.random()]
    }
  `)).toEqual([])
})

for (const layer of ['domain', 'app']) {
  test.each([
    ['document', 'document.title'],
    ['window', 'window.innerWidth'],
    ['setTimeout', 'setTimeout(() => 0, 1)'],
    ['performance', 'performance.now()'],
    ['HTMLElement', 'let element: HTMLElement'],
  ])(`pure typecheck rejects %s in ${layer}`, (name, code) => {
    const root = mkdtempSync(join(tmpdir(), 'gloss-purity-'))
    const dir = join(root, 'src', layer)
    cpSync('tsconfig.pure.json', join(root, 'tsconfig.pure.json'))
    cpSync('tsconfig.json', join(root, 'tsconfig.json'))
    const probe = `${dir}/s1-purity-probe.ts`
    mkdirSync(dir, { recursive: true })
    expect(existsSync(probe)).toBe(false)
    try {
      writeFileSync(probe, `${code};\nexport {};\n`)
      const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '-p', join(root, 'tsconfig.pure.json'), '--pretty', 'false'], { encoding: 'utf8' })
      expect(result.error).toBeUndefined()
      expect(result.status, result.stdout + result.stderr).not.toBe(0)
      expect(result.stdout).toContain(name)
      expect(result.stdout).toContain(probe)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
}

test('Vitest includes root and future test folders, alongside structure tests', async () => {
  for (const file of ['test/main.test.ts', 'test/future/example.test.ts', 'test/future/view.test.tsx', 'test/structure/purity.test.ts', 'test/domain/example.test.ts', 'test/app/example.test.ts', 'test/adapters/example.test.ts', 'test/ui/example.test.tsx']) {
    const projects = await Promise.all(config.test?.projects ?? [])
    const matching = projects.filter(project => typeof project === 'object' && project.test?.include?.some(pattern => matchesGlob(file, pattern)) && !project.test?.exclude?.some(pattern => matchesGlob(file, pattern)))
    expect(matching, file).toHaveLength(1)
    const project = matching[0]
    if (typeof project === 'object') {
      expect(project.test?.environment).toBe(/^test\/(domain|app|structure)\//.test(file) ? 'node' : 'jsdom')
    }
  }
})
