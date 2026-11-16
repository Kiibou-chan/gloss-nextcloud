import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
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

const allowed = ['appinfo', 'lib', 'templates', 'css', 'js/gloss-review.js', 'js/pdf.worker.js', 'js/typst.worker.js', 'js/typst-compiler.wasm', 'fonts', 'LICENSE', 'README.md', 'THIRD-PARTY.md']
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
  const file = archive(fixture().root, scratch())
  const paths = entries(file)
  assertContents(paths)
  const notices = execFileSync('tar', ['-xOzf', file, 'gloss/THIRD-PARTY.md'], { encoding: 'utf8' })
  for (const name of ['pdf.js', 'CodeMirror', 'Lezer', 'Preact', 'signals']) expect(notices).toContain(name)
  for (const name of ['pdfjs-dist', '@codemirror/view', '@lezer/common', 'preact', '@preact/signals', '@preact/signals-core', 'style-mod', 'w3c-keyname', 'crelt']) {
    expect(notices).toContain(name)
    expect(notices).toContain(readFileSync(resolve('node_modules', name, 'LICENSE'), 'utf8').trim())
  }
  for (const name of ['@myriaddreamin/typst-ts-web-compiler', 'Typst', 'typst-assets', 'Libertinus Serif', 'New Computer Modern', 'DejaVu', 'SIL OPEN FONT LICENSE', 'GUST Font License', 'Bitstream Vera']) expect(notices, name).toContain(name)
  expect(notices).toContain(readFileSync('notices/typst-ts.LICENSE', 'utf8').trim())
  expect(notices).toContain(readFileSync('notices/typst.LICENSE', 'utf8').trim())
  expect(notices).toContain(readFileSync('notices/typst.NOTICE', 'utf8').trim())
  expect(notices).toContain(readFileSync('fonts/NOTICE', 'utf8').trim())
  expect(notices).toContain('Apache License')
  expect(notices).toContain('Permission is hereby granted, free of charge')
})

function fixture() {
  const root = scratch()
  mkdirSync(join(root, 'scripts'))
  cpSync('scripts/package.sh', join(root, 'scripts/package.sh'))
  for (const path of allowed) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    if (path === 'js/typst-compiler.wasm') writeFileSync(join(root, path), 'Synthetic wasm placeholder')
    else if (path === 'fonts') {
      mkdirSync(join(root, path))
      for (const name of readdirSync(path)) writeFileSync(join(root, path, name), name === 'NOTICE' ? readFileSync(join(path, name)) : `Synthetic font placeholder ${name}`)
    } else cpSync(path, join(root, path), { recursive: true })
  }
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' })
  git('init', '-q')
  git('add', '.')
  git('-c', 'user.name=Package test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Synthetic runtime')
  return { root, git }
}

test('the archive version exceeds the base release', () => {
  const { root } = fixture()
  const xml = execFileSync('tar', ['-xOzf', archive(root, scratch()), 'gloss/appinfo/info.xml'], { encoding: 'utf8' })
  const version = xml.match(/<version>([^<]+)<\/version>/)![1]!
  expect(version).toBe('0.2.0')
  const base = spawnSync('git', ['show', 'origin/main:appinfo/info.xml'], { encoding: 'utf8' })
  const tag = spawnSync('git', ['describe', '--tags', '--abbrev=0'], { encoding: 'utf8' })
  const tagged = tag.status === 0 ? spawnSync('git', ['show', `${tag.stdout.trim()}:appinfo/info.xml`], { encoding: 'utf8' }).stdout : ''
  // 0.0.11 is the final spike version; installations need an upgrade to invalidate cached routes.
  const previous = (base.status === 0 ? base.stdout : tagged).match(/<version>([^<]+)<\/version>/)?.[1] ?? '0.0.11'
  const parts = (value: string) => value.split('.').map(Number)
  const currentParts = parts(version), baseParts = parts(previous)
  const differing = currentParts.findIndex((part, i) => part !== baseParts[i])
  expect(differing >= 0 && currentParts[differing]! > baseParts[differing]!, `${version} > ${previous}`).toBe(true)
})

test('only committed allowlisted runtime paths enter a reproducible root-owned archive', () => {
  const { root, git } = fixture()
  writeFileSync(join(root, '.env'), 'Synthetic excluded secret')
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src/probe.ts'), 'Synthetic excluded source')
  writeFileSync(join(root, 'js/unlisted.js'), 'Synthetic excluded entry')
  const first = archive(root, scratch())
  assertContents(entries(first))
  expect(entries(first)).not.toContain('gloss/js/unlisted.js')
  expect(readFileSync(first)).toEqual(readFileSync(archive(root, scratch())))
  expect(entries(first)).toContain('gloss/js/typst-compiler.wasm')
  expect(entries(first)).toContain('gloss/fonts/NOTICE')
  const listing = execFileSync('tar', ['--numeric-owner', '-tvzf', first], { encoding: 'utf8' })
  expect(listing.split('\n').filter(Boolean).every(line => / 0\/0 +/.test(line)), listing).toBe(true)
  const extracted = scratch()
  execFileSync('tar', ['-xzf', first, '-C', extracted])
  const timestamp = Number(git('show', '-s', '--format=%ct', 'HEAD').toString().trim())
  expect(statSync(join(extracted, 'gloss/appinfo/info.xml')).mtimeMs / 1000).toBe(timestamp)
}, 30_000)

test.each(['lib/ReviewController.php.orig', 'css/review.css', 'appinfo/info.xml'])('packaging refuses dirty allowlisted path %s', path => {
  const { root } = fixture()
  writeFileSync(join(root, path), 'Synthetic dirty runtime')
  const result = spawnSync('bash', [join(root, 'scripts/package.sh'), scratch()], { encoding: 'utf8' })
  expect(result.status, result.stdout + result.stderr).not.toBe(0)
  expect(result.stderr).toContain('allowlisted')
})
