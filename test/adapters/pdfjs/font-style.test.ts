import { describe, expect, it } from 'vitest'
import { fontLookup } from '../../../src/adapters/pdfjs/font-style'

const lookup = (items: object[], styles: Record<string, object>, objs: Record<string, object | undefined>) =>
  fontLookup({ content: { items, styles }, pdf: { commonObjs: { has: (id: string) => id in objs && objs[id] !== undefined, get: (id: string) => objs[id] } } } as never)

describe('fontLookup', () => {
  it('reads weight and slant from the font name, skipping marked-content records in the item index', () => {
    const of = lookup([{ type: 'beginMarkedContent' }, { str: 'a', fontName: 'f1' }], { f1: { fontFamily: 'serif' } }, { f1: { name: 'ABCDEF+Serif-BoldItalic' } })
    expect(of(0)).toEqual({ family: 'serif', weight: 'bold', slant: 'italic' })
  })
  it('reads bold and italic from the font flags when the name is plain', () => {
    const of = lookup([{ str: 'a', fontName: 'f1' }], { f1: { fontFamily: 'sans-serif' } }, { f1: { name: 'Plain', bold: true, italic: true } })
    expect(of(0)).toEqual({ family: 'sans-serif', weight: 'bold', slant: 'italic' })
    expect(lookup([{ str: 'a', fontName: 'f1' }], { f1: { fontFamily: 'sans-serif' } }, { f1: { name: 'Plain', black: true } })(0)?.weight).toBe('bold')
  })
  it('falls back to the style family and normal weight when the font is not loaded', () => {
    const of = lookup([{ str: 'a', fontName: 'f1' }], { f1: { fontFamily: 'monospace' } }, {})
    expect(of(0)).toEqual({ family: 'monospace', weight: 'normal', slant: 'normal' })
  })
  it('reads Computer Modern names, which carry no serif flag', () => {
    const of = lookup([{ str: 'a', fontName: 'f1' }, { str: 'b', fontName: 'f2' }, { str: 'c', fontName: 'f3' }], { f1: { fontFamily: 'sans-serif' }, f2: { fontFamily: 'sans-serif' }, f3: { fontFamily: 'sans-serif' } }, { f1: { name: 'EOUHJY+CMBX12' }, f2: { name: 'EKKKXK+CMTI10' }, f3: { name: 'TPORGP+CMR10' } })
    expect([of(0), of(1), of(2)]).toEqual([{ family: 'serif', weight: 'bold', slant: 'normal' }, { family: 'serif', weight: 'normal', slant: 'italic' }, { family: 'serif', weight: 'normal', slant: 'normal' }])
  })
  it('keeps sans-serif for a sans name and reads monospace from the name', () => {
    const of = lookup([{ str: 'a', fontName: 'f1' }, { str: 'b', fontName: 'f2' }], { f1: { fontFamily: 'sans-serif' }, f2: { fontFamily: 'sans-serif' } }, { f1: { name: 'ABCDEF+LibertinusSans-Regular' }, f2: { name: 'DejaVuSansMono' } })
    expect([of(0)?.family, of(1)?.family]).toEqual(['sans-serif', 'monospace'])
  })
  it('answers null for an unknown item', () => {
    expect(lookup([], {}, {})(3)).toBeNull()
  })
})
