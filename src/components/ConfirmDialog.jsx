import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { useFocusTrap } from '../lib/useFocusTrap'

// A styled replacement for window.confirm(), rendered in a portal so it can
// be used from anywhere without stacking-context surprises. Cancel receives
// initial focus, which is the safe default for destructive actions.
export default function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null)
  const restoreFocusRef = useRef(typeof document !== 'undefined' ? document.activeElement : null)
  const bodyId = useId()
  useFocusTrap(dialogRef)

  // Return focus to the control that opened the dialog when it closes.
  useEffect(() => () => {
    const el = restoreFocusRef.current
    if (el && typeof el.focus === 'function' && document.contains(el)) el.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      // Capture phase: don't let the parent modal or the global Escape
      // handler react to the same key press.
      e.preventDefault()
      e.stopImmediatePropagation()
      onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  return createPortal(
    <div className="modal-backdrop confirm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal confirm-dialog" ref={dialogRef} role="alertdialog" aria-modal="true" aria-label={title} aria-describedby={body ? bodyId : undefined}>
        <div className="confirm-head">
          <div className={`confirm-icon ${danger ? 'danger' : ''}`}><AlertTriangle size={17} /></div>
          <div className="confirm-copy">
            <h3>{title}</h3>
            {body && <p id={bodyId}>{body}</p>}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>{cancelLabel}</button>
          <button className={`btn ${danger ? 'confirm-danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
