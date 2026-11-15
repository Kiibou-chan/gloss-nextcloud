export interface KeyLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  getModifierState?: (modifier: string) => boolean
}

/** Navigation and command shortcuts must leave the normal focus order alone; AltGr characters are text. */
export function entersText(event: KeyLike): boolean {
  const altGr = event.getModifierState?.('AltGraph') === true
  return (altGr || (!event.ctrlKey && !event.altKey)) && !event.metaKey
    && (event.key.length === 1 || ['Enter', 'Backspace', 'Delete'].includes(event.key))
}
