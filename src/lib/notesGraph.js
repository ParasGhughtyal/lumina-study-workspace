import { uid } from './storage'

export function linksOfNote(notes, note) {
  const ids = new Set(note?.links || [])
  const re = /\[\[([^\]]+)\]\]/g
  let match
  while ((match = re.exec(note?.content || ''))) {
    const target = notes.find((n) => n.title.trim().toLowerCase() === match[1].trim().toLowerCase())
    if (target && target.id !== note.id) ids.add(target.id)
  }
  return [...ids].filter((id) => notes.some((n) => n.id === id))
}

// Build an Obsidian-style graph directly from the notes collection.
export function buildNotesGraph(notes, { full = false, rootId = null } = {}) {
  const childrenOf = (id) => notes.filter((n) => n.parentId === id).sort((a, b) => (a.order || 0) - (b.order || 0))
  const linksOf = (note) => linksOfNote(notes, note)

  const root = rootId ? notes.find((n) => n.id === rootId) : null
  const sources = root ? [root] : childrenOf(null)
  const toTopic = (note) => ({
    id: note.id, label: note.title || 'Untitled', summary: (note.content || '').slice(0, 180),
    noteId: note.id, fileId: note.fileId || null, collapsed: false,
    children: childrenOf(note.id).map(toTopic),
  })
  const topics = sources.map(toTopic)
  if (!topics.length) return null

  const visibleIds = new Set()
  const collect = (node) => { visibleIds.add(node.id); (node.children || []).forEach(collect) }
  topics.forEach(collect)

  const links = []
  notes.forEach((note) => {
    if (!visibleIds.has(note.id)) return
    linksOf(note).forEach((targetId) => {
      if (visibleIds.has(targetId) && !links.some((l) => (l.source === note.id && l.target === targetId) || (l.source === targetId && l.target === note.id)))
        links.push({ id: uid(), source: note.id, target: targetId, label: 'linked' })
    })
  })

  return {
    id: uid(),
    title: root ? `${root.title} map` : 'All notes',
    topics, links, layout: 'tree', source: 'notes', full, rootNoteId: rootId,
    createdAt: Date.now(), updatedAt: Date.now(),
  }
}
