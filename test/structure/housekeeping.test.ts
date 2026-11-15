import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

test('CI regenerates notices and its porcelain gate catches an untracked bundle', () => {
  const ci = JSON.parse(read('package.json')).scripts.ci as string
  expect(ci).toContain('node scripts/third-party.mjs')
  const gate = ci.split(' && ').at(-1)!
  const root = mkdtempSync(join(tmpdir(), 'gloss-drift-'))
  try {
    execFileSync('git', ['init', '-q', root])
    mkdirSync(join(root, 'js'))
    expect(spawnSync('sh', ['-c', gate], { cwd: root }).status).toBe(0)
    writeFileSync(join(root, 'js/untracked-probe.js'), '// synthetic probe')
    expect(spawnSync('sh', ['-c', gate], { cwd: root }).status).not.toBe(0)
    expect(gate).toContain('git status --porcelain -- js css THIRD-PARTY.md')
    expect(read('.github/workflows/ci.yml')).toContain(gate)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('purity probes use a temporary copy of the configuration', () => {
  const source = read('test/structure/purity.test.ts')
  expect(source).toContain('mkdtempSync(')
  expect(source).toContain("fileURLToPath(new URL('../../', import.meta.url))")
  expect(source).toMatch(/cpSync\(\s*join\(repoRoot, 'tsconfig\.pure\.json'\),\s*join\(root, 'tsconfig\.pure\.json'\)\s*\)/)
  expect(source).not.toContain('const dir = `src/${layer}`')
  expect(JSON.parse(read('tsconfig.pure.json')).include).not.toContain('src/pure-anchor.d.ts')
})

test('production cannot depend on test helpers', () => {
  const root = mkdtempSync(join(tmpdir(), 'gloss-layers-'))
  try {
    mkdirSync(join(root, 'src/adapters'), { recursive: true })
    mkdirSync(join(root, 'test'))
    cpSync('.dependency-cruiser.cjs', join(root, '.dependency-cruiser.cjs'))
    cpSync('tsconfig.json', join(root, 'tsconfig.json'))
    writeFileSync(join(root, 'test/helper.ts'), 'export const probe = 1')
    writeFileSync(join(root, 'src/adapters/probe.ts'), "import { probe } from '../../test/helper'; export const value = probe")
    const result = spawnSync(process.execPath, [resolve('node_modules/dependency-cruiser/bin/dependency-cruiser.mjs'), 'src', 'test', '--config', '.dependency-cruiser.cjs'], { cwd: root, encoding: 'utf8' })
    expect(result.status, result.stdout + result.stderr).not.toBe(0)
    expect(result.stdout).toContain('src-no-test')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('scene saves wait 30 seconds and bell tolerates repeated notifications', () => {
  const source = read('scripts/shots/scenes.mjs')
  const saved = [...source.matchAll(/toHaveText\('Saved'([^\n]*)/g)]
  expect(saved.length).toBeGreaterThan(0)
  for (const match of saved) expect(match[1]).toContain('timeout: 30_000')
  expect(source).toContain("{ exact: false }).first()")
  const runner = read('scripts/shots.mjs')
  expect(runner.indexOf("['empty-reviews']")).toBeGreaterThan(runner.indexOf("for (const colour"))
})
