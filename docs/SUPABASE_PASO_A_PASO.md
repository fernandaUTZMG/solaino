# Supabase — paso a paso (SOLAINO)

Guía para aplicar los parches y dejar la app lista. Tiempo estimado: **45–90 min** la primera vez.

---

## Antes de empezar

1. Entra a [supabase.com](https://supabase.com) → tu proyecto SOLAINO.
2. En el PC, abre la carpeta del repo:
   `INVENTARIOS_OMAR\inventario-solaino\supabase\`
3. Ten a mano el archivo `.env.local` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (los usarás al desplegar).

---

## Paso 0 — ¿Qué falta en mi base?

1. Supabase → **SQL Editor** → **New query**.
2. Abre el archivo `supabase/verify_go_live_schema.sql`, copia **todo** y pégalo en el editor.
3. Pulsa **Run**.
4. En el resultado, filas con `ok = false` → ejecuta el parche de la columna `parche_si_falta`.

Si **ya usabas bodega hace semanas**, es normal que casi todo salga `true` y solo falten plan semanal o renombrar en Nube.

---

## Paso 1 — Ejecutar parches SQL

### Cómo ejecutar cada parche

1. SQL Editor → **New query** (una pestaña por parche, o reutiliza y borra).
2. En VS Code/Cursor, abre el `.sql` del parche (ej. `patch_bodega_proyectos_storage_maquinado_paths.sql`).
3. **Ctrl+A** → copiar → pegar en Supabase → **Run**.
4. Abajo debe decir **Success** (verde).

### Si sale error

| Mensaje típico | Qué hacer |
|----------------|-----------|
| `already exists` / `duplicate` | **OK** — ese parche ya estaba; sigue al siguiente. |
| `relation "bodega_projects" does not exist` | La base es nueva: primero schemas en `supabase/_archive/reference/` (ver `supabase/README.md`). |
| `function … does not exist` | Ejecutaste parches fuera de orden; ejecuta el parche anterior de la lista en `GO_LIVE.md`. |
| `permission denied` | Debes estar como dueño del proyecto; no uses rol de solo lectura. |

### Orden recomendado (lista completa)

Sigue la tabla de `docs/GO_LIVE.md` del **1 al 24**, luego:

```sql
notify pgrst, 'reload schema';
```

(o Dashboard → **Project Settings** → **API** → **Reload schema**).

### Parches críticos si solo quieres lo nuevo (plan + nube)

Si el resto de bodega ya funcionaba, como mínimo ejecuta:

| # | Archivo |
|---|---------|
| 1 | `patch_bodega_project_prioridad_nivel.sql` |
| 2 | `patch_bodega_weekly_plan.sql` |
| 3 | `patch_bodega_weekly_plan_prioridad.sql` |
| 4 | `patch_bodega_cloud_rename_rls_storage.sql` |
| 5 | `notify_pgrst_reload_schema.sql` |

Vuelve a correr `verify_go_live_schema.sql` hasta que todo sea `ok = true`.

---

## Paso 2 — Storage (bucket)

1. Supabase → **Storage**.
2. Debe existir el bucket **`bodega-proyectos`** (público o privado según tu configuración inicial).
3. Si subes OC/PDF en otro bucket, revisa que coincida con lo que usa la app (`bodega-ordenes-compra` si aplica).

Sin este bucket, los ZIP de diseño fallan al subir.

---

## Paso 3 — Variables en la app

En la máquina de desarrollo o en el hosting:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   # o sb_publishable_...
```

Opcional (ZIP grandes):

```env
VITE_USE_R2_STORAGE=1
```

Configuración R2: `supabase/R2_STORAGE_SETUP.md` (puede hacerse **después** del primer día en planta).

---

## Paso 4 — Edge Functions (opcional el día 1)

Solo si usas R2 o parseo de ZIP/OC en la nube:

```powershell
cd inventario-solaino
npx supabase login
npx supabase link --project-ref TU_REF
npx supabase functions deploy bodega-r2-storage
npx supabase functions deploy parse-design-assembly
npx supabase functions deploy parse-orden-compra-pdf
```

Sin R2, la app usa **Supabase Storage** (límite ~50 MB por archivo en plan free).

---

## Paso 5 — Usuarios

1. Abre la app en local: `npm run dev` → entra como **admin**.
2. Menú **Usuarios** → crea cuentas:

| Rol en app | Quién |
|------------|--------|
| Encargado | Supervisor bodega |
| Diseñadora | Diseño |
| Programadora maquinaria | CNC / programación |
| Operador bodega | Taller |
| Admin | Omar / TI |

Cada persona debe **cerrar sesión y volver a entrar** después de cambiar rol.

---

## Paso 6 — Prueba de humo (15 min)

Con un proyecto real o de prueba:

1. **Bodega → Proyectos** → abrir proyecto → pestaña **Diseño** → subir ZIP.
2. Encargado: revisar / aprobar diseño.
3. **Programación** → rutas y archivos por pieza.
4. **Prioridades** → asignar nivel 1–4.
5. **Plan de trabajo bodega** → **Sincronizar con prioridades** → debe aparecer la fila.
6. **Nube** → deben verse archivos del folio.
7. **Reportes** → exportar PDF de tiempos (si hay datos).
8. Marcar proyecto **terminado** → en el plan debe verse en verde al 100 %.

Si algo falla, anota el mensaje exacto de la pantalla (o F12 → Consola).

---

## Paso 7 — Publicar la web

### Opción A — Misma PC (prueba en red local)

```powershell
cd inventario-solaino
npm install
npm run build
npm run preview
```

Abre la URL que muestra (ej. `http://localhost:4173`). En Supabase → **Authentication** → URL settings, añade esa URL si usas magic link.

### Opción B — Carpeta `dist` en IIS / nginx

1. `npm run build` → se genera `dist/`.
2. Copia **todo** `dist/` al servidor web.
3. Configura **SPA fallback**: cualquier ruta devuelve `index.html` (en IIS: URL Rewrite).

### Opción C — Vercel / Netlify

1. Conecta el repo o sube `dist`.
2. Build command: `npm run build`
3. Output directory: `dist`
4. Variables de entorno: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

---

## Checklist final

- [ ] `verify_go_live_schema.sql` → todo `ok = true`
- [ ] `notify pgrst, 'reload schema'` ejecutado
- [ ] Bucket `bodega-proyectos` existe
- [ ] Usuarios con rol correcto
- [ ] Prueba de humo sin errores rojos
- [ ] `npm run build` y app accesible en URL de planta

Cuando los seis estén marcados, **puedes operar en producción**.

---

## Ayuda rápida por síntoma

| Síntoma en app | Solución |
|----------------|----------|
| Plan de trabajo 400 al guardar | `patch_bodega_weekly_plan_prioridad.sql` + reload schema |
| No renombra en Nube | `patch_bodega_cloud_rename_rls_storage.sql` |
| «Falta package_category» | `patch_design_version_package_category.sql` |
| Fotos no por pieza | `patch_bodega_piece_photos_piece_id.sql` |
| Sin campana de prioridad | `patch_app_notifications.sql` + reload schema |
| Módulo Histórico vacío / error al subir | `patch_bodega_historico.sql` + reload schema |
| Subida ZIP > 50 MB falla | Activar R2 (`R2_STORAGE_SETUP.md`) |
