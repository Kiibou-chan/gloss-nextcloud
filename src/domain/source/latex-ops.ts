import type { Op } from './typst-parse';

// Ported from gloss's LaTeX letter scan, src/features/preview/logic/preview-words.ts at e9cb47e5f
// (KEY_COMMAND, argumentEnd, keyArguments, and the escape and % rules), as text ops over the source.
// Its LETTER_COMMANDS table is not ported. Added here: the preamble before \begin{document} is dropped,
// the arguments of the layout commands below are dropped, and so are the optional arguments of every command but \item.

const KEY_COMMAND = /^(?:begin|end|label|ref|eqref|pageref|cref|Cref|crefrange|Crefrange|cpageref|Cpageref|autoref|Autoref|nameref|Nameref|vref|Vref|cite[a-z]*|parencites?|textcites?|autocites?|footcites?|fullcite|nocite|Cite|Citep|Citet|Citealp|Citeauthor|href)$/;
const LAYOUT_COMMAND = /^(?:usepackage|documentclass|includegraphics|input|include|bibliography|bibliographystyle|vspace|hspace|newcommand|renewcommand|setlength|addtolength)$/;
const DELIMITER_COMMAND = /^(?:left|right|middle|[bB]ig{1,2}[lrm]?)$/;

function paragraphEnd(text: string, from: number, to: number): number {
  const blank = /\n[ \t]*\n/g;
  blank.lastIndex = from;
  const m = blank.exec(text);
  return m && m.index < to ? m.index : to;
}

/** The end of the bracketed or braced argument at `start`, or -1 when it does not close within its paragraph. */
function argumentEnd(text: string, start: number, to: number): number {
  const limit = paragraphEnd(text, start, to);
  const close = text[start] === '[' ? ']' : '}';
  let depth = 1;
  for (let i = start + 1; i < limit; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '%') { while (i < limit && text[i] !== '\n') i++; continue; }
    if (close === ']' && text[i] === '{') { const inner = argumentEnd(text, i, limit); if (inner >= 0) i = inner - 1; continue; }
    if (text[i] === text[start]) depth++;
    if (text[i] === close && --depth === 0) return i + 1;
  }
  return -1;
}

function hide(text: string, at: number, to: number, hidden: Map<number, number>): number {
  const end = argumentEnd(text, at, to);
  if (end < 0) return at;
  hidden.set(at, end);
  return end;
}

function hiddenArguments(text: string, name: string, start: number, to: number, hidden: Map<number, number>): void {
  let i = start + (text[start] === '*' ? 1 : 0);
  const layout = LAYOUT_COMMAND.test(name);
  if (name !== 'item' && !DELIMITER_COMMAND.test(name)) {
    while (text[i] === '[') { const end = hide(text, i, to, hidden); if (end === i) break; i = end; }
  }
  if (!KEY_COMMAND.test(name) && !layout) return;
  const count = name === 'crefrange' || name === 'Crefrange' ? 2 : /^(?:text|paren|auto|foot)?cites$/.test(name) || layout ? Infinity : 1;
  const space = () => { while (i < to && /\s/.test(text[i]!)) i++; };
  for (let n = 0; n < count; n++) {
    space();
    while (text[i] === '[') { const end = hide(text, i, to, hidden); if (end === i) break; i = end; space(); }
    if (text[i] !== '{') break;
    const end = hide(text, i, to, hidden);
    if (end === i) break;
    i = end;
  }
  if (name === 'begin') {
    if (text[i] === '{') {
      const title = hide(text, i, to, hidden);
      if (title !== i && text[title] === '{') i = hide(text, title, to, hidden);
      else i = title;
    }
    while (text[i] === '[') { const end = hide(text, i, to, hidden); if (end === i) break; i = end; }
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
      const name = src.slice(s + 1, i);
      if (name === 'verb') {
        const at = i + (src[i] === '*' ? 1 : 0), delimiter = src[at];
        const close = delimiter && !/[A-Za-z\s]/.test(delimiter) ? src.indexOf(delimiter, at + 1) : -1;
        if (close > 0 && !src.slice(at, close).includes('\n')) {
          if (close > at + 1) ops.push({ op: 'text', from: at + 1, to: close });
          i = close + 1;
          continue;
        }
      }
      hiddenArguments(src, name, i, to, hidden);
      continue;
    }
    if (c === '\\') {
      flush(i);
      if (i + 1 >= to) { i++; continue; }
      const escaped = String.fromCodePoint(src.codePointAt(i + 1)!);
      start = i + 1; i += 1 + escaped.length; flush(i);
      if (escaped === '\\') { let j = i; if (src[j] === '*') j++; if (src[j] === '[') hide(src, j, to, hidden); }
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
