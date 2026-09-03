# Worker de ensamblajes .x_T

Servicio Python que **lee el ZIP de diseño** y devuelve las piezas por ensamblaje (para paso 3 y 4 de bodega).

## Qué puede extraer (sin licencia Parasolid)

| Método | Cuándo funciona |
|--------|------------------|
| `zip_xt` | Hay archivos `.x_T` de pieza en la misma carpeta que el ensamblaje |
| `html` | El ZIP trae HTML de SolidWorks / eDrawings con lista de piezas |
| `bom_xml` | BOM / PLM XML en el paquete |
| `xt_text` | El `.x_T` es formato texto Parasolid (poco común) |
| `step` | Archivos `.step` / `.stp` en la misma carpeta (nombre de pieza) |

Los `.x_T` **binarios** (exportación típica de CAD) **no se pueden abrir** con herramientas open source. Para esos casos el diseño debe incluir al menos una de las filas de arriba, o usar un conversor comercial (CAD Exchanger / HOOPS) y enlazarlo después.

## Arranque local

```bash
cd services/xt-assembly-worker
pip install -r requirements.txt
set XT_WORKER_SECRET=tu-secreto
uvicorn app.main:app --host 127.0.0.1 --port 8090
```

## Docker

```bash
docker build -t solaino-xt-worker .
docker run -p 8090:8090 -e XT_WORKER_SECRET=tu-secreto solaino-xt-worker
```

## Supabase

1. Despliega este servicio (VPS, Railway, Render, máquina en red local).
2. En **Edge Functions → Secrets** define:
   - `XT_WORKER_URL` = `https://tu-servidor:8090`
   - `XT_WORKER_SECRET` = mismo valor que `XT_WORKER_SECRET` del worker
3. Despliega la función `parse-design-assembly`.

## Próximo paso (visor 3D)

Para mostrar modelos en React con Three.js hace falta convertir a **GLB** en servidor (STEP → GLB con FreeCAD/OCC o servicio CAD). Este worker se puede extender con un endpoint `/v1/convert-glb` cuando tengas STEP o un conversor con licencia `.x_T`.
