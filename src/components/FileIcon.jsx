import { FileText, Presentation, Image as ImageIcon, FileType2, FileQuestion } from 'lucide-react'

const ICONS = {
  pdf: FileText,
  document: FileText,
  presentation: Presentation,
  text: FileType2,
  image: ImageIcon,
  unknown: FileQuestion,
}

export default function FileIcon({ kind, size = 20 }) {
  const Icon = ICONS[kind] || FileText
  return <Icon size={size} />
}
