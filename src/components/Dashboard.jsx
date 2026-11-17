import { FileText, MessageSquareText, Network, Layers3, ArrowRight, Upload, ListChecks, FileClock, NotebookPen, Check, Plus } from 'lucide-react'
import { useApp } from '../context/AppContext'

function timeAgo(t) {
  const d = Date.now() - t
  if (d < 60000) return 'just now'
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  return `${Math.floor(d / 86400000)}d ago`
}

export default function Dashboard({ setView, onUpload, onOpenActivity }) {
  const { files, graphs, conversations, activity, studyItems, notes } = useApp()

  const stats = [
    { icon: FileText, color: 'var(--accent)', num: files.length, label: 'Documents' },
    { icon: NotebookPen, color: 'var(--teal)', num: notes.length, label: 'Notes' },
    { icon: MessageSquareText, color: 'var(--accent)', num: conversations.length, label: 'Chats' },
    { icon: Network, color: 'var(--amber)', num: graphs.length, label: 'Graphs' },
    { icon: Layers3, color: 'var(--green)', num: studyItems.length, label: 'Study sets' },
  ]

  const actions = [
    { icon: MessageSquareText, title: 'Ask your AI', desc: 'Grounded answers from your sources', fn: () => setView('chat') },
    { icon: Network, title: 'Build a knowledge graph', desc: 'Map ideas and see connections', fn: () => setView('graphs') },
    { icon: NotebookPen, title: 'Organize your notes', desc: 'Domains, subjects and chapters', fn: () => setView('notes') },
    { icon: ListChecks, title: 'Study tools', desc: 'Flashcards, quizzes and summaries', fn: () => setView('study') },
  ]

  const steps = [
    { done: files.length > 0, label: 'Upload a study source', fn: onUpload },
    { done: conversations.length > 0, label: 'Ask a question with AI', fn: () => setView('chat') },
    { done: graphs.length > 0 || notes.length > 0, label: 'Map or organize your ideas', fn: () => setView('notes') },
    { done: studyItems.length > 0, label: 'Create a flashcard set', fn: () => setView('study') },
  ]
  const completed = steps.filter((s) => s.done).length

  return (
    <div className="view dash-view">
      <section className="hero dash-hero">
        <div className="dash-kicker">Your learning workspace</div>
        <h2>Make every source count.</h2>
        <p>Upload your material, ask questions grounded in it, and turn what you learn into maps and study sets — all in one focused space.</p>
        <div className="dash-hero-actions">
          <button className="btn primary" onClick={onUpload}><Upload size={15} /> Upload files</button>
          <button className="btn ghost" onClick={() => setView('chat')}>Open AI chat <ArrowRight size={14} /></button>
        </div>
      </section>

      <div className="stat-grid">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div className="card stat" key={s.label}>
              <div className="stat-top"><span className="stat-label">{s.label}</span><Icon size={16} style={{ color: s.color }} /></div>
              <div className="stat-num">{s.num}</div>
            </div>
          )
        })}
      </div>

      <div className="dash-grid">
        <section className="card dash-card">
          <div className="section-head">
            <div><h2>Recent activity</h2><p className="section-sub">Pick up where you left off</p></div>
            <button className="link" onClick={() => setView('library')}>View library →</button>
          </div>
          {activity.length ? activity.slice(0, 7).map((a) => (
            <button type="button" className="activity-row clickable" key={a.id} onClick={() => onOpenActivity?.(a)} title="Open">
              <div className="ai">{a.type === 'graph' ? <Network size={16} /> : <FileClock size={16} />}</div>
              <div className="t"><b>{a.title}</b><span>{a.type === 'graph' ? 'Knowledge graph' : 'Document'} · {timeAgo(a.time)}</span></div>
              <ArrowRight size={14} className="muted" />
            </button>
          )) : (
            <div className="dash-empty">
              <div className="ei"><FileClock size={22} /></div>
              <p>Nothing yet — your recent files and graphs will show up here.</p>
              <button className="btn sm" onClick={onUpload}><Plus size={13} /> Upload a file</button>
            </div>
          )}
        </section>

        <div className="dash-side">
          <section className="card dash-card">
            <div className="section-head"><div><h2>Quick actions</h2><p className="section-sub">Jump straight in</p></div></div>
            <div className="action-list">
              {actions.map((a) => {
                const Icon = a.icon
                return (
                  <button className="action-row" key={a.title} onClick={a.fn}>
                    <span className="action-icon"><Icon size={16} /></span>
                    <span className="action-copy"><b>{a.title}</b><span>{a.desc}</span></span>
                    <ArrowRight size={14} className="muted" />
                  </button>
                )
              })}
            </div>
          </section>

          <section className="card dash-card getting-started">
            <div className="section-head">
              <div><h2>Getting started</h2><p className="section-sub">{completed} of {steps.length} complete</p></div>
              <div className="gs-ring">{completed}/{steps.length}</div>
            </div>
            <div className="gs-bar"><i style={{ width: `${(completed / steps.length) * 100}%` }} /></div>
            <div className="gs-list">
              {steps.map((s) => (
                <button key={s.label} className={`gs-row ${s.done ? 'done' : ''}`} onClick={() => !s.done && s.fn()}>
                  <span className="gs-check">{s.done ? <Check size={12} /> : null}</span>
                  <span>{s.label}</span>
                  {!s.done && <ArrowRight size={13} className="muted" />}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
