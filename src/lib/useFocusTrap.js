import { useEffect } from 'react'

const SELECTOR = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Keeps Tab focus inside a modal and focuses its first control on open.
export function useFocusTrap(ref, active = true) {
  useEffect(() => {
    if (!active || !ref?.current) return
    const node = ref.current
    const items = () => [...node.querySelectorAll(SELECTOR)].filter((el) => el.offsetParent !== null)
    // Focus synchronously: rAF can be throttled in background tabs and never fires
    // in some headless environments.
    const first = items()[0]
    if (first) first.focus({ preventScroll: true })
    const onKey = (e) => {
      if (e.key !== 'Tab') return
      const list = items()
      if (!list.length) return
      const head = list[0], tail = list[list.length - 1]
      if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus() }
      else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus() }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [ref, active])
}
