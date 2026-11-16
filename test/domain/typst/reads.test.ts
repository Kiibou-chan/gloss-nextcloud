import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { importsPackage, typstReads } from '../../../src/domain/typst/reads'

const fixture = readFileSync('test/fixtures/nc/Typst/paper.typ', 'utf8')

test('the fixture reads its bibliography', () => {
  expect(typstReads('paper.typ', fixture)).toEqual(['references.bib'])
})

test('an array bibliography reads every file', () => {
  expect(typstReads('main.typ', '#bibliography(("a.bib", "b/c.bib"), style: "ieee")')).toEqual(['a.bib', 'b/c.bib'])
})

test('include and image resolve against the including file', () => {
  expect(typstReads('main.typ', '#include "ch/one.typ"\n')).toEqual(['ch/one.typ'])
  expect(typstReads('ch/one.typ', '#image("fig.png", width: 50%)')).toEqual(['ch/fig.png'])
  expect(typstReads('main.typ', '#import "lib.typ": f\n#let d = read("data/x.txt")\n#csv("t.csv")')).toEqual(['lib.typ', 'data/x.txt', 't.csv'])
})

test('a leading slash means the shared folder, dot segments resolve, an escaping path is dropped', () => {
  expect(typstReads('ch/one.typ', '#image("/img/a.png")')).toEqual(['img/a.png'])
  expect(typstReads('ch/one.typ', '#image("../img/b.png")')).toEqual(['img/b.png'])
  expect(typstReads('main.typ', '#image("../out.png")')).toEqual([])
  expect(typstReads('main.typ', '#image("./a/./b.png")')).toEqual(['a/b.png'])
})

test('reads are deduplicated and packages are not reads', () => {
  expect(typstReads('m.typ', '#image("a.png")\n#image("a.png")\n#import "@preview/x:0.1.0": y')).toEqual(['a.png'])
})

test('reads inside a comment or a string are ignored', () => {
  expect(typstReads('m.typ', '// #image("a.png")\n/* #include "b.typ" */\n#let s = "#image(\\"c.png\\")"\n')).toEqual([])
})

test('a non-literal argument and prose are not reads', () => {
  expect(typstReads('m.typ', '#image(path)\nWe include "quoted" words and read it.')).toEqual([])
})

test('importsPackage flags namespaced imports and includes outside comments', () => {
  expect(importsPackage('#import "@preview/x:0.1.0"')).toBe(true)
  expect(importsPackage('#include "@local/y:1.0.0"')).toBe(true)
  expect(importsPackage('#import "lib.typ": f')).toBe(false)
  expect(importsPackage('// #import "@preview/x:0.1.0"\ntext')).toBe(false)
  expect(importsPackage(readFileSync('test/fixtures/nc/Typst/package.typ', 'utf8'))).toBe(true)
  expect(importsPackage(fixture)).toBe(false)
})
