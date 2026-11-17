import { Fragment } from 'react'

function inline(text, onWiki) {
  const parts = []
  const re = /(\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g
  let last = 0
  let match
  let i = 0
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(<Fragment key={i++}>{text.slice(last, match.index)}</Fragment>)
    if (match[2] !== undefined) {
      parts.push(<button key={i++} className="wiki-link" onClick={() => onWiki?.(match[2])}>{match[2]}</button>)
    } else if (match[3] !== undefined) {
      parts.push(<strong key={i++}>{match[3]}</strong>)
    } else if (match[4] !== undefined) {
      parts.push(<em key={i++}>{match[4]}</em>)
    } else if (match[5] !== undefined) {
      parts.push(<code key={i++}>{match[5]}</code>)
    }
    last = re.lastIndex
  }
  if (last < text.length) parts.push(<Fragment key={i++}>{text.slice(last)}</Fragment>)
  return parts
}

export default function MarkdownView({ text, onWiki }) {
  const lines = (text || '').split('\n')
  const out = []
  let list = []
  const flush = () => {
    if (list.length) { out.push(<ul key={`l${out.length}`}>{list.map((item, i) => <li key={i}>{inline(item, onWiki)}</li>)}</ul>); list = [] }
  }
  lines.forEach((line, idx) => {
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    const bullet = line.match(/^\s*[-*]\s+(.+)$/)
    if (heading) {
      flush()
      const Tag = `h${heading[1].length}`
      out.push(<Tag key={idx}>{inline(heading[2], onWiki)}</Tag>)
    } else if (bullet) {
      list.push(bullet[1])
    } else if (!line.trim()) {
      flush()
    } else {
      flush()
      out.push(<p key={idx}>{inline(line, onWiki)}</p>)
    }
  })
  flush()
  return <div className="markdown-view">{out.length ? out : <p className="muted">Nothing to preview yet.</p>}</div>
}
