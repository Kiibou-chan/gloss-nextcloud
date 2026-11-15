(() => {
	const root = document.getElementById('gloss-review')
	if (!root) return
	const base = location.pathname.replace(/\/$/, '')
	const token = document.head.dataset.requesttoken || ''
	const $ = id => document.getElementById(id)
	const editorEl = $('gr-text'); const pdfEl = $('gr-pdf'); const form = $('gr-form'); const list = $('gr-items'); const status = $('gr-status')
	const CONTEXT = 32

	let src = '' // the draft as shared
	let srcOps = []
	let isTypst = false
	let applied = '' // the draft with the reviewer's proposals applied, what the editor shows
	let cm = null // the editor
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
	}

	const drawEditor = () => {
		if (!cm) return
		const marks = []; const deleted = []
		for (const x of proposals) {
			const a = toApplied(x.from)
			if (x.text) marks.push({ from: a, to: a + x.text.length, id: x.id, cls: 'gr-ins' })
			if (x.to > x.from) deleted.push({ at: a, text: src.slice(x.from, x.to), id: x.id })
		}
		for (const c of notes) {
			const a = toApplied(c.from); const b = toApplied(c.to)
			if (b > a) marks.push({ from: a, to: b, id: c.id, cls: 'gr-note' })
		}
		cm.setDecos(marks, deleted)
		cm.setEditable(!review.sent && !!review.reviewer)
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
		const brief = s => s.replace(/\s+/g, ' ').trim()
		if (isProposal) {
			const old = brief(src.slice(x.from, x.to)); const now = brief(x.text)
			if (old) { const d = document.createElement('del'); d.textContent = old; head.append(d) }
			if (old && now) head.append(' → ')
			if (now) { const i = document.createElement('ins'); i.textContent = now; head.append(i) }
			if (!old && !now) head.append('(line break)')
		} else {
			const q = document.createElement('blockquote'); q.textContent = brief(src.slice(x.from, x.to)); head.append(q)
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
					const a = toApplied(x.from)
					cm.replace(a, a + x.text.length, src.slice(x.from, x.to))
				})
				row.append(undo)
			}
			li.append(row)
		}
		li.addEventListener('click', () => {
			cm?.scrollTo(toApplied(x.from))
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
		$('gr-quote').textContent = src.slice(from, to).replace(/\s+/g, ' ').trim() || '(new words)'
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

	// Editing: the difference between the draft and the editor's text is the proposals.
	const setApplied = text => {
		if (text === applied) return
		const old = proposals
		proposals = GlossDiff.changes(src, text).map(c => ({ from: c.aFrom, to: c.aTo, text: text.slice(c.bFrom, c.bTo) }))
		const taken = new Set()
		for (const p of proposals) {
			const was = old.find(o => !taken.has(o) && o.from <= p.to && p.from <= o.to)
			if (was) { taken.add(was); p.id = was.id; p.comments = was.comments; p.at = was.at }
			else { p.id = newId(); p.comments = []; p.at = new Date().toISOString() }
		}
		for (const o of old) if (!taken.has(o) && o.comments.length) notes.push({ id: o.id, from: o.from, to: Math.max(o.to, o.from + 1), comments: o.comments, at: o.at })
		applied = text
		redraw(); queueSave()
	}
	const selectionIn = el => {
		const sel = getSelection()
		if (review.sent || !sel || sel.isCollapsed || !el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) return null
		return sel
	}
	editorEl.addEventListener('mouseup', () => setTimeout(() => {
		if (!cm || review.sent) return
		const [a, b] = cm.selection()
		if (b <= a) return
		const fa = fromApplied(a); const fb = fromApplied(b)
		const inside = fa.inside || fb.inside
		openForm({ ...(inside ? { id: inside.id } : targetFor(fa.at, fb.at)), focus: false })
	}))
	pdfEl.addEventListener('mouseup', () => {
		const sel = selectionIn(pdfEl)
		if (!sel) return
		sourceKey ??= GlossPdf.sourceKey(src, srcOps)
		const at = GlossPdf.toSource(sourceKey, sel.toString(), GlossPdf.fractionOf(pdfEl, sel.anchorNode))
		if (!at) { say('That selection could not be placed in the draft. Select a little more, or use the editor.'); return }
		openForm(targetFor(at.from, at.to))
		cm?.scrollTo(toApplied(at.from))
	})

	// Views.
	const setView = mode => {
		root.dataset.view = mode
		editorEl.hidden = mode === 'pdf'; pdfEl.hidden = mode === 'editor'
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
		const appliedOps = parse(applied)
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
		apply(); cm.setDoc(applied); redraw()
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
		apply()
		const lang = isTypst ? 'typst' : /\.tex$/i.test(d.name) ? 'latex' : /\.md$/i.test(d.name) ? 'markdown' : 'plain'
		cm = GlossEditor.create(editorEl, { doc: applied, lang, onChange: setApplied })
		redraw()
		setView(root.dataset.hasPdf ? (store.get('gloss-review-view:' + base) || 'editor') : 'editor')
		const name = store.get('gloss-review-name:' + base)
		if (name) { $('gr-name').value = name; return loadReview(name) }
		say('Enter your name to start.')
	}).catch(e => say('Could not load the draft: ' + e.message))
})()
