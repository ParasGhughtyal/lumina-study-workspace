import { useEffect, useRef, useState } from 'react'
import { X, KeyRound, ShieldCheck, Info, Download, Upload } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { testConnection, DEFAULT_SETTINGS } from '../lib/ai'
import { useFocusTrap } from '../lib/useFocusTrap'
import { useConfirm } from '../lib/useConfirm'

const PRESETS = [
  { name: 'Gemini (free)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-flash-lite-latest' },
  { name: 'Groq (free)', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' },
  { name: 'OpenRouter (free)', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/free' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
]

export default function SettingsModal({ onClose }) {
  const { settings, updateSettings, exportWorkspace, importWorkspace, toast } = useApp()
  const [confirmNode, confirm] = useConfirm()
  const backupRef = useRef(null)
  const dialogRef = useRef(null)
  useFocusTrap(dialogRef)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify(exportWorkspace(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lumina-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoking synchronously can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast('Workspace backup downloaded', 'success')
  }
  const restoreBackup = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const ok = await confirm({
      title: 'Replace this workspace?',
      body: 'The backup replaces all current notes, graphs, chats and study items. This cannot be undone.',
      confirmLabel: 'Restore backup',
    })
    if (!ok) return
    try {
      await importWorkspace(JSON.parse(await file.text()))
      toast('Workspace restored', 'success')
      onClose()
    } catch (e) { toast(e.message || 'Could not restore backup', 'error') }
  }
  const [draft, setDraft] = useState({ ...settings })
  const [test, setTest] = useState(null)
  const [testing, setTesting] = useState(false)
  const set = (k, v) => { setDraft((d) => ({ ...d, [k]: v })); setTest(null) }

  const checkConnection = async () => {
    if (!draft.apiKey.trim()) return
    setTesting(true)
    setTest(await testConnection({ ...draft, apiKey: draft.apiKey.trim() }))
    setTesting(false)
  }

  const save = () => {
    const next = { ...draft, apiKey: draft.apiKey.trim() }
    if (!next.demoMode && !next.apiKey) {
      toast('Add an API key or enable Demo mode.', 'error')
      return
    }
    updateSettings(next)
    toast('Settings saved', 'success')
    onClose()
  }
  const applyPreset = (p) => setDraft((d) => ({ ...d, baseUrl: p.baseUrl, model: p.model }))
  const resetDefault = () => { setDraft({ ...DEFAULT_SETTINGS }); setTest(null) }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-label="AI Settings">
        <div className="modal-head"><h2><KeyRound size={18} style={{ verticalAlign: -3, marginRight: 8, color: 'var(--accent)' }} />AI Settings</h2><button className="icon-btn" onClick={onClose} aria-label="Close settings"><X size={16} /></button></div>
        <div className="modal-body" style={{ whiteSpace: 'normal' }}>
          <div className="card" style={{ padding: 14, marginBottom: 18, background: 'var(--panel-2)', display: 'flex', gap: 12 }}>
            <Info size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
              Lumina comes configured with a shared <b>Google Gemini</b> demo key. It is included in the public app bundle, so use a restricted key with a quota limit. You can also add your own key or switch to <b>Demo mode</b> for local answers with no API calls.
            </div>
          </div>

          <label className="doc-option" style={{ background: 'var(--panel-2)', marginBottom: 18 }}>
            <input type="checkbox" checked={draft.demoMode} onChange={(e) => set('demoMode', e.target.checked)} />
            <span><b>Demo mode</b> <span className="muted">— use local answers, no API key needed</span></span>
          </label>

          <div style={{ opacity: draft.demoMode ? 0.45 : 1, pointerEvents: draft.demoMode ? 'none' : 'auto' }}>
            <div className="field">
              <label>Provider presets</label>
              <div className="chips">
                {PRESETS.map((p) => <button key={p.name} className="chip" onClick={() => applyPreset(p)}>{p.name}</button>)}
                <button className="chip" onClick={resetDefault}>Reset to default</button>
              </div>
            </div>
            <div className="field"><label>API key</label><input className="input" type="password" autoComplete="off" spellCheck="false" placeholder="Paste your API key" value={draft.apiKey} onChange={(e) => set('apiKey', e.target.value)} /></div>
            <div className="field"><label>Base URL</label><input className="input" value={draft.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} placeholder="https://api.openai.com/v1" /></div>
            <div className="field"><label>Model</label><input className="input" value={draft.model} onChange={(e) => set('model', e.target.value)} placeholder="gpt-4o-mini" /></div>
          </div>

          <div className="connection-test">
            <button className="btn sm" disabled={testing || draft.demoMode || !draft.apiKey.trim()} onClick={checkConnection}>{testing ? 'Testing…' : 'Test connection'}</button>
            {test && <span className={`test-result ${test.ok ? 'ok' : 'bad'}`}>{test.ok ? '✓' : '✕'} {test.message}</span>}
          </div>

          <div className="backup-section">
            <div className="backup-head"><Download size={14} /> Workspace backup</div>
            <p>Download all your notes, graphs, chats and study items as JSON. Restore replaces the current workspace. Original uploaded files aren't included — their extracted text is.</p>
            <div className="backup-actions">
              <button className="btn sm" onClick={downloadBackup}><Download size={13} /> Export backup</button>
              <button className="btn sm" onClick={() => backupRef.current?.click()}><Upload size={13} /> Restore backup</button>
              <input ref={backupRef} type="file" accept="application/json,.json" hidden onChange={restoreBackup} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--ink-3)', fontSize: 11, lineHeight: 1.5 }}>
            <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Your key is stored in this browser's local database and sent directly to its provider. The shared demo key is part of the public app bundle; avoid sensitive documents when using it.</span>
          </div>
        </div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save settings</button></div>
      </div>
      {confirmNode}
    </div>
  )
}
