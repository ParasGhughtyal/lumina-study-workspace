import { uid } from './storage'

// Vite embeds this build-time value in the browser bundle. Never commit a real key.
const DEFAULT_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''

export const DEFAULT_SETTINGS = {
  apiKey: DEFAULT_KEY,
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  model: 'gemini-flash-lite-latest',
  demoMode: false,
}

export function isConfigured(settings) {
  return !settings?.demoMode && !!settings?.apiKey
}

function buildContextBlock(files) {
  if (!files?.length) return 'No documents are selected as context.'
  return files
    .map((f) => {
      const pages = (f.pages || []).map((p) => `[${p.label}] ${p.text}`).join('\n')
      return `=== SOURCE: ${f.name} ===\n${pages}`
    })
    .join('\n\n')
}

const GROUNDING = `You are Lumina, a friendly, precise AI study assistant.
Answer using ONLY the provided source material. Never invent facts not present in the sources.
Explain difficult ideas in beginner-friendly language, use short paragraphs and simple examples.
When you use information from a source, cite it inline like (Source name, Page 3) or (Source name, Slide 2).
If the answer is not in the sources, say so honestly and suggest what to study next.`

export class AiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'AiError'
    this.status = status
    this.auth = status === 401 || status === 403
  }
}
export const isAuthError = (e) => !!e?.auth

function parseJson(text) {
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) } catch {}
  const match = cleaned.match(/[\{\[][\s\S]*[\}\]]/)
  if (!match) throw new Error('The model did not return structured data.')
  return JSON.parse(match[0])
}

function answerIndex(value, length) {
  if (typeof value === 'number' && value >= 0 && value < length) return value
  if (typeof value === 'string') {
    const s = value.trim()
    if (/^[a-zA-Z]$/.test(s)) return s.toUpperCase().charCodeAt(0) - 65
    const n = parseInt(s, 10)
    if (!Number.isNaN(n) && n >= 0 && n < length) return n
  }
  return 0
}

// Providers differ on object vs. bare-array output, and on field names / answer format.
function normalizeStructured(out, action) {
  if (action === 'flashcards') {
    const cards = Array.isArray(out) ? out : (out.flashcards || out.cards || [])
    return { flashcards: cards.map((x) => ({ question: x.question || x.front || x.q || '', answer: x.answer || x.back || x.a || '' })).filter((x) => x.question) }
  }
  if (action === 'mcqs') {
    const qs = Array.isArray(out) ? out : (out.questions || out.mcqs || [])
    return { questions: qs.map((x) => {
      const options = x.options || x.choices || []
      return { question: x.question || x.q || '', options, answer: answerIndex(x.answer ?? x.correct, options.length) }
    }).filter((x) => x.question && x.options.length) }
  }
  if (Array.isArray(out)) return { topics: out.map((x) => ({ name: x.name || x.label || '', summary: x.summary || '', subtopics: x.subtopics || [] })), links: [] }
  return out
}

async function callApi(settings, messages, { json = false, stream = false, onChunk } = {}) {
  const url = `${(settings.baseUrl || DEFAULT_SETTINGS.baseUrl).replace(/\/$/, '')}/chat/completions`
  const request = (useJson, useStream) => fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_SETTINGS.model,
      messages,
      temperature: 0.4,
      ...(useJson ? { response_format: { type: 'json_object' } } : {}),
      ...(useStream ? { stream: true } : {}),
    }),
  })

  for (let attempt = 0; attempt < 4; attempt++) {
    let res = await request(json, stream)
    // Some OpenAI-compatible providers don't support response_format. Retry without it.
    if (!res.ok && json && res.status === 400) res = await request(false, stream)

    if (res.ok) {
      if (!stream || !res.body) {
        const data = await res.json()
        return data.choices?.[0]?.message?.content || ''
      }
      // Read the SSE stream and emit text deltas as they arrive.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let full = ''
      const handleLine = (line) => {
        const payload = line.replace(/^data:\s*/, '').trim()
        if (!payload || payload === '[DONE]') return
        try {
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content
          if (delta) { full += delta; onChunk?.(delta) }
        } catch {}
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) handleLine(line)
      }
      // Some compatible providers end the stream without a final newline.
      if (buffer) handleLine(buffer)
      return full
    }

    const auth = res.status === 401 || res.status === 403
    const retryable = [408, 429, 500, 502, 503, 504].includes(res.status)
    if (auth) throw new AiError('The API key was rejected (401/403). Update it in Settings or switch to Demo mode.', res.status)
    if (!retryable || attempt === 3) {
      const detail = await res.text().catch(() => '')
      throw new AiError(`API error ${res.status}: ${detail.slice(0, 160) || res.statusText}`, res.status)
    }
    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)))
  }
}

export async function testConnection(settings) {
  if (isConfigured(settings) === false) return { ok: false, message: 'Demo mode is on — no API key is being used.' }
  try {
    const reply = await callApi(settings, [{ role: 'user', content: 'Reply with OK' }])
    return { ok: true, message: 'Connected — your API key works.' }
  } catch (e) {
    return { ok: false, message: e.message }
  }
}

/* ----------------------------- Demo helpers ----------------------------- */

const sentences = (text) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 25)

function demoAnswer(question, files) {
  const q = question.toLowerCase()
  const words = q.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w))
  const all = []
  for (const f of files) for (const p of f.pages || []) for (const s of sentences(p.text)) all.push({ s, f: f.name, label: p.label })
  const scored = all
    .map((x) => ({ ...x, score: words.reduce((n, w) => n + (x.s.toLowerCase().includes(w) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  let body
  if (scored.length) {
    body = `Here is what your materials say about **${question.replace(/[?!.]+$/, '')}**:\n\n${scored.map((x, i) => `${i + 1}. ${x.s} *(${x.f}, ${x.label})*`).join('\n')}`
  } else if (all.length) {
    body = `Here's what your materials cover on this topic:\n\n${all.slice(0, 3).map((x) => `- ${x.s} *(${x.f}, ${x.label})*`).join('\n')}`
  } else {
    body = 'I don\'t have any document context yet. **Upload a file** and select it for this chat to get grounded answers.'
  }
  return `${body}\n\n_Demo mode — add an API key in Settings for full AI-generated answers._`
}

const STOP = new Set(['what', 'when', 'where', 'which', 'with', 'this', 'that', 'from', 'your', 'about', 'into', 'does', 'explain', 'summarize', 'summarise', 'generate', 'create', 'their', 'there', 'these', 'those', 'would', 'could', 'should'])

function topTerms(text, max = 8) {
  const counts = {}
  for (const w of text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (w.length > 4 && !STOP.has(w)) counts[w] = (counts[w] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w.replace(/^\w/, (c) => c.toUpperCase()))
}

/* ----------------------------- Public API ------------------------------ */

export async function askAI({ question, history = [], files = [], settings, onChunk }) {
  if (isConfigured(settings)) {
    const context = buildContextBlock(files)
    const messages = [
      { role: 'system', content: `${GROUNDING}\n\nSOURCE MATERIAL:\n${context}` },
      ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: question },
    ]
    return callApi(settings, messages, { stream: true, onChunk })
  }
  // Demo mode still streams visually by emitting the answer in a few pieces.
  const answer = demoAnswer(question, files)
  if (onChunk) {
    for (let i = 0; i < answer.length; i += 24) onChunk(answer.slice(i, i + 24))
  }
  return answer
}

export const LEARN_ACTIONS = {
  explain: { label: 'Explain this', prompt: 'Explain the following material in beginner-friendly language with a simple analogy. Break it into clear steps.' },
  summarize: { label: 'Summarize', prompt: 'Summarize the following material into concise key points (5-8 bullets).' },
  mindmap: { label: 'Generate a mind map', prompt: 'Turn the following material into a knowledge graph.' },
  flashcards: { label: 'Create flashcards', prompt: 'Create 8 flashcards from the following material.' },
  mcqs: { label: 'Generate MCQs', prompt: 'Create 5 multiple-choice questions from the following material.' },
  connections: { label: 'Find connections', prompt: 'Find meaningful connections between the following topics and related ideas.' },
  examples: { label: 'Real-world examples', prompt: 'Give 4 concrete real-world examples that illustrate the following material.' },
  roadmap: { label: 'Learning roadmap', prompt: 'Create a simple step-by-step learning roadmap to master the following material.' },
}

function demoStructured(action, text, files) {
  const src = files?.[0]?.name || 'Selection'
  const sents = sentences(text).slice(0, 6)
  if (action === 'flashcards') return { flashcards: sents.map((s) => ({ question: `What does this describe: "${s.slice(0, 70)}..."?`, answer: s })) }
  if (action === 'mcqs') {
    return {
      questions: sents.slice(0, 5).map((s) => {
        const correct = s
        const wrong = sents.filter((x) => x !== s).slice(0, 2).map((x) => `Related idea: ${x.slice(0, 50)}...`)
        const options = [correct, ...wrong].sort(() => Math.random() - 0.5)
        return { question: `Which statement is supported by the source?`, options, answer: options.indexOf(correct) }
      }),
    }
  }
  if (action === 'mindmap' || action === 'connections') {
    const terms = topTerms(text)
    const root = terms[0] || src
    return {
      topics: [{ name: root, summary: sents[0] || text.slice(0, 160), subtopics: terms.slice(1, 7).map((t) => ({ name: t, summary: sents.find((s) => s.toLowerCase().includes(t.toLowerCase())) || `A key idea related to ${root}.` })) }],
      links: [],
    }
  }
  return { text: `${LEARN_ACTIONS[action]?.prompt || 'Notes'}\n\n${sents.map((s) => `- ${s}`).join('\n')}\n\n_(Demo mode — connect an API key for model-generated results.)_` }
}

export async function runLearnAction({ action, text, files = [], settings }) {
  if (isConfigured(settings)) {
    const instruction = LEARN_ACTIONS[action]?.prompt || 'Help with this material.'
    const formatNote = ['flashcards', 'mcqs', 'mindmap', 'connections'].includes(action)
      ? action === 'flashcards'
        ? 'Return JSON: {"flashcards":[{"question":"...","answer":"..."}]}'
        : action === 'mcqs'
          ? 'Return JSON: {"questions":[{"question":"...","options":["..."],"answer":0}]} where answer is the index of the correct option.'
          : 'Return JSON: {"topics":[{"name":"...","summary":"...","subtopics":[{"name":"...","summary":"..."}]}],"links":[{"source":"...","target":"...","label":"..."}]}'
      : 'Return plain markdown.'
    const messages = [
      { role: 'system', content: `${GROUNDING}\n\n${instruction}\n\n${formatNote}\n\nReturn ONLY the requested output.` },
      { role: 'user', content: `MATERIAL:\n${text}\n\nSOURCE: ${files.map((f) => f.name).join(', ')}` },
    ]
    const out = await callApi(settings, messages, { json: ['flashcards', 'mcqs', 'mindmap', 'connections'].includes(action) })
    if (['flashcards', 'mcqs', 'mindmap', 'connections'].includes(action)) return normalizeStructured(parseJson(out), action)
    return { text: out }
  }
  return demoStructured(action, text, files)
}

export async function generateGraph({ text, files = [], settings, title }) {
  if (isConfigured(settings)) {
    const context = buildContextBlock(files)
    const out = await callApi(settings, [
      {
        role: 'system',
        content: `You are a knowledge graph builder. From the source material, produce a JSON graph of the most important topics, subtopics, concepts and their relationships.
Return JSON ONLY with this shape:
{"topics":[{"name":"Topic Name","summary":"2 sentence explanation","subtopics":[{"name":"Subtopic","summary":"1 sentence"}]}],"links":[{"source":"Topic Name","target":"Subtopic Name","label":"relates to"}]}
Include 4-7 topics and 2-5 subtopics each. Links connect related topics/concepts.`,
      },
      { role: 'user', content: `MATERIAL:\n${text.slice(0, 12000)}\n\n${context.slice(0, 12000)}` },
    ], { json: true })
    return normalizeGraph(normalizeStructured(parseJson(out), 'mindmap'), title)
  }
  return normalizeGraph(demoStructured('mindmap', text, files), title)
}

function normalizeGraph(data, title) {
  const topics = (data.topics || []).filter((t) => t?.name).map((t) => ({
    id: uid(),
    label: String(t.name),
    summary: String(t.summary || ''),
    children: (t.subtopics || []).filter((s) => s?.name).map((s) => ({ id: uid(), label: String(s.name), summary: String(s.summary || '') })),
  }))
  const idByLabel = {}
  for (const t of topics) {
    idByLabel[t.label.toLowerCase()] = t.id
    for (const c of t.children) idByLabel[c.label.toLowerCase()] = c.id
  }
  const links = (data.links || []).map((l) => ({
    id: uid(),
    source: idByLabel[String(l.source || '').toLowerCase()],
    target: idByLabel[String(l.target || '').toLowerCase()],
    label: String(l.label || 'relates to'),
  })).filter((l) => l.source && l.target && l.source !== l.target)
  return { title: title || 'Untitled graph', topics, links }
}
