import { useEffect, useRef, useState } from 'react'
import { Send, Plus, Trash2, FileText, MessageSquareText, Copy, Check, RefreshCw, Pencil, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { askAI, isAuthError } from '../lib/ai'
import { uid } from '../lib/storage'
import { useConfirm } from '../lib/useConfirm'
import Markdown from '../lib/markdown'

const SUGGESTIONS = [
  'Summarize the key points',
  'Explain this like I am a beginner',
  'Give me real-world examples',
  'What are the most important concepts?',
]

function Bubble({ content }) {
  return <Markdown text={content} />
}

export default function Chat({ contextIds = [], onPickFiles, onError, newChatKey }) {
  const { files, conversations, saveConversation, deleteConversation, settings } = useApp()
  const [activeId, setActiveId] = useState(null)
  const [selected, setSelected] = useState(contextIds)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [sideOpen, setSideOpen] = useState(false)
  const [confirmNode, confirm] = useConfirm()
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const pinnedRef = useRef(true)
  const cancelRenameRef = useRef(false)
  const streamConvRef = useRef(null)

  const autoGrow = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }
  useEffect(() => { autoGrow(inputRef.current) }, [input])

  useEffect(() => { if (contextIds.length) setSelected(contextIds) }, [contextIds.join(',')])
  useEffect(() => { if (newChatKey) setActiveId(null) }, [newChatKey])

  // Restore each conversation's source selection so answers stay grounded in
  // the documents they were originally asked about.
  useEffect(() => {
    if (!activeId) return
    const conv = conversations.find((c) => c.id === activeId)
    if (!conv) return
    setSelected((conv.fileIds || []).filter((id) => files.some((f) => f.id === id && f.status === 'done')))
  }, [activeId])

  // Keep the transcript pinned to the newest message, including while a
  // streamed answer is arriving — unless the reader scrolled up to read.
  useEffect(() => {
    pinnedRef.current = true
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [activeId])
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !pinnedRef.current) return
    el.scrollTop = el.scrollHeight
  }, [conversations, busy, streamText])

  useEffect(() => {
    if (!sideOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setSideOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sideOpen])

  const onTranscriptScroll = () => {
    const el = scrollRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const active = conversations.find((c) => c.id === activeId)
  const readyFiles = files.filter((f) => f.status === 'done' && selected.includes(f.id))

  const openConversation = (id) => { setActiveId(id); setSideOpen(false) }
  const startNewConversation = () => { setActiveId(null); setSideOpen(false) }

  const copyMessage = async (msg) => {
    try {
      await navigator.clipboard.writeText(msg.content)
      setCopiedId(msg.id)
    } catch { /* clipboard unavailable — leave the button unchanged */ }
  }
  useEffect(() => {
    if (!copiedId) return
    const t = setTimeout(() => setCopiedId(null), 1600)
    return () => clearTimeout(t)
  }, [copiedId])

  const startRename = (c) => { cancelRenameRef.current = false; setRenamingId(c.id); setRenameValue(c.title) }
  const commitRename = (c) => {
    if (cancelRenameRef.current) { cancelRenameRef.current = false; setRenamingId(null); return }
    const title = renameValue.trim()
    if (title && title !== c.title) saveConversation({ ...c, title })
    setRenamingId(null)
  }
  const removeConversation = async (c) => {
    const ok = await confirm({
      title: `Delete “${c.title}”?`,
      body: 'The whole conversation is removed from this browser. This cannot be undone.',
      confirmLabel: 'Delete chat',
    })
    if (!ok) return
    deleteConversation(c.id)
    if (activeId === c.id) setActiveId(null)
  }

  const regenerate = async (index) => {
    if (!active || busy) return
    const msgs = [...active.messages]
    const userMsg = msgs[index - 1]
    if (!userMsg || userMsg.role !== 'user') return
    const sourceIds = readyFiles.map((f) => f.id)
    pinnedRef.current = true
    streamConvRef.current = active.id
    setBusy(true)
    setStreamText('')
    try {
      const history = msgs.slice(0, index - 1).map((m) => ({ role: m.role, content: m.content }))
      const answer = await askAI({
        question: userMsg.content, history, files: readyFiles, settings,
        onChunk: (chunk) => setStreamText((prev) => prev + chunk),
      })
      msgs[index] = { id: uid(), role: 'assistant', content: answer, sources: readyFiles.map((f) => f.name) }
      saveConversation({ ...active, messages: msgs, fileIds: sourceIds, updatedAt: Date.now() })
    } catch (e) {
      if (isAuthError(e)) onError?.(e)
      msgs[index] = { id: uid(), role: 'assistant', content: `Error — ${e.message}` }
      saveConversation({ ...active, messages: msgs, fileIds: sourceIds, updatedAt: Date.now() })
    }
    setStreamText('')
    setBusy(false)
  }

  const sendMessage = async (question) => {
    const q = (question || input).trim()
    if (!q || busy) return
    pinnedRef.current = true
    setInput('')
    setBusy(true)
    setStreamText('')

    const sourceIds = selected
    let conv = active ? { ...active, messages: [...active.messages] } : { id: uid(), title: q.slice(0, 38), messages: [], fileIds: sourceIds, createdAt: Date.now(), updatedAt: Date.now() }
    const history = conv.messages.map((m) => ({ role: m.role, content: m.content }))
    conv.messages.push({ id: uid(), role: 'user', content: q })
    conv.fileIds = sourceIds
    streamConvRef.current = conv.id
    saveConversation({ ...conv, updatedAt: Date.now() })
    // Activate immediately so the answer streams into the transcript instead
    // of appearing behind the empty state.
    setActiveId(conv.id)

    try {
      const answer = await askAI({
        question: q, history, files: readyFiles, settings,
        onChunk: (chunk) => setStreamText((prev) => prev + chunk),
      })
      conv.messages.push({ id: uid(), role: 'assistant', content: answer, sources: readyFiles.map((f) => f.name) })
    } catch (e) {
      if (isAuthError(e)) {
        onError?.(e)
        conv.messages.push({ id: uid(), role: 'assistant', content: 'I can’t reach your AI provider — the key may have expired or been revoked. Update it in Settings, or switch to Demo mode to keep studying.' })
      } else {
        conv.messages.push({ id: uid(), role: 'assistant', content: `Error — ${e.message}` })
      }
    }
    setStreamText('')
    conv.updatedAt = Date.now()
    conv.fileIds = sourceIds
    saveConversation(conv)
    setBusy(false)
  }

  return (
    <div className="view" style={{ paddingBottom: 0 }}>
      <div className="chat-layout">
        <div className="card chat-main">
          <div className="chat-head">
            <div className="mav">L</div>
            <div>
              <div className="title">AI Study Assistant</div>
              <div className="sub">{readyFiles.length ? `Grounded in ${readyFiles.length} document${readyFiles.length > 1 ? 's' : ''}` : 'No sources selected'}</div>
            </div>
            <button className="btn sm chat-side-toggle" onClick={() => setSideOpen(true)} aria-expanded={sideOpen}>
              <FileText size={14} /> Sources{readyFiles.length ? ` · ${readyFiles.length}` : ''}
            </button>
          </div>

          <div className="messages" ref={scrollRef} onScroll={onTranscriptScroll}>
            {!active?.messages.length && (
              <div className="empty" style={{ margin: 'auto 0' }}>
                <div className="ei"><MessageSquareText size={26} /></div>
                <h2>Ask anything about your materials</h2>
                <p>Select documents on the right, then ask a question. Answers are grounded in your uploaded sources.</p>
                <div style={{ display: 'grid', gap: 8, marginTop: 18, width: 'min(100%, 420px)' }}>
                  {SUGGESTIONS.map((s) => <button key={s} className="suggest-btn" onClick={() => sendMessage(s)}>{s}</button>)}
                </div>
              </div>
            )}
            {active?.messages.map((m, idx) => (
              <div className={`msg ${m.role === 'user' ? 'user' : ''}`} key={m.id}>
                <div className="mav">{m.role === 'user' ? 'You' : 'L'}</div>
                <div>
                  <div className="bubble"><Bubble content={m.content} /></div>
                  <div className="msg-actions">
                    <button className={`icon-btn ${copiedId === m.id ? 'copied' : ''}`} title={copiedId === m.id ? 'Copied' : 'Copy'} onClick={() => copyMessage(m)}>
                      {copiedId === m.id ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                    {m.role === 'assistant' && <button className="icon-btn" title="Regenerate" onClick={() => regenerate(idx)}><RefreshCw size={13} /></button>}
                  </div>
                  {m.role === 'assistant' && m.sources?.length > 0 && (
                    <div className="msg-sources">
                      {m.sources.map((name, i) => <span key={i}><FileText size={11} /> {name}</span>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && activeId === streamConvRef.current && streamText && (
              <div className="msg">
                <div className="mav">L</div>
                <div className="bubble"><Bubble content={streamText} /><span className="stream-caret" /></div>
              </div>
            )}
            {busy && activeId === streamConvRef.current && !streamText && <div className="msg"><div className="mav">L</div><div className="bubble"><span className="typing"><i /><i /><i /></span></div></div>}
          </div>

          <div className="composer">
            <div className="composer-box">
              <textarea ref={inputRef} rows={1} value={input} placeholder="Ask a question about your documents..." onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }} />
              <button className="btn primary" title="Send message" aria-label="Send message" disabled={!input.trim() || busy} onClick={() => sendMessage()}><Send size={16} /></button>
            </div>
          </div>
        </div>

        {sideOpen && <div className="chat-scrim" onClick={() => setSideOpen(false)} />}
        <div className={`chat-side ${sideOpen ? 'mobile-open' : ''}`}>
          <div className="chat-side-head">
            <span>Sources & conversations</span>
            <button className="icon-btn" onClick={() => setSideOpen(false)} aria-label="Close sources panel"><X size={15} /></button>
          </div>
          <div className="card side-panel">
            <div className="section-head" style={{ marginBottom: 10 }}><h3>Sources</h3><button className="btn sm ghost" onClick={onPickFiles}>Manage</button></div>
            {files.filter((f) => f.status === 'done').length ? files.filter((f) => f.status === 'done').map((f) => (
              <label className="doc-option" key={f.id}>
                <input type="checkbox" checked={selected.includes(f.id)} onChange={() => setSelected((s) => s.includes(f.id) ? s.filter((x) => x !== f.id) : [...s, f.id])} />
                <FileText size={15} style={{ color: 'var(--accent)' }} />
                <span className="dn">{f.name}</span>
              </label>
            )) : <p className="muted" style={{ fontSize: 12 }}>Upload documents to use them as sources.</p>}
          </div>

          <div className="card side-panel">
            <button className="btn sm" style={{ width: '100%', marginBottom: 10 }} onClick={startNewConversation}><Plus size={14} /> New conversation</button>
            <h3>Conversations</h3>
            {conversations.map((c) => (
              <div key={c.id} className={`conv-item ${activeId === c.id ? 'active' : ''}`}>
                <MessageSquareText size={15} className="muted" onClick={() => openConversation(c.id)} style={{ cursor: 'pointer' }} />
                {renamingId === c.id ? (
                  <input className="conv-rename" autoFocus value={renameValue} aria-label="Conversation title"
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => commitRename(c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelRenameRef.current = true; setRenamingId(null) }
                    }} />
                ) : (
                  <span className="ct" onClick={() => openConversation(c.id)} title={`${c.messages?.length || 0} messages · updated ${new Date(c.updatedAt).toLocaleString()}`}>{c.title}</span>
                )}
                <button className="icon-btn" title="Rename" style={{ width: 24, height: 24, border: 'none', background: 'none' }} onClick={() => startRename(c)}><Pencil size={12} /></button>
                <button className="icon-btn" title="Delete" disabled={busy && streamConvRef.current === c.id} style={{ width: 24, height: 24, border: 'none', background: 'none' }} onClick={() => removeConversation(c)}><Trash2 size={13} /></button>
              </div>
            ))}
            {!conversations.length && <p className="muted" style={{ fontSize: 12 }}>No conversations yet.</p>}
          </div>

        </div>
      </div>
      {confirmNode}
    </div>
  )
}
