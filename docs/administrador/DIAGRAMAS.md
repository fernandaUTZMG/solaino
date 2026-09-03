# Diagramas — Administrador SOLAINO

Referencia visual del manual del administrador. Los diagramas usan [Mermaid](https://mermaid.js.org/); se renderizan en GitHub, GitLab, VS Code y muchas herramientas de documentación.

---

## 1. Contexto del sistema

```mermaid
C4Context
  title SOLAINO — Vista de contexto (Administrador)

  Person(admin, "Administrador", "Gestiona usuarios, inventario, bodega y auditoría")
  Person(user, "Usuario inventario", "Consulta stock y solicita productos")
  Person(bodega, "Personal bodega", "Diseño, programación, taller")

  System(solaino, "SOLAINO", "App web / escritorio React + Vite")
  System_Ext(supabase, "Supabase", "Auth, PostgreSQL, Storage, Edge Functions")
  System_Ext(r2, "Cloudflare R2", "Archivos grandes de Bodega e Histórico")

  Rel(admin, solaino, "Opera todos los módulos")
  Rel(user, solaino, "Inventario + solicitudes propias")
  Rel(bodega, solaino, "Módulo Bodega según rol")
  Rel(solaino, supabase, "API / datos")
  Rel(solaino, r2, "Subida/descarga vía URLs firmadas", "Producción")
```

---

## 2. Casos de uso — Administrador

Actores principales y casos de uso **exclusivos o ampliados** para el administrador.

```mermaid
flowchart TB
  subgraph Actores
    ADM((Administrador))
    USR((Usuario inventario))
    ENC((Encargado bodega))
  end

  subgraph CU_Admin["Casos de uso — Administrador"]
    UC1[Gestionar usuarios]
    UC2[Asignar roles y contraseñas]
    UC3[Atender recuperación de contraseña]
    UC4[Consultar historial de auditoría]
    UC5[Limpiar historial por usuario]
    UC6[Administrar inventario completo]
    UC7[Gestionar solicitudes de producto]
    UC8[Operar módulo Bodega]
    UC9[Administrar catálogos Empresa / Requisitor]
    UC10[Revisar entregas de diseño]
    UC11[Exportar inventario CSV]
    UC12[Ver panel Inicio y contadores]
    UC13[Respaldo USB — Histórico]
    UC14[Gestionar plan de trabajo semanal]
  end

  subgraph CU_Otros["Compartidos con otros roles"]
    UC_E1[Registrar entradas/salidas]
    UC_E2[Gestionar proyectos y OC]
  end

  ADM --> UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UC7 & UC8 & UC9 & UC10 & UC11 & UC12 & UC13 & UC14
  ADM --> UC_E1 & UC_E2
  USR --> UC_E1
  ENC --> UC_E2 & UC10

  style CU_Admin fill:#eff6ff,stroke:#1d4ed8
  style CU_Otros fill:#f8fafc,stroke:#64748b
```

---

## 3. Mapa de navegación (Administrador)

```mermaid
flowchart LR
  subgraph Barra["Barra principal"]
    INICIO[Inicio]
    HIST[Historial]
    USR[Usuarios]
  end

  subgraph Inv["Grupo Inventario"]
    INV[Inventario]
    SOL[Solicitudes]
  end

  subgraph Bod["Grupo Bodega"]
    PROY[Proyectos]
    ARC[Archivos]
    REP[Reportes]
    NUB[Nube]
    HISTUSB[Histórico]
    PLAN[Plan de trabajo]
    MAQ[Maquinado]
    TAL[Taller]
  end

  INICIO --> INV
  INICIO --> PROY
  INICIO --> USR
  INICIO --> EMP[Empresas]
  INICIO --> REQ[Requisitores]

  style INICIO fill:#1e3a5f,color:#fff
  style HIST fill:#1e3a5f,color:#fff
  style USR fill:#1e3a5f,color:#fff
```

> **Nota:** El administrador **no** ve la vista «Prioridades» en el menú (reservada a diseñadora, programadora y operador). Sí tiene **Histórico**, **Plan de trabajo bodega**, Maquinado y Taller. La **campana de notificaciones** aparece junto al grupo Bodega.

---

## 4. Jerarquía de roles

```mermaid
flowchart TB
  ADMIN["admin — Administrador global"]
  ENC["encargado — Supervisor bodega"]
  DIS["disenadora"]
  PROG["programadora_maquinaria"]
  OPE["operador_bodega"]
  USER["user — Usuario inventario"]

  ADMIN -->|"Incluye todo lo de encargado +"| ENC
  ADMIN -->|"Acceso inventario + admin tools"| USER
  ENC --> DIS & PROG & OPE
  DIS & PROG & OPE -->|"Sin inventario"| X1[ ]
  USER -->|"Sin bodega"| X2[ ]

  style ADMIN fill:#fecaca,stroke:#b91c1c
  style ENC fill:#fde68a,stroke:#b45309
  style USER fill:#bfdbfe,stroke:#1d4ed8
```

---

## 5. Flujo — Creación de usuario

```mermaid
flowchart TD
  A[Usuarios → Nuevo usuario] --> B{Usuario ≥ 3 caracteres?}
  B -->|No| E1[Mostrar error]
  B -->|Sí| C{Contraseña ≥ 6 y coincide?}
  C -->|No| E1
  C -->|Sí| D[Seleccionar rol]
  D --> F[Crear en Supabase Auth + perfil]
  F --> G{Éxito?}
  G -->|Sí| H[Usuario aparece en listado]
  G -->|No| E2[Error: usuario duplicado u otro]
  H --> I[Comunicar credenciales al usuario por canal seguro]

  style A fill:#dbeafe
  style H fill:#d1fae5
  style E1 fill:#fee2e2
  style E2 fill:#fee2e2
```

---

## 6. Flujo — Solicitud de producto (Administrador)

```mermaid
stateDiagram-v2
  [*] --> Pendiente: Usuario crea solicitud
  Pendiente --> Aprobada: Admin — Aprobar
  Pendiente --> Rechazada: Admin — Rechazar
  Aprobada --> CompraHecha: Admin — Compra hecha
  CompraHecha --> Entregada: Admin — Entregar
  Aprobada --> Entregada: Admin — Entregar directo
  Pendiente --> [*]: Admin — Eliminar del panel
  Rechazada --> [*]: Admin — Eliminar del panel
  Entregada --> [*]: Admin — Eliminar del panel

  note right of Pendiente
    Badge en menú Solicitudes
    muestra pendientes
  end note
```

---

## 7. Flujo — Recuperación de contraseña

```mermaid
sequenceDiagram
  actor U as Usuario
  participant App as SOLAINO
  participant DB as Supabase
  actor A as Administrador

  U->>App: Solicita recuperación (login)
  App->>DB: Registra solicitud pendiente
  A->>App: Usuarios — ve badge de recuperaciones
  A->>App: Editar usuario → nueva contraseña
  A->>U: Comunica clave en persona / canal seguro
  A->>App: Marcar solicitud como atendida
  U->>App: Inicia sesión con nueva clave
```

---

## 8. Flujo — Historial de auditoría

```mermaid
flowchart TD
  A[Historial] --> B[Lista de usuarios del sistema]
  B --> C[Seleccionar usuario]
  C --> D[Ver acciones: crear / modificar / eliminar]
  D --> E{Filtrar por tipo o buscar}
  E --> D
  D --> F{¿Limpiar historial?}
  F -->|Solo admin| G[Confirmar eliminación permanente]
  G --> H[RPC clear_audit_log]
  F -->|Cancelar| D

  style G fill:#fef3c7,stroke:#d97706
```

Acciones registradas incluyen, entre otras: producto creado/actualizado/eliminado, exportación CSV, solicitud creada/actualizada.

---

## 9. Ciclo de vida — Proyecto de Bodega (vista administrador)

El administrador puede intervenir en **todas** las etapas con permisos de supervisor.

```mermaid
flowchart LR
  OC[Registrar OC + PDF] --> PROY[Crear / abrir proyecto]
  PROY --> DIS[Diseño — ZIP / piezas]
  DIS --> REV{Revisión supervisor}
  REV -->|Aprobar| PROG[Programación CNC]
  REV -->|Cambios| DIS
  PROG --> MAQ[Maquinado]
  MAQ --> TAL[Taller — perfilado / detallado / armado]
  TAL --> FOT[Fotos piezas]
  FOT --> FIN[Finalizar proyecto]

  style REV fill:#fef9c3
  style FIN fill:#bbf7d0
```

**Capacidades admin en este flujo:**

- Registrar órdenes de compra y PDF
- Creación masiva de proyectos desde partidas del PDF
- Asignar prioridad al proyecto
- Revisar y aprobar entregas de diseño (badge «!» en menú Bodega)
- Finalizar proyecto formalmente
- Consultar reportes de tiempos y contratiempos
- Explorar archivos en «Nube»
- Respaldo masivo USB en «Histórico» (diseño y programación)
- Sincronizar y exportar «Plan de trabajo bodega»

---

## 11. Flujo — Respaldo USB (Histórico)

```mermaid
flowchart TD
  A[Bodega → Histórico] --> B{¿Diseño o Programadora?}
  B -->|Diseño| C[Área SolidWorks / planos]
  B -->|Programadora| D[Área PROGRAMAS / DXF / NC]
  C --> E[Elegir carpeta raíz USB]
  D --> E
  E --> F[Subida archivo por archivo a R2]
  F --> G[Registro en bodega_historic_files]
  G --> H{¿Sesión OK?}
  H -->|Sí| I[Árbol visible + descarga]
  H -->|No| J[Reiniciar sesión y re-subir misma carpeta]
  J --> E

  style A fill:#ede9fe
  style I fill:#d1fae5
  style J fill:#fef3c7
```

> Re-subir la **misma carpeta** no duplica: la ruta relativa es única por archivo.

---

## 12. Matriz de permisos (resumen)

```mermaid
flowchart TB
  subgraph Leyenda
    L1[✓ = Acceso completo]
    L2[◐ = Parcial / operativo]
    L3[✗ = Sin acceso]
  end
```

| Función | Admin | Encargado | Usuario | Diseñadora | Programadora | Operador |
|---------|:-----:|:---------:|:-------:|:----------:|:------------:|:--------:|
| Panel Inicio | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Usuarios | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Historial global | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Inventario (CRUD) | ✓ | ✗ | ◐ | ✗ | ✗ | ✗ |
| Solicitudes (todas) | ✓ | ✗ | ◐ propias | ✗ | ✗ | ✗ |
| Bodega proyectos | ✓ | ✓ | ✗ | ◐ | ◐ | ◐ |
| Archivos diseño ref. | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Reportes bodega | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ |
| Nube (flujo activo) | ✓ | ✓ | ✗ | ◐ | ◐ | ◐ |
| Histórico (respaldo USB) | ✓ | ✓ | ✗ | ◐ | ◐ | ✗ |
| Plan de trabajo — editar/export | ✓ | ✓ | ✗ | ◐ ver | ◐ ver | ◐ ver |
| Prioridades (cola personal) | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Empresas / Requisitores | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |

---

## 13. Arquitectura de datos (Administrador)

```mermaid
flowchart TB
  subgraph Frontend["SOLAINO (React)"]
    UI[Interfaz administrador]
  end

  subgraph Supabase
    AUTH[Authentication]
    PROF[profiles — roles]
    PROD[productos / movimientos]
    SOL[solicitudes]
    AUD[audit_log]
    BOD[proyectos / piezas / tiempos]
    HIST[bodega_historic_files]
    NOTIF[app_notifications]
    STG[Storage buckets]
    EF[Edge Functions]
  end

  subgraph Storage["Almacenamiento archivos"]
    R2[(Cloudflare R2)]
    STG
  end

  UI --> AUTH
  UI --> PROF & PROD & SOL & AUD & BOD & HIST & NOTIF
  UI --> STG
  UI --> EF
  EF --> R2
  EF --> STG

  style UI fill:#1e3a5f,color:#fff
  style R2 fill:#f97316,color:#fff
```

---

## 14. Flujo — Exportación CSV (Inventario)

```mermaid
flowchart TD
  A[Inventario] --> B[Marcar filas en tabla o usar menú CSV]
  B --> C{Selección}
  C -->|Página actual| D1[Filas visibles]
  C -->|Todo filtrado| D2[Resultado de búsqueda]
  C -->|Manual| D3[Checkbox por producto]
  D1 & D2 & D3 --> E[Descargar CSV seleccionado]
  E --> F[Registro en audit_log: export_excel]

  style E fill:#d1fae5
```

---

*Fin de diagramas — ver [MANUAL_ADMINISTRADOR.md](./MANUAL_ADMINISTRADOR.md) para procedimientos paso a paso.*
