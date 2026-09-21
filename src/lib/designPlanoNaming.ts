import { zipPathStem } from './designZipPiecePairs'
import { displayLabelFromDesignPath } from './designZipScope'
import { labelFromZipPath } from './zipDesignPackage'

export function compactPlanoStem(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_\-().]+/g, '')
    .trim()
}

/** Nombre de pieza sin extensión, para armar el PDF. */
export function piecePlanoBaseName(pathOrLabel: string): string {
  const fromPath = labelFromZipPath(pathOrLabel).replace(/\.(x_t|xt|prt|sldprt|slcprt|pdf)$/i, '').trim()
  if (fromPath) return fromPath
  return displayLabelFromDesignPath(pathOrLabel).replace(/\.(x_t|xt|prt|sldprt|slcprt|pdf)$/i, '').trim()
}

/** Mismo nombre que la pieza: Nombre.pdf */
export function expectedPlanoFileName(pathOrLabel: string): string {
  return `${piecePlanoBaseName(pathOrLabel)}.pdf`
}

function stemCandidates(raw: string): string[] {
  const stem = zipPathStem(raw) || piecePlanoBaseName(raw)
  const out = new Set<string>()
  const compact = compactPlanoStem(stem)
  if (compact) out.add(compact)
  // Quita sufijos tipo "copia", "(1)", "-plano"
  const stripped = compactPlanoStem(
    stem
      .replace(/\s*\(\d+\)\s*$/i, '')
      .replace(/[\s_\-]*(copia|copy|plano|pdf)\s*$/i, ''),
  )
  if (stripped) out.add(stripped)
  return [...out]
}

export function pdfMatchesPiecePlano(piecePathOrLabel: string, pdfName: string): boolean {
  const parts = stemCandidates(piecePathOrLabel)
  const pdfs = stemCandidates(pdfName)
  return parts.some((p) => pdfs.includes(p))
}

/** Empareja un PDF con una pieza del ensamble por el mismo nombre. */
export function matchPlanoPdfToPieceName(pdfFileName: string, pieceNames: string[]): string | null {
  const pdfs = stemCandidates(pdfFileName)
  if (pdfs.length === 0) return null
  for (const name of pieceNames) {
    const parts = stemCandidates(name)
    if (parts.some((p) => pdfs.includes(p))) return name
  }
  return null
}

export function fileRenamedToExpectedPlano(file: File, pathOrLabel: string): File {
  const expected = expectedPlanoFileName(pathOrLabel)
  if (file.name.replace(/\s+/g, '').toLowerCase() === expected.replace(/\s+/g, '').toLowerCase()) return file
  return new File([file], expected, { type: file.type || 'application/pdf' })
}
