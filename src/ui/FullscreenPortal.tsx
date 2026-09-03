import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Monta hijos en `document.body` para cubrir toda la ventana (fuera de `main` / nav). */
export function FullscreenPortal(props: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(props.children, document.body)
}
