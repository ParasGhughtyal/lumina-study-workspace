# Lumina — Learning Workspace

## Technical Project Report

---

## 1. Overview

**Lumina** is a responsive, single-page web application that turns uploaded study material into an interactive learning workspace. Users can upload documents, ask an AI questions grounded in those sources, visualize relationships as interactive knowledge graphs, organize notes into a hierarchy, and generate flashcards, quizzes and summaries.

The application is **local-first**: all user data is stored in the browser with IndexedDB. There is no application backend, no account system and no server-side data processing, apart from the configured AI provider.

- **Type:** Client-side SPA (Vite + React)
- **Version:** 1.0.0
- **Primary language:** JavaScript (ES modules, JSX)
- **Styling:** Plain CSS with custom design tokens (no CSS framework)
- **Approx. source size:** ~3,400 lines across 26 source files

---

## 2. Goals and scope

| Goal | Implementation |
|---|---|
| Upload and extract many file formats | Client-side extraction pipeline with progress and clear errors |
| AI answers grounded in user material | Context injection from selected documents plus inline source citations |
| Interactive knowledge graphs | Custom SVG canvas with pan/zoom, editing, multiple layouts |
| Select-to-learn workflows | Global selection toolbar with eight study actions |
| Organize notes into a knowledge tree | Hierarchical notes with wiki links and an embedded graph |
| Work without setup or signup | Sensible defaults, demo AI mode, local persistence |
| Deploy as a static site | `dist/` build with Vercel/Netlify configuration |

---

## 3. Tech stack

### Runtime dependencies

| Package | Version | Purpose |
|---|---|---|
| `react` | ^18.3.1 | UI component framework |
| `react-dom` | ^18.3.1 | DOM rendering |
| `pdfjs-dist` | ^4.10.38 | PDF text extraction (with web worker) |
| `mammoth` | ^1.8.0 | DOCX → plain text and HTML |
| `jszip` | ^3.10.1 | Reading PPTX package XML (slide text) |
| `tesseract.js` | ^5.1.1 | Browser OCR for images (lazy loaded) |
| `lucide-react` | ^0.468.0 | Icon set |

### Development dependencies

| Package | Version | Purpose |
|---|---|---|
| `vite` | ^6.0.7 | Dev server and production bundler |
| `@vitejs/plugin-react` | ^4.3.4 | React JSX transform and fast refresh |

### Browser APIs used

- IndexedDB (persistence)
- Fetch + Streams API (AI streaming responses)
- DOMParser (HTML sanitization)
- Pointer Events (graph pan/zoom/drag)
- `URL.createObjectURL` (file previews)
- Clipboard API (copy answers)
- `matchMedia` / CSS `prefers-reduced-motion`

### Fonts

Inter (UI text) and Sora (headings), loaded from Google Fonts.

---

## 4. Architecture

```
src/
├── main.jsx                  Entry point, React root, ErrorBoundary
├── App.jsx                   View routing, global state wiring, AI action dispatch
├── index.css                 Full design system and all component styles
├── context/
│   └── AppContext.jsx        Global state provider + IndexedDB actions
├── lib/
│   ├── storage.js            IndexedDB wrapper, UID generator
│   ├── extraction.js         File-type detection and text extraction
│   ├── ai.js                 AI client, prompts, streaming, demo fallback
│   ├── notesGraph.js         Builds graphs from the notes collection
│   └── sanitize.js           Allow-list HTML sanitizer
└── components/
    ├── Sidebar.jsx           Primary navigation
    ├── Dashboard.jsx         Stats, activity, quick actions
    ├── Library.jsx           Upload, search, filter, sort, file cards
    ├── DocumentViewer.jsx    Preview / extracted-text reader
    ├── FileIcon.jsx          File-type icon mapping
    ├── Chat.jsx              Conversational AI interface
    ├── Graphs.jsx            Graph workspace + generation UI
    ├── Notes.jsx             Notes tree, editor, connections, organizer
    ├── NotesGraph.jsx        Embedded interactive note map
    ├── MarkdownView.jsx      Markdown renderer with wiki links
    ├── StudyTools.jsx        Flashcards, quizzes, saved notes
    ├── SelectionToolbar.jsx  Select-to-learn actions
    ├── LearnResultModal.jsx  AI result display
    ├── SettingsModal.jsx     AI provider configuration
    ├── CommandPalette.jsx    Ctrl/Cmd+K global search and actions
    ├── Toasts.jsx            Notifications
    └── ErrorBoundary.jsx     Crash recovery UI
```

### State management

A single React context (`AppContext`) holds `files`, `conversations`, `graphs`, `notes`, `studyItems`, `activity`, `settings`, `toasts` and UI helpers. Components consume it via `useApp()`. Writes are debounced for high-frequency operations (graph dragging, note typing) to reduce IndexedDB churn.

### Data flow

1. **Upload** → file saved as a Blob in IndexedDB → extraction pipeline → text/page data stored → a source note is auto-created.
2. **Chat** → selected files are serialized into a grounded system prompt → streaming answer → message saved with source snapshot.
3. **Graph** → generated from document text or notes → topic tree + links → SVG layout → user edits persisted.
4. **Selection** → text/nodes/files become AI context → action result becomes a study item, graph, or modal result.

---

## 5. Persistence schema

Database: **`lumina-workspace`**, version 2.

| Store | Key | Value shape |
|---|---|---|
| `files` | file id | metadata, `Blob`, extracted text, pages, HTML, status |
| `notes` | note id | title, content, `parentId`, `type`, `order`, `links[]`, `fileId` |
| `graphs` | graph id | topics (recursive), links, layout, `source`, `notesSignature` |
| `conversations` | conversation id | messages with roles, sources, `fileIds`, timestamps |
| `activity` | activity id | type, title, refId, time |
| `kv` | string key | settings record and `study:<id>` items |

Data never leaves the browser except for AI requests sent to the configured provider.

---

## 6. Feature modules

### 6.1 Library and reader
- Drag-and-drop and multi-file upload; supported formats: PDF, PPT/PPTX, DOC/DOCX, TXT, Markdown, JPG/JPEG/PNG/WEBP.
- Search, type filters, sort (newest/oldest/name), rename, delete, bulk delete.
- Processing status with progress and explicit errors (e.g. legacy `.doc` / `.ppt` guidance).
- Reader with **Preview** and **Extracted text** modes:
  - PDF: native embedded viewer
  - Images: full-size display
  - DOCX: sanitized rich HTML
  - PPTX: slide cards
  - Text/Markdown: sectioned text with selectable content

### 6.2 File extraction pipeline
- PDF: `pdfjs-dist` with a dedicated worker; text items joined with line-break heuristics; page references retained.
- DOCX: `mammoth` raw text plus rich HTML; split into sections.
- PPTX: `jszip` reads `ppt/slides/slideN.xml`; `<a:t>` nodes extracted; slide numbers retained.
- Images: `tesseract.js` OCR.
- All format libraries (pdfjs, mammoth, jszip, tesseract) are **lazy-loaded per file type** — the initial bundle never downloads them.
- Legacy formats produce clear, actionable messages.

### 6.3 AI study assistant
- OpenAI-compatible client; default provider **Google Gemini** (`gemini-flash-lite-latest`).
- Grounded system prompt: answers must use only selected sources and cite `(Source, Page/Slide)`.
- Streaming SSE responses rendered progressively with a caret; answers rendered as safe React-node markdown (headings, lists, code blocks, inline code, links).
- Composer auto-grows with the message and resets after sending.
- The transcript stays pinned to the newest message while streaming, but scrolling up releases the pin so earlier answers can be read.
- First messages activate their conversation immediately, so answers stream into the transcript instead of behind the empty state.
- Conversation management: multiple chats, inline rename, delete with in-app confirmation, source chips per answer.
- Switching conversations restores that conversation's source selection, keeping follow-up answers grounded in the right documents.
- Message actions: copy (per-message check feedback) and regenerate.
- Mobile-friendly sources/conversations drawer behind a "Sources" button; Escape closes it.
- Reliability: 4 retry attempts for transient failures (408/429/5xx), automatic fallback when a provider rejects `response_format`, robust JSON parsing (object or array, alternate field names, letter answers).
- Demo mode provides local, context-aware answers when no API is used.

### 6.4 Knowledge graphs
- Interactive SVG canvas: pan, zoom, drag nodes, multi-select, double-click focus.
- Two layout engines: **Radial** (angular wedge allocation) and **Tree** (tidy columns), plus a collision-separation pass so nodes never overlap.
- Recursive hierarchy support (domains → subjects → chapters → notes).
- Node editing: add/rename/delete, add subtopics, expand/collapse branches.
- Connection editing: add, rename label, delete; dashed lines for custom links.
- Search-to-dim, select-all, fit, JSON export, and auto-sync for note-derived graphs.

### 6.5 Select-to-learn
Selection sources: text in the reader, multiple library files, graph nodes. Actions: Explain, Summarize, Generate mind map, Create flashcards, Generate MCQs, Find connections, Real-world examples, Learning roadmap. Results open in a modal, become a graph, or are saved into Study Tools.

### 6.6 Notes organizer
- Tree hierarchy: Domain → Subject → Chapter → Note; add, rename, delete, move under, merge into, move to root.
- Destructive actions use in-app confirmation dialogs; merges explain what moves and what is removed.
- Autosaving markdown editor with Write / Preview toggle.
- Pending autosave timers are cancelled around merges and file-derived note deletions, so stale writes cannot resurrect removed notes.
- Deleting an upload preserves notes the user nested beneath its source note by lifting them back to the root.
- `[[Wiki Links]]` and an explicit Connections panel for bidirectional-style linking.
- Embedded Obsidian-style map beside the editor with clickable nodes.
- Uploaded files automatically become source notes; "Open source file" links back.
- Full map auto-syncs with note edits, merges and moves.

### 6.7 Study tools
- Flashcards with flip, previous/next and shuffle; each deck keeps its own position independently.
- Quizzes with scoring, correct/wrong feedback and reset; answers lock once chosen so scores can't be gamed.
- Saved summaries and AI note results.

### 6.8 Dashboard, navigation and UX
- Refreshed dashboard: compact hero, five metric cards (documents, notes, chats, graphs, study sets), a full quick-action list, clickable recent activity (real buttons, keyboard accessible), and a getting-started checklist with progress bar.
- Onboarding empty states and responsive stat grid.
- Command palette (`Ctrl/Cmd+K`) searching views, commands, files, graphs and note content, with a keyboard-hints footer; dismissible toasts; error boundary.
- All destructive actions use a styled in-app confirmation dialog instead of native `confirm()` / `prompt()`: Cancel receives initial focus, focus is trapped, the dialog sits above any parent modal, and focus returns to the trigger when it closes.
- View-aware browser tab titles (`AI Chat · Lumina`, document names in the reader, etc.).
- Keyboard polish: `Ctrl/Cmd+1–6` jumps between views, `?` opens a shortcut cheat-sheet overlay; flashcard flip/navigate with Space and arrows, graph node/connection deletion with Delete, Escape to clear selections; dialog roles, focus trapping and dismissible toasts for accessibility.
- Focus management: focus trap with Tab wrap-around and synchronous initial focus in all modals and the command palette, Escape-to-close everywhere.
- Hover-revealed message, conversation and note-tree actions also appear on keyboard focus.
- Motion polish: modal/palette entrance animations, smooth view transitions, press feedback on icon buttons, reduced-motion support, balanced heading typography.
- Consistent iconography: semantic icons for AI actions (GraduationCap/MessageSquareText/FlaskConical); no sparkle icons or emoji anywhere.
- Notes editor shows a live "Saving… / Saved locally" indicator.
- Responsive layout: collapsed icon sidebar, stacked graph panels, and a slide-in chat drawer for sources/conversations below 860px.

---

## 7. UI design system

- Dark, editorial palette: near-black charcoal (`#0b0c0d`), warm ivory text, hairline borders.
- Single lime accent (`#d7f27a`) reserved for primary actions and active states.
- Secondary semantic colors: teal, amber, green, red.
- Typography: Inter for UI, Sora for headings, tabular numerals for counts.
- Flat surfaces, minimal shadows, 8–12px radii, restrained motion, `prefers-reduced-motion` support.
- Responsive layout: sidebar collapses to icons, panels reflow, note map hides at narrow widths.

---

## 8. Security and privacy

- No server, no account, no analytics; data stays in the browser.
- Uploaded DOCX HTML is passed through an allow-list sanitizer (scripts, styles, iframes and event attributes removed).
- API key is stored in browser IndexedDB and sent directly to the configured provider.
- **Deployment caveat:** the public repository contains no live API key. A key supplied through `VITE_GEMINI_API_KEY` is embedded in the static browser bundle, so visitors can inspect and use it. Restrict the key and its quota, avoid sensitive documents, and use a serverless proxy or per-user keys for production.

---

## 9. Build and deployment

```bash
npm install
npm run dev      # development server
npm run build    # production build → dist/
npm run preview  # preview production build
```

Static hosting configs included: `vercel.json`, `netlify.toml`, `.env.example`.

Approximate build output (after lazy-loading the document toolchains):
- Initial application JS: ~306 kB (~105 kB gzip) across entry + preboot chunks
- Lazy chunks: PDF engine ~365 kB, DOCX libs ~213 kB, JSZip ~97 kB, PDF worker ~1.38 MB — loaded only when a matching file type is uploaded
- CSS: ~40 kB (~8.4 kB gzip)

### 9.1 Installable web app (PWA)
- `manifest.webmanifest` + SVG icon; standalone display, themed to the charcoal background.
- Hand-rolled service worker (`public/sw.js`): app-shell precache, immutable cache-first for hashed `/assets/*`, network-first navigation with offline fallback, stale-while-revalidate for fonts, and API traffic always bypasses the cache.
- Registered only in production builds; enables offline use and desktop/mobile install.

---

## 10. Verification performed

- Production build succeeds with no errors.
- All six views render with zero console errors.
- Upload → extraction → source note creation verified.
- Streaming chat with grounded citations verified.
- Chat audit (mocked SSE stream): immediate conversation activation, progressive streaming bubble, bottom-pinned auto-scroll, per-message copy feedback, per-conversation source restore, inline rename and delete confirmation verified.
- Study tools audit: per-deck flashcard positions and locked quiz answers implemented; scoring/reset logic reviewed.
- In-app confirmations verified: Cancel focused by default, Tab wrap-around, Escape closes only the dialog even when it is layered over Settings, and focus returns to the trigger.
- Mobile audit at 420px: sources drawer opens with scrim, stays inside the viewport, and closes with Escape.
- Accessibility sweep: every icon-only button has an accessible name (title/aria-label), note-tree carets expose `aria-expanded`, and toasts render inside a polite `role="status"` live region.
- Narrow-viewport check at 560px: quiz/summary cards span the full grid width and cause no horizontal overflow.
- Bulk file deletion keeps chat and graph source references consistent; note merge/delete cancels pending autosaves.
- Flashcards, MCQs and note/wiki-link generation verified with live AI.
- Graph layouts verified collision-free; node → note round-trip verified.
- Note merge/move and graph auto-sync verified.
- PDF, DOCX, PPTX and image previews exercised.
- Simulated invalid/revoked API key: actionable banner and demo fallback verified, then recovery verified.
- Error boundary and reduced-motion support included.

---

## 11. Limitations and future work

| Limitation | Possible next step |
|---|---|
| Single-browser data; no cross-device sync | Optional Supabase/Firebase sync with accounts |
| Default key visible in static bundle | Serverless proxy or per-user keys |
| OCR depends on CDN language data | Bundle language data or provide offline model |
| Legacy `.doc`/`.ppt` unsupported | Pre-convert to `.docx`/`.pptx` |
| Graph snapshots are per graph, not globally synced except note graphs | Add workspace-level graph index |
| No collaboration or sharing | Add accounts, permissions and shared workspaces |

---

## 12. Conclusion

Lumina demonstrates a complete, lightweight learning workspace built entirely with front-end technologies. It combines document ingestion, grounded AI conversation, interactive knowledge visualization, note organization and study tools in one coherent interface while keeping the user's data private and locally owned.
