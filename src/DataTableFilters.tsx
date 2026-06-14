import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Filter, X, Plus, ChevronDown } from 'lucide-react'
import { cn } from './cn'
import {
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  defaultOperator,
  newRuleId,
  type FilterCombinator,
  type FilterOperator,
  type FilterOption,
  type FilterRule,
  type FilterType,
} from './tableFilters'

// A column that can be filtered. Tables derive this list from their column
// definitions (those with meta.filterType set).
export interface FilterableColumn {
  id:       string
  label:    string
  type:     FilterType
  options?: FilterOption[]
}

// Context lets per-column header menus reach back into the table's filter
// popover (open it, pre-add a rule for the column the user clicked from).
// Also carries `sortCount` so the header can render a priority badge on the
// sort arrow only when multi-sort is active — kept here to avoid spinning up
// a second context just for one number.
interface TableFiltersContextValue {
  openForColumn: (columnId: string) => void
  isFilterable:  (columnId: string) => boolean
  sortCount:     number
}
const TableFiltersContext = createContext<TableFiltersContextValue | null>(null)

export function useTableFilters(): TableFiltersContextValue | null {
  return useContext(TableFiltersContext)
}

export function TableFiltersProvider({ value, children }: { value: TableFiltersContextValue; children: ReactNode }) {
  return <TableFiltersContext.Provider value={value}>{children}</TableFiltersContext.Provider>
}

interface Props {
  columns:        FilterableColumn[]
  rules:          FilterRule[]
  setRules:       (rules: FilterRule[]) => void
  combinator:     FilterCombinator
  setCombinator:  (c: FilterCombinator) => void
  open:           boolean
  onOpenChange:   (open: boolean) => void
}

// Operators that don't take a value and should hide the value input.
const VALUELESS: ReadonlySet<FilterOperator> = new Set(['isEmpty', 'isNotEmpty', 'isTrue', 'isFalse'])

// Popover anchor offset (px gap between the trigger and the popover) and the
// minimum margin to keep between the popover and the viewport edges.
const POPOVER_GAP    = 4
const POPOVER_MARGIN = 8

export function DataTableFilters({ columns, rules, setRules, combinator, setCombinator, open, onOpenChange }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Click-away: covers both the trigger and the portalled popover, since the
  // popover lives outside this component's DOM subtree.
  useEffect(() => {
    if (!open) return
    function handleDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      onOpenChange(false)
    }
    document.addEventListener('mousedown', handleDocClick)
    return () => document.removeEventListener('mousedown', handleDocClick)
  }, [open, onOpenChange])

  // Position the portalled popover under the trigger. Re-runs on scroll/resize
  // so the popover tracks the button when the page/scroll containers move.
  // Right-aligns when left-aligned overflow would push it past the viewport.
  useLayoutEffect(() => {
    if (!open) return
    function reposition() {
      const trigger = triggerRef.current
      const popover = popoverRef.current
      if (!trigger) return
      const r  = trigger.getBoundingClientRect()
      const pw = popover?.offsetWidth ?? 0
      const vw = window.innerWidth
      let left = r.left
      if (pw > 0 && left + pw > vw - POPOVER_MARGIN) left = Math.max(POPOVER_MARGIN, r.right - pw)
      setPos({ top: r.bottom + POPOVER_GAP, left })
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  useEffect(() => { if (!open) setPos(null) }, [open])

  function addRule() {
    const first = columns[0]
    if (!first) return
    setRules([
      ...rules,
      { id: newRuleId(), columnId: first.id, operator: defaultOperator(first.type), value: first.type === 'boolean' ? null : '' },
    ])
  }

  function updateRule(id: string, patch: Partial<FilterRule>) {
    setRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRule(id: string) {
    setRules(rules.filter((r) => r.id !== id))
  }

  function clearAll() { setRules([]) }

  const count = rules.length

  // Portalled so it escapes the table's scroll container and `<main>`'s
  // overflow-clip — otherwise the popover would be cut off at the page bounds.
  // Visibility before `pos` is computed is hidden to avoid a one-frame flash at
  // 0,0 from the portal mounting before useLayoutEffect runs.
  const popover = open ? createPortal(
    <div
      ref={popoverRef}
      style={pos ? { position: 'fixed', top: pos.top, left: pos.left } : { position: 'fixed', visibility: 'hidden' }}
      className="z-20 w-[min(40rem,calc(100vw-1rem))] rounded-md border border-border bg-background p-3 shadow-md"
    >
      {rules.length >= 2 && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Combine with</span>
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            {(['and', 'or'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCombinator(c)}
                className={cn(
                  'px-2 py-0.5 text-xs uppercase tracking-wide',
                  combinator === c ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="px-1 py-3 text-sm text-muted-foreground">No filters yet.</p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              columns={columns}
              onChange={(patch) => updateRule(rule.id, patch)}
              onRemove={() => removeRule(rule.id)}
            />
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={addRule}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-primary hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" />
          Add filter
        </button>
        {rules.length > 0 && (
          <button
            onClick={clearAll}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => onOpenChange(!open)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted"
      >
        <Filter className="h-4 w-4" />
        Filters
        {count > 0 && (
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
            {count}
          </span>
        )}
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {popover}
    </>
  )
}

// ── Rule row ─────────────────────────────────────────────────────────────────

interface RuleRowProps {
  rule:     FilterRule
  columns:  FilterableColumn[]
  onChange: (patch: Partial<FilterRule>) => void
  onRemove: () => void
}

function RuleRow({ rule, columns, onChange, onRemove }: RuleRowProps) {
  const column = columns.find((c) => c.id === rule.columnId) ?? columns[0]
  const type   = column?.type ?? 'text'
  const ops    = OPERATORS_BY_TYPE[type]
  const valueless = VALUELESS.has(rule.operator)

  function handleColumnChange(nextId: string) {
    const next = columns.find((c) => c.id === nextId)
    if (!next) return
    onChange({
      columnId: next.id,
      operator: defaultOperator(next.type),
      value:    next.type === 'boolean' ? null : '',
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-2">
      <select
        value={rule.columnId}
        onChange={(e) => handleColumnChange(e.target.value)}
        className="h-8 min-w-32 rounded-md border border-border bg-background px-2 text-sm"
      >
        {columns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>

      <select
        value={rule.operator}
        onChange={(e) => onChange({ operator: e.target.value as FilterOperator })}
        className="h-8 min-w-28 rounded-md border border-border bg-background px-2 text-sm"
      >
        {ops.map((op) => <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>)}
      </select>

      {!valueless && (
        <ValueInput
          type={type}
          options={column?.options}
          operator={rule.operator}
          value={rule.value}
          onChange={(v) => onChange({ value: v })}
        />
      )}

      <button
        onClick={onRemove}
        aria-label="Remove filter"
        className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  )
}

// ── Value input dispatch ─────────────────────────────────────────────────────

interface ValueInputProps {
  type:     FilterType
  options?: FilterOption[]
  operator: FilterOperator
  value:    FilterRule['value']
  onChange: (value: FilterRule['value']) => void
}

function ValueInput({ type, options, operator, value, onChange }: ValueInputProps) {
  const baseCls = 'h-8 min-w-40 rounded-md border border-border bg-background px-2 text-sm'

  if (type === 'enum' && options) {
    if (operator === 'isAnyOf') {
      const selected = Array.isArray(value) ? value : []
      return (
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background px-1.5 py-1">
          {options.map((o) => {
            const on = selected.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
                className={cn(
                  'rounded px-1.5 py-0.5 text-xs',
                  on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      )
    }
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className={baseCls}
      >
        <option value="">—</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }

  const inputType =
    type === 'number'   ? 'number'
    : type === 'date'     ? 'date'
    : type === 'datetime' ? 'datetime-local'
    : 'text'

  return (
    <input
      type={inputType}
      value={typeof value === 'string' || typeof value === 'number' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      className={baseCls}
    />
  )
}
