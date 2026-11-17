import { GraduationCap, X, BookOpen, AlignLeft, Network, Layers3, ListChecks, Link2, Lightbulb, Map } from 'lucide-react'
import { LEARN_ACTIONS } from '../lib/ai'

const ICONS = {
  explain: BookOpen, summarize: AlignLeft, mindmap: Network, flashcards: Layers3,
  mcqs: ListChecks, connections: Link2, examples: Lightbulb, roadmap: Map,
}

export default function SelectionToolbar({ selection, onAction, onClose, busy }) {
  if (!selection) return null
  return (
    <div className="selection-bar">
      <span className="lbl"><GraduationCap size={14} style={{ color: 'var(--accent)' }} /> Learn from selection</span>
      {Object.entries(LEARN_ACTIONS).map(([key, meta]) => {
        const Icon = ICONS[key] || GraduationCap
        return (
          <button key={key} className="btn sm" disabled={busy} onClick={() => onAction(key)} title={meta.label}>
            <Icon size={14} /><span>{meta.label}</span>
          </button>
        )
      })}
      <button className="btn sm ghost" onClick={onClose} title="Close"><X size={14} /></button>
    </div>
  )
}
