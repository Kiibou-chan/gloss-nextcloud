import { expect, it } from 'vitest';
import { languageOf, spellLanguage } from '../../../src/domain/source/language';

it.each([
  ['paper.TYP', 'typst'], ['folder/paper.tex', 'latex'], ['paper.MD', 'markdown'],
  ['paper.txt', 'plain'], ['paper.typ.bak', 'plain'], ['', 'plain'],
])('chooses the editor language for %s', (file, expected) => {
  expect(languageOf(file)).toBe(expected);
});
it.each([
  ['#set text(lang: "en")', 'en'], ['#set text(lang: "de")', 'de'],
  ['\\usepackage[english]{babel}', 'en'], ['\\usepackage[ngerman]{babel}', 'de'],
  ['\\usepackage[german]{babel}', 'de'], ['plain synthetic text', undefined],
  ['#set text(lang: "fra")', 'fra'],
])('preserves the spike spell language for %s', (text, expected) => {
  expect(spellLanguage(text)).toBe(expected);
});
