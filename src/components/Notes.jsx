import { useEffect, useMemo, useRef, useState } from 'react'
import { NotebookPen, Plus, Trash2, ChevronRight, ChevronDown, Network, MessageSquareText, FileText, Search, Link2, X, ArrowUpRight, GitMerge, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { uid } from '../lib/storage'
import { buildNotesGraph } from '../lib/notesGraph'
import NotesGraph from './NotesGraph'
import MarkdownView from './MarkdownView'
import { useConfirm } from '../lib/useConfirm'

const NEXT_TYPE = { domain: 'subject', subject: 'chapter', chapter: 'note', note: null, source: null }
const TYPE_LABEL = { domain: 'Domain', subject: 'Subject', chapter: 'Chapter', note: 'Note', source: 'Uploaded source' }

export default function Notes({ activeId, setActiveId, onOpenGraph, onAsk, onOpenFile, onSyncUploads, onNoteAction }) {
  const { notes, graphs, saveNote, deleteNote, mergeNote } = useApp()
  const [expanded, setExpanded] = useState({})
  const [search, setSearch] = useState('')
  const [showMap, setShowMap] = useState(true)
  const [editMode, setEditMode] = useState('write')
  const [saveState, setSaveState] = useState('saved')
  const [confirmNode, confirm] = useConfirm()
  const saveTimer = useRef(null)

  useEffect(() => { onSyncUploads?.() }, [])

  const childrenOf = (id) => notes.filter((n) => n.parentId === id).sort((a, b) => (a.order || 0) - (b.order || 0))
  const roots = childrenOf(null)
  const active = notes.find((n) => n.id === activeId)

  const breadcrumb = useMemo(() => {
    const path = []
    let node = active
    while (node) { path.unshift(node); node = notes.find((n) => n.id === node.parentId) }
    return path
  }, [active, notes])

  // [[Wiki Links]] inside note content plus explicit connections.
  const linksOf = (note) => {
    const ids = new Set(note?.links || [])
    const re = /\[\[([^\]]+)\]\]/g
    let match
    while ((match = re.exec(note?.content || ''))) {
      const target = notes.find((n) => n.title.trim().toLowerCase() === match[1].trim().toLowerCase())
      if (target && target.id !== note.id) ids.add(target.id)
    }
    return [...ids].filter((id) => notes.some((n) => n.id === id))
  }

  const visible = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    const keep = new Set()
    const mark = (note) => {
      if (note.title.toLowerCase().includes(q) || (note.content || '').toLowerCase().includes(q)) {
        let cur = note
        while (cur) { keep.add(cur.id); cur = notes.find((n) => n.id === cur.parentId) }
      }
      childrenOf(note.id).forEach(mark)
    }
    roots.forEach(mark)
    return keep
  }, [search, notes])

  const addNote = (parentId = null, type = 'domain') => {
    const note = {
      id: uid(), title: `New ${TYPE_LABEL[type]}`, content: '', links: [], parentId, type,
      order: notes.length, createdAt: Date.now(), updatedAt: Date.now(),
    }
    saveNote(note)
    setActiveId(note.id)
    if (parentId) setExpanded((e) => ({ ...e, [parentId]: true }))
  }

  const update = (patch) => {
    if (!active) return
    saveNote({ ...active, ...patch, updatedAt: Date.now() })
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaveState('saved'), 700)
  }

  const toggleLink = (targetId) => {
    if (!active) return
    const links = linksOf(active).filter((id) => id !== targetId)
    if (!links.includes(targetId)) links.push(targetId)
    update({ links })
  }

  const buildGraph = (full = false) => {
    const rootId = full || !active ? null : active.id
    // Re-open an existing map instead of creating a duplicate on every click.
    const existing = graphs.find((g) => g.source === 'notes' && !!g.full === full && (g.rootNoteId || null) === rootId)
    if (existing) { onOpenGraph(existing); return }
    const graph = buildNotesGraph(notes, { full, rootId })
    if (graph) onOpenGraph(graph)
  }

  const descendantsOf = (id) => {
    const out = []
    const walk = (parent) => notes.filter((n) => n.parentId === parent).forEach((c) => { out.push(c.id); walk(c.id) })
    walk(id)
    return out
  }
  const candidates = active ? notes.filter((n) => n.id !== active.id && !descendantsOf(active.id).includes(n.id)) : []

  const renderTree = (note, depth) => {
    if (visible && !visible.has(note.id)) return null
    const kids = childrenOf(note.id)
    const isOpen = expanded[note.id] !== false || !!search
    const isActive = activeId === note.id
    return (
      <div key={note.id}>
        <div className={`note-tree-item ${isActive ? 'active' : ''}`} style={{ paddingLeft: 8 + depth * 16 }}>
          {kids.length ? (
            <button className="note-caret" aria-expanded={isOpen} aria-label={`${isOpen ? 'Collapse' : 'Expand'} “${note.title || 'Untitled'}”`}
              onClick={() => setExpanded((x) => ({ ...x, [note.id]: !isOpen }))}>
              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : <span className="note-caret" aria-hidden="true" />}
          <button className="note-tree-open" onClick={() => setActiveId(note.id)}
            aria-current={isActive ? 'true' : undefined} title={note.title || 'Untitled'}>
            <span className="note-tree-type" data-type={note.type} />
            <span className="note-tree-label">{note.title || 'Untitled'}</span>
          </button>
          {NEXT_TYPE[note.type] && (
            <button className="note-tree-action" title={`Add ${TYPE_LABEL[NEXT_TYPE[note.type]]}`} aria-label={`Add ${TYPE_LABEL[NEXT_TYPE[note.type]]} under “${note.title || 'Untitled'}”`}
              onClick={() => addNote(note.id, NEXT_TYPE[note.type])}><Plus size={13} /></button>
          )}
          <button className="note-tree-action danger" title="Delete" aria-label={`Delete “${note.title || 'Untitled'}”`} onClick={async () => {
            const ok = await confirm({
              title: `Delete “${note.title || 'Untitled'}”?`,
              body: 'Any notes nested beneath it are deleted as well. This cannot be undone.',
              confirmLabel: 'Delete note',
            })
            if (ok) { deleteNote(note.id); if (isActive) setActiveId(null) }
          }}><Trash2 size={13} /></button>
        </div>
        {isOpen && kids.map((k) => renderTree(k, depth + 1))}
      </div>
    )
  }

  const linkedNotes = active ? linksOf(active).map((id) => notes.find((n) => n.id === id)).filter(Boolean) : []

  return (
    <div className="view notes-view">
      <div className="section-head">
        <div><div className="eyebrow">Your knowledge base</div><h2 style={{ fontSize: 22, marginTop: 6 }}>Notes</h2></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => onSyncUploads?.()} title="Bring any uploaded files into Notes"><FileText size={15} /> Sync uploads</button>
          <button className="btn" disabled={!active} onClick={() => onAsk(active)}><MessageSquareText size={15} /> Ask AI</button>
          <button className="btn" disabled={!notes.length} onClick={() => buildGraph(true)}><Network size={15} /> Open full map</button>
          <button className="btn primary" onClick={() => setShowMap((v) => !v)}>{showMap ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />} {showMap ? 'Hide map' : 'Show map'}</button>
        </div>
      </div>

      <div className={`notes-layout ${showMap ? 'with-map' : ''}`}>
        <div className="card notes-tree">
          <div className="notes-tree-head">
            <span>Structure</span>
            <button className="icon-btn" title="Add domain" onClick={() => addNote(null, 'domain')}><Plus size={15} /></button>
          </div>
          <div className="notes-search"><Search size={13} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find notes…" /></div>
          {roots.length ? roots.map((r) => renderTree(r, 0)) : (
            <div className="notes-empty">
              <NotebookPen size={22} />
              <p>Start with a domain, then add subjects, chapters and notes beneath it.</p>
              <button className="btn sm primary" onClick={() => addNote(null, 'domain')}><Plus size={14} /> Add domain</button>
            </div>
          )}
          {visible && !visible.size && <p className="muted" style={{ fontSize: 12, padding: 12 }}>No notes match “{search}”.</p>}
        </div>

        <div className="card notes-editor">
          {active ? (
            <>
              <div className="notes-breadcrumb">
                {breadcrumb.map((b, i) => <span key={b.id}>{i > 0 && <ChevronRight size={11} />}{b.title || 'Untitled'}</span>)}
              </div>
              <div className="notes-meta">
                {TYPE_LABEL[active.type]} · updated {new Date(active.updatedAt).toLocaleDateString()}
                {active.fileId && <button className="btn sm ghost" style={{ marginLeft: 10 }} onClick={() => onOpenFile?.(active.fileId)}><ArrowUpRight size={13} /> Open source file</button>}
              </div>
              <input className="notes-title" value={active.title} onChange={(e) => update({ title: e.target.value })} placeholder="Untitled" />
              <div className="note-study-actions">
                <button className="btn sm" disabled={!active.content.trim()} onClick={() => onNoteAction?.(active, 'flashcards')}>Flashcards</button>
                <button className="btn sm" disabled={!active.content.trim()} onClick={() => onNoteAction?.(active, 'mcqs')}>Quiz</button>
                <button className="btn sm" disabled={!active.content.trim()} onClick={() => onNoteAction?.(active, 'summarize')}>Summarize</button>
                <button className="btn sm" disabled={!active.content.trim()} onClick={() => onNoteAction?.(active, 'mindmap')}>Mind map</button>
              </div>
              <div className="notes-mode">
                <button className={`chip ${editMode === 'write' ? 'active' : ''}`} onClick={() => setEditMode('write')}>Write</button>
                <button className={`chip ${editMode === 'preview' ? 'active' : ''}`} onClick={() => setEditMode('preview')}>Preview</button>
              </div>
              {editMode === 'write' ? (
                <textarea className="notes-content" value={active.content} onChange={(e) => update({ content: e.target.value })}
                  placeholder="Write your notes here… Use [[Note Title]] to link another note." />
              ) : (
                <div className="notes-content notes-preview">
                  <MarkdownView text={active.content} onWiki={(title) => {
                    const target = notes.find((n) => n.title.trim().toLowerCase() === title.trim().toLowerCase())
                    if (target) setActiveId(target.id)
                  }} />
                </div>
              )}

              <div className="note-connections">
                <div className="note-connections-head"><Link2 size={13} /> Connections</div>
                <div className="note-link-chips">
                  {linkedNotes.map((n) => (
                    <span key={n.id} className="note-link-chip">
                      <button onClick={() => setActiveId(n.id)}>{n.title}</button>
                      <button title="Remove link" onClick={() => toggleLink(n.id)}><X size={11} /></button>
                    </span>
                  ))}
                  {!linkedNotes.length && <span className="muted" style={{ fontSize: 11 }}>No connections yet. Use [[Note Title]] or add one below.</span>}
                </div>
                <select className="select" value="" onChange={(e) => { if (e.target.value) toggleLink(e.target.value); e.target.value = '' }}>
                  <option value="">Connect to a note…</option>
                  {notes.filter((n) => n.id !== active.id && !linkedNotes.some((l) => l.id === n.id)).map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
                </select>
              </div>

              <div className="note-organize">
                <div className="note-connections-head"><GitMerge size={13} /> Organize</div>
                <div className="note-organize-row">
                  <select className="select" value="" onChange={(e) => {
                    if (e.target.value) { update({ parentId: e.target.value }); setExpanded((x) => ({ ...x, [e.target.value]: true })) }
                    e.target.value = ''
                  }}>
                    <option value="">Move under…</option>
                    {candidates.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
                  </select>
                  <select className="select" value="" onChange={async (e) => {
                    const targetId = e.target.value
                    e.target.value = ''
                    if (!targetId) return
                    const target = notes.find((n) => n.id === targetId)
                    const ok = await confirm({
                      title: `Merge into “${target?.title || 'that note'}”?`,
                      body: 'This note’s content, links and sub-notes move into the target, then this note is removed.',
                      confirmLabel: 'Merge notes',
                      danger: false,
                    })
                    if (ok) { mergeNote(active.id, targetId); setActiveId(targetId) }
                  }}>
                    <option value="">Merge into…</option>
                    {candidates.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
                  </select>
                  {active.parentId && <button className="btn sm" onClick={() => update({ parentId: null })}>Move to root</button>}
                </div>
              </div>
              <div className="notes-foot">
                <FileText size={12} /> {active.content.length} characters
                <span className={`save-state ${saveState}`}>
                  <span className="save-dot" /> {saveState === 'saving' ? 'Saving…' : 'Saved locally'}
                </span>
              </div>
            </>
          ) : (
            <div className="empty">
              <div className="ei"><NotebookPen size={26} /></div>
              <h3>Select or create a note</h3>
              <p>Build a tree of domains, subjects, chapters and notes, connect them with [[links]], then open the full map.</p>
            </div>
          )}
        </div>

        {showMap && <NotesGraph notes={notes} activeId={activeId} onSelect={setActiveId} onOpenFull={() => buildGraph(true)} />}
      </div>
      {confirmNode}
    </div>
  )
}
