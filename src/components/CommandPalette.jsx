import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutDashboard, Library, MessageSquareText, Network, GraduationCap, NotebookPen, Upload, Plus, FlaskConical, Search, FileText, CornerDownLeft, Keyboard } from 'lucide-react'
import { useFocusTrap } from '../lib/useFocusTrap'

export default function CommandPalette({ open, onClose, onNavigate, onUpload, onNewChat, onNewGraph, onToggleDemo, demoMode, files, graphs, notes = [], onOpenFile, onOpenGraph, onOpenNote, onShortcuts }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef(null)
  const dialogRef = useRef(null)
  useFocusTrap(dialogRef, open)

  useEffect(() => {
    if (open) { setQuery(''); setIndex(0); inputRef.current?.focus() }
  }, [open])

  const commands = useMemo(() => {
    const base = [
      { id: 'dash', label: 'Go to Dashboard', icon: LayoutDashboard, hint: 'Navigation', run: () => onNavigate('dashboard') },
      { id: 'lib', label: 'Go to My Library', icon: Library, hint: 'Navigation', run: () => onNavigate('library') },
      { id: 'chat', label: 'Go to AI Chat', icon: MessageSquareText, hint: 'Navigation', run: () => onNavigate('chat') },
      { id: 'graphs', label: 'Go to Knowledge Graphs', icon: Network, hint: 'Navigation', run: () => onNavigate('graphs') },
      { id: 'study', label: 'Go to Study Tools', icon: GraduationCap, hint: 'Navigation', run: () => onNavigate('study') },
      { id: 'notes', label: 'Go to Notes', icon: NotebookPen, hint: 'Navigation', run: () => onNavigate('notes') },
      { id: 'upload', label: 'Upload files', icon: Upload, hint: 'Action', run: onUpload },
      { id: 'newchat', label: 'New conversation', icon: Plus, hint: 'Action', run: onNewChat },
      { id: 'newgraph', label: 'Generate a new graph', icon: Network, hint: 'Action', run: onNewGraph },
      { id: 'demo', label: demoMode ? 'Switch to full AI mode' : 'Switch to Demo mode', icon: FlaskConical, hint: 'Settings', run: onToggleDemo },
      { id: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard, hint: 'Help', run: onShortcuts },
    ]
    const recentFiles = files.filter((f) => f.status === 'done').slice(0, 6).map((f) => ({
      id: `file-${f.id}`, label: f.name, icon: FileText, hint: 'Document',
      run: () => onOpenFile(f),
    }))
    const recentGraphs = graphs.slice(0, 6).map((g) => ({
      id: `graph-${g.id}`, label: g.title, icon: Network, hint: 'Graph',
      run: () => onOpenGraph(g.id),
    }))
    const noteResults = notes.map((n) => ({
      id: `note-${n.id}`, label: n.title, icon: NotebookPen, hint: 'Note',
      keywords: (n.content || '').slice(0, 400),
      run: () => onOpenNote?.(n.id),
    }))
    return [...base, ...recentFiles, ...recentGraphs, ...noteResults]
  }, [demoMode, files, graphs, notes, onNavigate, onUpload, onNewChat, onNewGraph, onToggleDemo, onOpenFile, onOpenGraph, onOpenNote, onShortcuts])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands.slice(0, 9)
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q) || (c.keywords || '').toLowerCase().includes(q)).slice(0, 10)
  }, [commands, query])

  useEffect(() => { setIndex(0) }, [query])

  if (!open) return null

  const run = (cmd) => { if (!cmd) return; onClose(); cmd.run() }

  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="command-palette" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input">
          <Search size={17} />
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files, graphs or run a command…"
            onKeyDown={(e) => {
              if (!results.length) return
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
              if (e.key === 'Enter') { e.preventDefault(); run(results[index]) }
            }} />
          <kbd>ESC</kbd>
        </div>
        <div className="palette-results">
          {results.map((c, i) => {
            const Icon = c.icon
            return (
              <button key={c.id} className={`palette-item ${i === index ? 'active' : ''}`}
                onMouseEnter={() => setIndex(i)} onClick={() => run(c)}>
                <Icon size={16} />
                <span>{c.label}</span>
                <em>{c.hint}</em>
                {i === index && <CornerDownLeft size={14} className="muted" />}
              </button>
            )
          })}
          {!results.length && <div className="empty" style={{ padding: 30 }}><p>No matches.</p></div>}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
