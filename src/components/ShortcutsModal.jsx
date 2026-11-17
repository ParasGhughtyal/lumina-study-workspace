import { useEffect, useRef } from 'react'
import { X, Keyboard } from 'lucide-react'
import { useFocusTrap } from '../lib/useFocusTrap'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'

const GROUPS = [
  {
    title: 'Global',
    items: [
      { keys: [MOD, 'K'], label: 'Open the command palette' },
      { keys: [MOD, '1–6'], label: 'Jump to Dashboard, Library, Chat, Graphs, Study Tools or Notes' },
      { keys: ['?'], label: 'Show this shortcut cheat sheet' },
      { keys: ['Esc'], label: 'Close dialogs and clear selections' },
    ],
  },
  {
    title: 'Chat',
    items: [
      { keys: ['Enter'], label: 'Send a message' },
      { keys: ['Shift', 'Enter'], label: 'Insert a new line' },
      { keys: ['⌘/Ctrl'], label: 'With C / V, copy or paste as usual' },
    ],
  },
  {
    title: 'Flashcards',
    items: [
      { keys: ['Space'], label: 'Flip the current card' },
      { keys: ['←', '→'], label: 'Move to the previous / next card' },
    ],
  },
  {
    title: 'Knowledge graphs',
    items: [
      { keys: ['Del'], label: 'Delete the selected node or connection' },
      { keys: ['Esc'], label: 'Deselect everything' },
      { keys: ['Drag'], label: 'Move a node — layouts keep nodes apart' },
      { keys: ['Scroll'], label: 'Zoom the canvas' },
    ],
  },
  {
    title: 'Notes',
    items: [
      { keys: ['[[', ']]'], label: 'Link two notes while typing, e.g. [[Sorting]]' },
      { keys: ['Auto'], label: 'Every change saves locally a moment after you stop typing' },
    ],
  },
]

export default function ShortcutsModal({ onClose }) {
  const dialogRef = useRef(null)
  useFocusTrap(dialogRef)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal shortcuts-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="modal-head"><h2><Keyboard size={17} style={{ verticalAlign: -3, marginRight: 8, color: 'var(--accent)' }} />Keyboard shortcuts</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="modal-body shortcuts-body">
          {GROUPS.map((g) => (
            <section key={g.title} className="sc-group">
              <h3>{g.title}</h3>
              <ul>
                {g.items.map((it) => (
                  <li key={it.label}>
                    <span className="sc-keys">{it.keys.map((k, i) => <kbd key={i}>{k}</kbd>)}</span>
                    <span className="sc-label">{it.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
