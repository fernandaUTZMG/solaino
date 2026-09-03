import { useEffect, useState } from 'react'
import { createSignedUrlForPieceProgrammingFile } from '../../lib/bodegaPieceProgrammingFile'

type Props = {
  storagePath: string
  fileName: string
  className?: string
}

export function BodegaPieceProgrammingFileDownload(props: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void createSignedUrlForPieceProgrammingFile(props.storagePath).then((u) => {
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
    return <span className={props.className ?? 'text-[12px] text-rose-700'}>No se pudo abrir el archivo</span>
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download={props.fileName}
      className={
        props.className ??
        'inline-flex min-h-[40px] items-center rounded-lg border border-programacion-300 bg-programacion-50 px-4 py-2 text-[13px] font-semibold text-programacion-900 hover:bg-programacion-100'
      }
    >
      Descargar — {props.fileName}
    </a>
  )
}
