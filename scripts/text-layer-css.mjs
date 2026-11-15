/** Keep only pdf.js's core selectable text styles, without annotation assets. */
export function textLayerCss(css, { rotations = true } = {}) {
  const blocks = [extractBlock(css, '.textLayer', '.textLayer core')]
  if (rotations) {
    for (const rotation of [90, 180, 270]) {
      blocks.push(extractBlock(css, `[data-main-rotation="${rotation}"]`, `${rotation} degree rotation`))
    }
  }
  return blocks.join('\n') + '\n'
}

function extractBlock(css, selector, label) {
  // Match standalone rules only, excluding nested annotation rotations.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const start = new RegExp(`(?:^|\\n)(${escaped}\\s*\\{)`).exec(css)
  if (!start) throw new Error(`Missing ${label} CSS`)
  const from = start.index + start[0].indexOf(selector)
  // Skip quoted strings and comments while counting nested rule braces.
  const tokens = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|[{}]/g
  tokens.lastIndex = css.indexOf('{', from)
  let depth = 0
  for (let token; (token = tokens.exec(css));) {
    if (token[0] === '{') depth++
    if (token[0] !== '}' || --depth !== 0) continue
    const block = css.slice(from, tokens.lastIndex)
    if (/url\s*\(/i.test(block)) throw new Error(`Unexpected url( in ${label} CSS`)
    return block
  }
  throw new Error(`Incomplete ${label} CSS`)
}
