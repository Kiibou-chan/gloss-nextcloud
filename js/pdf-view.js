/**
 * The draft's PDF with a selectable text layer, and the bridge between PDF text and the source: both sides are reduced to
 * their letters and digits (lower case, ligatures split), so line breaks, hyphenation, and markup do not stop a match.
 */
window.GlossPdf = (() => {
	const keep = /[\p{L}\p{N}]/u

	/** A key of letters and digits for chars, each key character carrying the place its char came from. */
	const keyOf = chars => {
		let key = ''; const at = []
		for (const [ch, place] of chars) {
			for (const k of ch.normalize('NFKC').toLowerCase()) if (keep.test(k)) { key += k; at.push(place) }
		}
		return { key, at }
	}

	/** The source key: the characters the readable view shows, each with its source offset. */
	const sourceKey = (src, ops) => keyOf((function* () {
		for (const o of ops) if (o.op === 'text') for (let i = o.from; i < o.to; i++) yield [src[i], i]
	})())

	/** Every start of needle in hay. */
	const findAll = (hay, needle) => {
		const out = []
		if (!needle) return out
		for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) out.push(i)
		return out
	}

	/** The source range of a PDF selection, the match nearest the selection's place in the document; null if none. */
	const toSource = (sk, selected, fraction) => {
		const { key } = keyOf([...selected].map(c => [c, 0]))
		const hits = findAll(sk.key, key)
		if (!hits.length) return null
		const best = hits.reduce((a, b) => Math.abs(a / sk.key.length - fraction) <= Math.abs(b / sk.key.length - fraction) ? a : b)
		return { from: sk.at[best], to: sk.at[best + key.length - 1] + 1 }
	}

	const mount = async (el, url, workerSrc) => {
		pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc
		const doc = await pdfjsLib.getDocument({ url, isEvalSupported: false }).promise
		el.replaceChildren()
		const width = Math.min(el.clientWidth || 800, 900) - 2
		for (let n = 1; n <= doc.numPages; n++) {
			const page = await doc.getPage(n)
			const base = page.getViewport({ scale: 1 })
			const viewport = page.getViewport({ scale: width / base.width })
			const box = document.createElement('div'); box.className = 'gr-page'; box.dataset.page = String(n)
			box.style.width = viewport.width + 'px'; box.style.height = viewport.height + 'px'
			const canvas = document.createElement('canvas'); const ratio = window.devicePixelRatio || 1
			canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio)
			canvas.style.width = viewport.width + 'px'; canvas.style.height = viewport.height + 'px'
			const layer = document.createElement('div'); layer.className = 'textLayer'
			layer.style.setProperty('--scale-factor', String(viewport.scale))
			const marks = document.createElement('div'); marks.className = 'gr-pdf-marks'
			box.append(canvas, marks, layer); el.append(box)
			await page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] }).promise
			await pdfjsLib.renderTextLayer({ textContentSource: await page.getTextContent(), container: layer, viewport, textDivs: [] }).promise
		}
		return doc.numPages
	}

	/** Where a selection sits in the document, from 0 to 1, by its page. */
	const fractionOf = (el, node) => {
		const page = (node.nodeType === Node.TEXT_NODE ? node.parentElement : node)?.closest('.gr-page')
		const pages = el.querySelectorAll('.gr-page').length
		return page && pages ? (Number(page.dataset.page) - 0.5) / pages : 0.5
	}

	/** Highlights over the PDF text for each item's shown words; returns how many were found. */
	const highlight = (el, items, fractionOf) => {
		el.querySelectorAll('.gr-pdf-marks').forEach(m => m.replaceChildren())
		const nodes = []
		el.querySelectorAll('.textLayer').forEach(layer => {
			const w = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
			for (let t = w.nextNode(); t; t = w.nextNode()) nodes.push(t)
		})
		const pk = keyOf((function* () { for (const t of nodes) for (let i = 0; i < t.length; i++) yield [t.data[i], [t, i]] })())
		let found = 0
		items.forEach((it, n) => {
			const { key } = keyOf([...(it.shown || it.quote.exact)].map(c => [c, 0]))
			const hits = findAll(pk.key, key)
			if (!hits.length) return
			const f = fractionOf(it)
			const at = hits.reduce((a, b) => Math.abs(a / pk.key.length - f) <= Math.abs(b / pk.key.length - f) ? a : b)
			found++
			const [startNode, startOff] = pk.at[at]; const [endNode, endOff] = pk.at[at + key.length - 1]
			const r = document.createRange(); r.setStart(startNode, startOff); r.setEnd(endNode, endOff + 1)
			for (const rect of r.getClientRects()) {
				const box = (startNode.parentElement.closest('.gr-page'))
				const pageOf = [...el.querySelectorAll('.gr-page')].find(p => {
					const b = p.getBoundingClientRect(); return rect.top >= b.top - 1 && rect.bottom <= b.bottom + 1
				}) || box
				const b = pageOf.getBoundingClientRect()
				const d = document.createElement('div'); d.className = 'gr-pdf-mark'; d.dataset.n = String(n)
				Object.assign(d.style, { left: rect.left - b.left + 'px', top: rect.top - b.top + 'px', width: rect.width + 'px', height: rect.height + 'px' })
				pageOf.querySelector('.gr-pdf-marks').append(d)
			}
		})
		return found
	}

	return { keyOf, sourceKey, toSource, mount, fractionOf, highlight }
})()
