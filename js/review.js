(() => {
	const root = document.getElementById('gloss-review')
	if (!root) return
	const base = location.pathname.replace(/\/$/, '')
	const token = document.head.dataset.requesttoken || ''
	const $ = id => document.getElementById(id)
	const textEl = $('gr-text'); const form = $('gr-form'); const items = $('gr-items'); const status = $('gr-status')
	const CONTEXT = 32
	let text = ''
	let review = { reviewer: '', items: [], sent: false }
	let pending = null
	let saveTimer = 0

	const store = {
		get: k => { try { return localStorage.getItem(k) } catch { return null } },
		set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* private window */ } },
	}
	const keyFor = name => {
		let id = store.get('gloss-review-id:' + base)
		if (!id) { id = Math.random().toString(36).slice(2, 10); store.set('gloss-review-id:' + base, id) }
		const slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'reviewer'
		return slug + '-' + id
	}
	const say = s => { status.textContent = s }

	/** Where an item's quote sits now: its saved offset if the words still match there, otherwise the first match. */
	const locate = it => {
		const at = it.from
		if (text.slice(at, at + it.quote.exact.length) === it.quote.exact) return at
		const i = text.indexOf(it.quote.prefix + it.quote.exact)
		if (i >= 0) return i + it.quote.prefix.length
		return text.indexOf(it.quote.exact)
	}

	const render = () => {
		const spans = review.items.map((it, n) => ({ n, at: locate(it), len: it.quote.exact.length }))
			.filter(s => s.at >= 0).sort((a, b) => a.at - b.at)
		textEl.replaceChildren()
		let pos = 0
		for (const s of spans) {
			if (s.at < pos) continue
			textEl.append(text.slice(pos, s.at))
			const m = document.createElement('mark')
			m.textContent = text.slice(s.at, s.at + s.len)
			m.dataset.n = String(s.n)
			textEl.append(m)
			pos = s.at + s.len
		}
		textEl.append(text.slice(pos))
		items.replaceChildren(...review.items.map((it, n) => {
			const li = document.createElement('li')
			li.dataset.n = String(n)
			const q = document.createElement('blockquote'); q.textContent = it.quote.exact
			li.append(q)
			if (it.comment) { const p = document.createElement('p'); p.textContent = it.comment; li.append(p) }
			if (it.proposal !== undefined) {
				const p = document.createElement('p'); p.className = 'gr-proposal'; p.textContent = '→ ' + it.proposal; li.append(p)
			}
			if (!review.sent) {
				const del = document.createElement('button'); del.type = 'button'; del.textContent = 'Remove'
				del.addEventListener('click', () => { review.items.splice(n, 1); render(); queueSave() })
				li.append(del)
			}
			return li
		}))
		$('gr-send').disabled = review.sent || review.items.length === 0
		if (review.sent) say('Review sent. Thank you.')
	}

	const post = async () => {
		const body = new URLSearchParams({ reviewer: review.reviewer, review: JSON.stringify(review) })
		const r = await fetch(base + '/review', { method: 'POST', headers: { requesttoken: token }, body })
		if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText)
	}
	const queueSave = () => {
		clearTimeout(saveTimer)
		say('Saving…')
		saveTimer = setTimeout(() => post().then(() => say('Saved')).catch(e => say('Not saved: ' + e.message)), 600)
	}

	const loadReview = async name => {
		review.reviewer = keyFor(name)
		review.name = name
		const r = await fetch(base + '/review?' + new URLSearchParams({ reviewer: review.reviewer }))
		const saved = await r.json()
		review = { ...review, items: saved.items || [], sent: !!saved.sent }
		render()
	}

	const offsetOf = (node, off) => {
		const r = document.createRange(); r.setStart(textEl, 0); r.setEnd(node, off); return r.toString().length
	}
	textEl.addEventListener('mouseup', () => {
		const sel = getSelection()
		if (review.sent || !sel || sel.isCollapsed || !textEl.contains(sel.anchorNode) || !textEl.contains(sel.focusNode)) return
		const range = sel.getRangeAt(0)
		const from = offsetOf(range.startContainer, range.startOffset)
		const to = offsetOf(range.endContainer, range.endOffset)
		if (to <= from) return
		if (!review.reviewer) { $('gr-name').focus(); say('Enter your name first.'); return }
		pending = { from, quote: { exact: text.slice(from, to), prefix: text.slice(Math.max(0, from - CONTEXT), from), suffix: text.slice(to, to + CONTEXT) } }
		$('gr-quote').textContent = pending.quote.exact
		$('gr-comment').value = ''; $('gr-proposal').value = ''
		form.hidden = false; $('gr-hint').hidden = true
		$('gr-comment').focus()
	})
	form.addEventListener('submit', e => {
		e.preventDefault()
		if (!pending) return
		const comment = $('gr-comment').value.trim(); const proposal = $('gr-proposal').value
		if (!comment && !proposal) return
		review.items.push({ ...pending, comment, ...proposal ? { proposal } : {}, at: new Date().toISOString() })
		pending = null; form.hidden = true; $('gr-hint').hidden = false
		getSelection()?.removeAllRanges()
		render(); queueSave()
	})
	$('gr-cancel').addEventListener('click', () => { pending = null; form.hidden = true; $('gr-hint').hidden = false })
	$('gr-name').addEventListener('change', e => {
		const name = e.target.value.trim()
		if (!name) return
		store.set('gloss-review-name:' + base, name)
		loadReview(name).catch(err => say('Could not load your review: ' + err.message))
	})
	$('gr-send').addEventListener('click', () => {
		review.sent = true
		post().then(() => render()).catch(e => { review.sent = false; say('Not sent: ' + e.message) })
	})

	fetch(base + '/text').then(r => r.json()).then(d => {
		if (d.error) { say(d.error); return }
		text = d.text
		render()
		const name = store.get('gloss-review-name:' + base)
		if (name) { $('gr-name').value = name; return loadReview(name) }
	}).catch(e => say('Could not load the draft: ' + e.message))
})()
