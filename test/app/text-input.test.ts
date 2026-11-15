import { describe, expect, it } from 'vitest'
import { entersText } from '../../src/app/text-input'

const key = (key: string, over: Partial<Parameters<typeof entersText>[0]> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, altKey: false, ...over })

describe('entersText', () => {
  it('counts printable keys, Enter, Backspace and Delete', () => {
    for (const k of ['a', ' ', 'Enter', 'Backspace', 'Delete']) expect(entersText(key(k))).toBe(true)
  })

  it('ignores navigation, modifiers alone, and shortcuts', () => {
    for (const k of ['Tab', 'ArrowLeft', 'Escape', 'Shift', 'Control']) expect(entersText(key(k))).toBe(false)
    expect(entersText(key('a', { ctrlKey: true }))).toBe(false)
    expect(entersText(key('m', { ctrlKey: true, altKey: true }))).toBe(false)
  })

  it('counts AltGr characters as text although they arrive with Ctrl and Alt set', () => {
    const altGr = { ctrlKey: true, altKey: true, getModifierState: (m: string) => m === 'AltGraph' }
    expect(entersText(key('@', altGr))).toBe(true)
  })
})
