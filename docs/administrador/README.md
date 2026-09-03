# Documentación del Administrador — SOLAINO

Manual operativo para el rol **Administrador** del sistema **inventario-solaino** (SOLAINO).

> **Alcance:** esta documentación describe la interfaz y los procesos tal como están implementados hoy. No sustituye políticas internas de la empresa ni configuración de Supabase/Cloudflare.

---

## Índice

| # | Documento | Contenido |
|---|-----------|-----------|
| 1 | **[Manual PDF (HTML)](./MANUAL_ADMINISTRADOR_PDF.html)** | **Manual profesional con capturas — imprimir como PDF** |
| 2 | [Cómo generar el PDF](./INSTRUCCIONES_PDF.md) | Pasos Ctrl+P → Guardar como PDF |
| 3 | [Manual del administrador](./MANUAL_ADMINISTRADOR.md) | Guía completa en Markdown |
| 4 | [Diagramas](./DIAGRAMAS.md) | Casos de uso, flujos, secuencias y arquitectura |
| 5 | [Puesta en marcha](../GO_LIVE.md) | Checklist técnico para TI (SQL, R2, build) |

---

## Audiencia

- Administrador global del sistema (rol `admin`)
- Supervisores que necesitan entender qué puede hacer el administrador frente al encargado de bodega
- Personal de TI o dirección que revisa capacidades antes de contratar servicios (p. ej. almacenamiento R2)

---

## Resumen ejecutivo

El **Administrador** es el único rol con acceso a:

- Panel **Inicio** (dashboard)
- Gestión de **Usuarios** (alta, baja, roles, contraseñas)
- **Historial** global de auditoría (inventario y acciones registradas)
- **Solicitudes** de producto de todos los usuarios
- Catálogos **Empresas** y **Requisitores** (desde el panel Inicio)
- **Inventario** completo (crear, editar, eliminar, ajustes)
- **Bodega** completa (mismas capacidades operativas que el supervisor/encargado, más herramientas globales)

**Capacidades destacadas de Bodega (admin / encargado):**

- **Histórico** — respaldo de carpetas USB (diseño y programación) con árbol de archivos en R2
- **Plan de trabajo bodega** — tablero semanal, sincronización con prioridades, exportación Excel/PDF
- **Nube** — archivos del flujo activo por proyecto
- Cambio de **prioridad** en proyectos (genera notificación al personal operativo)

---

## Versión

| Campo | Valor |
|-------|--------|
| Sistema | SOLAINO / inventario-solaino v1.0.0 |
| Documento | 1.2 |
| Fecha | Mayo 2026 |

**Cambios v1.2:** manual HTML/PDF con 70+ capturas de `IMG-SOLAINO/manual_admin`, diagramas Mermaid, flujos completos de bodega.
