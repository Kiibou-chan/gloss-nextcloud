/** Keep only pdf.js's core selectable text styles, without annotation assets. */
export function textLayerCss(css) {
  const start = /(?:^|\n)(\.textLayer\s*\{)/.exec(css)
  if (!start) throw new Error('Missing .textLayer core CSS')
  const from = start.index + start[0].indexOf('.textLayer')
  // Skip quoted strings and comments while counting nested rule braces.
  const tokens = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|[{}]/g
  tokens.lastIndex = css.indexOf('{', from)
  let depth = 0
  for (let token; (token = tokens.exec(css));) {
    if (token[0] === '{') depth++
    if (token[0] !== '}' || --depth !== 0) continue
    const block = css.slice(from, tokens.lastIndex)
    if (/url\s*\(/i.test(block)) throw new Error('Unexpected url( in .textLayer core CSS')
    return block + '\n'
  }
  throw new Error('Incomplete .textLayer core CSS')
}
