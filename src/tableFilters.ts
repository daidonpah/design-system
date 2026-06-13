// Per-column filter primitives, shared by every TanStack-backed table.
//
// Tables compose AND/OR groups of typed rules and apply them before handing
// rows to TanStack — TanStack's built-in column filters only AND together,
// which is why we evaluate ourselves.

export type FilterType =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'boolean'

export type FilterCombinator = 'and' | 'or'

export const TEXT_OPERATORS = ['contains', 'equals', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty'] as const
export const NUMBER_OPERATORS = ['=', '!=', '<', '>', '<=', '>=', 'isEmpty', 'isNotEmpty'] as const
export const DATE_OPERATORS = ['is', 'isNot', 'before', 'after', 'onOrBefore', 'onOrAfter', 'isEmpty', 'isNotEmpty'] as const
export const ENUM_OPERATORS = ['is', 'isNot', 'isAnyOf'] as const
export const BOOLEAN_OPERATORS = ['isTrue', 'isFalse'] as const

export type FilterOperator =
  | (typeof TEXT_OPERATORS)[number]
  | (typeof NUMBER_OPERATORS)[number]
  | (typeof DATE_OPERATORS)[number]
  | (typeof ENUM_OPERATORS)[number]
  | (typeof BOOLEAN_OPERATORS)[number]

export const OPERATORS_BY_TYPE: Record<FilterType, readonly FilterOperator[]> = {
  text:     TEXT_OPERATORS,
  number:   NUMBER_OPERATORS,
  date:     DATE_OPERATORS,
  datetime: DATE_OPERATORS,
  enum:     ENUM_OPERATORS,
  boolean:  BOOLEAN_OPERATORS,
}

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains:   'contains',
  equals:     'equals',
  startsWith: 'starts with',
  endsWith:   'ends with',
  '=':        '=',
  '!=':       '≠',
  '<':        '<',
  '>':        '>',
  '<=':       '≤',
  '>=':       '≥',
  is:         'is',
  isNot:      'is not',
  isAnyOf:    'is any of',
  before:     'before',
  after:      'after',
  onOrBefore: 'on or before',
  onOrAfter:  'on or after',
  isEmpty:    'is empty',
  isNotEmpty: 'is not empty',
  isTrue:     'is true',
  isFalse:    'is false',
}

export interface FilterOption { value: string; label: string }

export interface FilterRule {
  id:        string
  columnId:  string
  operator:  FilterOperator
  /** Encoded value: string for text/date/datetime/enum-single, number for number, string[] for isAnyOf. */
  value:     string | number | string[] | null
}

// Augment TanStack Table's ColumnMeta in a single shared place so columns and
// tables can stop redeclaring it locally.
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Human-readable name for the column. Used by the auto-rendered header
     *  and the columns-visibility menu. */
    label?:          string
    /** Optional shorter label used only by the auto-rendered header (e.g. "#"
     *  in the table when the menu still wants the long "Article #" label).
     *  Falls back to `label`. */
    shortLabel?:     string
    filterType?:     FilterType
    filterOptions?:  FilterOption[]
    /** Reads the raw value used for filtering; defaults to row[columnId]. */
    filterAccessor?: (row: TData) => unknown
    /** Horizontal alignment applied to both header and body cells. */
    align?:          'left' | 'right' | 'center'
    /** Pin the column to the left or right edge during horizontal scroll. */
    pinned?:         'left' | 'right'
    /** Extra classes applied to the <th>. */
    headerClassName?: string
    /** Extra classes applied to the <td>. */
    cellClassName?:   string
  }
}

// ── Evaluation ───────────────────────────────────────────────────────────────

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function toTime(v: unknown): number | null {
  if (v == null || v === '') return null
  const t = new Date(v as string).getTime()
  return Number.isFinite(t) ? t : null
}

export function evaluateRule(raw: unknown, rule: FilterRule): boolean {
  switch (rule.operator) {
    case 'isEmpty':    return isEmptyValue(raw)
    case 'isNotEmpty': return !isEmptyValue(raw)
    case 'isTrue':     return raw === true
    case 'isFalse':    return raw === false || raw == null
  }

  if (isEmptyValue(rule.value) && rule.operator !== 'isAnyOf') return true

  // Text
  const s = raw == null ? '' : String(raw).toLowerCase()
  const q = String(rule.value ?? '').toLowerCase()
  switch (rule.operator) {
    case 'contains':   return s.includes(q)
    case 'equals':     return s === q
    case 'startsWith': return s.startsWith(q)
    case 'endsWith':   return s.endsWith(q)
  }

  // Number
  const rn = toNumber(raw)
  const vn = toNumber(rule.value)
  if (rn !== null && vn !== null) {
    switch (rule.operator) {
      case '=':  return rn === vn
      case '!=': return rn !== vn
      case '<':  return rn <  vn
      case '>':  return rn >  vn
      case '<=': return rn <= vn
      case '>=': return rn >= vn
    }
  }

  // Date / datetime
  const rt = toTime(raw)
  const vt = toTime(rule.value)
  if (rt !== null && vt !== null) {
    switch (rule.operator) {
      case 'before':     return rt <  vt
      case 'after':      return rt >  vt
      case 'onOrBefore': return rt <= vt
      case 'onOrAfter':  return rt >= vt
    }
  }

  // Enum
  switch (rule.operator) {
    case 'is':      return String(raw ?? '') === String(rule.value ?? '')
    case 'isNot':   return String(raw ?? '') !== String(rule.value ?? '')
    case 'isAnyOf': return Array.isArray(rule.value) && rule.value.includes(String(raw ?? ''))
  }
  return true
}

// Apply a set of rules to an array of rows using AND or OR composition.
// `accessors` maps a column id to a getter; rules referring to unknown ids are
// skipped (treated as no-op).
export function applyFilters<T>(
  rows:        readonly T[],
  rules:       readonly FilterRule[],
  combinator:  FilterCombinator,
  accessors:   Record<string, (row: T) => unknown>,
): T[] {
  if (rules.length === 0) return rows.slice()

  return rows.filter((row) => {
    const outcomes = rules.map((rule) => {
      const get = accessors[rule.columnId]
      if (!get) return true
      return evaluateRule(get(row), rule)
    })
    return combinator === 'and' ? outcomes.every(Boolean) : outcomes.some(Boolean)
  })
}

// Pick a sensible default operator for a fresh rule on a column of this type.
export function defaultOperator(type: FilterType): FilterOperator {
  switch (type) {
    case 'text':     return 'contains'
    case 'number':   return '='
    case 'date':
    case 'datetime': return 'onOrAfter'
    case 'enum':     return 'is'
    case 'boolean':  return 'isTrue'
  }
}

// Generate a short opaque id for new rules.
export function newRuleId(): string {
  return Math.random().toString(36).slice(2, 10)
}

