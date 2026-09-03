import { useEffect, useState } from 'react'
import { createSignedUrlForPieceDesignDrawing } from '../../lib/bodegaPieceDesignDrawing'

type Props = {
  storagePath: string
  fileName: string
  className?: string
}

export function BodegaPieceDesignDrawingDownload(props: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void createSignedUrlForPieceDesignDrawing(props.storagePath).then((u) => {
      if (!cancelled) {
        setUrl(u)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [props.storagePath])

  if (loading) {
    return <span className={props.className ?? 'text-[12px] text-slate-500'}>Preparando enlace…</span>
  }
  if (!url) {
    return <span className={props.className ?? 'text-[12px] text-rose-700'}>No se pudo abrir el plano</span>
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={
        props.className ??
        'inline-flex min-h-[36px] items-center rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-[12px] font-semibold text-sky-950 hover:bg-sky-100'
      }
    >
      Ver plano — {props.fileName}
    </a>
  )
}
