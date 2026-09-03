# Supabase SQL en este proyecto

## Qué usar en el día a día

En **SQL Editor** ejecuta solo los archivos en la **raíz** de `supabase/`:

| Prefijo | Uso |
|---------|-----|
| `patch_*.sql` | Cambios incrementales (columnas, RPC, RLS). Copia el archivo completo y recarga el esquema API. |
| `patch_bodega_piece_maquinado_real_capture.sql` | Tiempo real desde captura en pestaña Maquinado (OCR Overall). |
| `patch_bodega_proyectos_storage_maquinado_paths.sql` | Storage: programadora puede subir en `/maquinado/` y `/programacion/`. |
| `notify_pgrst_reload_schema.sql` | Avisar a PostgREST que recargue columnas. |

La app muestra en errores la ruta del `patch_` correcto (p. ej. `patch_bodega_complete_maquinado.sql`).

## Qué NO indexa Cursor (más rápido)

- `supabase/_archive/` — schemas/policies viejos, seeds, repairs, parches legacy.
- `supabase/migrations/` — copias para historial; **duplican** los `patch_*.sql` (ya aplicadas en producción).

Están en `.cursorignore` para que el agente no lea ~70 archivos SQL repetidos.

## Instalación nueva de base

Si levantas un proyecto Supabase desde cero, los scripts de referencia están en:

`supabase/_archive/reference/` (schema, policies, storage, rpc).

Orden típico: `schema_*.sql` → `policies_*.sql` → `storage_*.sql` → luego todos los `patch_bodega_*.sql` por fecha.

## Edge Functions

`supabase/functions/` — código TypeScript desplegado aparte (no va en SQL Editor).
