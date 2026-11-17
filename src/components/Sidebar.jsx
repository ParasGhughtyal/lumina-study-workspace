import { LayoutDashboard, Library, MessageSquareText, Network, GraduationCap, NotebookPen } from 'lucide-react'
import { useApp } from '../context/AppContext'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'library', label: 'My Library', icon: Library },
  { id: 'chat', label: 'AI Chat', icon: MessageSquareText },
  { id: 'graphs', label: 'Knowledge Graphs', icon: Network },
  { id: 'study', label: 'Study Tools', icon: GraduationCap },
  { id: 'notes', label: 'Notes', icon: NotebookPen },
]

export default function Sidebar({ view, setView }) {
  const { files, graphs, settings } = useApp()
  const badges = { library: files.length, graphs: graphs.length }
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><span className="brand-glyph" /></div>
        <div>
          <div className="brand-name">Lumina</div>
          <div className="brand-sub">Learning workspace</div>
        </div>
      </div>

      <div className="nav-label">Workspace</div>
      {NAV.map((n) => {
        const Icon = n.icon
        return (
          <button key={n.id} className={`nav-item ${view === n.id ? 'active' : ''}`} onClick={() => setView(n.id)} title={n.label}>
            <Icon size={18} />
            <span>{n.label}</span>
            {badges[n.id] !== undefined && <span className="badge">{badges[n.id]}</span>}
          </button>
        )
      })}

      <div className="sidebar-foot">
        <div className="storage-card">
          <div className="row"><span>Local storage</span><span>{files.length} files</span></div>
          <div className="bar"><i style={{ width: `${Math.min(100, files.length * 6 + 8)}%` }} /></div>
        </div>
        <div className={`mode-pill ${settings.demoMode ? '' : 'live'}`}>
          <span className="dot" /><span>{settings.demoMode ? 'Demo mode · no API key' : 'AI connected'}</span>
        </div>
      </div>
    </aside>
  )
}
