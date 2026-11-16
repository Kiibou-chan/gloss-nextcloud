import type { Op } from './typst-parse';

// Ported from gloss's LaTeX letter scan, src/features/preview/logic/preview-words.ts at e9cb47e5f
// (KEY_COMMAND, argumentEnd, keyArguments, and the escape and % rules), as text ops over the source.
// Its LETTER_COMMANDS table is not ported. Added here: the preamble before \begin{document} is dropped,
// the arguments of the layout commands below are dropped, and so are the optional arguments of every command but \item.

const KEY_COMMAND = /^(?:begin|end|label|ref|eqref|pageref|cref|Cref|crefrange|Crefrange|cpageref|Cpageref|autoref|Autoref|nameref|Nameref|vref|Vref|cite[a-z]*|parencites?|textcites?|autocites?|footcites?|fullcite|nocite|Cite|Citep|Citet|Citealp|Citeauthor|href)$/;
const LAYOUT_COMMAND = /^(?:usepackage|documentclass|includegraphics|input|include|bibliography|bibliographystyle|vspace|hspace|newcommand|renewcommand|setlength|addtolength)$/;

function argumentEnd(text: string, start: number, to: number): number {
  const close = text[start] === '[' ? ']' : '}';
  let depth = 1;
  for (let i = start + 1; i < to; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '%') { while (i < to && text[i] !== '\n') i++; continue; }
    if (close === ']' && text[i] === '{') { i = argumentEnd(text, i, to) - 1; continue; }
    if (text[i] === text[start]) depth++;
    if (text[i] === close && --depth === 0) return i + 1;
  }
  return to;
}

function hiddenArguments(text: string, name: string, start: number, to: number, hidden: Map<number, number>): void {
  let i = start + (text[start] === '*' ? 1 : 0);
  const layout = LAYOUT_COMMAND.test(name);
  if (name !== 'item') {
    while (text[i] === '[') { const end = argumentEnd(text, i, to); hidden.set(i, end); i = end; }
  }
  if (!KEY_COMMAND.test(name) && !layout) return;
  const count = name === 'crefrange' || name === 'Crefrange' ? 2 : /^(?:text|paren|auto|foot)?cites$/.test(name) || layout ? Infinity : 1;
  const space = () => { while (i < to && /\s/.test(text[i]!)) i++; };
  for (let n = 0; n < count; n++) {
    space();
    while (text[i] === '[') { const end = argumentEnd(text, i, to); hidden.set(i, end); i = end; space(); }
    if (text[i] !== '{') break;
    const end = argumentEnd(text, i, to);
    hidden.set(i, end); i = end;
  }
  if (name === 'begin') {
    if (text[i] === '{') {
      const title = argumentEnd(text, i, to);
      if (text[title] === '{') { const end = argumentEnd(text, title, to); hidden.set(title, end); i = end; }
      else i = title;
    }
    while (text[i] === '[') { const end = argumentEnd(text, i, to); hidden.set(i, end); i = end; }
  }
}

/** The text a reader sees in a LaTeX draft: outside command names, comments, and hidden arguments. */
export function latexOps(src: string): Op[] {
  const ops: Op[] = [{ op: 'open', tag: 'div', cls: 'gr-plain' }];
  const to = src.length, hidden = new Map<number, number>();
  const body = src.indexOf('\\begin{document}');
  let i = body >= 0 ? body : 0, start = -1;
  const flush = (j: number) => { if (start >= 0 && j > start) ops.push({ op: 'text', from: start, to: j }); start = -1; };
  while (i < to) {
    const end = hidden.get(i);
    if (end !== undefined) { flush(i); i = end; continue; }
    const c = src[i]!;
    if (c === '\\' && /[A-Za-z@]/.test(src[i + 1] ?? '')) {
      flush(i);
      const s = i;
      i++;
      while (i < to && /[A-Za-z@]/.test(src[i]!)) i++;
      hiddenArguments(src, src.slice(s + 1, i), i, to, hidden);
      continue;
    }
    if (c === '\\') {
      flush(i); start = i + 1; i += 2; flush(i);
      if (src[i - 1] === '\\') { let j = i; if (src[j] === '*') j++; if (src[j] === '[') hidden.set(j, argumentEnd(src, j, to)); }
      continue;
    }
    if (c === '%') { flush(i); while (i < to && src[i] !== '\n') i++; continue; }
    if (start < 0) start = i;
    i++;
  }
  flush(to);
  ops.push({ op: 'close' });
  return ops;
}
