import { useState } from 'react'
import { GraduationCap, Layers3, ListChecks, NotebookPen, RotateCcw, Trash2, CheckCircle2, XCircle, Shuffle } from 'lucide-react'
import { useApp } from '../context/AppContext'

const date = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function Flashcards({ items, remove }) {
  const [flipped, setFlipped] = useState({})
  const [actives, setActives] = useState({})
  const [orders, setOrders] = useState({})

  // Each deck keeps its own position — a shared index broke when two decks
  // had different lengths or were navigated independently.
  const setActive = (id, update) => setActives((a) => {
    const current = a[id] || 0
    return { ...a, [id]: typeof update === 'function' ? update(current) : update }
  })

  const shuffle = (item) => {
    const idx = (item.cards || []).map((_, i) => i)
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]] }
    setOrders((o) => ({ ...o, [item.id]: idx }))
    setActive(item.id, 0)
    setFlipped((f) => ({ ...f, [`${item.id}-0`]: false }))
  }

  return (
    <>
      {items.map((item) => {
        const active = actives[item.id] || 0
        const cards = orders[item.id] ? orders[item.id].map((i) => item.cards[i]) : (item.cards || [])
        const flipKey = `${item.id}-${active}`
        return (
          <div className="card study-card" key={item.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Layers3 size={16} style={{ color: 'var(--accent)' }} />
              <h3 style={{ flex: 1, margin: 0 }}>{item.title}</h3>
              <button className="icon-btn" style={{ width: 26, height: 26, border: 'none', background: 'none' }} title="Shuffle cards" onClick={() => shuffle(item)}><Shuffle size={13} /></button>
              <span className="muted" style={{ fontSize: 11 }}>{date(item.createdAt)}</span>
              <button className="icon-btn" style={{ width: 26, height: 26, border: 'none', background: 'none' }} title="Delete set" aria-label="Delete set" onClick={() => remove(item.id)}><Trash2 size={13} /></button>
            </div>
            {cards.length > 0 ? (
              <>
                <div className="flashcard" tabIndex={0} title="Click or press Space to flip · arrow keys to navigate"
                  onClick={() => setFlipped((f) => ({ ...f, [flipKey]: !f[flipKey] }))}
                  onKeyDown={(e) => {
                    if (e.code === 'Space') { e.preventDefault(); setFlipped((f) => ({ ...f, [flipKey]: !f[flipKey] })) }
                    if (e.key === 'ArrowRight') setActive(item.id, (a) => Math.min(a + 1, cards.length - 1))
                    if (e.key === 'ArrowLeft') setActive(item.id, (a) => Math.max(a - 1, 0))
                  }}>
                  <div className={`flash-inner ${flipped[flipKey] ? 'flipped' : ''}`}>
                    <div className="flash-face flash-front">
                      <div className="flash-label">Question {active + 1} / {cards.length}</div>
                      <div>{cards[active]?.question}</div>
                    </div>
                    <div className="flash-face flash-back">
                      <div className="flash-label">Answer</div>
                      <div>{cards[active]?.answer}</div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <button className="btn sm" disabled={active === 0} onClick={() => setActive(item.id, (a) => a - 1)}>Previous</button>
                  <button className="btn sm ghost" onClick={() => setFlipped((f) => ({ ...f, [flipKey]: false }))}><RotateCcw size={13} /> Flip</button>
                  <button className="btn sm" disabled={active >= cards.length - 1} onClick={() => setActive(item.id, (a) => a + 1)}>Next</button>
                </div>
                <div className="flash-progress">
                  {cards.map((_, i) => <button key={i} className={i === active ? 'active' : ''} onClick={() => setActive(item.id, i)} aria-label={`Card ${i + 1}`} />)}
                </div>
              </>
            ) : <p className="muted" style={{ fontSize: 12 }}>No cards available.</p>}
          </div>
        )
      })}
    </>
  )
}

function Quizzes({ items, remove }) {
  const [answers, setAnswers] = useState({})
  return (
    <>
      {items.map((item) => {
        const qs = item.questions || []
        const correct = qs.reduce((n, q, i) => n + (answers[`${item.id}-${i}`] === q.answer ? 1 : 0), 0)
        const done = Object.keys(answers).filter((k) => k.startsWith(`${item.id}-`)).length
        return (
          <div className="card study-card study-wide" key={item.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <ListChecks size={16} style={{ color: 'var(--teal)' }} />
              <h3 style={{ flex: 1, margin: 0 }}>{item.title}</h3>
              {done > 0 && <span className="status done"><span className="dot" />{correct}/{done} correct</span>}
              <button className="icon-btn" style={{ width: 26, height: 26, border: 'none', background: 'none' }} title="Reset answers"
                onClick={() => setAnswers((a) => { const next = { ...a }; Object.keys(next).filter((k) => k.startsWith(`${item.id}-`)).forEach((k) => delete next[k]); return next })}>
                <RotateCcw size={13} />
              </button>
              <span className="muted" style={{ fontSize: 11 }}>{date(item.createdAt)}</span>
              <button className="icon-btn" style={{ width: 26, height: 26, border: 'none', background: 'none' }} title="Delete set" aria-label="Delete set" onClick={() => remove(item.id)}><Trash2 size={13} /></button>
            </div>
            {qs.map((q, i) => {
              const key = `${item.id}-${i}`
              const picked = answers[key]
              return (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{i + 1}. {q.question}</div>
                  {(q.options || []).map((opt, j) => {
                    let cls = 'quiz-opt'
                    if (picked !== undefined) {
                      if (j === q.answer) cls += ' correct'
                      else if (j === picked) cls += ' wrong'
                    }
                    return (
                      <button key={j} className={cls} disabled={picked !== undefined} onClick={() => setAnswers((a) => ({ ...a, [key]: j }))}>
                        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                          {String.fromCharCode(65 + j)}. {opt}
                          {picked !== undefined && j === q.answer && <CheckCircle2 size={14} color="var(--green)" />}
                          {picked === j && j !== q.answer && <XCircle size={14} color="var(--red)" />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
            {!qs.length && <p className="muted" style={{ fontSize: 12 }}>No questions available.</p>}
          </div>
        )
      })}
    </>
  )
}

function Summaries({ items, remove }) {
  return items.map((item) => (
    <div className="card study-card study-wide" key={item.id}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <NotebookPen size={16} style={{ color: 'var(--amber)' }} />
        <h3 style={{ flex: 1, margin: 0 }}>{item.title}</h3>
        <span className="muted" style={{ fontSize: 11 }}>{date(item.createdAt)}</span>
        <button className="icon-btn" style={{ width: 26, height: 26, border: 'none', background: 'none' }} title="Delete set" aria-label="Delete set" onClick={() => remove(item.id)}><Trash2 size={13} /></button>
      </div>
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 13 }}>{item.text}</div>
    </div>
  ))
}

export default function StudyTools() {
  const { studyItems, deleteStudyItem } = useApp()
  const [tab, setTab] = useState('flashcards')
  const byType = (t) => studyItems.filter((x) => x.type === t)

  const tabs = [
    { id: 'flashcards', label: 'Flashcards', icon: Layers3, n: byType('flashcards').length },
    { id: 'mcqs', label: 'Quizzes', icon: ListChecks, n: byType('mcqs').length },
    { id: 'summary', label: 'Summaries & notes', icon: NotebookPen, n: studyItems.filter((x) => ['summary', 'explain', 'examples', 'roadmap', 'connections'].includes(x.type)).length },
  ]
  const list = tab === 'flashcards' ? byType('flashcards') : tab === 'mcqs' ? byType('mcqs') : studyItems.filter((x) => ['summary', 'explain', 'examples', 'roadmap', 'connections'].includes(x.type))

  return (
    <div className="view">
      <div className="section-head">
        <div><div className="eyebrow">Practice & review</div><h2 style={{ fontSize: 22, marginTop: 6 }}>Study Tools</h2></div>
      </div>
      <div className="tabs">
        {tabs.map((t) => { const Icon = t.icon; return <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}><Icon size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{t.label} <span className="muted">({t.n})</span></button> })}
      </div>
      {list.length ? (
        <div className="study-grid">
          {tab === 'flashcards' && <Flashcards items={list} remove={deleteStudyItem} />}
          {tab === 'mcqs' && <Quizzes items={list} remove={deleteStudyItem} />}
          {tab === 'summary' && <Summaries items={list} remove={deleteStudyItem} />}
        </div>
      ) : (
        <div className="empty card" style={{ padding: 60 }}>
          <div className="ei"><GraduationCap size={28} /></div>
          <h2>Nothing here yet</h2>
          <p>Select text in a document, or nodes in a knowledge graph, and choose “Create flashcards” or “Generate MCQs” from the Learn toolbar.</p>
        </div>
      )}
    </div>
  )
}
