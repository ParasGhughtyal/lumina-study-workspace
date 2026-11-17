# Lumina — Learning Workspace

A modern, responsive, client-side learning workspace. Upload your study materials, chat with an AI grounded in those sources, and explore topics through an interactive knowledge graph — with select-to-learn study tools on top.

## Run it

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. To produce a static build: `npm run build` (output in `dist/`).

## What's included

- **Library & reader** — drag-and-drop multi-file upload, search/filter, rename, delete, processing status and clear errors. Supports PDF, PPTX, DOCX, TXT/Markdown and JPG/PNG/WEBP images. The in-app reader has a **Preview** for every format: native PDF viewer, full-size images, rich formatted DOCX (sanitized), slide cards for presentations, and an **Extracted text** view with page/slide/section references for select-to-learn. Text is extracted client-side; OCR (Tesseract.js) is used for images and runs lazily.
- **AI Chat** — conversations with a document selector. Answers are grounded in selected documents and cite the source page/slide. Supports follow-up questions.
- **Knowledge Graphs** — generate a graph from a whole document or chosen sections. Choose a **Radial** mind-map layout or a **Tree** layout; both use spacing-aware placement so nodes never overlap. Drag nodes, pan, zoom, search/filter nodes, double-click to focus a node, expand/collapse branches, edit/add/delete nodes and connections, export as JSON, and launch "Learn from selection".
- **Select-to-learn** — select text in the reader, multiple library files, or graph nodes, then explain, summarize, mind-map, create flashcards, generate MCQs, find connections, get real-world examples or a learning roadmap.
- **Study Tools** — flip through flashcards and take scored quizzes.
- **Notes** — a local-first knowledge tree: Domain → Subject → Chapter → Note, with search, an autosaving editor, **Move under / Merge into** actions, and an **interactive Obsidian-style map embedded beside the editor** (pan/zoom, click a node to open its note). Uploaded files become source notes automatically. Link notes with `[[Wiki Links]]` or the Connections panel. **Open full map** launches the large graph view, which auto-syncs with note changes. Hierarchy is solid lines, manual links are dashed.
- **Dashboard** — stats, quick actions and recent activity.

Everything is stored locally in your browser (IndexedDB). No backend, no account required.

## AI configuration

The app uses **Google Gemini** when a key is supplied and streams answers as they are generated. Without a configured key, it remains usable in local demo mode with context-aware answers and no API calls.

To use a key, open **Settings** and paste it, or set `VITE_GEMINI_API_KEY` at build time (see `.env.example`). Presets for Gemini, Groq, OpenRouter and OpenAI are included. **Reset to default** restores the configured defaults, including the build-time key if one is set.

> **Demo key:** the public GitHub repository does not contain a live key. To enable AI for a demo deployment, set `VITE_GEMINI_API_KEY` in the host's build environment. Vite embeds that value in the browser bundle, so visitors can inspect and use it. Restrict the key to the required API, set a quota, and avoid uploading sensitive or production documents. For production use, put a server-side proxy between the app and the provider or require each user to supply their own key.

Use **Test connection** in Settings to verify a key before saving. If a key is revoked or rejected, the app shows an actionable banner with links to Settings and a one-click switch to Demo mode instead of failing silently. Free models returning `503` under load are retried automatically; switching models in AI Studio (https://aistudio.google.com/rate-limit) is the next step.

Deleting a document removes it from chat sources and graph references too, so features stay in sync. Recent activity items are clickable, and you can rename graphs, auto-arrange nodes, and rename or delete individual connections.

> Note: OCR language data and AI API calls require an internet connection. Unsupported legacy formats (`.doc`, `.ppt`) show a clear message asking you to save as `.docx`/`.pptx`.

## Deploying

It's a static Vite build with no backend:

```bash
npm run build   # output in dist/
```

Deploy the `dist/` folder to any static host. Configs for **Vercel** (`vercel.json`) and **Netlify** (`netlify.toml`) are included. To enable the demo AI, add `VITE_GEMINI_API_KEY` in the host's environment variables before deploying; changing it requires a new build.

### Recommended: GitHub + Vercel

1. Push the project to a GitHub repository.
2. In Vercel, choose **Add New → Project**, import the repository, and deploy. The checked-in Vite settings use `npm run build` and publish `dist/`.
3. Push or merge changes to `main` to publish an update. Vercel also creates preview deployments for other branches and pull requests.

Netlify is also supported: import the same GitHub repository and it will use the included `netlify.toml` build and publish settings.

## Design

A restrained editorial dark theme: near-black warm charcoal surfaces, ivory typography (Inter for UI, Sora for headings), hairline borders, a single lime accent used only for actions and active states, and no gradients or glow effects. Icons are functional rather than decorative, and the brand mark and assistant avatar use a custom geometric glyph instead of generic "AI" sparkles.

## Stack

Vite + React 18, custom CSS design system, `pdfjs-dist`, `mammoth`, `jszip`, `tesseract.js`, `lucide-react`. No graph library — the interactive graph is implemented with SVG + pointer events.
