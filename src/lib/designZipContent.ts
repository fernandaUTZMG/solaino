import JSZip from 'jszip'

/** Lee entradas de texto del ZIP (HTML, TXT, etc.). */
export async function readZipEntryTexts(
  zipBlob: Blob,
  entryPaths: string[],
  nameFilter: (path: string) => boolean,
): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(zipBlob)
  const out = new Map<string, string>()
  for (const path of entryPaths) {
    if (!nameFilter(path)) continue
    const entry = zip.file(path.replaceAll('\\', '/'))
    if (!entry || entry.dir) continue
    try {
      const text = await entry.async('string')
      if (text.trim()) out.set(path.replaceAll('\\', '/'), text)
    } catch {
      /* binario */
    }
  }
  return out
}

export async function readZipEntryBytes(zipBlob: Blob, entryPath: string): Promise<Uint8Array | null> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(zipBlob)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/central directory|zip file/i.test(msg)) {
      throw new Error('El archivo de diseño no es un ZIP (p. ej. un ensamble .x_t).')
    }
    throw e
  }
  const norm = entryPath.replaceAll('\\', '/')
  const entry = zip.file(norm)
  if (!entry || entry.dir) return null
  return entry.async('uint8array')
}
