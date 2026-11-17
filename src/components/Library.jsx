import { useRef, useState } from 'react'
import { UploadCloud, FileText, Search, Eye, Pencil, Trash2, FileUp, GraduationCap } from 'lucide-react'
import FileIcon from './FileIcon'
import { useApp } from '../context/AppContext'
import { KIND_META } from '../lib/extraction'
import { useConfirm } from '../lib/useConfirm'

function fmtSize(b) {
  if (!b) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), 3)
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`
}
const date = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export default function Library({ onOpenFile, selectedIds, setSelectedIds, onLearnSelected, onAskSelected, setView }) {
  const { files, addFiles, renameFile, deleteFile } = useApp()
  const [drag, setDrag] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [editing, setEditing] = useState(null)
  const [newName, setNewName] = useState('')
  const [confirmNode, confirm] = useConfirm()
  const inputRef = useRef(null)

  const kinds = ['all', ...Array.from(new Set(files.map((f) => f.kind)))]
  const shown = files.filter((f) => {
    const okQ = f.name.toLowerCase().includes(query.toLowerCase())
    const okF = filter === 'all' || f.kind === filter
    return okQ && okF
  }).sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    if (sort === 'oldest') return a.uploadDate - b.uploadDate
    return b.uploadDate - a.uploadDate
  })

  const deleteSelected = async () => {
    if (!selectedIds.length) return
    const ok = await confirm({
      title: `Delete ${selectedIds.length} file${selectedIds.length > 1 ? 's' : ''}?`,
      body: 'Their extracted text, chat sources and linked notes are removed too. This cannot be undone.',
      confirmLabel: 'Delete files',
    })
    if (!ok) return
    selectedIds.forEach((id) => deleteFile(id))
    setSelectedIds([])
  }

  const handleFiles = (list) => { addFiles(list); inputRef.current.value = '' }
  const toggleSelect = (id) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  return (
    <div className="view">
      <div className="section-head">
        <div><div className="eyebrow">Your collection</div><h2 style={{ fontSize: 22, marginTop: 6 }}>My Library</h2></div>
        <button className="btn primary" onClick={() => inputRef.current?.click()}><UploadCloud size={16} /> Upload files</button>
      </div>

      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files) }}
      >
        <input ref={inputRef} type="file" multiple hidden accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.markdown,.jpg,.jpeg,.png,.webp"
          onChange={(e) => e.target.files.length && handleFiles(e.target.files)} />
        <div className="dicon"><FileUp size={24} /></div>
        <h3>Drop your files here</h3>
        <p>Drag & drop or click to browse · PDF, PPTX, DOCX, TXT, MD, images · Multiple files supported</p>
      </div>

      {selectedIds.length > 0 && (
        <div className="card" style={{ padding: '12px 16px', marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{selectedIds.length} selected</span>
          <button className="btn sm primary" onClick={onLearnSelected}><GraduationCap size={14} /> Learn from selection</button>
          <button className="btn sm" onClick={onAskSelected}>Ask AI about these</button>
          <button className="btn sm danger" onClick={deleteSelected}><Trash2 size={14} /> Delete</button>
          <button className="btn sm ghost" onClick={() => setSelectedIds([])}>Clear</button>
        </div>
      )}

      <div className="toolbar">
        <div className="search"><Search size={16} className="muted" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your library..." /></div>
        <div className="chips">
          {kinds.map((k) => (
            <button key={k} className={`chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
              {k === 'all' ? 'All' : KIND_META[k]?.label || k}
            </button>
          ))}
        </div>
        <select className="select sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {shown.length ? (
        <div className="file-grid">
          {shown.map((f) => (
            <div key={f.id} className={`card file-card ${selectedIds.includes(f.id) ? 'selected' : ''}`}
              onClick={(e) => { if (e.target.closest('.no-sel')) return; toggleSelect(f.id) }}>
              <div className="file-top">
                <div className="file-ico" style={{ color: KIND_META[f.kind]?.color }}>
                  <FileIcon kind={f.kind} size={19} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editing === f.id ? (
                    <input className="input" autoFocus value={newName} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { renameFile(f.id, newName.trim() || f.name); setEditing(null) }
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      onBlur={() => { renameFile(f.id, newName.trim() || f.name); setEditing(null) }} />
                  ) : <div className="file-name">{f.name}</div>}
                  <div className="file-meta">{KIND_META[f.kind]?.label} · {fmtSize(f.size)}</div>
                  <div className="file-meta">{date(f.uploadDate)}</div>
                </div>
              </div>

              {f.status === 'processing' && <><div className="progress-line"><i style={{ width: `${f.progress || 8}%` }} /></div><div className="file-meta" style={{ marginTop: 6 }}>Extracting text…</div></>}
              {f.status === 'error' && <div className="err-text">{f.error}</div>}
              {f.status === 'done' && <div className="file-meta" style={{ marginTop: 8 }}>{f.note || `${f.pages?.length || 0} section(s)`} · {f.text?.length.toLocaleString()} chars</div>}

              <div className="file-foot">
                <span className={`status ${f.status}`}><span className="dot" />{f.status === 'done' ? 'Ready' : f.status}</span>
                <div className="file-actions no-sel">
                  <button className="icon-btn" title="Open" onClick={() => onOpenFile(f)}><Eye size={15} /></button>
                  <button className="icon-btn" title="Rename" onClick={() => { setEditing(f.id); setNewName(f.name) }}><Pencil size={15} /></button>
                  <button className="icon-btn" title="Delete" onClick={async () => {
                    const ok = await confirm({
                      title: `Delete “${f.name}”?`,
                      body: 'Its extracted text, chat sources and linked notes are removed too. This cannot be undone.',
                      confirmLabel: 'Delete file',
                    })
                    if (ok) deleteFile(f.id)
                  }}><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty" style={{ marginTop: 24 }}>
          <div className="ei"><FileText size={26} /></div>
          <h3>{files.length ? 'No matching files' : 'Your library is empty'}</h3>
          <p>{files.length ? 'Try a different search or filter.' : 'Upload a document above to get started.'}</p>
        </div>
      )}
      {confirmNode}
    </div>
  )
}
