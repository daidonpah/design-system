import { useEffect, useRef, useState } from 'react'
import type { Column } from '@tanstack/react-table'
import { ArrowUpDown, ArrowUp, ArrowDown, MoreVertical, Filter, EyeOff } from 'lucide-react'
import { cn } from './cn'
import { useTableFilters } from './DataTableFilters'

interface Props<TData, TValue> {
  column: Column<TData, TValue>
  label:  string
}

// Replaces both the old SortableHeader and bare-string headers across tables.
// Renders the label (sortable button when applicable) plus an opt-in three-dots
// menu exposing "Filter" (when the column is filterable via meta.filterType)
// and "Hide column" (when the column can be hidden).
export function TableColumnHeader<TData, TValue>({ column, label }: Props<TData, TValue>) {
  const filters   = useTableFilters()
  const canSort   = column.getCanSort()
  const canHide   = column.getCanHide()
  const canFilter = !!filters && filters.isFilterable(column.id)
  const showMenu  = canFilter || canHide
  const alignEnd  = column.columnDef.meta?.align === 'right'

  return (
    <div className={cn('group flex items-center gap-1', alignEnd && 'justify-end')}>
      {canSort ? (
        <button
          onClick={column.getToggleSortingHandler()}
          className="flex items-center whitespace-nowrap font-medium hover:text-foreground"
        >
          {label}
          <SortIcon sorted={column.getIsSorted()} />
        </button>
      ) : (
        <span className="whitespace-nowrap font-medium">{label}</span>
      )}

      {showMenu && (
        <HeaderMenu
          canFilter={canFilter}
          canHide={canHide}
          alignEnd={alignEnd}
          onFilter={() => filters?.openForColumn(column.id)}
          onHide={() => column.toggleVisibility(false)}
        />
      )}
    </div>
  )
}

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc')  return <ArrowUp   className="ml-1 inline h-3 w-3" />
  if (sorted === 'desc') return <ArrowDown className="ml-1 inline h-3 w-3" />
  return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />
}

interface HeaderMenuProps {
  canFilter: boolean
  canHide:   boolean
  alignEnd:  boolean
  onFilter:  () => void
  onHide:    () => void
}

function HeaderMenu({ canFilter, canHide, alignEnd, onFilter, onHide }: HeaderMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleDocClick)
    return () => document.removeEventListener('mousedown', handleDocClick)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Column actions"
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60',
          'opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100',
          open && 'opacity-100',
        )}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className={cn('absolute z-30 mt-1 w-44 rounded-md border border-border bg-background py-1 shadow-md', alignEnd ? 'right-0' : 'left-0')}>
          {canFilter && (
            <button
              onClick={() => { setOpen(false); onFilter() }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
            >
              <Filter className="h-3.5 w-3.5" />
              Filter
            </button>
          )}
          {canHide && (
            <button
              onClick={() => { setOpen(false); onHide() }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
            >
              <EyeOff className="h-3.5 w-3.5" />
              Hide column
            </button>
          )}
        </div>
      )}
    </div>
  )
}
