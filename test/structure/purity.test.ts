import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { expect, test } from 'vitest'

function sources(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? sources(path) : /\.tsx?$/.test(path) ? [path] : []
  })
}

test('domain and app receive time, randomness, and browser services as parameters', () => {
  const violations: string[] = []
  for (const file of ['src/domain', 'src/app'].flatMap(sources)) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    function visit(node: ts.Node): void {
      const forbidden = ts.isIdentifier(node) && /^(Date|crypto|setTimeout|localStorage|window|document)$/.test(node.text)
      const random = ts.isPropertyAccessExpression(node) && node.expression.getText(source) === 'Math' && node.name.text === 'random'
      const randomElement = ts.isElementAccessExpression(node) && node.expression.getText(source) === 'Math' && ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === 'random'
      if (forbidden || random || randomElement) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
        violations.push(`${file}:${line + 1}: ${node.getText(source)}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  expect(violations, violations.join('\n')).toEqual([])
})
