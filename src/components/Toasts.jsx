import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useApp } from '../context/AppContext'

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info }

export default function Toasts() {
  const { toasts, dismissToast } = useApp()
  return (
    <div className="toasts" role="status" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => {
        const Icon = ICONS[t.type] || Info
        return (
          <div key={t.id} className={`toast ${t.type}`}>
            <Icon size={17} aria-hidden="true" style={{ color: t.type === 'error' ? 'var(--red)' : t.type === 'success' ? 'var(--green)' : 'var(--accent)' }} />
            <span style={{ flex: 1 }}>{t.message}</span>
            <button className="icon-btn" style={{ width: 22, height: 22, border: 'none', background: 'none' }} onClick={() => dismissToast(t.id)} aria-label="Dismiss notification"><X size={13} /></button>
          </div>
        )
      })}
    </div>
  )
}
