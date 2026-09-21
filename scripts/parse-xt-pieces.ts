/**
 * Prueba el extractor de piezas `.x_t` contra un archivo real, sin tocar la app.
 *
 *   npm run xt:pieces -- "C:\\ruta\\Ensamblaje.x_t"
 *   npm run xt:pieces -- "C:\\ruta\\Ensamblaje.x_t" --json
 *
 * Usa la misma lógica que el navegador (`src/lib/xtParasolidPieces.ts`).
 */

import { readFile } from 'node:fs/promises'
import { parseXtPieces } from '../src/lib/xtParasolidPieces.ts'

async function main(): Promise<void> {
  const file = process.argv[2]
  const asJson = process.argv.includes('--json')
  if (!file) {
    console.error('Falta la ruta del .x_t')
    process.exit(1)
  }

  const raw = await readFile(file, 'latin1')
  const result = parseXtPieces(raw)

  if (result.format !== 'text') {
    console.error(`Este archivo es FORMAT=${result.format}. Solo se puede leer FORMAT=text.`)
    process.exit(2)
  }

  if (asJson) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  console.log(`Ensamble : ${result.assemblyKey}`)
  console.log(`Exportado: ${result.exportedBy}`)
  console.log(`Piezas encontradas: ${result.pieces.length}`)
  console.log('')
  for (const p of result.pieces) console.log(`  ${String(p.occurrences).padStart(3)} x  ${p.name}`)
  console.log('')
  console.log(`Cadenas descartadas por el filtro: ${result.discarded.length}`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
