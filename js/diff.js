/**
 * Word diff of two strings (Myers' O(ND) algorithm over word, space, and punctuation tokens), grouped into changes:
 * [{aFrom, aTo, bFrom, bTo}], a's range replaced by b's. Changes separated by one space only are joined.
 */
window.GlossDiff = (() => {
	const TOKEN = /\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu

	const tokens = s => {
		const out = []
		for (const m of s.matchAll(TOKEN)) out.push({ t: m[0], at: m.index })
		return out
	}

	/** The edit script as runs: [{kind: 'eq'|'del'|'ins', a: [i, j), b: [k, l)}] in token indices. */
	const script = (a, b) => {
		const n = a.length; const m = b.length; const max = n + m; const off = max + 1
		let v = new Int32Array(2 * max + 3)
		const trace = []
		let found = false
		for (let d = 0; d <= max && !found; d++) {
			trace.push(v.slice())
			for (let k = -d; k <= d; k += 2) {
				let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1
				let y = x - k
				while (x < n && y < m && a[x].t === b[y].t) { x++; y++ }
				v[off + k] = x
				if (x >= n && y >= m) { found = true; break }
			}
		}
		trace.push(v.slice())
		const steps = []
		let x = n; let y = m
		for (let d = trace.length - 2; d > 0; d--) {
			const pv = trace[d]; const k = x - y
			const prevK = k === -d || (k !== d && pv[off + k - 1] < pv[off + k + 1]) ? k + 1 : k - 1
			const px = pv[off + prevK]; const py = px - prevK
			while (x > px && y > py) { steps.push(['eq', x - 1, y - 1]); x--; y-- }
			if (x === px) steps.push(['ins', x, y - 1]); else steps.push(['del', x - 1, y])
			x = px; y = py
		}
		while (x > 0 && y > 0) { steps.push(['eq', x - 1, y - 1]); x--; y-- }
		return steps.reverse()
	}

	const changes = (sa, sb) => {
		if (sa === sb) return []
		const a = tokens(sa); const b = tokens(sb)
		const end = (arr, s, i) => i < arr.length ? arr[i].at : s.length
		const out = []
		let cur = null
		let ia = 0; let ib = 0
		let gap = [] // equal tokens since the last change
		for (const [kind] of script(a, b)) {
			if (kind === 'eq') {
				if (cur) gap.push(a[ia].t)
				ia++; ib++
				if (cur && !(gap.length === 1 && /^\s+$/.test(gap[0]))) { out.push(cur); cur = null; gap = [] }
				continue
			}
			if (!cur) cur = { aFrom: end(a, sa, ia), bFrom: end(b, sb, ib) }
			gap = []
			if (kind === 'del') ia++; else ib++
			cur.aTo = end(a, sa, ia); cur.bTo = end(b, sb, ib)
		}
		if (cur) out.push(cur)
		return out.map(c => ({ aFrom: c.aFrom, aTo: c.aTo ?? c.aFrom, bFrom: c.bFrom, bTo: c.bTo ?? c.bFrom }))
	}

	return { changes }
})()
