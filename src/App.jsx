import { useCallback, useEffect, useRef, useState } from 'react'
import { Settings, UploadCloud, Search, X, Keyboard } from 'lucide-react'
import { AppProvider, useApp } from './context/AppContext'
import { runLearnAction, generateGraph, LEARN_ACTIONS, isAuthError, testConnection } from './lib/ai'
import { uid } from './lib/storage'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import Library from './components/Library'
import DocumentViewer from './components/DocumentViewer'
import Chat from './components/Chat'
import Graphs from './components/Graphs'
import StudyTools from './components/StudyTools'
import Notes from './components/Notes'
import SelectionToolbar from './components/SelectionToolbar'
import LearnResultModal from './components/LearnResultModal'
import SettingsModal from './components/SettingsModal'
import Toasts from './components/Toasts'
import CommandPalette from './components/CommandPalette'
import ShortcutsModal from './components/ShortcutsModal'

const TITLES = {
  dashboard: ['Dashboard', 'Overview of your workspace'],
  library: ['My Library', 'All your uploaded materials'],
  reader: ['Document', 'Reading view'],
  chat: ['AI Chat', 'Ask questions about your sources'],
  graphs: ['Knowledge Graphs', 'Explore connections visually'],
  study: ['Study Tools', 'Flashcards, quizzes and notes'],
  notes: ['Notes', 'Organize your knowledge tree'],
}

function Workspace() {
  const { ready, files, graphs, notes, settings, saveStudyItem, saveGraph, updateSettings, syncLibraryNotes, toast, openFile: logFileOpen } = useApp()
  const [view, setViewState] = useState('dashboard')
  const [readerFileId, setReaderFileId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [chatContextIds, setChatContextIds] = useState([])
  const [selection, setSelection] = useState(null)
  const [learnBusy, setLearnBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [openGraphId, setOpenGraphId] = useState(null)
  const [graphSourceId, setGraphSourceId] = useState(null)
  const [aiError, setAiError] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [newChatKey, setNewChatKey] = useState(0)
  const [activeNoteId, setActiveNoteId] = useState(null)
  const fileRef = useRef(null)
  const lastCheckedConnection = useRef('')
  const clearOpenGraph = useCallback(() => setOpenGraphId(null), [])

  const setView = useCallback((v) => { setViewState(v); setSelection(null) }, [])

  const handleAiError = useCallback((e) => {
    if (isAuthError(e)) setAiError(e.message)
    else toast(e.message || 'Something went wrong.', 'error')
  }, [toast])

  const useDemoMode = () => {
    updateSettings({ demoMode: true })
    setAiError('')
    toast('Demo mode enabled — you can keep studying offline.', 'success')
  }

  useEffect(() => {
    const signature = `${settings.demoMode}|${settings.apiKey}|${settings.baseUrl}|${settings.model}`
    if (!ready || settings.demoMode || !settings.apiKey || lastCheckedConnection.current === signature) return
    lastCheckedConnection.current = signature
    setAiError('')
    testConnection(settings).then((r) => { if (!r.ok) setAiError(r.message) })
  }, [ready, settings])

  const openGraph = (id) => { setOpenGraphId(id); setViewState('graphs') }
  const openNoteGraph = (g) => { saveGraph(g); setOpenGraphId(g.id); setViewState('graphs') }
  const askAboutNote = (note) => {
    if (!note) return
    setSelection({ kind: 'text', text: `${note.title}\n${note.content}`, files: [], label: note.title })
  }
  const openNote = (id) => { setActiveNoteId(id); setViewState('notes') }
  const newGraph = () => {
    const first = files.find((f) => f.status === 'done')
    if (first) setGraphSourceId(first.id)
    setViewState('graphs')
  }
  const toggleDemo = () => {
    updateSettings({ demoMode: !settings.demoMode })
    toast(settings.demoMode ? 'Full AI mode enabled' : 'Demo mode enabled', 'success')
  }

  const upload = () => fileRef.current?.click()
  const onFiles = (e) => {
    if (e.target.files?.length) { addFiles(e.target.files); setViewState('library') }
    e.target.value = ''
  }
  const { addFiles } = useApp()

  const openFile = (f) => { logFileOpen(f.id); setReaderFileId(f.id); setViewState('reader'); setSelection(null) }

  const openActivity = (item) => {
    if (item.type === 'graph') { setOpenGraphId(item.refId); setViewState('graphs'); return }
    const f = files.find((x) => x.id === item.refId)
    if (f) openFile(f)
    else setViewState('library')
  }
  const selectText = (text, file) => setSelection({ kind: 'text', text, files: [file], label: file.name })
  const learnNodes = (nodes, graph) => setSelection({
    kind: 'nodes', nodes, graphId: graph.id, label: graph.title,
    text: nodes.map((n) => `${n.label}: ${n.summary || ''}`).join('\n'),
    files: graph.fileIds?.map((id) => files.find((f) => f.id === id)).filter(Boolean) || [],
  })
  const learnSelectedFiles = () => {
    const chosen = files.filter((f) => selectedIds.includes(f.id))
    if (!chosen.length) return
    setSelection({
      kind: 'files', files: chosen, label: `${chosen.length} documents`,
      text: chosen.map((f) => `=== ${f.name} ===\n${f.text}`).join('\n\n').slice(0, 20000),
    })
  }

  const runAction = async (key, override) => {
    const source = override || selection
    if (!source) return
    setLearnBusy(true)
    try {
      const out = await runLearnAction({ action: key, text: source.text, files: source.files || [], settings })
      if (key === 'flashcards') {
        saveStudyItem({ id: uid(), type: 'flashcards', title: `Flashcards · ${source.label}`, cards: out.flashcards || [], createdAt: Date.now() })
        setViewState('study'); toast(`${out.flashcards?.length || 0} flashcards created`, 'success'); setSelection(null)
      } else if (key === 'mcqs') {
        saveStudyItem({ id: uid(), type: 'mcqs', title: `Quiz · ${source.label}`, questions: out.questions || [], createdAt: Date.now() })
        setViewState('study'); toast(`${out.questions?.length || 0} questions created`, 'success'); setSelection(null)
      } else if (key === 'mindmap') {
        const title = /map$/i.test(source.label) ? source.label : `${source.label} map`
        const data = await generateGraph({ text: source.text, files: source.files || [], settings, title })
        const id = uid()
        saveGraph({ id, ...data, fileIds: source.files?.map((f) => f.id) || [], createdAt: Date.now(), updatedAt: Date.now() })
        setViewState('graphs'); setOpenGraphId(id); toast('Mind map generated', 'success'); setSelection(null)
      } else {
        const text = typeof out === 'string' ? out : out.text || JSON.stringify(out, null, 2)
        setResult({ title: LEARN_ACTIONS[key]?.label || 'Result', text, type: key, source: source.label })
        setSelection(null)
      }
    } catch (e) { handleAiError(e) }
    setLearnBusy(false)
  }

  const saveResult = () => {
    if (!result) return
    saveStudyItem({ id: uid(), type: result.type, title: `${result.title} · ${result.source || 'Notes'}`, text: result.text, createdAt: Date.now() })
    toast('Saved to Study Tools', 'success')
    setViewState('study')
    setResult(null)
  }
  const askAboutSelection = () => {
    if (selection?.files?.length) setChatContextIds(selection.files.map((f) => f.id))
    setResult(null)
    setViewState('chat')
  }
  const mindmapFromResult = async () => {
    if (!result) return
    setLearnBusy(true)
    try {
      const data = await generateGraph({ text: result.text, settings, title: `${result.title} map` })
      const id = uid()
      saveGraph({ id, ...data, createdAt: Date.now(), updatedAt: Date.now() })
      setViewState('graphs'); setOpenGraphId(id); setResult(null)
    } catch (e) { handleAiError(e) }
    setLearnBusy(false)
  }

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if (mod && /^[1-6]$/.test(e.key)) {
        const target = ['dashboard', 'library', 'chat', 'graphs', 'study', 'notes'][Number(e.key) - 1]
        if (target && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
          e.preventDefault()
          setView(target)
        }
        return
      }
      if (e.key === '?' && !mod && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault()
        setShortcutsOpen((v) => !v)
        return
      }
      if (e.key !== 'Escape') return
      if (paletteOpen) setPaletteOpen(false)
      else if (settingsOpen) setSettingsOpen(false)
      else if (shortcutsOpen) setShortcutsOpen(false)
      else if (result) setResult(null)
      else if (selection) setSelection(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, settingsOpen, shortcutsOpen, result, selection, setView])

  useEffect(() => {
    if (readerFileId && !files.some((f) => f.id === readerFileId)) setViewState('library')
    setSelectedIds((ids) => ids.filter((id) => files.some((f) => f.id === id)))
    setChatContextIds((ids) => ids.filter((id) => files.some((f) => f.id === id)))
  }, [files, readerFileId])

  // Keep the browser tab informative as the user moves around the workspace.
  useEffect(() => {
    const label = view === 'reader'
      ? files.find((f) => f.id === readerFileId)?.name || 'Document'
      : TITLES[view]?.[0] || 'Workspace'
    document.title = view === 'dashboard' ? 'Lumina — Learning Workspace' : `${label} · Lumina`
  }, [view, readerFileId, files])

  if (!ready) return (
    <div className="boot-screen">
      <div className="boot-brand">
        <div className="brand-mark boot-mark"><span className="brand-glyph" /></div>
        <div className="brand-name">Lumina</div>
      </div>
      <div className="boot-bar"><i /></div>
      <div className="boot-sub">Preparing your workspace</div>
    </div>
  )

  const [title, sub] = TITLES[view] || TITLES.dashboard
  const readerFile = files.find((f) => f.id === readerFileId)

  return (
    <div className="app-shell">
      <input ref={fileRef} type="file" multiple hidden
        accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.markdown,.jpg,.jpeg,.png,.webp"
        onChange={onFiles} />

      <Sidebar view={view} setView={setView} />

      <div className="main">
        <header className="topbar">
          <div>
            <h1>{view === 'reader' && readerFile ? readerFile.name : title}</h1>
            <div className="crumb">{sub}</div>
          </div>
          <div className="topbar-actions">
            <button className="topbar-search" onClick={() => setPaletteOpen(true)} title="Search or jump to (Ctrl+K)">
              <Search size={14} /><span>Search or jump to…</span><kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</kbd>
            </button>
            <button className="icon-btn" title="Keyboard shortcuts (?)" onClick={() => setShortcutsOpen(true)}><Keyboard size={17} /></button>
            <button className="icon-btn" title="Settings" onClick={() => setSettingsOpen(true)}><Settings size={18} /></button>
            <button className="btn primary" onClick={upload}><UploadCloud size={15} /> Upload</button>
          </div>
        </header>

        {aiError && (
          <div className="ai-banner" role="alert">
            <span className="ai-banner-icon">!</span>
            <div className="ai-banner-text"><b>AI connection issue</b><span>{aiError}</span></div>
            <button className="btn sm" onClick={() => setSettingsOpen(true)}>Open Settings</button>
            <button className="btn sm primary" onClick={useDemoMode}>Use Demo mode</button>
            <button className="btn sm ghost" onClick={() => setAiError('')} aria-label="Dismiss"><X size={14} /></button>
          </div>
        )}

        {view === 'dashboard' && <Dashboard setView={setView} onUpload={upload} onOpenActivity={openActivity} />}
        {view === 'library' && (
          <Library onOpenFile={openFile} selectedIds={selectedIds} setSelectedIds={setSelectedIds}
            onLearnSelected={learnSelectedFiles}
            onAskSelected={() => { setChatContextIds(selectedIds); setViewState('chat') }}
            setView={setViewState} />
        )}
        {view === 'reader' && readerFile && (
          <DocumentViewer file={readerFile} onBack={() => setView('library')} onSelectText={selectText}
            onAsk={(f) => { setChatContextIds([f.id]); setViewState('chat') }}
            onGenerateGraph={(f) => { setGraphSourceId(f.id); setViewState('graphs') }} />
        )}
        {view === 'reader' && !readerFile && <div className="empty card"><p>Document not found.</p><button className="btn" onClick={() => setView('library')}>Back to library</button></div>}
        {view === 'chat' && <Chat contextIds={chatContextIds} onPickFiles={() => setViewState('library')} onError={handleAiError} newChatKey={newChatKey} />}
        {view === 'graphs' && <Graphs onLearnNodes={learnNodes} openGraphId={openGraphId} onOpened={clearOpenGraph}
          sourceFileId={graphSourceId} onSourceHandled={() => setGraphSourceId(null)} onError={handleAiError} onOpenNote={openNote} />}
        {view === 'study' && <StudyTools />}
        {view === 'notes' && <Notes activeId={activeNoteId} setActiveId={setActiveNoteId} onOpenGraph={openNoteGraph} onAsk={askAboutNote}
          onSyncUploads={() => { const n = syncLibraryNotes(); if (n) toast(`${n} uploaded note${n > 1 ? 's' : ''} added to Notes`, 'success') }}
          onNoteAction={(note, action) => runAction(action, { text: `${note.title}\n${note.content}`, files: [], label: note.title })}
          onOpenFile={(fileId) => { const f = files.find((x) => x.id === fileId); if (f) openFile(f) }} />}
      </div>

      <SelectionToolbar selection={selection} onAction={runAction} onClose={() => setSelection(null)} busy={learnBusy} />
      <LearnResultModal result={result} onClose={() => setResult(null)} onSave={saveResult}
        onAsk={askAboutSelection} onMindmap={mindmapFromResult} />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={setView}
        onUpload={upload} onNewChat={() => { setNewChatKey((k) => k + 1); setViewState('chat') }}
        onNewGraph={newGraph} onToggleDemo={toggleDemo} demoMode={settings.demoMode}
        onShortcuts={() => setShortcutsOpen(true)}
        files={files} graphs={graphs} notes={notes} onOpenFile={openFile} onOpenGraph={openGraph} onOpenNote={openNote} />
      <Toasts />
    </div>
  )
}

export default function App() {
  return <AppProvider><Workspace /></AppProvider>
}
