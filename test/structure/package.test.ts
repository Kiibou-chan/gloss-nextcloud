import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, expect, test } from 'vitest'

const roots: string[] = []
const scratch = () => {
  const folder = mkdtempSync(join(tmpdir(), 'gloss-package-'))
  roots.push(folder)
  return folder
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

const allowed = ['appinfo', 'lib', 'templates', 'css', 'js/gloss-review.js', 'js/pdf.worker.js', 'LICENSE', 'README.md', 'THIRD-PARTY.md']
const forbidden = ['.local-nc.env', '.dev-nc.env', '.env', '.env.production', 'node_modules', 'src', 'tests', 'test', '.git', 'shots']

function archive(root: string, output: string) {
  execFileSync('bash', [join(root, 'scripts/package.sh'), output], { cwd: tmpdir() })
  const version = readFileSync(join(root, 'appinfo/info.xml'), 'utf8').match(/<version>([^<]+)<\/version>/)?.[1]
  return join(output, `gloss-${version}.tar.gz`)
}

function entries(file: string) {
  return execFileSync('tar', ['-tzf', file], { encoding: 'utf8' }).trim().split('\n')
}

function assertContents(paths: string[]) {
  expect(paths.length).toBeGreaterThan(allowed.length)
  for (const path of paths) {
    expect(path.startsWith('gloss/'), path).toBe(true)
    for (const part of path.split('/').slice(1)) {
      expect(forbidden.includes(part) || part.startsWith('.env'), path).toBe(false)
    }
  }
  for (const path of allowed) expect(paths.some(entry => entry === `gloss/${path}` || entry.startsWith(`gloss/${path}/`)), path).toBe(true)
}

test('the release archive contains the runtime allowlist and complete licence notices', () => {
  const file = archive(resolve('.'), scratch())
  const paths = entries(file)
  assertContents(paths)
  const notices = execFileSync('tar', ['-xOzf', file, 'gloss/THIRD-PARTY.md'], { encoding: 'utf8' })
  for (const name of ['pdf.js', 'CodeMirror', 'Lezer', 'Preact', 'signals']) expect(notices).toContain(name)
  for (const name of ['pdfjs-dist', '@codemirror/view', '@lezer/common', 'preact', '@preact/signals', '@preact/signals-core', 'style-mod', 'w3c-keyname', 'crelt']) {
    expect(notices).toContain(name)
    expect(notices).toContain(readFileSync(resolve('node_modules', name, 'LICENSE'), 'utf8').trim())
  }
  expect(notices).toContain('Apache License')
  expect(notices).toContain('Permission is hereby granted, free of charge')
})

test('scratch files forbidden by R31 are excluded even inside allowlisted directories', () => {
  const root = scratch()
  const put = (path: string, content = 'Synthetic exclusion probe.\n') => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  mkdirSync(join(root, 'scripts'))
  cpSync('scripts/package.sh', join(root, 'scripts/package.sh'))
  for (const path of allowed) put(path.includes('/') || path.includes('.') || path === 'LICENSE' ? path : `${path}/runtime.txt`)
  put('appinfo/info.xml', '<info><version>9.8.7</version></info>')
  for (const prefix of ['', 'appinfo/', 'lib/', 'templates/', 'css/']) {
    for (const path of forbidden) put(`${prefix}${path}${path.startsWith('.') && path !== '.git' ? '' : '/probe.txt'}`)
  }
  put('js/unlisted.js')
  const paths = entries(archive(root, scratch()))
  assertContents(paths)
  expect(paths).not.toContain('gloss/js/unlisted.js')
})
