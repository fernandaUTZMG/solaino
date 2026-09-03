/**
 * Genera build/app-icon.png (512×512) para Windows / Electron.
 * Usa el logo horizontal completo (icon-source-full.png) centrado sobre fondo blanco,
 * ocupando ~96,5% del cuadrado para que se distinga mejor.
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const SRC_FULL = path.join(__dirname, '..', 'public', 'img', 'icon-source-full.png')
const SRC_FALLBACK = path.join(__dirname, '..', 'public', 'img', 'logo2.png')
const OUT = path.join(__dirname, '..', 'build', 'app-icon.png')
const SIZE = 512
/** Máximo lado del logo dentro del cuadrado (resto = margen blanco). Más alto = logo más grande. */
const INNER = Math.round(SIZE * 0.965)

async function main() {
  const src = fs.existsSync(SRC_FULL) ? SRC_FULL : SRC_FALLBACK
  if (!fs.existsSync(src)) {
    console.error('No existe fuente de icono:', src)
    process.exit(1)
  }
  await fs.promises.mkdir(path.dirname(OUT), { recursive: true })

  const resized = await sharp(src)
    .resize(INNER, INNER, { fit: 'inside' })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = resized.info
  const padT = Math.floor((SIZE - height) / 2)
  const padB = SIZE - height - padT
  const padL = Math.floor((SIZE - width) / 2)
  const padR = SIZE - width - padL

  await sharp(resized.data)
    .extend({
      top: padT,
      bottom: padB,
      left: padL,
      right: padR,
      background: '#ffffff',
    })
    .png()
    .toFile(OUT)

  console.log('Icono escritorio:', OUT, `${SIZE}×${SIZE} (logo ${width}×${height} dentro de ${INNER} máx.)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
