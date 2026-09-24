// Polaris IndexTable (selectable, sortable resource table with bulk actions),
// IndexFilters (view tabs + search + sort) and DataTable (read-only report table).
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowDownUp, ArrowUp, Check, Ellipsis, Search, SlidersHorizontal } from 'lucide-react'
import { cx } from '../common/utils'
import { Button } from './Button'
import { Pagination } from './display'
import { Checkbox, ChoiceList, TextField } from './forms'
import { ActionList, Popover, Tooltip } from './overlays'
import { Tabs, type TabDescriptor } from './Page'
import { Spinner } from './primitives'
import type { IconSource } from './shared'
import './polaris.css'
import './forms.css'
import './table.css'

export type SortDirection = 'ascending' | 'descending'
export interface TableSort {
  columnId: string
  direction: SortDirection
}

// ---------------------------------------------------------------------------
// IndexTable
// ---------------------------------------------------------------------------
export interface IndexTableColumn<T> {
  id: string
  title: ReactNode
  /** cell content */
  render: (row: T, index: number) => ReactNode
  /** makes the header sortable; return the comparable value */
  sortValue?: (row: T) => number | string | null | undefined
  /** first click direction (default: descending for numbers, ascending for text) */
  defaultSortDirection?: SortDirection
  align?: 'start' | 'center' | 'end'
  /** tabular numerals (and right alignment unless `align` is set) */
  numeric?: boolean
  width?: number | string
  minWidth?: number
  /** definition tooltip on the header */
  tooltip?: ReactNode
  /** keep cell text on one line */
  nowrap?: boolean
  hidden?: boolean
}
export interface IndexBulkAction {
  content: ReactNode
  onAction: (selectedIds: string[]) => void
  icon?: IconSource
  destructive?: boolean
  disabled?: boolean
}
export interface IndexTableProps<T> {
  rows: T[]
  columns: IndexTableColumn<T>[]
  rowKey: (row: T) => string
  /** used in "3 orders selected", empty text etc. (default item/items) */
  resourceName?: { singular: string; plural: string }
  /** checkbox column (default true) */
  selectable?: boolean
  /** controlled selection */
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
  /** buttons shown directly in the floating bulk bar */
  promotedBulkActions?: IndexBulkAction[]
  /** actions collapsed in the bulk bar's "…" menu */
  bulkActions?: IndexBulkAction[]
  onRowClick?: (row: T) => void
  /** controlled sort */
  sort?: TableSort | null
  onSortChange?: (sort: TableSort) => void
  defaultSort?: TableSort
  /** shown instead of rows when `rows` is empty */
  emptyState?: ReactNode
  loading?: boolean
  condensed?: boolean
  /** client-side pagination (rows per page) */
  pageSize?: number
  /** keep checkbox + first column pinned while scrolling horizontally (default true) */
  stickyFirstColumn?: boolean
  /** subtle row tint */
  rowTone?: (row: T) => 'subdued' | 'critical' | 'warning' | 'success' | undefined
  /** mark a row as selected-looking without checking it (e.g. currently open) */
  highlightedId?: string
  /** custom content in the footer bar (replaces pagination when set) */
  footer?: ReactNode
  className?: string
}

const INTERACTIVE = 'button, a, input, select, textarea, label, [role="button"], [data-no-row-click]'

function compareVals(a: unknown, b: unknown): number {
  const na = a === null || a === undefined
  const nb = b === null || b === undefined
  if (na && nb) return 0
  if (na) return 1
  if (nb) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' })
}

/** Sort rows by a column (stable). Exported for callers that sort outside the table. */
export function sortRows<T>(rows: T[], columns: IndexTableColumn<T>[], sort: TableSort | null | undefined): T[] {
  if (!sort) return rows
  const col = columns.find(c => c.id === sort.columnId)
  if (!col?.sortValue) return rows
  const dir = sort.direction === 'ascending' ? 1 : -1
  return rows
    .map((r, i) => ({ r, i, v: col.sortValue!(r) }))
    .sort((x, y) => {
      const nx = x.v === null || x.v === undefined
      const ny = y.v === null || y.v === undefined
      if (nx !== ny) return nx ? 1 : -1 // blanks always last
      return compareVals(x.v, y.v) * dir || x.i - y.i
    })
    .map(x => x.r)
}

/** Visual-only checkbox for table rows: the cell owns the click so shift-click ranges work. */
function RowCheck({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: (shift: boolean) => void }) {
  return (
    <span
      className="p-choice"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          onToggle(e.shiftKey)
        }
      }}
    >
      <span className="p-choice-control">
        <span className={cx('p-checkbox-box', checked && 'p-checkbox-box-checked')}>
          <Check size={12} strokeWidth={3} />
        </span>
      </span>
    </span>
  )
}

/**
 * Shopify admin resource list (orders, products, customers).
 * Checkbox selection with shift-click ranges, "N selected" header, floating bulk bar,
 * sortable headers, row click navigation, sticky first column, optional pagination.
 */
export function IndexTable<T>({
  rows, columns, rowKey, resourceName = { singular: 'item', plural: 'items' }, selectable = true, selectedIds, onSelectionChange,
  promotedBulkActions = [], bulkActions = [], onRowClick, sort, onSortChange, defaultSort, emptyState, loading, condensed,
  pageSize, stickyFirstColumn = true, rowTone, highlightedId, footer, className,
}: IndexTableProps<T>) {
  const cols = columns.filter(c => !c.hidden)
  const [innerSel, setInnerSel] = useState<string[]>([])
  const sel = selectedIds ?? innerSel
  const setSel = (ids: string[]) => {
    if (selectedIds === undefined) setInnerSel(ids)
    onSelectionChange?.(ids)
  }
  const [innerSort, setInnerSort] = useState<TableSort | null>(defaultSort ?? null)
  const activeSort = sort === undefined ? innerSort : sort
  const [page, setPage] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)
  const lastClicked = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)

  const sorted = useMemo(() => sortRows(rows, columns, activeSort), [rows, columns, activeSort])
  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])
  const visible = pageSize ? sorted.slice(page * pageSize, page * pageSize + pageSize) : sorted
  const visibleIds = visible.map(rowKey)
  const allIds = useMemo(() => sorted.map(rowKey), [sorted, rowKey])
  // drop selections for rows that no longer exist
  const selSet = new Set(sel.filter(id => allIds.includes(id)))
  const selCount = selSet.size
  const pageAllSelected = visibleIds.length > 0 && visibleIds.every(id => selSet.has(id))
  const headerState: boolean | 'indeterminate' = selCount === 0 ? false : pageAllSelected ? true : 'indeterminate'
  const noun = (n: number) => (n === 1 ? resourceName.singular : resourceName.plural)

  const toggleSort = (c: IndexTableColumn<T>) => {
    if (!c.sortValue) return
    let dir: SortDirection
    if (activeSort?.columnId === c.id) dir = activeSort.direction === 'ascending' ? 'descending' : 'ascending'
    else if (c.defaultSortDirection) dir = c.defaultSortDirection
    else {
      const sample = rows.map(c.sortValue).find(v => v !== null && v !== undefined)
      dir = typeof sample === 'number' ? 'descending' : 'ascending'
    }
    const next = { columnId: c.id, direction: dir }
    if (sort === undefined) setInnerSort(next)
    onSortChange?.(next)
  }

  const toggleRow = (idx: number, id: string, shift: boolean) => {
    const next = new Set(selSet)
    const on = !next.has(id)
    if (shift && lastClicked.current !== null) {
      const [a, b] = [lastClicked.current, idx].sort((x, y) => x - y)
      for (let i = a; i <= b; i++) {
        const rid = visibleIds[i]
        if (rid === undefined) continue
        if (on) next.add(rid)
        else next.delete(rid)
      }
    } else if (on) next.add(id)
    else next.delete(id)
    lastClicked.current = idx
    setSel([...next])
  }

  const toggleAllOnPage = () => {
    const next = new Set(selSet)
    if (pageAllSelected) visibleIds.forEach(id => next.delete(id))
    else visibleIds.forEach(id => next.add(id))
    setSel([...next])
  }

  const onRow = (e: MouseEvent<HTMLTableRowElement>, row: T, idx: number, id: string) => {
    const target = e.target as HTMLElement
    const interactive = target.closest(INTERACTIVE)
    if (interactive && e.currentTarget.contains(interactive)) return
    if (onRowClick) onRowClick(row)
    else if (selectable) toggleRow(idx, id, e.shiftKey)
  }

  const colAlign = (c: IndexTableColumn<T>) => c.align ?? (c.numeric ? 'end' : 'start')
  const firstColLeft = selectable ? 36 : 0
  const totalCols = cols.length + (selectable ? 1 : 0)
  const selIds = [...selSet]
  const showBulk = selectable && selCount > 0 && (promotedBulkActions.length > 0 || bulkActions.length > 0)

  return (
    <div className={cx('p-itable', condensed && 'p-itable-condensed', scrolled && 'p-itable-scrolled', className)}>
      <div className="p-itable-scroll" ref={scrollRef} onScroll={e => setScrolled((e.target as HTMLDivElement).scrollLeft > 0)}>
        <table>
          <thead>
            <tr>
              {selectable && (
                <th className={cx('p-itable-check', stickyFirstColumn && 'p-itable-sticky')}>
                  <Checkbox
                    label={pageAllSelected ? `Deselect all ${resourceName.plural}` : `Select all ${resourceName.plural}`}
                    labelHidden
                    checked={headerState}
                    disabled={!visible.length}
                    onChange={toggleAllOnPage}
                  />
                </th>
              )}
              {cols.map((c, ci) => {
                  const isSorted = activeSort?.columnId === c.id
                  const align = colAlign(c)
                  const label = c.tooltip ? (
                    <Tooltip content={c.tooltip} width="wide"><span className="p-itable-headtip">{c.title}</span></Tooltip>
                  ) : (
                    c.title
                  )
                  const sticky = stickyFirstColumn && ci === 0
                  return (
                    <th
                      key={c.id}
                      className={cx(
                        align !== 'start' && `p-itable-align-${align}`,
                        sticky && 'p-itable-sticky-2 p-itable-sticky-last',
                      )}
                      style={{ width: c.width, minWidth: c.minWidth, left: sticky ? firstColLeft : undefined }}
                      aria-sort={isSorted ? activeSort!.direction : undefined}
                    >
                      {c.sortValue ? (
                        <button type="button" className={cx('p-itable-sortbtn', isSorted && 'p-itable-sorted')} onClick={() => toggleSort(c)}>
                          {align === 'end' && (
                            <span className="p-itable-sorticon">
                              {isSorted && activeSort!.direction === 'ascending' ? <ArrowUp size={14} strokeWidth={2} /> : <ArrowDown size={14} strokeWidth={2} />}
                            </span>
                          )}
                          {label}
                          {align !== 'end' && (
                            <span className="p-itable-sorticon">
                              {isSorted && activeSort!.direction === 'ascending' ? <ArrowUp size={14} strokeWidth={2} /> : <ArrowDown size={14} strokeWidth={2} />}
                            </span>
                          )}
                        </button>
                      ) : (
                        label
                      )}
                    </th>
                  )
                })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr className="p-itable-empty">
                <td colSpan={totalCols}>
                  {emptyState ?? <div className="p-itable-subtle" style={{ padding: 24, textAlign: 'center' }}>No {resourceName.plural} found</div>}
                </td>
              </tr>
            ) : (
              visible.map((row, idx) => {
                const id = visibleIds[idx]
                const isSel = selSet.has(id)
                const tone = rowTone?.(row)
                return (
                  <tr
                    key={id}
                    className={cx(
                      (onRowClick || selectable) && 'p-itable-row-click',
                      (isSel || highlightedId === id) && 'p-itable-row-selected',
                      tone && `p-itable-tone-${tone}`,
                    )}
                    onClick={e => onRow(e, row, idx, id)}
                    aria-selected={selectable ? isSel : undefined}
                  >
                    {selectable && (
                      <td className={cx('p-itable-check', stickyFirstColumn && 'p-itable-sticky')} onClick={e => { e.stopPropagation(); toggleRow(idx, id, e.shiftKey) }}>
                        <RowCheck checked={isSel} label={`Select ${resourceName.singular}`} onToggle={shift => toggleRow(idx, id, shift)} />
                      </td>
                    )}
                    {cols.map((c, ci) => {
                      const align = colAlign(c)
                      const sticky = stickyFirstColumn && ci === 0
                      return (
                        <td
                          key={c.id}
                          className={cx(
                            align !== 'start' && `p-itable-align-${align}`,
                            c.numeric && 'p-itable-numeric',
                            c.nowrap && 'p-itable-nowrap',
                            ci === 0 && 'p-itable-first',
                            sticky && 'p-itable-sticky-2 p-itable-sticky-last',
                          )}
                          style={{ left: sticky ? firstColLeft : undefined, width: c.width, minWidth: c.minWidth }}
                        >
                          {c.render(row, idx)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {selCount > 0 && (
        <div className="p-itable-selhead" style={{ left: selectable ? 36 : 0 }}>
          <span>{selCount} selected</span>
          {selCount < allIds.length && (
            <Button variant="plain" onClick={() => setSel(allIds)}>
              Select all {allIds.length} {noun(allIds.length)}
            </Button>
          )}
          {selCount === allIds.length && allIds.length > 1 && (
            <Button variant="plain" onClick={() => setSel([])}>Unselect all</Button>
          )}
        </div>
      )}
      {loading && <div className="p-itable-loading"><Spinner size="large" /></div>}
      {showBulk && <div className="p-itable-bulkspace" aria-hidden />}
      {showBulk && (
        <div className="p-itable-bulkwrap">
          <div className="p-itable-bulkbar" role="toolbar" aria-label="Bulk actions">
            {promotedBulkActions.map((a, i) => (
              <Button
                key={i}
                size="slim"
                icon={a.icon}
                disabled={a.disabled}
                tone={a.destructive ? 'critical' : undefined}
                onClick={() => a.onAction(selIds)}
              >
                {a.content}
              </Button>
            ))}
            {bulkActions.length > 0 && (
              <Popover
                active={moreOpen}
                onClose={() => setMoreOpen(false)}
                preferredPosition="above"
                preferredAlignment="right"
                activator={<Button size="slim" icon={Ellipsis} accessibilityLabel="More actions" onClick={() => setMoreOpen(o => !o)} />}
              >
                <ActionList
                  items={bulkActions.map(a => ({
                    content: a.content, icon: a.icon, destructive: a.destructive, disabled: a.disabled, onAction: () => a.onAction(selIds),
                  }))}
                  onActionAnyItem={() => setMoreOpen(false)}
                />
              </Popover>
            )}
          </div>
        </div>
      )}
      {(footer || (pageSize && sorted.length > pageSize)) && (
        <div className="p-itable-footer">
          {footer ?? (
            <Pagination
              hasPrevious={page > 0}
              hasNext={page < pageCount - 1}
              onPrevious={() => setPage(p => Math.max(0, p - 1))}
              onNext={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              label={`${page * pageSize! + 1}–${Math.min(sorted.length, (page + 1) * pageSize!)} of ${sorted.length}`}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// IndexFilters
// ---------------------------------------------------------------------------
export interface IndexSortOption {
  label: string
  value: string
  /** direction labels, e.g. ['Oldest to newest', 'Newest to oldest'] (default A–Z / Z–A) */
  directionLabels?: [string, string]
}
export interface IndexFiltersProps {
  /** saved views ("All", "Unfulfilled", …) */
  tabs: TabDescriptor[]
  selected: number
  onSelect: (index: number) => void
  queryValue?: string
  onQueryChange?: (value: string) => void
  queryPlaceholder?: string
  sortOptions?: IndexSortOption[]
  sortSelected?: { value: string; direction: SortDirection }
  onSortChange?: (value: string, direction: SortDirection) => void
  /** extra filter controls shown under the bar while searching (e.g. status pills) */
  filters?: ReactNode
  /** spinner in the search field */
  loading?: boolean
}
/**
 * The bar above an IndexTable: view tabs on the left, search/filter + sort buttons on the right.
 * Place both inside `<Card padding="0">`.
 */
export function IndexFilters({
  tabs, selected, onSelect, queryValue = '', onQueryChange, queryPlaceholder = 'Searching all', sortOptions, sortSelected, onSortChange,
  filters, loading,
}: IndexFiltersProps) {
  const [searching, setSearching] = useState(!!queryValue)
  const [sortOpen, setSortOpen] = useState(false)
  const current = sortOptions?.find(o => o.value === sortSelected?.value) ?? sortOptions?.[0]
  const dirLabels = current?.directionLabels ?? ['A–Z', 'Z–A']
  const sortBtn = sortOptions && sortOptions.length > 0 && (
    <Popover
      active={sortOpen}
      onClose={() => setSortOpen(false)}
      preferredAlignment="right"
      activator={
        <Tooltip content="Sort results">
          <Button size="slim" icon={ArrowDownUp} accessibilityLabel="Sort" pressed={sortOpen} onClick={() => setSortOpen(o => !o)} />
        </Tooltip>
      }
    >
      <div style={{ padding: 12, minWidth: 220 }}>
        <ChoiceList
          title="Sort by"
          choices={sortOptions.map(o => ({ label: o.label, value: o.value }))}
          selected={current ? [current.value] : []}
          onChange={([v]) => onSortChange?.(v, sortSelected?.direction ?? 'descending')}
        />
      </div>
      <div style={{ borderTop: '1px solid #ebebeb', padding: 6 }}>
        <ActionList
          items={[
            { content: dirLabels[0], icon: ArrowUp, active: sortSelected?.direction === 'ascending', onAction: () => current && onSortChange?.(current.value, 'ascending') },
            { content: dirLabels[1], icon: ArrowDown, active: sortSelected?.direction === 'descending', onAction: () => current && onSortChange?.(current.value, 'descending') },
          ]}
        />
      </div>
    </Popover>
  )
  return (
    <div>
      <div className="p-ifilters">
        {searching && onQueryChange ? (
          <div className="p-ifilters-search">
            <TextField
              label="Search"
              labelHidden
              value={queryValue}
              onChange={onQueryChange}
              placeholder={queryPlaceholder}
              prefix={loading ? <Spinner size={16} /> : <Search size={16} strokeWidth={2} />}
              size="slim"
              autoFocus
              clearButton
            />
            <Button
              variant="tertiary"
              size="slim"
              onClick={() => {
                onQueryChange('')
                setSearching(false)
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="p-ifilters-tabs">
            <Tabs tabs={tabs} selected={selected} onSelect={onSelect} />
          </div>
        )}
        <div className="p-ifilters-tools">
          {!searching && onQueryChange && (
            <Tooltip content="Search and filter">
              <Button size="slim" icon={<span style={{ display: 'inline-flex', gap: 0 }}><Search size={14} strokeWidth={2} /><SlidersHorizontal size={14} strokeWidth={2} /></span>} accessibilityLabel="Search and filter" onClick={() => setSearching(true)} />
            </Tooltip>
          )}
          {sortBtn}
        </div>
      </div>
      {searching && filters && <div className="p-ifilters-row2">{filters}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------
export interface DataTableProps {
  /** per column: 'text' (left) or 'numeric' (right, tabular) */
  columnContentTypes: ('text' | 'numeric')[]
  headings: ReactNode[]
  /** cell content; strings/numbers sort automatically ("$1,234.50", "12.5%" parse as numbers) */
  rows: ReactNode[][]
  /** totals row (use '' for blank cells) */
  totals?: ReactNode[]
  /** label for the totals row's first cell (default "Totals") */
  totalsName?: string
  /** render totals at the bottom instead of under the header */
  showTotalsInFooter?: boolean
  /** which columns are sortable */
  sortable?: boolean[]
  defaultSortDirection?: SortDirection
  initialSortColumnIndex?: number
  /** called on header click; when omitted the table sorts primitive cells itself */
  onSort?: (columnIndex: number, direction: SortDirection) => void
  footerContent?: ReactNode
  /** first column one-line with ellipsis */
  truncate?: boolean
  increasedTableDensity?: boolean
  hasZebraStripingOnData?: boolean
  stickyHeader?: boolean
  hoverable?: boolean
}
const parseCell = (v: ReactNode): number | string | null => {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return null
  const t = v.replace(/[$,%\s×x]/g, '')
  if (t === '' || t === '—' || t === '-') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : v
}
/** Read-only report table (Reports, Finances, P&L). */
export function DataTable({
  columnContentTypes, headings, rows, totals, totalsName = 'Totals', showTotalsInFooter, sortable, defaultSortDirection = 'descending',
  initialSortColumnIndex, onSort, footerContent, truncate, increasedTableDensity, hasZebraStripingOnData, stickyHeader, hoverable = true,
}: DataTableProps) {
  const [sortState, setSortState] = useState<{ i: number; dir: SortDirection } | null>(
    initialSortColumnIndex !== undefined ? { i: initialSortColumnIndex, dir: defaultSortDirection } : null,
  )
  const displayRows = useMemo(() => {
    if (!sortState || onSort) return rows
    const dir = sortState.dir === 'ascending' ? 1 : -1
    return rows
      .map((r, idx) => ({ r, idx, v: parseCell(r[sortState.i]) }))
      .sort((a, b) => compareVals(a.v, b.v) * dir || a.idx - b.idx)
      .map(x => x.r)
  }, [rows, sortState, onSort])
  const cls = (i: number) => (columnContentTypes[i] === 'numeric' ? 'p-dtable-numeric' : undefined)
  const totalsRow = totals && (
    <tr className="p-dtable-totals">
      {totals.map((t, i) => (
        <td key={i} className={cls(i)}>{i === 0 && (t === '' || t === null || t === undefined) ? totalsName : t}</td>
      ))}
    </tr>
  )
  return (
    <div
      className={cx(
        'p-dtable', increasedTableDensity && 'p-dtable-dense', truncate && 'p-dtable-truncate', hasZebraStripingOnData && 'p-dtable-zebra',
        stickyHeader && 'p-dtable-sticky', hoverable && 'p-dtable-hover',
      )}
    >
      <div className="p-dtable-scroll">
        <table>
          <thead>
            <tr>
              {headings.map((h, i) => {
                const canSort = sortable?.[i]
                const isSorted = sortState?.i === i
                return (
                  <th key={i} className={cls(i)} aria-sort={isSorted ? sortState!.dir : undefined}>
                    {canSort ? (
                      <button
                        type="button"
                        className={cx('p-dtable-sortbtn', isSorted && 'p-dtable-sorted')}
                        onClick={() => {
                          const dir: SortDirection = isSorted ? (sortState!.dir === 'ascending' ? 'descending' : 'ascending') : defaultSortDirection
                          setSortState({ i, dir })
                          onSort?.(i, dir)
                        }}
                      >
                        {columnContentTypes[i] === 'numeric' && (isSorted && sortState!.dir === 'ascending' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                        {h}
                        {columnContentTypes[i] !== 'numeric' && (isSorted && sortState!.dir === 'ascending' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                      </button>
                    ) : (
                      h
                    )}
                  </th>
                )
              })}
            </tr>
            {!showTotalsInFooter && totalsRow}
          </thead>
          <tbody>
            {displayRows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} className={cls(ci)}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {showTotalsInFooter && totalsRow && <tfoot>{totalsRow}</tfoot>}
        </table>
      </div>
      {footerContent && <div className="p-dtable-footer">{footerContent}</div>}
    </div>
  )
}
