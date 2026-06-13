import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type Table,
  type VisibilityState,
} from '@tanstack/react-table'
import { Search, SlidersHorizontal, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from './cn'
import { useTableState } from './useTableState'
import { DataTableFilters, TableFiltersProvider, type FilterableColumn } from './DataTableFilters'
import { applyFilters, defaultOperator, newRuleId } from './tableFilters'
import { getThClassName, getTdClassName, useScrollShadows } from './tableLayout'

// Generic, declarative table that owns search / filters / column visibility /
// sorting / pagination / selection / sticky-header & pinned-column layout /
// scroll shadows / persisted state. Callers only supply data, columns, and
// page-specific toolbar slots.
export interface DataTableProps<T> {
  data:                     T[]
  columns:                  ColumnDef<T>[]
  /** Stable key persisting sort, visibility, page size, filter rules. */
  storageKey:               string
  /**
   * Returns a stable, unique row id. Required for every table so that row
   * identity (selection state, React keys, sort/filter stability) is always
   * explicit. Fall back to `(_, i) => String(i)` if the dataset has no natural
   * key, but be aware that index-based ids invalidate selection across sorts.
   */
  getRowId:                 (row: T, index: number) => string
  searchPlaceholder?:       string
  /** Enables row selection and auto-prepends a left-pinned checkbox column. */
  enableSelection?:         boolean
  defaultSorting?:          SortingState
  defaultColumnVisibility?: VisibilityState
  defaultPageSize?:         number
  /** Rendered inside <tbody> when the filtered row model is empty. */
  emptyMessage?:            ReactNode
  /** Footer noun: `${n} ${plural}` / `${1} ${singular}`. */
  itemLabel?:               { singular: string; plural: string }
  /** Right-aligned slot in the toolbar row. Receives the table instance. */
  toolbar?:                 (table: Table<T>) => ReactNode
  /** Inserted just before `toolbar` when at least one row is selected. */
  selectionToolbar?:        (table: Table<T>) => ReactNode
  /** Rendered between the toolbar row and the table — e.g. result panels. */
  beforeTable?:             (table: Table<T>) => ReactNode
  /** Pins a fixed pixel/CSS height on the scroll container. */
  height?:                  number | string
  /** Grows to fill a `flex flex-col` ancestor (which must be height-constrained). */
  autoHeight?:              boolean
}

export function DataTable<T>({
  data,
  columns,
  storageKey,
  searchPlaceholder = 'Search…',
  getRowId,
  enableSelection = false,
  defaultSorting,
  defaultColumnVisibility,
  defaultPageSize,
  emptyMessage = 'No results.',
  itemLabel = { singular: 'item', plural: 'items' },
  toolbar,
  selectionToolbar,
  beforeTable,
  height,
  autoHeight,
}: DataTableProps<T>) {
  const {
    sorting,          setSorting,
    columnVisibility, setColumnVisibility,
    pagination,       setPagination,
    filterRules,      setFilterRules,
    filterCombinator, setFilterCombinator,
  } = useTableState(storageKey, {
    sorting:          defaultSorting,
    columnVisibility: defaultColumnVisibility,
    pageSize:         defaultPageSize,
  })

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [rowSelection,  setRowSelection]  = useState<RowSelectionState>({})
  const [globalFilter,  setGlobalFilter]  = useState('')
  const [colMenuOpen,   setColMenuOpen]   = useState(false)
  const [filtersOpen,   setFiltersOpen]   = useState(false)
  const colMenuRef    = useRef<HTMLDivElement>(null)
  const scrollShadows = useScrollShadows<HTMLDivElement>()

  // Derive filterable columns + accessor map from columnDef.meta. Drives the
  // filter popover's column list and the rule evaluation in applyFilters.
  const { filterableColumns, filterAccessors } = useMemo(() => {
    const cols: FilterableColumn[] = []
    const acc:  Record<string, (row: T) => unknown> = {}
    for (const def of columns) {
      const meta = def.meta
      if (!meta?.filterType) continue
      const id = (def as { accessorKey?: string; id?: string }).accessorKey ?? def.id
      if (!id) continue
      cols.push({ id, label: meta.label ?? id, type: meta.filterType, options: meta.filterOptions })
      acc[id] = meta.filterAccessor
        ? (row) => meta.filterAccessor!(row)
        : (row) => (row as unknown as Record<string, unknown>)[id]
    }
    return { filterableColumns: cols, filterAccessors: acc }
  }, [columns])

  const filteredData = useMemo(
    () => applyFilters(data, filterRules, filterCombinator, filterAccessors),
    [data, filterRules, filterCombinator, filterAccessors],
  )

  // When selection is enabled, prepend a built-in checkbox column so callers
  // never have to spell it out. It pins left to ride along with any other
  // left-pinned columns, opts out of sorting/hiding, and reads `getRowId` via
  // TanStack's row API — which is why `getRowId` is required in that mode.
  const finalColumns = useMemo<ColumnDef<T>[]>(
    () => enableSelection ? [buildSelectionColumn<T>(), ...columns] : columns,
    [enableSelection, columns],
  )

  const table = useReactTable<T>({
    data: filteredData,
    columns: finalColumns,
    getRowId,
    state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter, pagination },
    enableMultiSort: true,
    enableRowSelection: enableSelection,
    onSortingChange:          setSorting,
    onColumnFiltersChange:    setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange:     setRowSelection,
    onGlobalFilterChange:     setGlobalFilter,
    onPaginationChange:       setPagination,
    getCoreRowModel:       getCoreRowModel(),
    getFilteredRowModel:   getFilteredRowModel(),
    getSortedRowModel:     getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const selectedCount = enableSelection ? Object.keys(rowSelection).length : 0

  useEffect(() => {
    if (!colMenuOpen) return
    function handleDocClick(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false)
    }
    document.addEventListener('mousedown', handleDocClick)
    return () => document.removeEventListener('mousedown', handleDocClick)
  }, [colMenuOpen])

  // Snapshot at first render; new dynamic columns shouldn't toggle visibility
  // mid-session. Matches the pre-refactor behaviour in *DataTable.tsx.
  const hideableColumns = useMemo(
    () => table.getAllColumns().filter((c) => c.getCanHide()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Per-column-header menus reach back here to open the filter popover and
  // append a sensible default rule for the column the user clicked.
  const filtersCtx = useMemo(() => ({
    isFilterable: (id: string) => filterableColumns.some(c => c.id === id),
    openForColumn: (id: string) => {
      const col = filterableColumns.find(c => c.id === id)
      if (!col) return
      setFilterRules(prev =>
        prev.some(r => r.columnId === id)
          ? prev
          : [...prev, { id: newRuleId(), columnId: id, operator: defaultOperator(col.type), value: col.type === 'boolean' ? null : '' }],
      )
      setFiltersOpen(true)
    },
  }), [filterableColumns, setFilterRules])

  // `autoHeight` plugs into a flex column ancestor: `flex-1` claims remaining
  // space, `min-h-0` lets the body's overflow take effect (without it flex
  // children default to `min-height: auto` and refuse to shrink below content).
  const rootCls   = autoHeight ? 'flex min-h-0 flex-1 flex-col gap-3' : 'space-y-3'
  const scrollCls = cn(
    'group/scroll rounded-lg border border-border',
    autoHeight       ? 'flex-1 min-h-0 overflow-auto'
    : height != null ? 'overflow-auto'
                     : 'overflow-x-auto',
  )
  const scrollStyle = !autoHeight && height != null
    ? { height: typeof height === 'number' ? `${height}px` : height }
    : undefined
  const filteredCount = table.getFilteredRowModel().rows.length

  return (
    <TableFiltersProvider value={filtersCtx}>
    <div className={rootCls}>
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <DataTableFilters
          columns={filterableColumns}
          rules={filterRules}
          setRules={setFilterRules}
          combinator={filterCombinator}
          setCombinator={setFilterCombinator}
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
        />

        <div ref={colMenuRef} className="relative">
          <button
            onClick={() => setColMenuOpen((v) => !v)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Columns
            <ChevronDown className={cn('h-3 w-3 transition-transform', colMenuOpen && 'rotate-180')} />
          </button>

          {colMenuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-border bg-background shadow-md">
              {hideableColumns.map((col) => (
                <label key={col.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={col.getIsVisible()}
                    onChange={col.getToggleVisibilityHandler()}
                    className="rounded border-border"
                  />
                  {col.columnDef.meta?.label ?? col.id}
                </label>
              ))}
            </div>
          )}
        </div>

        {selectionToolbar && selectedCount > 0 && selectionToolbar(table)}

        {toolbar && <div className="ml-auto flex items-center gap-2">{toolbar(table)}</div>}
      </div>

      {beforeTable?.(table)}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div
        ref={scrollShadows.ref}
        data-scrolled-left={scrollShadows.left}
        data-scrolled-right={scrollShadows.right}
        className={scrollCls}
        style={scrollStyle}
      >
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th key={header.id} className={getThClassName(header)}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={finalColumns.length} className="py-12 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-selected={row.getIsSelected()}
                  className="group/row transition-colors hover:bg-muted/40 even:bg-muted/10 data-[selected=true]:bg-primary/5"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={getTdClassName(cell)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {selectedCount > 0 ? `${selectedCount} of ` : ''}
          {filteredCount} {filteredCount === 1 ? itemLabel.singular : itemLabel.plural}
        </span>

        <div className="flex items-center gap-1">
          <span className="mr-2">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="rounded p-1 hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="rounded p-1 hover:bg-muted disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="ml-2 rounded border border-border bg-background px-2 py-1 text-xs"
          >
            {[10, 20, 50, 100].map((s) => <option key={s} value={s}>{s} / page</option>)}
          </select>
        </div>
      </div>
    </div>
    </TableFiltersProvider>
  )
}


// Built-in left-pinned checkbox column. Used when `enableSelection` is set;
// callers never spell it out themselves. `enableHiding: false` keeps it out of
// the columns-visibility menu; `enableSorting: false` matches its semantics.
function buildSelectionColumn<T>(): ColumnDef<T> {
  return {
    id: '__select',
    enableSorting: false,
    enableHiding:  false,
    meta: { pinned: 'left', headerClassName: 'w-10 px-3', cellClassName: 'w-10 px-3' },
    header: ({ table }) => (
      <input
        type="checkbox"
        className="rounded border-border"
        checked={table.getIsAllPageRowsSelected()}
        ref={(el) => { if (el) el.indeterminate = table.getIsSomePageRowsSelected() }}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        className="rounded border-border"
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onChange={row.getToggleSelectedHandler()}
        aria-label="Select row"
      />
    ),
  }
}
