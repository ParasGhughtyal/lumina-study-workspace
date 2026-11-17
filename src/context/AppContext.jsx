import { createContext, useContext, useEffect, useCallback, useRef, useState } from 'react'
import { db, uid } from '../lib/storage'
import { extractFile, getFileKind, KIND_META } from '../lib/extraction'
import { DEFAULT_SETTINGS } from '../lib/ai'

const AppContext = createContext(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}

export function AppProvider({ children }) {
  const [files, setFiles] = useState([])
  const [conversations, setConversations] = useState([])
  const [graphs, setGraphs] = useState([])
  const [activity, setActivity] = useState([])
  const [settings, setSettingsState] = useState(DEFAULT_SETTINGS)
  const [studyItems, setStudyItems] = useState([])
  const [notes, setNotes] = useState([])
  const [ready, setReady] = useState(false)
  const [toasts, setToasts] = useState([])
  const timerRef = useRef({})
  const storageWarned = useRef(false)
  const graphTimers = useRef({})
  const noteTimers = useRef({})
  const activityIds = useRef([])
  // Deletes can land while a large file is still extracting. Remember them so
  // the finished extraction can't resurrect the file or create its source note.
  const deletedFileIds = useRef(new Set())

  useEffect(() => {
    Promise.all([
      db.getAll('files'), db.getAll('conversations'), db.getAll('graphs'),
      db.getAll('activity'), db.getAll('kv'), db.getAll('notes'),
    ]).then(([f, c, g, a, kv, n]) => {
      setFiles(f.sort((x, y) => y.uploadDate - x.uploadDate))
      setConversations(c.sort((x, y) => y.updatedAt - x.updatedAt))
      setGraphs(g.sort((x, y) => y.updatedAt - x.updatedAt))
      const recentActivity = a.sort((x, y) => y.time - x.time).slice(0, 30)
      a.slice(30).forEach((item) => db.del('activity', item.id).catch(() => {}))
      activityIds.current = recentActivity.map((x) => x.id)
      setActivity(recentActivity)
      const settingsRec = kv.find((x) => x.id === 'settings')
      if (settingsRec?.value) setSettingsState({ ...DEFAULT_SETTINGS, ...settingsRec.value })
      setStudyItems(kv.filter((x) => x.id.startsWith('study:')).map((x) => x.value).sort((x, y) => y.createdAt - x.createdAt))
      setNotes((n || []).sort((x, y) => (x.order || 0) - (y.order || 0)))
      setReady(true)
    }).catch((e) => { console.error(e); setReady(true) })
  }, [])

  const toast = useCallback((message, type = 'info') => {
    const id = uid()
    setToasts((t) => [...t, { id, message, type }])
    timerRef.current[id] = setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
      delete timerRef.current[id]
    }, 3600)
  }, [])

  const persist = useCallback((store, value) => {
    return db.set(store, value).catch(() => {
      if (!storageWarned.current) {
        storageWarned.current = true
        toast('Browser storage is full or unavailable — changes may not persist.', 'error')
      }
    })
  }, [toast])

  const dismissToast = useCallback((id) => {
    clearTimeout(timerRef.current[id])
    delete timerRef.current[id]
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const logActivity = useCallback((type, title, refId) => {
    const item = { id: uid(), type, title, refId, time: Date.now() }
    // Keep the activity store bounded too, not just the in-memory list.
    if (activityIds.current.length >= 30) {
      const stale = activityIds.current.pop()
      if (stale) db.del('activity', stale).catch(() => {})
    }
    activityIds.current = [item.id, ...activityIds.current]
    setActivity((a) => [item, ...a].slice(0, 30))
    persist('activity', item).catch(() => {})
  }, [persist])

  const updateSettings = useCallback((patch) => {
    setSettingsState((s) => {
      const next = { ...s, ...patch }
      persist('kv', { id: 'settings', value: next }).catch(() => {})
      return next
    })
  }, [])

  /* --------------------------- File actions --------------------------- */
  const addFiles = useCallback(async (fileList) => {
    const incoming = Array.from(fileList)
    if (!incoming.length) return
    const created = []
    for (const file of incoming) {
      const id = uid()
      const kind = getFileKind(file.name)
      const record = {
        id, name: file.name, type: file.type || (kind === 'text' ? 'text/plain' : 'application/octet-stream'),
        size: file.size, uploadDate: Date.now(), status: 'processing', progress: 0,
        kind, color: KIND_META[kind]?.color, pages: [], text: '', note: '', html: '', error: null, blob: file,
      }
      setFiles((prev) => [record, ...prev])
      persist('files', record).catch(() => {})
      created.push(id)

      try {
        const result = await extractFile(file, (progress) => {
          setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, progress } : f)))
        })
        if (deletedFileIds.current.has(id)) {
          deletedFileIds.current.delete(id)
          continue
        }
        const done = { ...record, status: 'done', progress: 100, kind: result.kind, color: KIND_META[result.kind]?.color, pages: result.pages, text: result.text, note: result.note, html: result.html || '', error: null }
        setFiles((prev) => prev.map((f) => (f.id === id ? done : f)))
        persist('files', done).catch(() => {})
        logActivity('file', `Uploaded ${file.name}`, id)

        // Every processed upload becomes a note so it can be organized and mapped.
        const sourceNote = {
          id: uid(), title: file.name.replace(/\.[^.]+$/, ''), content: result.text,
          type: 'source', fileId: id, parentId: null, links: [],
          order: 0, createdAt: Date.now(), updatedAt: Date.now(),
        }
        setNotes((prev) => prev.some((n) => n.fileId === id) ? prev : [...prev, sourceNote])
        persist('notes', sourceNote).catch(() => {})
      } catch (err) {
        if (deletedFileIds.current.has(id)) {
          deletedFileIds.current.delete(id)
          continue
        }
        const failed = { ...record, status: 'error', progress: 0, error: err.message || 'Could not process this file.' }
        setFiles((prev) => prev.map((f) => (f.id === id ? failed : f)))
        persist('files', failed).catch(() => {})
        toast(`${file.name}: ${failed.error}`, 'error')
      }
    }
    return created
  }, [logActivity, toast, persist])

  const renameFile = useCallback((id, name) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)))
    const f = files.find((x) => x.id === id)
    if (f) persist('files', { ...f, name }).catch(() => {})

    const linked = notes.find((n) => n.fileId === id)
    if (linked) {
      // Cancel a pending editor autosave so it can't write the old title back.
      clearTimeout(noteTimers.current[linked.id])
      const updated = { ...linked, title: name.replace(/\.[^.]+$/, ''), updatedAt: Date.now() }
      setNotes((prev) => prev.map((n) => (n.id === linked.id ? updated : n)))
      persist('notes', updated).catch(() => {})
    }
  }, [files, notes, persist])

  const deleteFile = useCallback((id) => {
    const f = files.find((x) => x.id === id)
    if (f?.status === 'processing') deletedFileIds.current.add(id)
    setFiles((prev) => prev.filter((x) => x.id !== id))
    db.del('files', id).catch(() => {})

    const sourceNotes = notes.filter((n) => n.fileId === id)
    if (sourceNotes.length) {
      const ids = sourceNotes.map((n) => n.id)
      // Don't strand notes the user nested under an upload's source note —
      // lift its direct children back to the root instead.
      const lifted = notes.filter((n) => ids.includes(n.parentId)).map((n) => ({ ...n, parentId: null, updatedAt: Date.now() }))
      ids.forEach((noteId) => {
        clearTimeout(noteTimers.current[noteId])
        delete noteTimers.current[noteId]
        db.del('notes', noteId).catch(() => {})
      })
      lifted.forEach((n) => {
        clearTimeout(noteTimers.current[n.id])
        persist('notes', n).catch(() => {})
      })
      setNotes((prev) => prev.filter((n) => !ids.includes(n.id)).map((n) => lifted.find((l) => l.id === n.id) || n))
    }

    // Keep dependent features consistent. Functional updates matter here:
    // bulk deletes run several of these in a row from one render.
    setConversations((prev) => prev.map((c) => {
      if (!c.fileIds?.includes(id)) return c
      const next = { ...c, fileIds: c.fileIds.filter((x) => x !== id) }
      persist('conversations', next).catch(() => {})
      return next
    }))
    setGraphs((prev) => prev.map((g) => {
      if (!g.fileIds?.includes(id)) return g
      const next = { ...g, fileIds: g.fileIds.filter((x) => x !== id) }
      persist('graphs', next).catch(() => {})
      return next
    }))

    if (f) toast(`Deleted ${f.name}`)
  }, [files, notes, toast, persist])

  const openFile = useCallback((id) => {
    const f = files.find((x) => x.id === id)
    if (f) logActivity('file', `Opened ${f.name}`, id)
  }, [files, logActivity])

  /* --------------------------- Chat actions --------------------------- */
  const saveConversation = useCallback((conv) => {
    setConversations((prev) => {
      const exists = prev.some((c) => c.id === conv.id)
      const next = exists ? prev.map((c) => (c.id === conv.id ? conv : c)) : [conv, ...prev]
      persist('conversations', conv).catch(() => {})
      return next.sort((x, y) => y.updatedAt - x.updatedAt)
    })
  }, [])

  const deleteConversation = useCallback((id) => {
    setConversations((prev) => prev.filter((c) => c.id !== id))
    db.del('conversations', id).catch(() => {})
  }, [])

  /* --------------------------- Graph actions -------------------------- */
  const saveGraph = useCallback((graph) => {
    const isNew = !graphs.some((g) => g.id === graph.id)
    setGraphs((prev) => {
      const exists = prev.some((g) => g.id === graph.id)
      const next = exists ? prev.map((g) => (g.id === graph.id ? graph : g)) : [graph, ...prev]
      return next.sort((x, y) => y.updatedAt - x.updatedAt)
    })
    if (isNew) {
      persist('graphs', graph).catch(() => {})
      logActivity('graph', `Graph: ${graph.title}`, graph.id)
    } else {
      // Dragging a node fires many updates — only write the final position to storage.
      clearTimeout(graphTimers.current[graph.id])
      graphTimers.current[graph.id] = setTimeout(() => persist('graphs', graph).catch(() => {}), 300)
    }
  }, [graphs, logActivity, persist])

  const deleteGraph = useCallback((id) => {
    clearTimeout(graphTimers.current[id])
    delete graphTimers.current[id]
    setGraphs((prev) => prev.filter((g) => g.id !== id))
    db.del('graphs', id).catch(() => {})
  }, [])

  /* --------------------------- Study items ---------------------------- */
  const saveStudyItem = useCallback((item) => {
    setStudyItems((prev) => {
      const exists = prev.some((x) => x.id === item.id)
      return (exists ? prev.map((x) => (x.id === item.id ? item : x)) : [item, ...prev])
    })
    persist('kv', { id: `study:${item.id}`, value: item }).catch(() => {})
  }, [])

  const deleteStudyItem = useCallback((id) => {
    setStudyItems((prev) => prev.filter((x) => x.id !== id))
    db.del('kv', `study:${id}`).catch(() => {})
  }, [])

  /* ---------------------------- Notes actions --------------------------- */
  const librarySyncSignature = useRef('')
  const syncLibraryNotes = useCallback(() => {
    // Include existing source notes: if the user deletes one, a later sync must
    // notice the missing note even though the file list is unchanged.
    const signature = `${files.map((f) => `${f.id}:${f.status}`).join('|')}::${notes.map((n) => n.fileId || '').join(',')}`
    if (librarySyncSignature.current === signature) return 0
    librarySyncSignature.current = signature
    const missing = files.filter((f) => f.status === 'done' && !notes.some((n) => n.fileId === f.id))
    if (!missing.length) return 0
    const created = missing.map((f) => ({
      id: uid(), title: f.name.replace(/\.[^.]+$/, ''), content: f.text || '', type: 'source',
      fileId: f.id, parentId: null, links: [], order: 0, createdAt: Date.now(), updatedAt: Date.now(),
    }))
    setNotes((prev) => {
      const known = new Set(prev.map((n) => n.fileId))
      const unique = created.filter((n) => !known.has(n.fileId))
      unique.forEach((n) => persist('notes', n).catch(() => {}))
      return [...prev, ...unique]
    })
    return created.length
  }, [files, notes, persist])

  const saveNote = useCallback((note) => {
    setNotes((prev) => prev.some((x) => x.id === note.id)
      ? prev.map((x) => (x.id === note.id ? note : x))
      : [...prev, note])
    // Autosave from the editor fires on every keystroke — debounce the write.
    clearTimeout(noteTimers.current[note.id])
    noteTimers.current[note.id] = setTimeout(() => persist('notes', note).catch(() => {}), 350)
  }, [persist])

  const deleteNote = useCallback((id) => {
    const collect = (parent) => {
      const ids = [parent]
      notes.filter((x) => x.parentId === parent).forEach((child) => ids.push(...collect(child.id)))
      return ids
    }
    const ids = collect(id)
    ids.forEach((noteId) => { clearTimeout(noteTimers.current[noteId]); delete noteTimers.current[noteId]; db.del('notes', noteId).catch(() => {}) })
    setNotes((prev) => prev.filter((x) => !ids.includes(x.id)))
  }, [notes])

  const mergeNote = useCallback((sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return
    const source = notes.find((n) => n.id === sourceId)
    const target = notes.find((n) => n.id === targetId)
    if (!source || !target) return
    let ancestor = target
    while (ancestor) {
      if (ancestor.id === sourceId) return
      ancestor = notes.find((n) => n.id === ancestor.parentId)
    }
    const merged = {
      ...target,
      content: [target.content, source.content].filter(Boolean).join('\n\n---\n\n'),
      links: [...new Set([...(target.links || []), ...(source.links || [])])].filter((id) => id !== sourceId && id !== targetId),
      updatedAt: Date.now(),
    }
    const children = notes.filter((n) => n.parentId === sourceId).map((n) => ({ ...n, parentId: targetId, updatedAt: Date.now() }))
    // Stale autosave timers would otherwise write the pre-merge tree back.
    ;[sourceId, targetId, ...children.map((c) => c.id)].forEach((noteId) => {
      clearTimeout(noteTimers.current[noteId])
      delete noteTimers.current[noteId]
    })
    setNotes((prev) => prev.filter((n) => n.id !== sourceId).map((n) => n.id === targetId ? merged : (children.find((c) => c.id === n.id) || n)))
    persist('notes', merged).catch(() => {})
    children.forEach((c) => persist('notes', c).catch(() => {}))
    db.del('notes', sourceId).catch(() => {})
    toast(`Merged “${source.title}” into “${target.title}”`, 'success')
  }, [notes, persist, toast])

  /* -------------------------- Backup / restore ------------------------- */
  const exportWorkspace = useCallback(() => ({
    app: 'Lumina', version: 1, exportedAt: new Date().toISOString(),
    files: files.map(({ blob, ...meta }) => meta),
    notes, graphs, conversations, studyItems, activity,
    settings: { ...settings, apiKey: '' },
  }), [files, notes, graphs, conversations, studyItems, activity, settings])

  const importWorkspace = useCallback(async (payload) => {
    if (!payload || payload.app !== 'Lumina') throw new Error('This is not a Lumina backup file.')
    if (payload.version && Number(payload.version) > 1) throw new Error('This backup was made by a newer version of Lumina.')
    if (payload.settings != null && (typeof payload.settings !== 'object' || Array.isArray(payload.settings)))
      throw new Error('This backup has invalid settings.')

    // Accept older backups that omit optional collections, but reject values
    // that are the wrong shape instead of writing broken records.
    const records = (key) => {
      const value = payload[key]
      if (value == null) return []
      if (!Array.isArray(value)) throw new Error(`This backup's ${key} data is invalid.`)
      return value.filter((item) => item && typeof item === 'object' && typeof item.id === 'string')
    }

    const files = records('files').sort((a, b) => (b.uploadDate || 0) - (a.uploadDate || 0))
    const notes = records('notes')
    const graphs = records('graphs').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    const conversations = records('conversations').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    const activity = records('activity').sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 30)
    const studyItems = records('studyItems')

    // Pending autosaves from the previous workspace must not land after import.
    Object.values(noteTimers.current).forEach(clearTimeout)
    Object.values(graphTimers.current).forEach(clearTimeout)
    noteTimers.current = {}
    graphTimers.current = {}

    const stores = ['files', 'notes', 'graphs', 'conversations', 'kv', 'activity']
    for (const store of stores) await db.clear(store)
    const write = (store, list) => Promise.all(list.map((r) => db.set(store, r).catch(() => {})))
    await write('files', files)
    await write('notes', notes)
    await write('graphs', graphs)
    await write('conversations', conversations)
    await write('activity', activity)
    const kv = [...studyItems.map((item) => ({ id: `study:${item.id}`, value: item })),
      { id: 'settings', value: { ...DEFAULT_SETTINGS, ...(payload.settings || {}), apiKey: settings.apiKey } }]
    await write('kv', kv)

    activityIds.current = activity.map((x) => x.id)
    setFiles(files)
    setNotes(notes)
    setGraphs(graphs)
    setConversations(conversations)
    setStudyItems(studyItems)
    setActivity(activity)
  }, [settings.apiKey])

  const value = {
    ready, files, conversations, graphs, activity, settings, toasts, studyItems, notes, toast, dismissToast,
    exportWorkspace, importWorkspace,
    addFiles, renameFile, deleteFile, openFile,
    saveConversation, deleteConversation,
    saveGraph, deleteGraph,
    saveStudyItem, deleteStudyItem, updateSettings, logActivity,
    saveNote, deleteNote, mergeNote, syncLibraryNotes,
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
