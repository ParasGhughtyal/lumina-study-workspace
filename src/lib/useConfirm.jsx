import { useCallback, useRef, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'

// Promise-based in-app confirmation:
//
//   const [confirmNode, confirm] = useConfirm()
//   if (await confirm({ title: 'Delete file?', body: '...' })) deleteFile(id)
//   ...
//   return <div>{confirmNode} ...</div>
//
// Returns true on confirm and false on cancel.
export function useConfirm() {
  const [request, setRequest] = useState(null)
  const resolverRef = useRef(null)

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolverRef.current?.(false)
    resolverRef.current = resolve
    setRequest(typeof options === 'string' ? { title: options } : options)
  }), [])

  const settle = useCallback((value) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setRequest(null)
    resolve?.(value)
  }, [])

  const dialog = request ? (
    <ConfirmDialog
      {...request}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null

  return [dialog, confirm]
}
