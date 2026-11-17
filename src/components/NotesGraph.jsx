import { useEffect, useMemo, useRef, useState } from 'react'
import { Network, Maximize2, Link2 } from 'lucide-react'
import { linksOfNote } from '../lib/notesGraph'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function layout(notes) {
  const childrenOf = (id) => notes.filter((n) => n.parentId === id).sort((a, b) => (a.order || 0) - (b.order || 0))
  const positions = new Map()
  let cursor = 0
  const place = (note, depth) => {
    const kids = childrenOf(note.id)
    let y
    if (!kids.length) { y = cursor; cursor += 88 }
    else {
      const ys = kids.map((k) => place(k, depth + 1))
      y = (ys[0] + ys[ys.length - 1]) / 2
    }
    positions.set(note.id, { x: depth * 205, y })
    return y
  }
  childrenOf(null).forEach((r) => place(r, 0))
  if (positions.size) {
    const ys = [...positions.values()].map((p) => p.y)
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2
    positions.forEach((p) => { p.y -= mid })
  }
  return positions
}

export default function NotesGraph({ notes, activeId, onSelect, onOpenFull }) {
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const drag = useRef(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })

  const positions = useMemo(() => layout(notes), [notes])
  const nodes = useMemo(() => notes.filter((n) => positions.has(n.id)).map((n) => ({ ...n, ...positions.get(n.id) })), [notes, positions])
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))

  const links = useMemo(() => {
    const out = []
    notes.forEach((n) => linksOfNote(notes, n).forEach((target) => {
      if (byId[target] && !out.some((l) => (l.source === n.id && l.target === target) || (l.source === target && l.target === n.id)))
        out.push({ source: n.id, target })
    }))
    return out
  }, [notes])

  const fit = () => {
    if (!nodes.length || !wrapRef.current) return
    const r = wrapRef.current.getBoundingClientRect()
    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y)
    const minX = Math.min(...xs) - 110, maxX = Math.max(...xs) + 110
    const minY = Math.min(...ys) - 70, maxY = Math.max(...ys) + 70
    const k = clamp(Math.min(r.width / (maxX - minX), r.height / (maxY - minY)), 0.25, 1.4)
    setView({ k, x: r.width / 2 - ((minX + maxX) / 2) * k, y: r.height / 2 - ((minY + maxY) / 2) * k })
  }

  useEffect(() => { const t = setTimeout(fit, 60); return () => clearTimeout(t) }, [notes.length])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      setView((v) => {
        const k2 = clamp(v.k * (e.deltaY < 0 ? 1.12 : 0.89), 0.25, 2.2)
        return { k: k2, x: mx - (mx - v.x) * (k2 / v.k), y: my - (my - v.y) * (k2 / v.k) }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onDown = (e) => {
    drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  }
  const onMove = (e) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.sx, dy = e.clientY - drag.current.sy
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true
    setView((v) => ({ ...v, x: drag.current.vx + dx, y: drag.current.vy + dy }))
  }
  const onUp = () => { drag.current = null }

  return (
    <div className="card notes-graph-card" ref={wrapRef}>
      <div className="notes-graph-head">
        <span><Network size={13} /> Knowledge map</span>
        <div>
          <button className="icon-btn" title="Fit" aria-label="Fit graph" onClick={fit}><Maximize2 size={13} /></button>
          <button className="icon-btn" title="Open full graph" aria-label="Open full graph" onClick={onOpenFull}><Network size={13} /></button>
        </div>
      </div>
      <svg ref={svgRef} className="notes-graph-svg" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {links.map((l, i) => {
            const a = byId[l.source], b = byId[l.target]
            if (!a || !b) return null
            return <path key={i} d={`M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - 26} ${b.x} ${b.y}`}
              fill="none" stroke="#82d6bd" strokeOpacity=".55" strokeWidth="1.3" strokeDasharray="5 4" pointerEvents="none" />
          })}
          {nodes.map((n) => {
            const parent = n.parentId
            if (parent && byId[parent]) return (
              <path key={`e-${n.id}`} d={`M ${byId[parent].x} ${byId[parent].y} L ${n.x} ${n.y}`}
                fill="none" stroke="#333b44" strokeWidth="1.3" pointerEvents="none" />
            )
            return null
          })}
          {nodes.map((n) => {
            const w = Math.max(80, Math.min(150, n.title.length * 6.6 + 26))
            const sel = n.id === activeId
            return (
              <g key={n.id} transform={`translate(${n.x - w / 2},${n.y - 18})`} style={{ cursor: 'pointer' }}
                tabIndex={0} role="button" aria-label={`Open note “${n.title}”`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect(n.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n.id) }
                }}>
                <rect width={w} height="36" rx="9" fill={sel ? '#252b20' : '#181c20'} stroke={sel ? '#d7f27a' : '#343c43'} strokeWidth={sel ? 2 : 1.2} />
                <text x="10" y="22" fill="#f1f1ec" fontSize="11.5" fontWeight="600">
                  {n.title.length > 18 ? n.title.slice(0, 17) + '…' : n.title}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
      <div className="notes-graph-legend"><Link2 size={11} /> dashed = linked notes · click to open</div>
    </div>
  )
}
