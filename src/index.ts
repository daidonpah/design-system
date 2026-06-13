// Generic data-table primitives. The default surface for consumers is
// <DataTable>; the lower-level pieces (filters popover, column header,
// layout helpers, persistent state) are re-exported for callers that need
// to compose a custom shell.
export { DataTable, type DataTableProps } from './DataTable'

export {
  DataTableFilters,
  TableFiltersProvider,
  useTableFilters,
  type FilterableColumn,
} from './DataTableFilters'

export { TableColumnHeader } from './TableColumnHeader'

export {
  getThClassName,
  getTdClassName,
  useScrollShadows,
} from './tableLayout'

export {
  useTableState,
  type TableStateDefaults,
} from './useTableState'

// Filter primitives + ColumnMeta augmentation. Importing anything from this
// module pulls in the `declare module '@tanstack/react-table'` block, which
// activates the meta fields (`label`, `filterType`, `pinned`, etc.) on every
// ColumnDef in the consumer's program.
export {
  applyFilters,
  evaluateRule,
  defaultOperator,
  newRuleId,
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  TEXT_OPERATORS,
  NUMBER_OPERATORS,
  DATE_OPERATORS,
  ENUM_OPERATORS,
  BOOLEAN_OPERATORS,
  type FilterType,
  type FilterCombinator,
  type FilterOperator,
  type FilterOption,
  type FilterRule,
} from './tableFilters'

export { cn } from './cn'
