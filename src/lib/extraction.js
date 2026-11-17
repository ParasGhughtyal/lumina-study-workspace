// Heavy format libraries are lazy-loaded per file type, so opening the app
// never downloads the PDF/DOCX/PPTX/OCR toolchains up front.
let pdfjsPromise = null
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })
  }
  return pdfjsPromise
}

const clean = (s) => (s || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim()

export function getFileKind(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (['ppt', 'pptx'].includes(ext)) return 'presentation'
  if (['doc', 'docx'].includes(ext)) return 'document'
  if (['txt', 'md', 'markdown'].includes(ext)) return 'text'
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image'
  return 'unknown'
}

export const KIND_META = {
  pdf: { label: 'PDF', color: '#ef8d80' },
  presentation: { label: 'Presentation', color: '#e8b96a' },
  document: { label: 'Document', color: '#a9b8c8' },
  text: { label: 'Text', color: '#9bd98f' },
  image: { label: 'Image', color: '#c6a6df' },
  unknown: { label: 'File', color: '#7a817a' },
}

async function extractPdf(file, onProgress) {
  const pdfjs = await loadPdfjs()
  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    let lastY = null
    let text = ''
    for (const item of content.items) {
      if (!item.str) continue
      const y = item.transform ? Math.round(item.transform[5]) : null
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) text += '\n'
      text += item.str + ' '
      lastY = y
    }
    pages.push({ label: `Page ${i}`, text: clean(text) })
    onProgress?.(Math.round((i / pdf.numPages) * 100))
  }
  await pdf.destroy()
  return { pages, note: pdf.numPages ? `Extracted ${pdf.numPages} page(s)` : '' }
}

async function extractDocx(file) {
  const mammoth = (await import('mammoth')).default
  const arrayBuffer = await file.arrayBuffer()
  const [result, rich] = await Promise.all([
    mammoth.extractRawText({ arrayBuffer }),
    mammoth.convertToHtml({ arrayBuffer }),
  ])
  const text = clean(result.value)
  // Split on double newlines to keep readable, referenceable sections
  const chunks = text.split(/\n{2,}/).map((t) => clean(t)).filter(Boolean)
  const pages = chunks.length ? chunks.map((t, i) => ({ label: `Section ${i + 1}`, text: t })) : []
  return { pages, note: `${chunks.length} section(s)`, html: rich.value }
}

async function extractPptx(file, onProgress) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const n = (s) => parseInt(s.match(/slide(\d+)\.xml/)[1], 10)
      return n(a) - n(b)
    })
  const pages = []
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async('string')
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const texts = Array.from(doc.getElementsByTagName('a:t')).map((n) => n.textContent)
    pages.push({ label: `Slide ${i + 1}`, text: clean(texts.join(' ')) })
    onProgress?.(Math.round(((i + 1) / slideFiles.length) * 100))
  }
  return { pages, note: `${pages.length} slide(s)` }
}

function extractTextLike(file) {
  return file.text().then((raw) => {
    const text = clean(raw)
    const isMarkdown = /\.(md|markdown)$/i.test(file.name)
    const sections = []
    if (isMarkdown) {
      const parts = text.split(/^(#{1,6})\s+(.+)$/m)
      // parts: [preamble, hashes, title, content, ...]
      const preamble = clean(parts[0])
      if (preamble) sections.push({ label: 'Introduction', text: preamble })
      for (let i = 1; i < parts.length; i += 3) {
        const title = clean(parts[i + 1])
        const body = clean(parts[i + 2])
        if (title || body) sections.push({ label: title || `Section ${sections.length + 1}`, text: body })
      }
    }
    if (!sections.length) sections.push({ label: 'Content', text })
    return { pages: sections, note: '' }
  })
}

async function extractImage(file, onProgress) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress?.(Math.round(m.progress * 100))
    },
  })
  try {
    const { data } = await worker.recognize(file)
    return { pages: [{ label: 'Image', text: clean(data.text) }], note: 'Text extracted with OCR' }
  } finally {
    await worker.terminate()
  }
}

export async function extractFile(file, onProgress) {
  const kind = getFileKind(file.name)
  if (kind === 'unknown') throw new Error('Unsupported file type.')
  if (/\.doc$/i.test(file.name)) throw new Error('Legacy .doc is not supported. Please save as .docx and try again.')
  if (/\.ppt$/i.test(file.name)) throw new Error('Legacy .ppt is not supported. Please save as .pptx and try again.')

  let result
  if (kind === 'pdf') result = await extractPdf(file, onProgress)
  else if (kind === 'document') result = await extractDocx(file)
  else if (kind === 'presentation') result = await extractPptx(file, onProgress)
  else if (kind === 'text') result = await extractTextLike(file)
  else if (kind === 'image') result = await extractImage(file, onProgress)

  const pages = (result.pages || []).filter((p) => p.text)
  const text = pages.map((p) => p.text).join('\n\n')
  if (!text.trim()) throw new Error('No readable text found in this file.')
  return { kind, pages, text, note: result.note || '', html: result.html || '' }
}

export function buildSourceLabel(page) {
  return page?.label || 'Source'
}
