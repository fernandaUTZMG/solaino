import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured } from '../../env'
import { fetchProductos } from '../../lib/productosRepo'
import { loadJson, saveJson } from '../../lib/localStorage'
import type { InventoryItem } from '../../types/inventory'
import { seedItems } from './seed'

const STORAGE_KEY = 'solaino.inventory.items.v1'

function sortByCodigo(a: InventoryItem, b: InventoryItem) {
  return a.codigo.localeCompare(b.codigo)
}

export function useInventoryItems() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (isSupabaseConfigured()) {
        const data = await fetchProductos()
        setItems(data.sort(sortByCodigo))
      } else {
        const loaded = loadJson<InventoryItem[] | null>(STORAGE_KEY, null)
        if (!loaded || loaded.length === 0) {
          setItems([...seedItems].sort(sortByCodigo))
        } else {
          setItems([...loaded].sort(sortByCodigo))
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar inventario')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      saveJson(STORAGE_KEY, items)
    }
  }, [items])

  const stats = useMemo(() => {
    const sinStock = items.filter((i) => i.stockActual <= 0).length
    const porTerminarse = items.filter(
      (i) => i.stockActual > 0 && i.stockActual < i.stockMinimo,
    ).length
    const ok = items.length - sinStock - porTerminarse
    return { sinStock, porTerminarse, ok, total: items.length }
  }, [items])

  return {
    items,
    setItems,
    stats,
    loading,
    error,
    refresh,
    useLocal: !isSupabaseConfigured(),
  }
}
