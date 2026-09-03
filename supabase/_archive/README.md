# Archivo SQL (no indexado por Cursor)

Estos archivos **no se borran**: quedan por historial y despliegues antiguos.

- **migrations/** — versiones con timestamp (duplican `patch_*.sql` de la raíz).
- **reference/** — bootstrap original (schemas, policies, storage, rpc, seeds).
- **patches-legacy/** — parches sustituidos por otros más nuevos (p. ej. `patch_bodega_complete_maquinado.sql`).

Para cambios nuevos en producción, usa siempre `supabase/patch_*.sql` en la raíz.
