import { useCallback, useEffect, useMemo, useState } from 'react'

export function useBodegaPieceQueueBulk<T extends { id: string }>(
  filtered: T[],
  filterBySearch: (items: T[], query: string) => T[],
) {
  const [pieceFilter, setPieceFilter] = useState('')
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([])

  const filteredVisible = useMemo(
    () => filterBySearch(filtered, pieceFilter),
    [filtered, pieceFilter, filterBySearch],
  )

  const bulkPieces = useMemo(
    () => filtered.filter((p) => bulkSelectedIds.includes(p.id)),
    [filtered, bulkSelectedIds],
  )

  const bulkSelectedVisibleCount = useMemo(
    () => filteredVisible.filter((p) => bulkSelectedIds.includes(p.id)).length,
    [filteredVisible, bulkSelectedIds],
  )

  const showBatchPanel = bulkPieces.length >= 2

  useEffect(() => {
    setBulkSelectedIds((prev) => prev.filter((id) => filtered.some((p) => p.id === id)))
  }, [filtered])

  const toggleBulkPiece = useCallback((pieceId: string) => {
    setBulkSelectedIds((prev) =>
      prev.includes(pieceId) ? prev.filter((id) => id !== pieceId) : [...prev, pieceId],
    )
  }, [])

  const selectAllVisiblePieces = useCallback(() => {
    setBulkSelectedIds((prev) => {
      const s = new Set(prev)
      for (const p of filteredVisible) s.add(p.id)
      return Array.from(s)
    })
  }, [filteredVisible])

  const clearBulkSelection = useCallback(() => {
    setBulkSelectedIds([])
  }, [])

  return {
    pieceFilter,
    setPieceFilter,
    bulkSelectedIds,
    filteredVisible,
    bulkPieces,
    bulkSelectedVisibleCount,
    showBatchPanel,
    toggleBulkPiece,
    selectAllVisiblePieces,
    clearBulkSelection,
  }
}

export function getDeliveryScrollEl(): HTMLElement | null {
  return document.querySelector('[data-bodega-delivery-scroll]') as HTMLElement | null
}

export async function withDeliveryScrollRestore<T>(fn: () => Promise<T>): Promise<T> {
  const el = getDeliveryScrollEl()
  const top = el?.scrollTop ?? null
  const active = document.activeElement
  if (active instanceof HTMLElement && el?.contains(active)) {
    active.blur()
  }
  const out = await fn()
  if (el && top != null) {
    const restore = () => {
      el.scrollTop = top
    }
    restore()
    requestAnimationFrame(() => {
      restore()
      requestAnimationFrame(restore)
    })
    window.setTimeout(restore, 0)
    window.setTimeout(restore, 50)
    window.setTimeout(restore, 120)
  }
  return out
}
