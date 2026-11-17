import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, info) {
    console.error('Workspace error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)', color: 'var(--ink)' }}>
        <div className="card" style={{ maxWidth: 520, padding: 34, textAlign: 'center' }}>
          <div className="ei" style={{ margin: '0 auto 18px', color: 'var(--amber)' }}><AlertTriangle size={26} /></div>
          <h2 style={{ margin: '0 0 10px', fontSize: 20 }}>Something interrupted your workspace</h2>
          <p style={{ color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.7, margin: '0 0 22px' }}>
            Your saved notes, files and graphs are safe in this browser. Reload to continue.
          </p>
          <details style={{ textAlign: 'left', marginBottom: 20 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--ink-3)' }}>Technical details</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: 'var(--red)', maxHeight: 140, overflow: 'auto' }}>
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </details>
          <button className="btn primary" onClick={() => window.location.reload()}><RotateCcw size={15} /> Reload workspace</button>
        </div>
      </div>
    )
  }
}
