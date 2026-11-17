import { useEffect, useRef, useState, useMemo } from 'react'
import { Network, Plus, ZoomIn, ZoomOut, Maximize2, Trash2, GraduationCap, ChevronDown, ChevronRight, X, MousePointer2, Search, ChevronsDownUp, ChevronsUpDown, Download, NotebookPen, ArrowRight } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { generateGraph, isAuthError } from '../lib/ai'
import { buildNotesGraph } from '../lib/notesGraph'
import { uid } from '../lib/storage'
import { useConfirm } from '../lib/useConfirm'
import { useFocusTrap } from '../lib/useFocusTrap'
import { FileText } from 'lucide-react'

/* ----------------------------- graph helpers ---------------------------- */
const NODE_ARC = 215 // px of arc length reserved per node so nothing overlaps

function radialLayout(graph) {
  const topics = graph.topics || []
  const weights = topics.map(leafCount)
  const total = weights.reduce((a, b) => a + b, 0) || 1
  const rTopic = Math.max(250, (topics.length * NODE_ARC) / (2 * Math.PI))
  const rChild = Math.max(460, (total * NODE_ARC) / (2 * Math.PI))

  const place = (node, a0, a1, depth) => {
    const r = depth === 0 ? rTopic : rChild + (depth - 1) * 230
    const mid = (a0 + a1) / 2
    node.x = Math.cos(mid) * r
    node.y = Math.sin(mid) * r
    const kids = node.children || []
    kids.forEach((c, j) => {
      const w = (a1 - a0) / kids.length
      place(c, a0 + j * w, a0 + (j + 1) * w, depth + 1)
    })
  }

  if (topics.length === 1) {
    const t = topics[0]
    t.x = 0; t.y = 0
    const kids = t.children || []
    kids.forEach((c, j) => place(c, -Math.PI / 2 + (j * 2 * Math.PI) / kids.length, -Math.PI / 2 + ((j + 1) * 2 * Math.PI) / kids.length, 1))
    return graph
  }
  let cursor = -Math.PI / 2
  topics.forEach((t, i) => {
    const wedge = (weights[i] / total) * 2 * Math.PI
    place(t, cursor, cursor + wedge, 0)
    cursor += wedge
  })
  return graph
}

function treeLayout(graph) {
  const step = 100
  const placeAt = (node, depth, start, height) => {
    node.x = -280 + depth * 300
    node.y = start + height / 2
    let ky = start
    for (const child of node.children || []) {
      const h = leafCount(child) * step
      placeAt(child, depth + 1, ky, h)
      ky += h
    }
  }
  let y = -((graph.topics || []).reduce((n, t) => n + leafCount(t), 0) * step) / 2
  for (const t of graph.topics || []) {
    const h = leafCount(t) * step
    placeAt(t, 0, y, h)
    y += h
  }
  return graph
}

// Final pass: push apart any boxes that still overlap (handles long labels and manual edits).
function separateNodes(graph) {
  const nodes = []
  const collect = (node) => { nodes.push(node); for (const c of node.children || []) collect(c) }
  for (const t of graph.topics || []) collect(t)
  for (let iter = 0; iter < 80; iter++) {
    let moved = false
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        const dx = (b.x || 0) - (a.x || 0)
        const dy = (b.y || 0) - (a.y || 0)
        const ox = (nodeW(a) + nodeW(b)) / 2 + 18 - Math.abs(dx)
        const oy = NODE_H + 18 - Math.abs(dy)
        if (ox > 0 && oy > 0) {
          moved = true
          if (ox < oy) {
            const s = (ox / 2 + 1) * (dx >= 0 ? 1 : -1)
            a.x -= s; b.x += s
          } else {
            const s = (oy / 2 + 1) * (dy >= 0 ? 1 : -1)
            a.y -= s; b.y += s
          }
        }
      }
    }
    if (!moved) break
  }
  return graph
}

function layoutGraph(graph, mode = 'radial') {
  const next = mode === 'tree' ? treeLayout(graph) : radialLayout(graph)
  separateNodes(next)
  next.layout = mode
  return next
}
// Graphs saved before the spacing-aware layout have no `layout` field — relayout them on open.
const needsLayout = (g) => !g.layout || (g.topics || []).some((t) => t.x == null || (t.children || []).some((c) => c.x == null))
function flatten(graph) {
  const nodes = []
  const walk = (node, kind, depth, parent) => {
    nodes.push({ ...node, kind, depth, parent })
    if (!node.collapsed) for (const c of node.children || []) walk(c, 'concept', depth + 1, node.id)
  }
  for (const t of graph.topics || []) walk(t, 'topic', 0, null)
  return nodes
}
function edgesOf(graph, nodes) {
  const ids = new Set(nodes.map((n) => n.id))
  const out = []
  const walk = (node) => {
    for (const c of node.children || []) {
      if (ids.has(c.id)) out.push({ key: `tree-${c.id}`, source: node.id, target: c.id, tree: true })
      walk(c)
    }
  }
  for (const t of graph.topics || []) walk(t)
  for (const l of graph.links || []) if (ids.has(l.source) && ids.has(l.target)) out.push({ key: l.id, ...l, tree: false })
  return out
}
const leafCount = (node) => (node.children?.length ? node.children.reduce((n, c) => n + leafCount(c), 0) : 1)
const nodeCount = (node) => 1 + (node.children || []).reduce((n, c) => n + nodeCount(c), 0)
function findNode(topics, id, parent = null) {
  for (const t of topics || []) {
    if (t.id === id) return { node: t, parent }
    const found = findNode(t.children || [], id, t)
    if (found) return found
  }
  return null
}
function removeNode(topics, id) {
  for (let i = topics.length - 1; i >= 0; i--) {
    if (topics[i].id === id) topics.splice(i, 1)
    else removeNode(topics[i].children || [], id)
  }
}
const nodeW = (n) => Math.max(134, Math.min(236, String(n.label).length * 7.3 + 40))
const NODE_H = 50
function wrap(text, max = 22) {
  const words = String(text).split(/\s+/)
  const lines = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w }
    else cur = (cur + ' ' + w).trim()
    if (lines.length === 2) break
  }
  if (cur && lines.length < 2) lines.push(cur)
  return lines
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

/* ---------------------------- Graph workspace --------------------------- */
function GraphWorkspace({ graph, updateGraph, onLearnNodes, onOpenNote }) {
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [selected, setSelected] = useState([])
  const [selectedLink, setSelectedLink] = useState(null)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState('move')
  const [layoutMode, setLayoutMode] = useState(graph.layout || 'radial')
  const [confirmNode, confirm] = useConfirm()
  const dragRef = useRef(null)
  const didLayout = useRef(false)

  useEffect(() => {
    if (needsLayout(graph) && !didLayout.current) {
      didLayout.current = true
      const next = layoutGraph(JSON.parse(JSON.stringify(graph)), layoutMode)
      updateGraph(next)
      fitGraph(next)
    } else if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect()
      setView({ x: r.width / 2, y: r.height / 2, k: 1 })
    }
  }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      setView((v) => {
        const k2 = clamp(v.k * (e.deltaY < 0 ? 1.12 : 0.89), 0.25, 2.6)
        return { k: k2, x: mx - (mx - v.x) * (k2 / v.k), y: my - (my - v.y) * (k2 / v.k) }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const nodes = useMemo(() => flatten(graph), [graph])
  const edges = useMemo(() => edgesOf(graph, nodes), [graph, nodes])
  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])

  const onPointerDownBg = (e) => {
    if (e.target.closest('[data-node]')) return
    setSelectedLink(null)
    dragRef.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  }
  const onPointerDownNode = (e, node) => {
    e.stopPropagation()
    setSelectedLink(null)
    if (e.shiftKey) setSelected((s) => s.includes(node.id) ? s.filter((x) => x !== node.id) : [...s, node.id])
    else setSelected([node.id])
    if (mode === 'move') {
      dragRef.current = { type: 'node', id: node.id, sx: e.clientX, sy: e.clientY, ox: node.x || 0, oy: node.y || 0, k: view.k, moved: false }
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
    }
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    if (d.type === 'pan') setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
    else if (d.type === 'node') {
      const g = JSON.parse(JSON.stringify(graph))
      const nx = d.ox + dx / d.k, ny = d.oy + dy / d.k
      const found = findNode(g.topics, d.id)
      if (found) { found.node.x = nx; found.node.y = ny }
      updateGraph(g)
    }
  }
  const onPointerUp = (e) => {
    const d = dragRef.current
    if (d?.type === 'pan' && !d.moved) setSelected([])
    dragRef.current = null
  }

  const fitGraph = (g) => {
    const ns = flatten(g)
    if (!ns.length || !wrapRef.current) return
    const r = wrapRef.current.getBoundingClientRect()
    const xs = ns.map((n) => n.x || 0), ys = ns.map((n) => n.y || 0)
    const minX = Math.min(...xs) - 150, maxX = Math.max(...xs) + 150
    const minY = Math.min(...ys) - 90, maxY = Math.max(...ys) + 90
    const k = clamp(Math.min(r.width / (maxX - minX), r.height / (maxY - minY)), 0.18, 1.6)
    setView({ k, x: r.width / 2 - ((minX + maxX) / 2) * k, y: r.height / 2 - ((minY + maxY) / 2) * k })
  }
  const fit = () => fitGraph(graph)

  const editSelected = (patch) => {
    const g = JSON.parse(JSON.stringify(graph))
    const found = findNode(g.topics, selected[0])
    if (found) Object.assign(found.node, patch)
    updateGraph(g)
  }
  const deleteSelected = async () => {
    const id = selected[0]
    const target = findNode(graph.topics, id)?.node
    if (!target) return
    const ok = await confirm({
      title: `Delete “${target.label}”?`,
      body: 'Its subtopics and every connection attached to it are removed from this graph. This cannot be undone.',
      confirmLabel: 'Delete node',
    })
    if (!ok) return
    const g = JSON.parse(JSON.stringify(graph))
    removeNode(g.topics, id)
    g.links = (g.links || []).filter((l) => l.source !== id && l.target !== id)
    updateGraph(g); setSelected([])
  }
  const addChild = () => {
    const g = JSON.parse(JSON.stringify(graph))
    const id = uid()
    const found = findNode(g.topics, selected[0])
    if (!found) return
    const parent = found.node
    parent.children = parent.children || []
    parent.children.push({ id, label: 'New concept', summary: '', x: (parent.x || 0) + 120, y: (parent.y || 0) + 90 })
    parent.collapsed = false
    updateGraph(g); setSelected([id])
  }
  const addTopic = () => {
    const g = JSON.parse(JSON.stringify(graph))
    const id = uid()
    g.topics.push({ id, label: 'New topic', summary: '', children: [], x: (Math.random() - 0.5) * 300, y: (Math.random() - 0.5) * 260, collapsed: false })
    updateGraph(g); setSelected([id])
  }
  const toggleCollapse = (node) => {
    const g = JSON.parse(JSON.stringify(graph))
    const found = findNode(g.topics, node.id)
    if (found) found.node.collapsed = !found.node.collapsed
    updateGraph(g)
  }
  const collapseAll = (collapsed) => {
    const g = JSON.parse(JSON.stringify(graph))
    const walk = (node) => { node.collapsed = collapsed; for (const c of node.children || []) walk(c) }
    g.topics.forEach(walk)
    updateGraph(g)
  }
  const focusNode = (node) => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (r) setView((v) => ({ ...v, x: r.width / 2 - (node.x || 0) * v.k, y: r.height / 2 - (node.y || 0) * v.k }))
  }
  const addLink = (targetId) => {
    if (!selected[0] || !targetId || selected[0] === targetId) return
    const g = JSON.parse(JSON.stringify(graph))
    g.links = g.links || []
    if (!g.links.some((l) => (l.source === selected[0] && l.target === targetId) || (l.source === targetId && l.target === selected[0])))
      g.links.push({ id: uid(), source: selected[0], target: targetId, label: 'relates to' })
    updateGraph(g)
  }
  const editLink = (patch) => {
    const g = JSON.parse(JSON.stringify(graph))
    const link = g.links?.find((l) => l.id === selectedLink)
    if (link) Object.assign(link, patch)
    updateGraph(g)
  }
  const deleteLink = async () => {
    const link = graph.links?.find((l) => l.id === selectedLink)
    if (!link) return
    const from = byId[link.source]?.label || 'a node'
    const to = byId[link.target]?.label || 'a node'
    const ok = await confirm({
      title: 'Remove this connection?',
      body: `“${from}” will no longer be linked to “${to}”. The nodes themselves stay in the graph.`,
      confirmLabel: 'Remove connection',
    })
    if (!ok) return
    const g = JSON.parse(JSON.stringify(graph))
    g.links = (g.links || []).filter((l) => l.id !== selectedLink)
    updateGraph(g)
    setSelectedLink(null)
  }

  const current = byId[selected[0]]
  const currentLink = graph.links?.find((l) => l.id === selectedLink)
  const selectedNodes = selected.map((id) => byId[id]).filter(Boolean)

  useEffect(() => {
    const onKey = (e) => {
      // Never act on graph deletions while a dialog is open (confirm, generator,
      // settings, command palette…). Those keys belong to the dialog.
      if (document.querySelector('.modal-backdrop')) return
      const tag = document.activeElement?.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (e.key === 'Escape') { setSelected([]); setSelectedLink(null); return }
      if (tag === 'BUTTON') return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLink) { e.preventDefault(); deleteLink() }
        else if (selected[0]) { e.preventDefault(); deleteSelected() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, selectedLink, graph, deleteLink, deleteSelected])

  return (
    <div className="graph-wrap">
      <div className="graph-canvas-card" ref={wrapRef}>
        <div className="graph-toolbar">
          <button className="btn sm" onClick={addTopic}><Plus size={14} /> Topic</button>
          <button className="btn sm" onClick={() => setMode(mode === 'move' ? 'select' : 'move')} title="Toggle node drag">
            <MousePointer2 size={14} /> {mode === 'move' ? 'Drag nodes' : 'Select only'}
          </button>
          <button className="btn sm" onClick={fit}><Maximize2 size={14} /> Fit</button>
          <button className="btn sm" onClick={() => { const next = layoutGraph(JSON.parse(JSON.stringify(graph)), 'radial'); setLayoutMode('radial'); updateGraph(next); fitGraph(next) }}>Radial</button>
          <button className="btn sm" onClick={() => { const next = layoutGraph(JSON.parse(JSON.stringify(graph)), 'tree'); setLayoutMode('tree'); updateGraph(next); fitGraph(next) }}>Tree</button>
          <button className="btn sm" onClick={() => collapseAll(false)} title="Expand all branches"><ChevronsUpDown size={14} /> Expand</button>
          <button className="btn sm" onClick={() => collapseAll(true)} title="Collapse all branches"><ChevronsDownUp size={14} /> Collapse</button>
          <div className="graph-search"><Search size={13} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a node…" /></div>
        </div>

        {selectedNodes.length > 0 && (
          <div className="graph-toolbar" style={{ top: 62 }}>
            <button className="btn sm primary" onClick={() => onLearnNodes(selectedNodes, graph)}><GraduationCap size={14} /> Learn from {selectedNodes.length} node{selectedNodes.length > 1 ? 's' : ''}</button>
            <button className="btn sm ghost" onClick={() => setSelected([])}><X size={14} /> Clear</button>
          </div>
        )}

        <svg ref={svgRef} className="graph-canvas"
          onPointerDown={onPointerDownBg} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#343c43" />
            </marker>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#1b2024" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {edges.map((e) => {
              const a = byId[e.source], b = byId[e.target]
              if (!a || !b) return null
              const ax = a.x || 0, ay = a.y || 0, bx = b.x || 0, by = b.y || 0
              const mx = (ax + bx) / 2, my = (ay + by) / 2
              const active = selected.includes(e.source) || selected.includes(e.target)
              const linkSel = !e.tree && selectedLink === e.key
              const d = `M ${ax} ${ay} Q ${mx} ${my - 22} ${bx} ${by}`
              return (
                <g key={e.key}>
                  <path d={d} fill="none" stroke="transparent" strokeWidth="14" style={{ cursor: e.tree ? 'default' : 'pointer' }}
                    onPointerDown={(ev) => { if (!e.tree) { ev.stopPropagation(); setSelectedLink(e.key); setSelected([]) } }} />
                  <path d={d} fill="none" pointerEvents="none"
                    stroke={linkSel || active ? '#d7f27a' : e.tree ? '#2a3137' : '#82d6bd'} strokeOpacity={linkSel || active ? 0.95 : 0.6}
                    strokeWidth={linkSel ? 2.6 : active ? 2.2 : 1.4} strokeDasharray={e.tree ? 'none' : '6 4'} markerEnd="url(#arrow)" />
                  {!e.tree && e.label && <text x={mx} y={my - 14} fill={linkSel ? '#d7f27a' : '#7a817a'} fontSize="10" textAnchor="middle" pointerEvents="none">{e.label}</text>}
                </g>
              )
            })}
            {nodes.map((n) => {
              const w = nodeW(n), h = NODE_H, x = (n.x || 0) - w / 2, y = (n.y || 0) - h / 2
              const isSel = selected.includes(n.id)
              const isRoot = n.kind === 'topic'
              const lines = wrap(n.label)
              const hasKids = (n.children || []).length > 0
              const dim = search && !n.label.toLowerCase().includes(search.toLowerCase())
              return (
                <g key={n.id} data-node="1" transform={`translate(${x},${y})`} opacity={dim ? 0.16 : 1}
                  tabIndex={0} role="button" aria-label={`${n.label}${isRoot ? ' topic' : ' concept'}`}
                  onPointerDown={(e) => onPointerDownNode(e, n)} onDoubleClick={() => focusNode(n)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    if (e.shiftKey) setSelected((s) => s.includes(n.id) ? s.filter((id) => id !== n.id) : [...s, n.id])
                    else setSelected([n.id])
                    setSelectedLink(null)
                  }}
                  title="Double-click to focus" style={{ cursor: mode === 'move' ? 'grab' : 'pointer' }}>
                  <rect width={w} height={h} rx="12"
                    fill={isSel ? '#252b20' : isRoot ? '#181c20' : '#131619'}
                    stroke={isSel ? '#d7f27a' : isRoot ? '#343c43' : '#262c31'} strokeWidth={isSel ? 2 : 1.2} />
                  <rect width="4" height={h} rx="2" fill={isRoot ? '#d7f27a' : '#82d6bd'} opacity={0.9} />
                  <text x="14" y={lines.length === 1 ? 29 : 21} fill="#f1f1ec" fontSize="13" fontWeight="600">
                    {lines.map((ln, i) => <tspan key={i} x="14" dy={i === 0 ? 0 : 15}>{ln}</tspan>)}
                  </text>
                  {hasKids && (
                    <g onPointerDown={(e) => { e.stopPropagation(); toggleCollapse(n) }} style={{ cursor: 'pointer' }}>
                      <circle cx={w - 15} cy={h / 2} r="11" fill="#1e2328" stroke="#343c43" />
                      {n.collapsed
                        ? <path d={`M ${w - 19} ${h / 2} l 4 -4 l 4 4`} fill="none" stroke="#b3b9b2" strokeWidth="1.6" />
                        : <path d={`M ${w - 19} ${h / 2 + 2} l 4 4 l 4 -4`} fill="none" stroke="#b3b9b2" strokeWidth="1.6" />}
                    </g>
                  )}
                </g>
              )
            })}
          </g>
        </svg>

        <div className="graph-zoom">
          <button className="icon-btn" title="Zoom in" aria-label="Zoom in" onClick={() => setView((v) => ({ ...v, k: clamp(v.k * 1.2, 0.25, 2.6) }))}><ZoomIn size={17} /></button>
          <button className="icon-btn" title="Zoom out" aria-label="Zoom out" onClick={() => setView((v) => ({ ...v, k: clamp(v.k * 0.83, 0.25, 2.6) }))}><ZoomOut size={17} /></button>
        </div>
        <div className="graph-legend">Drag to pan · Scroll to zoom · Click a node · Shift-click to multi-select</div>
      </div>

      <div className="node-detail">
        <div className="card">
          <div className="section-head"><h2>{currentLink ? 'Connection details' : current ? 'Node details' : 'Graph overview'}</h2></div>
          {currentLink ? (
            <>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Relationship</div>
              <div className="field">
                <label>From → To</label>
                <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                  {byId[currentLink.source]?.label || 'Unknown'} <span className="muted">→</span> {byId[currentLink.target]?.label || 'Unknown'}
                </div>
              </div>
              <div className="field">
                <label>Label</label>
                <input className="input" value={currentLink.label || ''} onChange={(e) => editLink({ label: e.target.value })} />
              </div>
              <button className="btn sm danger" onClick={deleteLink}><Trash2 size={13} /> Delete connection</button>
            </>
          ) : current ? (
            <>
              <div className="eyebrow" style={{ marginBottom: 6 }}>{current.kind === 'topic' ? 'Main topic' : 'Concept'}</div>
              <div className="field">
                <label>Name</label>
                <input className="input" value={current.label} onChange={(e) => editSelected({ label: e.target.value })} />
              </div>
              <div className="field">
                <label>Explanation</label>
                <textarea className="textarea" value={current.summary || ''} placeholder="Add an explanation…" onChange={(e) => editSelected({ summary: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <button className="btn sm" onClick={addChild}><Plus size={13} /> Subtopic</button>
                {(current.children || []).length > 0 && <button className="btn sm" onClick={() => toggleCollapse(current)}>{current.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />} {current.collapsed ? 'Expand' : 'Collapse'}</button>}
                {current.noteId && <button className="btn sm" onClick={() => onOpenNote?.(current.noteId)}><NotebookPen size={13} /> Open note</button>}
              </div>
              <div className="field">
                <label>Connect to…</label>
                <select className="select" value="" onChange={(e) => { addLink(e.target.value); e.target.value = '' }}>
                  <option value="">Select a node</option>
                  {nodes.filter((n) => n.id !== selected[0]).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </div>
              <button className="btn sm danger" onClick={deleteSelected}><Trash2 size={13} /> Delete node</button>
            </>
          ) : (
            <>
              <div className="field">
                <label>Graph name</label>
                <input className="input" value={graph.title} onChange={(e) => updateGraph({ ...graph, title: e.target.value })} />
              </div>
              <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>Click a node to edit its explanation, add subtopics or connect it to another concept. Click a dashed connection to rename or remove it. Use <b>Radial</b> or <b>Tree</b> to auto-arrange.</p>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <div><div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{graph.topics?.length || 0}</div><div className="lbl">Topics</div></div>
                <div><div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{graph.links?.length || 0}</div><div className="lbl">Links</div></div>
              </div>
            </>
          )}
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Selection</div>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            {selectedNodes.length ? `${selectedNodes.length} node(s) selected. Use “Learn from selection” to create flashcards, summaries, MCQs and more.` : 'Shift-click multiple nodes to select them together.'}
          </p>
          {selectedNodes.length > 0 && <button className="btn sm primary" style={{ marginTop: 12, width: '100%' }} onClick={() => onLearnNodes(selectedNodes, graph)}><GraduationCap size={14} /> Learn from selection</button>}
        </div>
      </div>
      {confirmNode}
    </div>
  )
}

/* -------------------------------- Graphs view -------------------------- */
export default function Graphs({ onLearnNodes, openGraphId, onOpened, sourceFileId, onSourceHandled, onError, onOpenNote }) {
  const { graphs, files, notes, settings, saveGraph, deleteGraph, toast } = useApp()
  const [activeId, setActiveId] = useState(openGraphId || graphs[0]?.id || null)
  const [genOpen, setGenOpen] = useState(false)
  const [genFile, setGenFile] = useState(null)
  const [genSections, setGenSections] = useState([])
  const [genTitle, setGenTitle] = useState('')
  const [generating, setGenerating] = useState(false)
  const [confirmNode, confirm] = useConfirm()
  const genRef = useRef(null)
  useFocusTrap(genRef, genOpen)

  useEffect(() => {
    if (!genOpen) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (!generating) setGenOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [genOpen, generating])

  useEffect(() => { if (openGraphId) { setActiveId(openGraphId); onOpened?.() } }, [openGraphId])
  useEffect(() => { if (!graphs.some((g) => g.id === activeId)) setActiveId(graphs[0]?.id || null) }, [graphs])
  useEffect(() => {
    if (sourceFileId) { openGenerator(sourceFileId); onSourceHandled?.() }
  }, [sourceFileId])

  const active = graphs.find((g) => g.id === activeId)
  const updateGraph = (g) => saveGraph({ ...g, updatedAt: Date.now() })

  const isNotesGraph = (g) => g?.source === 'notes' || (g?.topics?.length > 0 && g.topics.some((t) => notes.some((n) => n.id === t.id)))
  const signatureOf = (ns) => ns.map((n) => `${n.id}:${n.title}:${n.parentId}:${(n.content || '').length}:${(n.links || []).join(',')}`).join('|')

  const syncNotes = (silent = false) => {
    if (!active || !isNotesGraph(active)) return
    const fresh = buildNotesGraph(notes, { full: active.full, rootId: active.rootNoteId })
    if (!fresh) { toast('No notes to sync', 'error'); return }
    const preserve = (topics, old) => topics.map((t) => {
      const found = findNode(old || [], t.id)
      return found ? { ...t, x: found.node.x, y: found.node.y, collapsed: found.node.collapsed, children: preserve(t.children || [], found.node.children || []) } : t
    })
    fresh.id = active.id
    fresh.title = active.title
    fresh.layout = active.layout || 'tree'
    fresh.createdAt = active.createdAt
    fresh.notesSignature = signatureOf(notes)
    fresh.topics = preserve(fresh.topics, active.topics)
    updateGraph(fresh)
    if (!silent) toast('Graph synced with notes', 'success')
  }

  useEffect(() => {
    if (!active || !isNotesGraph(active)) return
    const signature = signatureOf(notes)
    if (active.notesSignature === signature) return
    const timer = setTimeout(() => syncNotes(true), 450)
    return () => clearTimeout(timer)
  }, [notes, active?.id])

  const exportGraph = () => {
    if (!active) return
    const blob = new Blob([JSON.stringify(active, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${active.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'graph'}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast('Graph exported as JSON', 'success')
  }

  const openGenerator = (fileId) => {
    const chosen = files.find((f) => f.id === fileId && f.status === 'done') || files.find((f) => f.status === 'done')
    setGenFile(chosen?.id || null)
    setGenSections([])
    setGenTitle(chosen ? `${chosen.name.replace(/\.[^.]+$/, '')} map` : 'Knowledge map')
    setGenOpen(true)
  }
  const generate = async () => {
    const f = files.find((x) => x.id === genFile)
    if (!f) return toast('Choose a document first', 'error')
    const picked = genSections.length ? f.pages.filter((p, i) => genSections.includes(i)) : f.pages
    const text = picked.map((p) => p.text).join('\n\n')
    if (!text.trim()) return toast('Selected sections have no text', 'error')
    setGenerating(true)
    try {
      const data = await generateGraph({ text, files: [f], settings, title: genTitle || 'Knowledge map' })
      const graph = { id: uid(), ...data, fileIds: [f.id], createdAt: Date.now(), updatedAt: Date.now() }
      saveGraph(graph)
      setActiveId(graph.id)
      setGenOpen(false)
      toast('Knowledge graph generated', 'success')
    } catch (e) {
      if (isAuthError(e)) onError?.(e)
      else toast(e.message, 'error')
    }
    setGenerating(false)
  }

  if (!active) {
    return (
      <div className="view">
        <div className="section-head">
          <div><div className="eyebrow">Visual understanding</div><h2 style={{ fontSize: 22, marginTop: 6 }}>Knowledge Graphs</h2></div>
          <button className="btn primary" onClick={openGenerator}><Network size={16} /> Generate graph</button>
        </div>
        <div className="empty card" style={{ padding: 70 }}>
          <div className="ei"><Network size={30} /></div>
          <h2>Map what you're learning</h2>
          <p>Turn a document — or just a section — into an interactive graph of topics, concepts and connections.</p>
          <button className="btn primary" style={{ marginTop: 18 }} onClick={openGenerator}><Network size={16} /> Generate from a document</button>
        </div>
        {genModal()}
      </div>
    )
  }

  function genModal() {
    if (!genOpen) return null
    const f = files.find((x) => x.id === genFile)
    return (
      <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !generating) setGenOpen(false) }}>
        <div className="modal" ref={genRef} role="dialog" aria-modal="true" aria-label="Generate knowledge graph">
          <div className="modal-head"><h2><Network size={18} style={{ verticalAlign: -3, marginRight: 8, color: 'var(--accent)' }} />Generate knowledge graph</h2><button className="icon-btn" disabled={generating} onClick={() => setGenOpen(false)} aria-label="Close"><X size={16} /></button></div>
          <div className="modal-body" style={{ whiteSpace: 'normal' }}>
            <div className="field"><label>Graph title</label><input className="input" disabled={generating} value={genTitle} onChange={(e) => setGenTitle(e.target.value)} /></div>
            <div className="field">
              <label>Source document</label>
              <select className="select" disabled={generating} value={genFile || ''} onChange={(e) => { setGenFile(e.target.value); setGenSections([]) }}>
                <option value="">Select a document</option>
                {files.filter((x) => x.status === 'done').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            {f && (
              <div className="field">
                <label>Sections to include (leave empty for whole document)</label>
                <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 9, padding: 8 }}>
                  {f.pages.map((p, i) => (
                    <label className="doc-option" key={i}>
                      <input type="checkbox" disabled={generating} checked={genSections.includes(i)} onChange={() => setGenSections((s) => s.includes(i) ? s.filter((x) => x !== i) : [...s, i])} />
                      <span className="dn"><b>{p.label}</b> — {p.text.slice(0, 70)}…</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="modal-foot"><button className="btn" disabled={generating} onClick={() => setGenOpen(false)}>Cancel</button><button className="btn primary" disabled={generating || !genFile} onClick={generate}>{generating ? 'Generating…' : 'Generate graph'}</button></div>
        </div>
      </div>
    )
  }

  return (
    <div className="view" style={{ paddingBottom: 0 }}>
      <div className="section-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select className="select" style={{ width: 260 }} value={activeId || ''} onChange={(e) => setActiveId(e.target.value)}>
            {graphs.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
          {isNotesGraph(active) && <button className="btn sm primary" onClick={() => syncNotes()} title="Rebuild this graph from current notes"><NotebookPen size={14} /> Sync notes</button>}
          <button className="btn sm" onClick={exportGraph} title="Export graph as JSON"><Download size={14} /> Export</button>
          <button className="btn sm danger" title="Delete graph" aria-label="Delete graph" onClick={async () => {
            const ok = await confirm({
              title: `Delete “${active?.title || 'this graph'}”?`,
              body: 'The graph and its generated connections are removed. Notes and source files are not affected.',
              confirmLabel: 'Delete graph',
            })
            if (ok) { deleteGraph(activeId); setActiveId(null) }
          }}><Trash2 size={14} /></button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setActiveId(null)}><Network size={15} /> All graphs</button>
          <button className="btn primary" onClick={openGenerator}><Network size={15} /> New graph</button>
        </div>
      </div>
      <GraphWorkspace key={active.id} graph={active} updateGraph={updateGraph} onLearnNodes={onLearnNodes} onOpenNote={onOpenNote} />
      {genModal()}
      {confirmNode}
    </div>
  )
}
