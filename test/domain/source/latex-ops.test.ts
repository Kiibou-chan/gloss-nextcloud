import { expect, test } from 'vitest';
import { latexOps } from '../../../src/domain/source/latex-ops';
import { shown } from '../../../src/domain/source/shown';
import { sourceKey } from '../../../src/domain/pdf/match';

const body = (s: string) => `\\begin{document}\n${s}\n\\end{document}`;
const see = (src: string) => shown(src, latexOps(src), 0, src.length);
const key = (src: string) => sourceKey('a.tex', src, latexOps(src)).key;

// Cases ported from the rules of gloss's preview-words.ts (e9cb47e5f): command names, comments, key arguments.
test('drops command names and keeps the words of an argument', () => {
  expect(see(body('\\emph{word} and \\textbf{bold}'))).toBe('{word} and {bold}');
});
test('drops a comment to the end of the line and keeps an escaped percent sign', () => {
  expect(see(body('keep % hidden\nnext 50\\% more'))).toBe('keep next 50% more');
});
test('drops the arguments of label, ref, and cite commands', () => {
  expect(key(body('See \\label{sec:a}\\cite{smith2020} and \\citep[p.~3]{x}.'))).toBe(key(body('See and.')));
  expect(key(body('\\citet{a,b} done'))).toBe('done');
});
test('drops the environment name and a box environment label', () => {
  expect(key('\\begin{document}\\begin{abstract}Words\\end{abstract}\\end{document}')).toBe('words');
});
test('drops a comment inside a dropped argument', () => {
  expect(key(body('\\label{a % }\nb}after'))).toBe('after');
});

test('drops the preamble before \\begin{document}', () => {
  expect(key('\\documentclass{article}\nPreamble words\n\\begin{document}Body\\end{document}')).toBe('body');
});
test('drops a comment line', () => {
  expect(key(body('% secret words\nvisible'))).toBe('visible');
});
test('drops the argument of vspace and hspace', () => {
  expect(key(body('before\\vspace{1em}after'))).toBe('beforeafter');
  expect(key(body('left\\hspace{2mm}right'))).toBe('leftright');
});
test('drops the optional arguments and the argument of includegraphics', () => {
  expect(key(body('\\includegraphics[width=0.2\\linewidth]{fig}'))).toBe('');
});
test('drops setlength and its two arguments', () => {
  expect(key(body('\\setlength{\\parskip}{4pt}'))).toBe('');
});
test('keeps only the long caption', () => {
  expect(key(body('\\caption[Short]{Long}'))).toBe('long');
});
test('keeps the label of an item', () => {
  expect(key(body('\\item[Iota] text'))).toBe('iotatext');
});
test('drops the optional argument of an environment and of a line break', () => {
  expect(key(body('\\begin{figure}[ht]Words\\end{figure}'))).toBe('words');
  expect(key(body('one\\\\[2pt]two'))).toBe('onetwo');
});
test('keeps the words of emph and an escaped percent sign', () => {
  expect(key(body('\\emph{word} 50\\%'))).toBe('word50');
});
test('the ops are ordered, disjoint source ranges', () => {
  const ops = latexOps(body('a \\emph{b} % c\n d'));
  let last = 0;
  for (const op of ops) if (op.op === 'text') { expect(op.from).toBeGreaterThanOrEqual(last); last = op.to; }
});
