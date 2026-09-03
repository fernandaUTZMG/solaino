# Cómo descargar el Manual de Usuario en PDF

## Archivo principal

Abra en su navegador (Chrome o Edge recomendado):

**`MANUAL_USUARIO_PDF.html`**

Ruta completa en este proyecto:

`docs/usuario/MANUAL_USUARIO_PDF.html`

## Pasos para generar el PDF

1. Abra el archivo `.html` con **doble clic** o arrástrelo al navegador.
2. Espere **10–20 segundos** para que los diagramas Mermaid terminen de dibujarse.
3. Pulse **Ctrl + P** (Imprimir).
4. Destino: **Guardar como PDF** / **Microsoft Print to PDF**.
5. Opciones recomendadas:
   - **Márgenes:** Predeterminado o Estrecho
   - **Escala:** 100 %
   - **Gráficos de fondo:** Activado (portada y banners por rol)
6. Guarde como: `Manual_Usuario_SOLAINO_Bodega.pdf`

## Contenido por rol

| Capítulo | Rol |
|----------|-----|
| 3 | Diseñadora |
| 4 | Programadora maquinaria |
| 5 | Operador taller (capturas de Taller = carpeta programadora) |
| 6 | Supervisor (encargado) |

Puede imprimir solo las páginas de su rol desde el diálogo de impresión (rango de páginas).

## Imágenes incluidas

Las capturas están en **`imagenes/`**:

- `imagenes/disenadora/` — rol diseñadora
- `imagenes/programadora/` — rol programadora (y taller para operador)
- `imagenes/encargado/` — supervisor
- `imagenes/bodega/` — diagramas de flujo del proceso
- `imagenes/logo_solaino.png` — logo en portada

Origen: `IMG-SOLAINO/manual_admin/manual de usuario`

## Actualizar capturas

Reemplace los PNG en la subcarpeta correspondiente manteniendo el nombre de archivo, o edite las rutas en el HTML.
