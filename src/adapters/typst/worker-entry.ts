import init, { TypstCompilerBuilder } from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs'
import { createProtocol, type Assets, type CompilerLike, type CompilerMessage } from './protocol'

async function bytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function start(assets: Assets): Promise<CompilerLike> {
  const [wasm, fonts] = await Promise.all([bytes(assets.wasmUrl), Promise.all(assets.fontUrls.map(bytes))])
  await init({ module_or_path: wasm })
  const builder = new TypstCompilerBuilder()
  builder.set_dummy_access_model()
  for (const font of fonts) await builder.add_raw_font(font)
  return await builder.build() as unknown as CompilerLike
}

const protocol = createProtocol({ start, now: () => performance.now() })

self.addEventListener('message', async event => {
  const answer = await protocol.handle((event as MessageEvent<CompilerMessage>).data)
  if (!answer) return
  const transfer = 'pdf' in answer && answer.pdf ? [answer.pdf.buffer] : []
  ;(self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(answer, transfer)
})
