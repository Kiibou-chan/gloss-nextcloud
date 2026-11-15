(() => {
	const root = document.getElementById('gloss-review')
	if (!root) return
	const base = location.pathname.replace(/\/$/, '')
	const token = document.head.dataset.requesttoken || ''
	const $ = id => document.getElementById(id)
	const editor = $('gr-text'); const pdfEl = $('gr-pdf'); const form = $('gr-form'); const list = $('gr-items'); const status = $('gr-status')
	const CONTEXT = 32

	let src = '' // the draft as shared
	let srcOps = []
	let isTypst = false
	let applied = '' // the draft with the reviewer's proposals applied, what the editor shows
	let appliedOps = []
	let proposals = [] // {id, from, to, text, comments, at}: src [from, to) replaced by text
	let notes = [] // {id, from, to, comments, at}: comments on src [from, to)
	const review = { reviewer: '', name: '', sent: false }
	let pending = null // {from, to} in src, or {id} of an item, for the comment form
	let pdfReady = null
	let sourceKey = null
	let saveTimer = 0

	const store = {
		get: k => { try { return localStorage.getItem(k) } catch { return null } },
		set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* private window */ } },
	}
	const say = s => { status.textContent = s }
	const newId = () => Math.random().toString(36).slice(2, 10)
	const keyFor = name => {
		let id = store.get('gloss-review-id:' + base)
		if (!id) { id = newId(); store.set('gloss-review-id:' + base, id) }
		const slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'reviewer'
		return slug + '-' + id
	}
	const parse = text => isTypst ? GlossTypst.parse(text)
		: [{ op: 'open', tag: 'div', cls: 'gr-plain' }, { op: 'text', from: 0, to: text.length }, { op: 'close' }]
	/** The characters of [from, to) the view shows, markup left out. */
	const shown = (text, ops, from, to) => ops.filter(o => o.op === 'text' && o.to > from && o.from < to)
		.map(o => text.slice(Math.max(o.from, from), Math.min(o.to, to))).join('').replace(/\s+/g, ' ').trim()
	const quoteOf = (from, to) => ({ exact: src.slice(from, to), prefix: src.slice(Math.max(0, from - CONTEXT), from), suffix: src.slice(to, to + CONTEXT) })
	/** Where a saved quote sits in the draft now: its saved offset if the words still match there, otherwise by its context. */
	const locate = it => {
		const q = it.quote
		if (src.slice(it.from, it.from + q.exact.length) === q.exact && src.slice(Math.max(0, it.from - q.prefix.length), it.from) === q.prefix) return it.from
		const i = src.indexOf(q.prefix + q.exact + q.suffix)
		if (i >= 0) return i + q.prefix.length
		const j = src.indexOf(q.prefix + q.exact)
		if (j >= 0) return j + q.prefix.length
		return q.exact ? src.indexOf(q.exact) : -1
	}

	// Mapping between the draft and the draft with proposals applied.
	const sorted = () => [...proposals].sort((a, b) => a.from - b.from)
	const toApplied = p => {
		let delta = 0
		for (const x of sorted()) {
			if (p < x.from) break
			if (p < x.to || p === x.from) return x.from + delta
			if (p === x.to) return x.from + delta + x.text.length
			delta += x.text.length - (x.to - x.from)
		}
		return p + delta
	}
	/** The draft offset of an applied offset, or the proposal whose new words hold it. */
	const fromApplied = q => {
		let delta = 0
		for (const x of sorted()) {
			const aFrom = x.from + delta; const aTo = aFrom + x.text.length
			if (q < aFrom) break
			if (q < aTo || (q === aTo && x.text.length && q > aFrom)) return q === aFrom ? { at: x.from } : { inside: x }
			delta += x.text.length - (x.to - x.from)
		}
		return { at: q - delta }
	}
	const apply = () => {
		let out = ''; let pos = 0
		for (const x of sorted()) { out += src.slice(pos, x.from) + x.text; pos = x.to }
		applied = out + src.slice(pos)
		appliedOps = parse(applied)
	}

	const drawEditor = () => {
		const marks = []; const dels = []
		for (const x of proposals) {
			const a = toApplied(x.from)
			if (x.text) marks.push({ from: a, to: a + x.text.length, n: x.id, cls: 'gr-ins' })
			if (x.to > x.from) dels.push({ at: a, text: shown(src, srcOps, x.from, x.to) || src.slice(x.from, x.to), n: x.id })
		}
		for (const c of notes) {
			const a = toApplied(c.from); const b = toApplied(c.to)
			if (b > a) marks.push({ from: a, to: b, n: c.id, cls: 'gr-note' })
		}
		GlossTypst.render(editor, applied, appliedOps, marks, dels)
		editor.contentEditable = review.sent || !review.reviewer ? 'false' : 'true'
	}
	const drawPdf = () => {
		if (!pdfReady) return
		const items = [...proposals.filter(x => x.to > x.from), ...notes].map(x => ({ ...x, shown: shown(src, srcOps, x.from, x.to) }))
		pdfReady.then(() => GlossPdf.highlight(pdfEl, items, it => it.from / Math.max(1, src.length)))
	}

	const card = x => {
		const isProposal = 'text' in x
		const li = document.createElement('li'); li.dataset.id = x.id
		const head = document.createElement('div'); head.className = 'gr-card-head'
		if (isProposal) {
			const old = shown(src, srcOps, x.from, x.to)
			const a = toApplied(x.from)
			const now = shown(applied, appliedOps, a, a + x.text.length)
			if (old) { const d = document.createElement('del'); d.textContent = old; head.append(d) }
			if (old && now) head.append(' → ')
			if (now) { const i = document.createElement('ins'); i.textContent = now; head.append(i) }
			if (!old && !now) head.append('(markup only)')
		} else {
			const q = document.createElement('blockquote'); q.textContent = shown(src, srcOps, x.from, x.to); head.append(q)
		}
		li.append(head)
		for (const [k, c] of x.comments.entries()) {
			const p = document.createElement('p'); p.className = 'gr-comment'; p.textContent = c.text
			if (!review.sent) {
				const del = document.createElement('button'); del.type = 'button'; del.className = 'gr-link'; del.textContent = 'Delete'
				del.addEventListener('click', e => {
					e.stopPropagation(); x.comments.splice(k, 1)
					if (!isProposal && !x.comments.length) notes = notes.filter(n => n !== x)
					redraw(); queueSave()
				})
				p.append(' ', del)
			}
			li.append(p)
		}
		if (!review.sent) {
			const row = document.createElement('div'); row.className = 'gr-card-actions'
			const add = document.createElement('button'); add.type = 'button'; add.textContent = x.comments.length ? 'Add comment' : 'Comment'
			add.addEventListener('click', e => { e.stopPropagation(); openForm({ id: x.id }) })
			row.append(add)
			if (isProposal) {
				const undo = document.createElement('button'); undo.type = 'button'; undo.textContent = 'Undo change'
				undo.addEventListener('click', e => {
					e.stopPropagation()
					proposals = proposals.filter(p => p !== x)
					if (x.comments.length) notes.push({ id: x.id, from: x.from, to: Math.max(x.to, x.from + 1), comments: x.comments, at: x.at })
					apply(); redraw(); queueSave()
				})
				row.append(undo)
			}
			li.append(row)
		}
		li.addEventListener('click', () => {
			editor.querySelector(`[data-items~="${x.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
			pdfEl.querySelector(`.gr-pdf-mark[data-n="${CSS.escape(x.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
		})
		return li
	}
	const drawList = () => {
		const all = [...proposals, ...notes].sort((a, b) => a.from - b.from)
		list.replaceChildren(...all.map(card))
		$('gr-send').disabled = review.sent || all.length === 0
		$('gr-count').textContent = all.length ? `${proposals.length} changes, ${notes.length} comments` : ''
		if (review.sent) say('Review sent. Thank you.')
	}
	const redraw = () => { drawEditor(); drawPdf(); drawList() }

	// The comment form.
	const openForm = target => {
		if (!review.reviewer) { $('gr-name').focus(); say('Enter your name first.'); return }
		pending = target
		const item = target.id && [...proposals, ...notes].find(x => x.id === target.id)
		const from = item ? item.from : target.from; const to = item ? item.to : target.to
		$('gr-quote').textContent = shown(src, srcOps, from, to) || '(new words)'
		$('gr-comment').value = ''
		form.hidden = false; $('gr-hint').hidden = true
		if (target.focus !== false) $('gr-comment').focus()
	}
	const closeForm = () => { pending = null; form.hidden = true; $('gr-hint').hidden = false }
	form.addEventListener('submit', e => {
		e.preventDefault()
		const text = $('gr-comment').value.trim()
		if (!pending || !text) return
		const c = { text, at: new Date().toISOString() }
		const item = pending.id && [...proposals, ...notes].find(x => x.id === pending.id)
		if (item) item.comments.push(c)
		else notes.push({ id: newId(), from: pending.from, to: pending.to, comments: [c], at: c.at })
		closeForm(); getSelection()?.removeAllRanges()
		redraw(); queueSave()
	})
	$('gr-cancel').addEventListener('click', closeForm)

	/** A comment target for the draft range [from, to): the proposal it touches, or the range itself. */
	const targetFor = (from, to) => {
		const x = proposals.find(p => p.from < Math.max(to, from + 1) && Math.max(p.to, p.from + 1) > from)
		return x ? { id: x.id } : { from, to }
	}

	// Editing: each keystroke replaces shown characters of the applied draft, keeping the markup between them, and the
	// difference between the draft and the applied draft is the proposals.
	const undo = []; const redo = []
	const shownRanges = () => appliedOps.filter(o => o.op === 'text')
	const isShown = i => shownRanges().some(o => i >= o.from && i < o.to)
	const prevShown = i => { for (let j = i - 1; j >= 0; j--) if (isShown(j)) return j; return -1 }
	const nextShown = i => { for (let j = i; j < applied.length; j++) if (isShown(j)) return j; return -1 }
	/** applied with the shown characters of [a, b) removed and insert put at a. */
	const edited = (a, b, insert) => {
		const ranges = shownRanges()
		let kept = ''
		for (let i = a; i < b; i++) if (!ranges.some(o => i >= o.from && i < o.to)) kept += applied[i]
		return applied.slice(0, a) + insert + kept + applied.slice(b)
	}
	const setApplied = (text, caret) => {
		if (text === applied) return
		const old = proposals
		proposals = GlossDiff.changes(src, text).map(c => ({ from: c.aFrom, to: c.aTo, text: text.slice(c.bFrom, c.bTo) }))
		// Changes with only markup or a space between them are one change.
		proposals = proposals.reduce((out, p) => {
			const prev = out[out.length - 1]
			if (prev && !shown(src, srcOps, prev.to, p.from)) {
				const joined = { from: prev.from, to: p.to }
				joined.text = text.slice(toAppliedIn(proposals, text, prev.from), toAppliedIn(proposals, text, p.to, true))
				out[out.length - 1] = joined
			} else out.push(p)
			return out
		}, [])
		const taken = new Set()
		for (const p of proposals) {
			const was = old.find(o => !taken.has(o) && o.from <= p.to && p.from <= o.to)
			if (was) { taken.add(was); p.id = was.id; p.comments = was.comments; p.at = was.at }
			else { p.id = newId(); p.comments = []; p.at = new Date().toISOString() }
		}
		for (const o of old) if (!taken.has(o) && o.comments.length) notes.push({ id: o.id, from: o.from, to: Math.max(o.to, o.from + 1), comments: o.comments, at: o.at })
		apply(); redraw(); placeCaret(caret); queueSave()
	}
	/** toApplied for a list of unjoined changes against their new text. */
	const toAppliedIn = (list, text, p, end = false) => {
		let delta = 0
		for (const x of list) {
			if (p < x.from || (p === x.from && !end)) break
			if (p < x.to) return x.from + delta
			delta += x.text.length - (x.to - x.from)
		}
		return p + delta
	}
	const placeCaret = at => {
		const spans = [...editor.querySelectorAll('[data-from]')]
		const span = spans.find(e => at >= Number(e.dataset.from) && at < Number(e.dataset.to))
			|| spans.find(e => at === Number(e.dataset.to)) || spans.find(e => Number(e.dataset.from) >= at)
		if (!span?.firstChild) return
		const off = Math.min(Math.max(0, at - Number(span.dataset.from)), span.firstChild.length)
		const r = document.createRange(); r.setStart(span.firstChild, off); r.collapse(true)
		const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r)
	}
	const caretRange = () => {
		const sel = getSelection()
		if (!sel?.rangeCount || !editor.contains(sel.anchorNode)) return null
		const r = sel.getRangeAt(0)
		const a = GlossTypst.sourceOffset(r.startContainer, r.startOffset); const b = GlossTypst.sourceOffset(r.endContainer, r.endOffset)
		return a === null || b === null ? null : [Math.min(a, b), Math.max(a, b)]
	}
	const WORD = /[\p{L}\p{N}]/u
	const editBy = (type, data) => {
		const range = caretRange()
		if (!range) return
		let [a, b] = range
		if (a === b) {
			if (type === 'deleteContentBackward') { a = prevShown(a); if (a < 0) return }
			else if (type === 'deleteContentForward') { b = nextShown(a); if (b < 0) return; a = b; b = a + 1 }
			else if (type === 'deleteWordBackward') {
				let j = prevShown(a)
				while (j >= 0 && /\s/.test(applied[j])) j = prevShown(j)
				while (j >= 0 && WORD.test(applied[j])) { const k = prevShown(j); if (k < 0 || !WORD.test(applied[k])) break; j = k }
				if (j < 0) return
				a = j
			} else if (type === 'deleteWordForward') {
				let j = nextShown(a)
				while (j >= 0 && /\s/.test(applied[j])) j = nextShown(j + 1)
				while (j >= 0 && WORD.test(applied[j])) j = nextShown(j + 1)
				b = j < 0 ? applied.length : j
			}
		}
		undo.push(applied); redo.length = 0
		setApplied(edited(a, b, data), a + data.length)
	}
	editor.addEventListener('beforeinput', e => {
		if (review.sent) { e.preventDefault(); return }
		const t = e.inputType
		if (t === 'insertCompositionText') return
		e.preventDefault()
		if (t === 'historyUndo') { if (undo.length) { redo.push(applied); setApplied(undo.pop(), caretRange()?.[0] ?? 0) } return }
		if (t === 'historyRedo') { if (redo.length) { undo.push(applied); setApplied(redo.pop(), caretRange()?.[0] ?? 0) } return }
		if (t === 'insertText' || t === 'insertReplacementText') editBy('insert', (e.data ?? e.dataTransfer?.getData('text/plain') ?? '').replace(/\s*\n\s*/g, ' '))
		else if (t === 'insertFromPaste') editBy('insert', (e.dataTransfer?.getData('text/plain') ?? '').replace(/\s*\n\s*/g, ' '))
		else if (t.startsWith('delete')) editBy(t, '')
	})
	editor.addEventListener('compositionend', e => { editBy('insert', e.data || '') })
	editor.addEventListener('keydown', e => {
		if (e.key === 'Enter') e.preventDefault()
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
			e.preventDefault()
			const back = e.shiftKey ? redo : undo; const fwd = e.shiftKey ? undo : redo
			if (back.length) { fwd.push(applied); setApplied(back.pop(), caretRange()?.[0] ?? 0) }
		}
	})
	editor.addEventListener('drop', e => e.preventDefault())
	const selectionIn = el => {
		const sel = getSelection()
		if (review.sent || !sel || sel.isCollapsed || !el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) return null
		return sel
	}
	editor.addEventListener('mouseup', () => {
		const sel = selectionIn(editor)
		if (!sel) return
		const r = sel.getRangeAt(0)
		const a = GlossTypst.sourceOffset(r.startContainer, r.startOffset); const b = GlossTypst.sourceOffset(r.endContainer, r.endOffset)
		if (a === null || b === null || b <= a) return
		const fa = fromApplied(a); const fb = fromApplied(b)
		const inside = fa.inside || fb.inside
		openForm({ ...(inside ? { id: inside.id } : targetFor(fa.at, fb.at)), focus: false })
	})
	pdfEl.addEventListener('mouseup', () => {
		const sel = selectionIn(pdfEl)
		if (!sel) return
		sourceKey ??= GlossPdf.sourceKey(src, srcOps)
		const at = GlossPdf.toSource(sourceKey, sel.toString(), GlossPdf.fractionOf(pdfEl, sel.anchorNode))
		if (!at) { say('That selection could not be placed in the draft. Select a little more, or use the editor.'); return }
		openForm(targetFor(at.from, at.to))
		const a = toApplied(at.from)
		;[...editor.querySelectorAll('[data-from]')].find(e => Number(e.dataset.to) > a)?.scrollIntoView({ block: 'center' })
	})

	// Views.
	const setView = mode => {
		root.dataset.view = mode
		editor.hidden = mode === 'pdf'; pdfEl.hidden = mode === 'editor'
		for (const m of ['editor', 'pdf', 'both']) $('gr-view-' + m)?.setAttribute('aria-pressed', String(m === mode))
		store.set('gloss-review-view:' + base, mode)
		if (mode !== 'editor' && !pdfReady) {
			say('Loading the PDF…')
			pdfReady = GlossPdf.mount(pdfEl, base + '/pdf', root.dataset.worker)
			pdfReady.then(() => { say(''); drawPdf() }).catch(e => say('Could not load the PDF: ' + e.message))
		} else if (pdfReady) drawPdf()
	}
	for (const m of ['editor', 'pdf', 'both']) $('gr-view-' + m)?.addEventListener('click', () => setView(m))

	// Saving.
	const toSaved = () => {
		const at = x => ({ id: x.id, from: x.from, quote: quoteOf(x.from, x.to), shown: shown(src, srcOps, x.from, x.to), comments: x.comments, at: x.at })
		return {
			reviewer: review.reviewer, name: review.name, sent: review.sent, draft: $('gr-title').textContent,
			items: [
				...proposals.map(x => {
					const a = toApplied(x.from)
					return { kind: 'proposal', ...at(x), proposal: x.text, proposalShown: shown(applied, appliedOps, a, a + x.text.length) }
				}),
				...notes.map(x => ({ kind: 'comment', ...at(x) })),
			],
		}
	}
	const post = async () => {
		const body = new URLSearchParams({ reviewer: review.reviewer, review: JSON.stringify(toSaved()) })
		const r = await fetch(base + '/review', { method: 'POST', headers: { requesttoken: token }, body })
		if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText)
	}
	const queueSave = () => {
		clearTimeout(saveTimer)
		say('Saving…')
		saveTimer = setTimeout(() => post().then(() => say('Saved')).catch(e => say('Not saved: ' + e.message)), 600)
	}
	const loadReview = async name => {
		review.reviewer = keyFor(name); review.name = name
		const saved = await (await fetch(base + '/review?' + new URLSearchParams({ reviewer: review.reviewer }))).json()
		review.sent = !!saved.sent
		proposals = []; notes = []
		let lost = 0
		for (const it of saved.items || []) {
			if (!it.quote) { lost++; continue }
			const from = locate(it)
			if (from < 0) { lost++; continue }
			const x = { id: it.id || newId(), from, to: from + it.quote.exact.length, comments: it.comments || [], at: it.at }
			if (it.kind === 'proposal') proposals.push({ ...x, text: it.proposal })
			else notes.push(x)
		}
		apply(); redraw()
		say(lost ? `${lost} of your earlier items no longer match the draft.` : '')
	}
	$('gr-name').addEventListener('change', e => {
		const name = e.target.value.trim()
		if (!name) return
		store.set('gloss-review-name:' + base, name)
		loadReview(name).catch(err => say('Could not load your review: ' + err.message))
	})
	$('gr-send').addEventListener('click', () => {
		review.sent = true
		post().then(redraw).catch(e => { review.sent = false; say('Not sent: ' + e.message) })
	})

	fetch(base + '/text').then(r => r.json()).then(d => {
		if (d.error) { say(d.error); return }
		src = d.text; isTypst = /\.typ$/i.test(d.name)
		srcOps = parse(src)
		apply(); redraw()
		setView(root.dataset.hasPdf ? (store.get('gloss-review-view:' + base) || 'editor') : 'editor')
		const name = store.get('gloss-review-name:' + base)
		if (name) { $('gr-name').value = name; return loadReview(name) }
		say('Enter your name to start.')
	}).catch(e => say('Could not load the draft: ' + e.message))
})()
