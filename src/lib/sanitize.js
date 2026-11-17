// Minimal allow-list sanitizer for rich text extracted from user-uploaded DOCX files.
const ALLOWED = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'B', 'EM', 'I', 'U',
  'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'BR',
  'BLOCKQUOTE', 'A', 'HR', 'SPAN', 'DIV', 'SUP', 'SUB',
])
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'LINK', 'META'])

export function sanitizeHtml(html) {
  if (!html) return ''
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = parsed.body.firstChild
  const out = document.createElement('div')

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || '')
    if (node.nodeType !== Node.ELEMENT_NODE) return null
    const tag = node.tagName
    if (DROP.has(tag)) return null
    const children = () => {
      const frag = document.createDocumentFragment()
      for (const child of node.childNodes) {
        const clean = walk(child)
        if (clean) frag.appendChild(clean)
      }
      return frag
    }
    if (!ALLOWED.has(tag)) return children()
    const el = document.createElement(tag.toLowerCase())
    if (tag === 'A') {
      const href = node.getAttribute('href') || ''
      if (/^(https?:|mailto:)/i.test(href)) {
        el.setAttribute('href', href)
        el.setAttribute('target', '_blank')
        el.setAttribute('rel', 'noopener noreferrer')
      }
    }
    el.appendChild(children())
    return el
  }

  for (const child of root?.childNodes || []) {
    const clean = walk(child)
    if (clean) out.appendChild(clean)
  }
  return out.innerHTML
}
