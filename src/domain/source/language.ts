/** Editor modes depend on the draft's extension, ignoring case. */
export function languageOf(fileName: string): 'typst' | 'latex' | 'markdown' | 'plain' {
  if (/\.typ$/i.test(fileName)) return 'typst';
  if (/\.tex$/i.test(fileName)) return 'latex';
  if (/\.md$/i.test(fileName)) return 'markdown';
  return 'plain';
}

/** Preserve the spike's Typst declaration and LaTeX babel language detection. */
export function spellLanguage(src: string): string | undefined {
  const lang = (src.match(/#set\s+text\([^)]*\blang:\s*"([a-z]{2,3})"/)
    || src.match(/\\usepackage\[[^\]]*\b(english|ngerman|german)\b/))?.[1];
  const babel: Record<string, string> = { english: 'en', ngerman: 'de', german: 'de' };
  return lang === undefined ? undefined : babel[lang] || lang;
}
