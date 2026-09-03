# Puesta en marcha — SOLAINO (Bodega + Inventario)

Checklist para dejar el sistema **listo en planta**. Marca cada ítem al completarlo.

> **Guía detallada:** [SUPABASE_PASO_A_PASO.md](./SUPABASE_PASO_A_PASO.md) (copiar/pegar SQL, verificar qué falta, despliegue).  
> **Verificación rápida en Supabase:** ejecuta `supabase/verify_go_live_schema.sql` en SQL Editor.

## 1. Supabase — SQL (obligatorio)

En **SQL Editor**, ejecuta **cada archivo completo** de `supabase/patch_*.sql` (en orden aproximado de fecha/nombre lógico).  
Al terminar **todos**, ejecuta `supabase/notify_pgrst_reload_schema.sql`.

| Orden | Archivo | Para qué |
|------|---------|----------|
| 1 | `patch_bodega_confirm_programming_routes.sql` | Confirmar rutas CNC |
| 2 | `patch_bodega_activity_actor_labels.sql` | Historial con nombres |
| 3 | `patch_bodega_avance_manual_rpc.sql` | Avance manual |
| 4 | `patch_bodega_complete_maquinado.sql` | Cerrar maquinado |
| 5 | `patch_bodega_folio_partida_I.sql` | Folio partida -I |
| 6 | `patch_bodega_proyectos_storage_maquinado_paths.sql` | Storage maquinado/programación |
| 7 | `patch_bodega_piece_assembly_xt.sql` | Ensamble XT |
| 8 | `patch_bodega_piece_design_drawing.sql` | Planos PDF por pieza |
| 9 | `patch_bodega_piece_maquinado_real_capture.sql` | Tiempo real maquinado |
| 10 | `patch_design_version_package_category.sql` | Info cliente vs entrega |
| 11 | `patch_bodega_piece_maquinado_estimate.sql` | Estimado maquinado |
| 12 | `patch_bodega_piece_programming_file.sql` | Archivo prog. por pieza |
| 13 | `patch_bodega_programadora_taller_access.sql` | Programadora en taller |
| 14 | `patch_bodega_project_closure_all_pieces.sql` | Cierre todas las piezas |
| 15 | `patch_bodega_project_prioridad_nivel.sql` | Prioridad 0–4 |
| 16 | `patch_design_version_assembly_parse.sql` | Parse ensamble ZIP |
| 17 | `patch_bodega_post_perfilado_programming.sql` | 2ª sesión prog. |
| 18 | `patch_bodega_design_notes_and_version_queue.sql` | Notas diseño |
| 19 | `patch_bodega_piece_photos_piece_id.sql` | Fotos por pieza |
| 20 | `patch_bodega_finish_spec_sin_tratamiento.sql` | Sin tratamiento |
| 21 | `patch_bodega_weekly_plan.sql` | Plan semanal |
| 22 | `patch_bodega_weekly_plan_prioridad.sql` | Prioridad en plan (si la tabla ya existía) |
| 23 | `patch_bodega_cloud_rename_rls_storage.sql` | Renombrar en Nube |
| 24 | `patch_audit_log_clear_admin.sql` | Borrar historial (solo admin) |
| 25 | `patch_bodega_historico.sql` | Módulo Histórico (archivo diseño / programación) |
| — | `patch_app_notifications.sql` | Campana prioridad (si aún no) |
| — | `notify_pgrst_reload_schema.sql` | Recargar API |

Si ya ejecutaste parches antes, **no hace falta repetirlos**; los nuevos (p. ej. plan semanal o nube) sí deben aplicarse una vez.

Si la base es **nueva**, primero los schemas en `supabase/_archive/reference/` (ver `supabase/README.md`).

## 2. Variables de entorno (producción)

Copia `.env.example` → `.env.local` o variables del hosting:

| Variable | Obligatorio |
|----------|-------------|
| `VITE_SUPABASE_URL` | Sí |
| `VITE_SUPABASE_ANON_KEY` | Sí |
| `VITE_USE_R2_STORAGE=1` | Recomendado (ZIP grandes) |

Ver `supabase/R2_STORAGE_SETUP.md` para secrets y despliegue de Edge Functions.

## 3. Edge Functions (recomendado)

```bash
supabase functions deploy bodega-r2-storage
supabase functions deploy parse-design-assembly
supabase functions deploy parse-orden-compra-pdf
```

## 4. Usuarios y roles

En la app (**Usuarios**): crear cuentas con rol correcto:

| Rol | Uso |
|-----|-----|
| `encargado` | Supervisor bodega |
| `disenadora` | Diseño |
| `programadora_maquinaria` | Programación / maquinado |
| `operador_bodega` | Taller |
| `admin` | Todo + inventario |

Manual: `docs/administrador/MANUAL_ADMINISTRADOR.md`

## 5. Prueba de humo (1 proyecto real)

- [ ] Crear o abrir proyecto con OC
- [ ] Diseñadora: subir ZIP en **Proyectos → Diseño**
- [ ] Encargado: aprobar diseño / tratamientos
- [ ] Programadora: asignar rutas + archivos por pieza
- [ ] Maquinado / taller / fotos en flujo
- [ ] **Prioridades** + **Plan de trabajo bodega** (sincronizar)
- [ ] **Nube**: ver archivos
- [ ] **Reportes**: tiempos
- [ ] Cierre y marcar terminado

## 6. Archivos históricos (opcional)

Si ya ejecutaste `patch_bodega_historico.sql`, corre también **`patch_bodega_historico_roles.sql`** (permisos programadora → carpeta `historico/disenadora/`) y vuelve a desplegar la función **`bodega-r2-storage`**.

Script CLI (service role):

```bash
node scripts/migrate-bodega-archivos.mjs --manifest migracion.csv --dry-run
node scripts/migrate-bodega-archivos.mjs --manifest migracion.csv
```

Ver comentarios al inicio del script para formato del CSV.

## 7. Build y despliegue web

```bash
npm install
npm run build
```

Sirve la carpeta `dist/` en tu hosting (Vercel, IIS, nginx).  
En CORS de R2 añade la URL de producción.

## 8. Capacitación mínima (1 h)

- Diseñadora: Proyectos → Diseño (no solo carpetas PC)
- Programadora: Proyectos → Programación
- Encargado: Prioridades, Plan semanal, Nube, cierre

---

**Listo para operar** cuando los ítems 1–5 estén marcados y al menos una prueba de humo pasó sin errores en pantalla.
