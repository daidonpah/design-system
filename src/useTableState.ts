import { useState, useCallback } from 'react'
import type { SortingState, VisibilityState, PaginationState } from '@tanstack/react-table'
import type { FilterCombinator, FilterRule } from './tableFilters'

// ── Persisted shape ───────────────────────────────────────────────────────────

interface PersistedState {
  sorting:           SortingState
  columnVisibility:  VisibilityState
  pageSize:          number
  filterRules:       FilterRule[]
  filterCombinator:  FilterCombinator
}

export interface TableStateDefaults {
  sorting?:           SortingState
  columnVisibility?:  VisibilityState
  pageSize?:          number
  filterRules?:       FilterRule[]
  filterCombinator?:  FilterCombinator
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function lsKey(tableId: string) {
  return `table-state:${tableId}`
}

function lsRead(tableId: string): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(lsKey(tableId))
    return raw ? (JSON.parse(raw) as Partial<PersistedState>) : {}
  } catch {
    return {}
  }
}

function lsWrite(tableId: string, patch: Partial<PersistedState>) {
  try {
    const current = lsRead(tableId)
    localStorage.setItem(lsKey(tableId), JSON.stringify({ ...current, ...patch }))
  } catch {
    // ignore quota / security errors
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages the persisted portion of a TanStack Table's state — sorting,
 * column visibility, and page size — backed by localStorage.
 *
 * Page **index** is intentionally not persisted (you want a fresh first page).
 *
 * @param tableId  Stable identifier used as the localStorage key suffix.
 *                 Use the route path or a stable name unique per table.
 * @param defaults Fallback values when localStorage has no saved entry yet.
 */
export function useTableState(tableId: string, defaults: TableStateDefaults = {}) {
  const saved = lsRead(tableId)

  const [sorting, _setSorting] = useState<SortingState>(
    saved.sorting ?? defaults.sorting ?? [],
  )

  const [columnVisibility, _setColumnVisibility] = useState<VisibilityState>(
    saved.columnVisibility ?? defaults.columnVisibility ?? {},
  )

  const [pagination, _setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize:  saved.pageSize ?? defaults.pageSize ?? 20,
  })

  const [filterRules, _setFilterRules] = useState<FilterRule[]>(
    saved.filterRules ?? defaults.filterRules ?? [],
  )

  const [filterCombinator, _setFilterCombinator] = useState<FilterCombinator>(
    saved.filterCombinator ?? defaults.filterCombinator ?? 'and',
  )

  // Wrap each setter so changes are also written to localStorage.
  // The functional-updater form is forwarded correctly so TanStack Table's
  // internal updaters (Updater<T> = T | (prev: T) => T) work as expected.

  const setSorting = useCallback(
    (updater: SortingState | ((prev: SortingState) => SortingState)) => {
      _setSorting(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        lsWrite(tableId, { sorting: next })
        return next
      })
    },
    [tableId],
  )

  const setColumnVisibility = useCallback(
    (updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => {
      _setColumnVisibility(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        lsWrite(tableId, { columnVisibility: next })
        return next
      })
    },
    [tableId],
  )

  const setPagination = useCallback(
    (updater: PaginationState | ((prev: PaginationState) => PaginationState)) => {
      _setPagination(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        // Only persist page size — never the page index
        if (next.pageSize !== prev.pageSize) {
          lsWrite(tableId, { pageSize: next.pageSize })
        }
        return next
      })
    },
    [tableId],
  )

  const setFilterRules = useCallback(
    (updater: FilterRule[] | ((prev: FilterRule[]) => FilterRule[])) => {
      _setFilterRules(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        lsWrite(tableId, { filterRules: next })
        return next
      })
    },
    [tableId],
  )

  const setFilterCombinator = useCallback(
    (updater: FilterCombinator | ((prev: FilterCombinator) => FilterCombinator)) => {
      _setFilterCombinator(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        lsWrite(tableId, { filterCombinator: next })
        return next
      })
    },
    [tableId],
  )

  return {
    sorting,          setSorting,
    columnVisibility, setColumnVisibility,
    pagination,       setPagination,
    filterRules,      setFilterRules,
    filterCombinator, setFilterCombinator,
  }
}
