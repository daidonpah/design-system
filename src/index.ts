// Public surface: a single <DataTable> component that owns search, filters,
// sorting, visibility, pagination, selection, sticky/pinned layout and
// persistent state. Configuration flows through ColumnDef and its `meta`
// (`label`, `shortLabel`, `filterType`, `align`, `pinned`, …) — the
// augmentation lives in ./tableFilters; the side-effect import below keeps
// it in the public .d.ts graph so consumers get the typed `meta` fields
// automatically when they import from this package.
import './tableFilters'
export { DataTable, type DataTableProps } from './DataTable'
