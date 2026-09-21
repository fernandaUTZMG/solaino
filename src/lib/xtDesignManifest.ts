import type { ProjectDesignVersionRow } from './designVersionsRepo'
import type { XtParseResult } from './xtParasolidPieces'

export function isXtDesignVersion(v: Pick<ProjectDesignVersionRow, 'zip_filename' | 'manifest'> | null | undefined): boolean {
  if (!v) return false
  if (/\.x_t$/i.test(v.zip_filename) || (/\.xt$/i.test(v.zip_filename) && !/\.x_b$/i.test(v.zip_filename))) {
    return true
  }
  const kind = v.manifest && typeof v.manifest === 'object' ? (v.manifest as { kind?: unknown }).kind : null
  return kind === 'xt'
}

export function xtParseResultFromManifest(manifest: Record<string, unknown> | null): XtParseResult | null {
  if (!manifest) return null
  const namesRaw = manifest.pieceNames ?? manifest.entryPaths
  const names = Array.isArray(namesRaw)
    ? namesRaw.filter((n): n is string => typeof n === 'string' && n.trim().length > 0).map((n) => n.trim())
    : []
  if (names.length === 0) return null
  return {
    assemblyKey: typeof manifest.assemblyKey === 'string' ? manifest.assemblyKey : '',
    exportedBy: typeof manifest.exportedBy === 'string' ? manifest.exportedBy : '',
    format: 'text',
    pieces: names.map((name) => ({ name, occurrences: 1 })),
    discarded: [],
  }
}
