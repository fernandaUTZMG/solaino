import { attachPieceDesignDrawing } from './bodegaPieceDesignDrawing'
import {
  fetchProjectPieces,
  insertProjectPiece,
  syncProjectPiecesFromDesignPathsDetailed,
  type BodegaProjectPieceRow,
} from './bodegaPiecesRepo'
import { matchPlanoPdfToPieceName, piecePlanoBaseName } from './designPlanoNaming'
import { pieceForZipPath } from './bodegaXtAssemblies'
import { displayLabelFromDesignPath } from './designZipScope'

export type DesignPlanoLinkResult = {
  linked: Array<{ fileName: string; pieceName: string }>
  unmatched: string[]
}

function pieceNameKeys(pieces: BodegaProjectPieceRow[], pieceNames: string[]): string[] {
  const keys = new Set<string>()
  for (const n of pieceNames) {
    if (n.trim()) keys.add(n.trim())
  }
  for (const p of pieces) {
    if (p.source_path?.trim()) keys.add(p.source_path.trim())
    if (p.label?.trim()) keys.add(p.label.trim())
  }
  return [...keys]
}

/**
 * Sincroniza piezas y adjunta cada PDF al mismo nombre de pieza.
 * El destino (torno/perfil) lo elige la diseñadora después.
 */
export async function applyDesignPlanosAutoAssign(args: {
  projectId: string
  projectFolio: string
  pieceNames: string[]
  planos: File[]
  onPhase?: (phase: string) => void
}): Promise<DesignPlanoLinkResult> {
  const pdfs = args.planos.filter((f) => f.name.toLowerCase().endsWith('.pdf'))
  if (pdfs.length === 0) {
    return { linked: [], unmatched: [] }
  }

  args.onPhase?.('Sincronizando piezas del ensamble…')
  if (args.pieceNames.length > 0) {
    await syncProjectPiecesFromDesignPathsDetailed(args.projectId, args.pieceNames, { swPartOnly: true })
  }

  let pieces = await fetchProjectPieces(args.projectId)
  const nameKeys = pieceNameKeys(pieces, args.pieceNames)
  const linked: DesignPlanoLinkResult['linked'] = []
  const unmatched: string[] = []

  for (const file of pdfs) {
    try {
      const pieceName = matchPlanoPdfToPieceName(file.name, nameKeys)
      if (!pieceName) {
        unmatched.push(file.name)
        continue
      }
      args.onPhase?.(`Vinculando plano: ${file.name} → ${piecePlanoBaseName(pieceName)}`)
      let piece =
        pieceForZipPath(pieces, pieceName) ||
        pieces.find((p) => matchPlanoPdfToPieceName(file.name, [p.source_path ?? '', p.label].filter(Boolean)))
      if (!piece) {
        const sourcePath = args.pieceNames.find((n) => matchPlanoPdfToPieceName(file.name, [n])) ?? pieceName
        const id = await insertProjectPiece({
          projectId: args.projectId,
          label: displayLabelFromDesignPath(sourcePath),
          sourcePath,
        })
        pieces = await fetchProjectPieces(args.projectId)
        piece = pieces.find((p) => p.id === id) ?? pieceForZipPath(pieces, sourcePath)
      }
      if (!piece) {
        unmatched.push(file.name)
        continue
      }
      await attachPieceDesignDrawing({
        projectFolio: args.projectFolio,
        pieceId: piece.id,
        file,
      })
      linked.push({ fileName: file.name, pieceName: piece.source_path ?? piece.label })
      pieces = await fetchProjectPieces(args.projectId)
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'error'
      unmatched.push(`${file.name} (${detail})`)
    }
  }

  return { linked, unmatched }
}
