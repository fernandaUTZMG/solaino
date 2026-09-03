export type InventoryCategory = 'Componente' | 'Herramienta' | 'Equipo' | 'Material'

export type InventoryItemStatus =
  | 'Disponible'
  | 'En uso'
  | 'Dañado'
  | 'En mantenimiento'

export interface Supplier {
  id: string
  nombre: string
  contacto?: string
  telefono?: string
  email?: string
}

export interface Category {
  id: string
  nombre: InventoryCategory | string
  descripcion?: string
}

export interface LocationRef {
  area: string
  ubicacion: string
}

export interface InventoryItem {
  id: string
  codigo: string
  nombre: string
  /** Medida del material (texto libre, ej. m, kg, rollo). */
  medida?: string
  /** Cantidad por pieza según inventario / Excel. */
  cantidadPorPza?: number
  /** Código de producto distinto del código de renglón (`codigo`). */
  codigoProducto?: string
  descripcion?: string
  categoriaId: string

  stockActual: number
  stockMinimo: number
  stockMaximo?: number
  unidad: 'piezas' | 'metros' | 'kits' | 'unidades' | string

  ubicacion: LocationRef

  costoUnitario: number
  proveedorId?: string

  partNumber?: string
  fabricante?: string
  especificaciones?: Record<string, string | number>
  lote?: string
  fechaCaducidad?: string

  estado: InventoryItemStatus
  imagenUrl?: string
  datasheetUrl?: string

  /** Si el producto se controla por número de serie (1 serie = 1 unidad). */
  tieneSerie?: boolean

  /** ISO 8601: última vez que subió el stock (entrada) */
  ultimaEntradaISO?: string
  /** ISO 8601: última vez que bajó el stock (salida) */
  ultimaSalidaISO?: string
}

export type InventoryMovementType = 'Entrada' | 'Salida' | 'Ajuste'
export type InventoryMovementReason =
  | 'Compra'
  | 'Devolución'
  | 'Producción'
  | 'Venta'
  | 'Desperdicio'
  | 'Corrección'

export interface InventoryMovement {
  id: string
  itemId: string
  tipo: InventoryMovementType
  motivo: InventoryMovementReason
  cantidad: number
  fechaISO: string
  responsable: string
  nota?: string
}
