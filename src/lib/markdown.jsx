import { Fragment } from 'react'

// Small, safe markdown renderer that produces React nodes (no innerHTML).
// Supports: headings, bullet/numbered lists, fenced code, blockquotes,
// bold, italic, inline code and http(s) links — enough for AI answers.

const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|https?:\/\/[^\s<>()]+)/g

function inline(text, keyBase = '') {
  const parts = String(text).split(INLINE_RE).filter((p) => p !== '' && p !== undefined)
  return parts.map((p, i) => {
    const k = `${keyBase}-${i}`
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={k}>{p.slice(2, -2)}</strong>
    if (p.startsWith('__') && p.endsWith('__') && p.length > 4) return <strong key={k}>{p.slice(2, -2)}</strong>
    if ((p.startsWith('*') && p.endsWith('*') && p.length > 2)) return <em key={k}>{p.slice(1, -1)}</em>
    if ((p.startsWith('_') && p.endsWith('_') && p.length > 2) && !/^_.*_$/.test(p.slice(1, -1))) return <em key={k}>{p.slice(1, -1)}</em>
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={k} className="md-code">{p.slice(1, -1)}</code>
    if (/^https?:\/\//.test(p)) {
      try {
        const url = new URL(p)
        if (url.protocol === 'http:' || url.protocol === 'https:')
          return <a key={k} href={p} target="_blank" rel="noreferrer noopener" className="md-link">{p.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>
      } catch { /* not a valid URL — fall through */ }
    }
    return <Fragment key={k}>{p}</Fragment>
  })
}

export default function Markdown({ text }) {
  const lines = String(text || '').split('\n')
  const out = []
  let list = null        // { ordered, items: [] }
  let code = null        // { lang, lines: [] }
  let quote = null       // lines []

  const flushList = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    out.push(
      <Tag key={`l${out.length}`} className="md-list">
        {list.items.map((item, i) => <li key={i}>{inline(item, `li${i}`)}</li>)}
      </Tag>
    )
    list = null
  }
  const flushQuote = () => {
    if (!quote) return
    out.push(<blockquote key={`q${out.length}`} className="md-quote">{quote.map((l, i) => <div key={i}>{inline(l, `ql${i}`)}</div>)}</blockquote>)
    quote = null
  }
  const flushCode = () => {
    if (!code) return
    out.push(
      <pre key={`c${out.length}`} className="md-pre">
        {code.lang && <span className="md-lang">{code.lang}</span>}
        <code>{code.lines.join('\n')}</code>
      </pre>
    )
    code = null
  }
  const flushAll = () => { flushList(); flushQuote(); flushCode() }

  lines.forEach((raw, idx) => {
    const line = raw.replace(/\s+$/, '')

    if (code !== null) {
      if (/^```/.test(line.trim())) { flushCode() } else { code.lines.push(raw) }
      return
    }
    const fence = line.trim().match(/^```(\w+)?\s*$/)
    if (fence) { flushList(); flushQuote(); code = { lang: fence[1] || '', lines: [] }; return }

    if (!line.trim()) { flushList(); flushQuote(); return }

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      flushAll()
      const level = Math.min(heading[1].length + 1, 5) // h1 -> h2 in answers
      const Tag = `h${level}`
      out.push(<Tag key={`h${idx}`} className="md-heading">{inline(heading[2], `h${idx}`)}</Tag>)
      return
    }

    if (/^\s*[-*•]\s+/.test(line)) {
      flushQuote()
      const item = line.replace(/^\s*[-*•]\s+/, '')
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] } }
      list.items.push(item)
      return
    }
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
    if (ol) {
      flushQuote()
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] } }
      list.items.push(ol[2])
      return
    }

    if (/^>\s?/.test(line)) {
      flushList()
      quote = quote || []
      quote.push(line.replace(/^>\s?/, ''))
      return
    }

    flushList(); flushQuote()
    out.push(<div key={`p${idx}`} className="md-p">{inline(line, `p${idx}`)}</div>)
  })
  flushAll()

  return <div className="md">{out}</div>
}
