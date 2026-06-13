// Shared th/td className builders driven by ColumnMeta. Tables call these so
// pinning, alignment and per-column class overrides stay declarative on the
// column definition rather than duplicated in every renderer.
//
// Pinned cells are positioned with CSS `sticky`. They need an opaque
// background to occlude scrolled-under content; we use `bg-background` plus
// `group-*` variants that mirror the row's hover/striping classes, so callers
// must add `group/row` to each <tr>.

import { useEffect, useRef, useState } from 'react'
import type { Cell, Header } from '@tanstack/react-table'
import { cn } from './cn'

// Row separators live on the cells (not on tr/tbody): the tables use
// `border-separate` so box-shadow renders on pinned <td>s, and in that mode
// borders on row/row-group elements are ignored by the browser.
//
// `sticky top-0` on every <th> keeps the header row visible when the scroll
// container has a constrained height and the body scrolls internally (see
// `height` / `autoHeight` on each DataTable). The opaque `bg-muted` occludes
// rows passing underneath; without it body content shows through the sticky
// header. z-[2] outranks pinned body cells (z-[1]); pinned headers go to z-[3].
const BASE_TH = 'sticky top-0 z-[2] bg-muted border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground'
const BASE_TD = 'border-b border-border px-4 py-3'

function alignClass(align: 'left' | 'right' | 'center' | undefined): string {
  if (align === 'right')  return 'text-right'
  if (align === 'center') return 'text-center'
  return 'text-left'
}

function pinClass(pinned: 'left' | 'right' | undefined, isHeader: boolean): string {
  if (!pinned) return ''
  // Stay well below the dropdown/popover z-20 levels — pinned cells only need
  // to outrank non-pinned cells in the same table. Stacking inside the table:
  //   z-auto (0) non-pinned body  <  z-[1] pinned body
  //                                <  z-[2] non-pinned header (sticky top)
  //                                <  z-[3] pinned header (sticky top + side)
  const z = isHeader ? 'z-[3]' : 'z-[1]'
  // Each pinned edge keeps a 1px hard separator line at all times; when the
  // scroll container reports content hidden in that direction we stack a soft
  // drop-shadow fading inward as a non-intrusive "more content here" cue.
  const edge = pinned === 'left'
    ? cn(
        'sticky left-0 transition-shadow',
        'shadow-[1px_0_0_0_hsl(var(--border))]',
        'group-data-[scrolled-left=true]/scroll:shadow-[1px_0_0_0_hsl(var(--border)),8px_0_8px_-4px_rgb(0_0_0/0.18)]',
      )
    : cn(
        'sticky right-0 transition-shadow',
        'shadow-[-1px_0_0_0_hsl(var(--border))]',
        'group-data-[scrolled-right=true]/scroll:shadow-[-1px_0_0_0_hsl(var(--border)),-8px_0_8px_-4px_rgb(0_0_0/0.18)]',
      )
  // Header cells: solid muted (matches the thead).
  // Body cells: opaque bg-background base, with a ::before overlay carrying the
  // row's striping / hover / selected tints. Tailwind alpha utilities like
  // `bg-muted/10` only set background-color, so they can't be stacked on the
  // same element — overlaying via a negative-z pseudo keeps the cell opaque
  // while still reflecting row state. `position: sticky` makes the cell its
  // own stacking context, so before:-z-10 sits between the cell's bg and the
  // in-flow content.
  //
  // `group-has-…/row:z-[5]`: when the current row contains an element marked
  // with `data-row-menu-open`, its pinned cells lift above other rows' pinned
  // cells (z-[1]) so the popover isn't occluded by sticky cells further down
  // in the DOM (each pinned <td> forms its own stacking context, so the popover
  // can't escape z-[1] otherwise).
  const bg = isHeader
    ? 'bg-muted'
    : cn(
        'bg-background',
        "before:content-[''] before:absolute before:inset-0 before:pointer-events-none before:-z-10",
        'group-even/row:before:bg-muted/10',
        'group-hover/row:before:bg-muted/40',
        'group-data-[selected=true]/row:before:bg-primary/5',
        'group-has-[[data-row-menu-open=true]]/row:z-[5]',
      )
  return cn(edge, z, bg)
}

export function getThClassName<TData, TValue>(header: Header<TData, TValue>): string {
  const meta = header.column.columnDef.meta
  return cn(
    BASE_TH,
    alignClass(meta?.align),
    pinClass(meta?.pinned, true),
    meta?.headerClassName,
  )
}

export function getTdClassName<TData, TValue>(cell: Cell<TData, TValue>): string {
  const meta = cell.column.columnDef.meta
  return cn(
    BASE_TD,
    alignClass(meta?.align),
    pinClass(meta?.pinned, false),
    meta?.cellClassName,
  )
}


// Tracks whether the scroll container has overflow hidden on the left or right
// of the visible viewport. Pinned columns use this (via `group/scroll` +
// `data-scrolled-left` / `data-scrolled-right` on the container) to fade in a
// soft drop-shadow when there's actually scrolled-away content behind them.
export function useScrollShadows<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [shadows, setShadows] = useState({ left: false, right: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const max = el.scrollWidth - el.clientWidth
      setShadows({
        left:  el.scrollLeft > 0,
        right: el.scrollLeft < max - 1,
      })
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])

  return { ref, ...shadows }
}
