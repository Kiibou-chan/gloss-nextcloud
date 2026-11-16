import type { PDFPageProxy } from 'pdfjs-dist'

export type FontStyle = { family: string; weight: 'normal' | 'bold'; slant: 'normal' | 'italic' }
type FontObject = { name?: string; bold?: boolean; black?: boolean; italic?: boolean }
type Source = { content: { items: readonly object[]; styles: Record<string, { fontFamily?: string }> }; pdf: Pick<PDFPageProxy, 'commonObjs'> }

const BOLD = /bold|black|heavy|semibold|cmbx|cmb\d/i
const ITALIC = /italic|oblique|cmti|cmsl/i
const MONO = /mono|courier|typewriter|cmtt|consolas/i
const SERIF = /serif|roman|times|libertinus|garamond|palatino|georgia|minion|bookman|charter|century|cm(r|bx|ti|sl|csc)\d|lmroman/i
function familyOf(style: string, name: string): string {
  if (/sans|cmss/i.test(name)) return MONO.test(name) ? 'monospace' : 'sans-serif'
  if (MONO.test(name)) return 'monospace'
  return style === 'sans-serif' && SERIF.test(name) ? 'serif' : style
}

/** Looks up the style of a text item by its index among the page's text items, from the page's loaded fonts; null when the item is unknown. */
export function fontLookup(page: Source): (item: number) => FontStyle | null {
  const texts = page.content.items.filter((item): item is { str: string; fontName?: string } => 'str' in item)
  return item => {
    const fontName = texts[item]?.fontName
    if (!fontName) return null
    let font: FontObject | null | undefined
    try { font = page.pdf.commonObjs.has(fontName) ? page.pdf.commonObjs.get(fontName) as FontObject | null : null } catch { font = null }
    const name = font?.name ?? ''
    return {
      family: familyOf(page.content.styles[fontName]?.fontFamily ?? 'sans-serif', name),
      weight: font?.bold || font?.black || BOLD.test(name) ? 'bold' : 'normal',
      slant: font?.italic || ITALIC.test(name) ? 'italic' : 'normal',
    }
  }
}
