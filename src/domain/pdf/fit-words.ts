export type Slot = { width: number; size: number }

export function fitWords(
  words: string,
  slots: readonly Slot[],
  measure: (text: string, size: number) => number,
): { lines: string[]; overflow: string } {
  const rest = words.split(/\s+/).filter(w => w !== '');
  const lines: string[] = [];
  for (const slot of slots) {
    let line = '';
    for (let word = rest[0]; word !== undefined; word = rest[0]) {
      const next = line === '' ? word : `${line} ${word}`;
      if (measure(next, slot.size) > slot.width) break;
      line = next;
      rest.shift();
    }
    lines.push(line);
  }
  return { lines, overflow: rest.join(' ') };
}
