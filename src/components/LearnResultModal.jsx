import { useEffect, useRef } from 'react'
import { X, BookmarkPlus, MessageSquareText, Network } from 'lucide-react'
import { useFocusTrap } from '../lib/useFocusTrap'
import Markdown from '../lib/markdown'

export default function LearnResultModal({ result, onClose, onSave, onAsk, onMindmap }) {
  const dialogRef = useRef(null)
  useFocusTrap(dialogRef, !!result)

  useEffect(() => {
    if (!result) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [result, onClose])

  if (!result) return null
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-label={result.title}>
        <div className="modal-head">
          <h2>{result.title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close result"><X size={16} /></button>
        </div>
        <div className="modal-body md-body"><Markdown text={result.text} /></div>
        <div className="modal-foot">
          <button className="btn" onClick={onMindmap}><Network size={14} /> Mind map</button>
          <button className="btn" onClick={onAsk}><MessageSquareText size={14} /> Ask AI</button>
          <button className="btn primary" onClick={onSave}><BookmarkPlus size={14} /> Save to study tools</button>
        </div>
      </div>
    </div>
  )
}
