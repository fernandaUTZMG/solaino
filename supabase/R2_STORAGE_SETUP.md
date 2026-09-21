# Cloudflare R2 para archivos de Bodega (SOLAINO)

Los ZIP de diseño, PDFs de OC, fotos y programación se guardan en **Cloudflare R2**.  
Supabase sigue con usuarios, permisos y metadatos (rutas en Postgres).

## 1. Cloudflare

1. Cuenta en [Cloudflare](https://dash.cloudflare.com) → **R2** → Create bucket.  
   Nombre sugerido: `solaino-bodega` (privado).
2. **Manage R2 API Tokens** → Create API token con permiso de lectura/escritura en ese bucket.
3. Anota:
   - Account ID (panel R2, columna derecha)
   - Access Key ID y Secret Access Key
   - Nombre del bucket

### CORS (subidas desde el navegador)

En el bucket → **Settings** → CORS, ejemplo:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5273", "http://127.0.0.1:5273", "https://TU-DOMINIO-PRODUCCION"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Añade el origen de tu app en producción (Vercel, Netlify, IP interna, etc.).

## 2. Supabase Edge Functions — Secrets

Dashboard → **Edge Functions** → Secrets (o CLI `supabase secrets set`):

| Secret | Valor |
|--------|--------|
| `R2_ACCOUNT_ID` | ID de cuenta Cloudflare |
| `R2_BUCKET_NAME` | ej. `solaino-bodega` |
| `R2_ACCESS_KEY_ID` | del token R2 |
| `R2_SECRET_ACCESS_KEY` | del token R2 |
| `R2_STORAGE_ENABLED` | `1` (pon `0` para desactivar R2 en la función) |

Los secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya los usa el proyecto.

## 3. Desplegar la función

```bash
cd inventario-solaino
supabase login
supabase link --project-ref TU_REF
supabase functions deploy bodega-r2-storage
supabase functions deploy parse-design-assembly
```

## 4. Frontend — `.env.local`

```env
VITE_USE_R2_STORAGE=1
```

Sin esta variable (o con `0`), la app sigue usando **solo Supabase Storage** (comportamiento anterior).

Reinicia `npm run dev` tras cambiar `.env.local`.

## 5. Cómo funciona

| Acción | Flujo |
|--------|--------|
| Subir ZIP/PDF/foto | App pide URL firmada PUT → sube directo a R2 |
| Descargar / ver | App pide URL firmada GET → si el archivo está en R2 lo usa; si no, Supabase (archivos viejos) |
| Renombrar en «Nube» | Edge Function copia/borra en R2 |

Rutas en la base de datos **no cambian** (`folio/diseno/v1/...`). En R2 el objeto se guarda como:

`bodega-proyectos/folio/diseno/v1/...`  
`bodega-proyectos/historico/disenadora/...` (módulo Histórico)  
`bodega-proyectos/historico/programacion/...` (módulo Histórico)  
`bodega-ordenes-compra/NUMERO/...`

## 6. Migrar archivos ya en Supabase Storage

Los archivos subidos antes de activar R2 siguen en Supabase; las descargas siguen funcionando (fallback automático).

Para mover todo a R2 puedes usar `rclone` o un script con AWS CLI apuntando al endpoint R2. Contacta al equipo si necesitas un script de migración por lotes.

## 7. Coste orientativo

~100 GB en R2 ≈ unos pocos USD/mes de almacenamiento; sin cargo de egreso habitual en descargas internas.
