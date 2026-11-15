/** Navigation and command shortcuts must leave the normal focus order alone. */
export function entersText(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey
    && (event.key.length === 1 || ['Enter', 'Backspace', 'Delete'].includes(event.key))
}
