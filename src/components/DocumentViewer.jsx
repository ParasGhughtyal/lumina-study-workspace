import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, MessageSquareText, Download, Network, Eye, AlignLeft } from 'lucide-react'
import FileIcon from './FileIcon'
import { KIND_META } from '../lib/extraction'
import { sanitizeHtml } from '../lib/sanitize'

export default function DocumentViewer({ file, onBack, onSelectText, onAsk, onGenerateGraph }) {
  const [viewMode, setViewMode] = useState('text')
  const [previewUrl, setPreviewUrl] = useState(null)

  const previewKind = ['pdf', 'image'].includes(file?.kind)
  const hasRichPreview = file?.kind === 'document' && !!file?.html
  const hasSlidePreview = file?.kind === 'presentation' && (file?.pages?.length || 0) > 0
  const hasPreview = previewKind || hasRichPreview || hasSlidePreview
  const cleanHtml = useMemo(() => hasRichPreview ? sanitizeHtml(file.html) : '', [file?.id, hasRichPreview])

  useEffect(() => {
    setViewMode(hasPreview ? 'preview' : 'text')
    if (!previewKind || !file?.blob) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(file.blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.id, hasPreview, previewKind])

  if (!file) return null

  const handleSelection = () => {
    const text = window.getSelection()?.toString().trim()
    if (text && text.length > 2) onSelectText(text, file)
  }

  const download = () => {
    if (!file.blob) return
    const url = URL.createObjectURL(file.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="view">
      <div className="reader">
        <div className="reader-head">
          <button className="icon-btn" onClick={onBack} title="Back to library"><ArrowLeft size={18} /></button>
          <div className="file-ico" style={{ color: KIND_META[file.kind]?.color }}><FileIcon kind={file.kind} size={19} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{file.name}</h2>
            <div className="muted" style={{ fontSize: 12 }}>{KIND_META[file.kind]?.label} · {file.pages?.length || 0} sections · {file.note}</div>
          </div>
          <button className="btn sm" onClick={download} disabled={!file.blob}><Download size={14} /> Download</button>
          <button className="btn sm" onClick={() => onGenerateGraph?.(file)}><Network size={14} /> Graph</button>
          <button className="btn sm primary" onClick={() => onAsk(file)}><MessageSquareText size={14} /> Ask AI</button>
        </div>

        {hasPreview && (
          <div className="view-toggle">
            <button className={`btn sm ${viewMode === 'preview' ? 'primary' : ''}`} onClick={() => setViewMode('preview')}><Eye size={14} /> Preview</button>
            <button className={`btn sm ${viewMode === 'text' ? 'primary' : ''}`} onClick={() => setViewMode('text')}><AlignLeft size={14} /> Extracted text</button>
          </div>
        )}

        {hasPreview && viewMode === 'preview' && (
          <div className="card reader-preview">
            {file.kind === 'pdf' && <iframe src={previewUrl} title={file.name} className="reader-frame" />}
            {file.kind === 'image' && <img src={previewUrl} alt={file.name} className="reader-image" />}
            {hasRichPreview && <div className="doc-html" dangerouslySetInnerHTML={{ __html: cleanHtml }} />}
            {hasSlidePreview && (
              <div className="slide-deck">
                {file.pages.map((p, i) => (
                  <div className="slide-page" key={i}>
                    <span className="slide-num">{p.label}</span>
                    <div className="slide-text">{p.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(viewMode === 'text' || !hasPreview) && (
          <>
            <div className="card" style={{ padding: '16px 20px', marginBottom: 18, fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.7 }}>
              Select any text below to open the <b style={{ color: 'var(--ink)' }}>Learn toolbar</b> — explain, summarize, create flashcards, MCQs, a mind map and more.
            </div>
            <div onMouseUp={handleSelection} onTouchEnd={handleSelection}>
              {(file.pages || []).map((p, i) => (
                <div className="card page-block" key={i}>
                  <span className="pg-label">{p.label}</span>
                  <div>{p.text}</div>
                </div>
              ))}
              {!file.pages?.length && <div className="empty"><p>No extracted text to display.</p></div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
