// Dense Ads Manager table shared by Fadbook and TikTak: sticky header and leading
// columns, checkbox + on/off toggle columns, sortable & resizable headers, row
// hover actions, breakdown sub-rows and a sticky "Results from N" totals footer.
import { Fragment, memo, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cx } from '../common/utils'
import { renderIcon, type IconSource } from '../common/icon'
import { useAmTheme, type AmTheme } from './theme'
import { AmCheckbox, AmSpinner, InfoTip, Toggle } from './controls'
import './adsmanager.css'
import './table.css'

export type AmSortDirection = 'asc' | 'desc'
export interface AmSort {
  columnId: string
  direction: AmSortDirection
}
export interface AmRowAction {
  label: string
  icon?: IconSource
  onClick: () => void
  disabled?: boolean
}
export interface AmColumn<T> {
  id: string
  header: ReactNode
  /** (i) definition next to the header (e.g. how "Hook rate" is calculated) */
  headerTip?: ReactNode
  /** px width (default 130; resizable by the player) */
  width?: number
  minWidth?: number
  align?: 'left' | 'right' | 'center'
  /** pin to the left while scrolling horizontally (only leading columns) */
  sticky?: boolean
  /** enables sorting; return the comparable value (null sorts last) */
  sortValue?: (row: T) => number | string | null | undefined
  render: (row: T) => ReactNode
  /** content for the totals footer cell */
  total?: (rows: T[]) => ReactNode
  /** actions revealed on row hover under this cell's content (Edit / Duplicate / View charts) */
  hoverActions?: (row: T) => AmRowAction[]
  resizable?: boolean
}
export interface AmTableProps<T> {
  rows: T[]
  columns: AmColumn<T>[]
  rowKey: (row: T) => string
  theme?: AmTheme
  /** checkbox column (default true) */
  selectable?: boolean
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
  /** on/off toggle column ("Off / On") */
  toggle?: {
    isOn: (row: T) => boolean
    onChange: (row: T, on: boolean) => void
    disabled?: (row: T) => boolean
    /** spinner in the knob while a change is pending */
    busy?: (row: T) => boolean
  }
  sort?: AmSort | null
  defaultSort?: AmSort
  onSortChange?: (sort: AmSort) => void
  /** sticky totals footer */
  totals?: boolean
  /** "campaign"/"campaigns" → "Results from 3 campaigns" */
  entityName?: { singular: string; plural: string }
  /** custom footer label */
  totalsLabel?: ReactNode
  /** footer sub-label (default "Excludes deleted items" on Fadbook) */
  totalsSubLabel?: ReactNode
  onRowClick?: (row: T) => void
  /** breakdown rows rendered under a row with the same column renderers */
  subRows?: (row: T) => T[] | undefined
  /** key for sub-rows (default parentKey + index) */
  subRowKey?: (row: T, index: number) => string
  /**
   * Optional content signature for a sub-row. When given, a sub-row only re-renders when its
   * signature (or the column layout) changes — long breakdowns (by day over months) stay cheap
   * while the sim ticks. Must cover everything the column renderers read from the row.
   */
  subRowSignature?: (row: T) => string
  /** grayed-out rows (off, deleted) */
  rowMuted?: (row: T) => boolean
  highlightedId?: string
  /** scroll height; header and footer stay visible (default 560) */
  maxHeight?: number | string
  dense?: boolean
  loading?: boolean
  emptyState?: ReactNode
  /** remove the top radius (table sits under EntityTabs) */
  attachedTop?: boolean
  className?: string
}

const SEL_W = 40
const TOG_W = 64
const DEFAULT_W = 130

/** Memoized sub-row: re-renders only when `sig` changes (see AmTableProps.subRowSignature). */
const MemoSubRow = memo(
  function MemoSubRow({ render }: { sig: string; render: () => ReactNode }) {
    return <>{render()}</>
  },
  (a, b) => a.sig === b.sig,
)

function cmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' })
}

/** Sort helper matching AmTable's behavior (null/undefined last). */
export function amSortRows<T>(rows: T[], columns: AmColumn<T>[], sort: AmSort | null | undefined): T[] {
  if (!sort) return rows
  const col = columns.find(c => c.id === sort.columnId)
  if (!col?.sortValue) return rows
  const dir = sort.direction === 'asc' ? 1 : -1
  return rows
    .map((r, i) => ({ r, i, v: col.sortValue!(r) }))
    .sort((x, y) => {
      const nx = x.v === null || x.v === undefined || (typeof x.v === 'number' && !Number.isFinite(x.v))
      const ny = y.v === null || y.v === undefined || (typeof y.v === 'number' && !Number.isFinite(y.v))
      if (nx !== ny) return nx ? 1 : -1
      if (nx && ny) return x.i - y.i
      return cmp(x.v, y.v) * dir || x.i - y.i
    })
    .map(x => x.r)
}

/**
 * The Ads Manager grid. Columns render any node; use StatusCell / MetricCell / BudgetCell / AmNameCell.
 * Sorting is internal unless `sort` is controlled.
 */
export function AmTable<T>({
  rows, columns, rowKey, theme, selectable = true, selectedIds, onSelectionChange, toggle, sort, defaultSort, onSortChange, totals = true,
  entityName = { singular: 'item', plural: 'items' }, totalsLabel, totalsSubLabel, onRowClick, subRows, subRowKey, subRowSignature, rowMuted, highlightedId,
  maxHeight = 560, dense, loading, emptyState, attachedTop, className,
}: AmTableProps<T>) {
  const t = useAmTheme(theme)
  const [innerSel, setInnerSel] = useState<string[]>([])
  const sel = selectedIds ?? innerSel
  const setSel = (ids: string[]) => {
    if (selectedIds === undefined) setInnerSel(ids)
    onSelectionChange?.(ids)
  }
  const [innerSort, setInnerSort] = useState<AmSort | null>(defaultSort ?? null)
  const activeSort = sort === undefined ? innerSort : sort
  const [widths, setWidths] = useState<Record<string, number>>({})
  const [resizing, setResizing] = useState<string | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const drag = useRef<{ id: string; x: number; w: number } | null>(null)

  const sorted = useMemo(() => amSortRows(rows, columns, activeSort), [rows, columns, activeSort])
  const ids = useMemo(() => sorted.map(rowKey), [sorted, rowKey])
  const selSet = new Set(sel)
  const selCount = ids.filter(id => selSet.has(id)).length
  const allState: boolean | 'indeterminate' = selCount === 0 ? false : selCount === ids.length ? true : 'indeterminate'

  const colW = (c: AmColumn<T>) => widths[c.id] ?? c.width ?? DEFAULT_W
  // left offsets for sticky cells: selection, toggle, then leading sticky columns
  const leftOf = new Map<string, number>()
  let acc = 0
  if (selectable) {
    leftOf.set('__sel', acc)
    acc += SEL_W
  }
  if (toggle) {
    leftOf.set('__tog', acc)
    acc += TOG_W
  }
  let lastSticky: string | null = toggle ? '__tog' : selectable ? '__sel' : null
  for (const c of columns) {
    if (!c.sticky) break
    leftOf.set(c.id, acc)
    acc += colW(c)
    lastSticky = c.id
  }
  const tableWidth = (selectable ? SEL_W : 0) + (toggle ? TOG_W : 0) + columns.reduce((s, c) => s + colW(c), 0)
  const stickyCls = (id: string) => leftOf.has(id) && cx('am-table-sticky', id === lastSticky && 'am-table-sticky-last')
  const stickyStyle = (id: string) => (leftOf.has(id) ? { left: leftOf.get(id) } : undefined)

  const onHeaderClick = (c: AmColumn<T>) => {
    if (!c.sortValue || drag.current) return
    let direction: AmSortDirection
    if (activeSort?.columnId === c.id) direction = activeSort.direction === 'desc' ? 'asc' : 'desc'
    else {
      const sample = rows.map(c.sortValue).find(v => v !== null && v !== undefined)
      direction = typeof sample === 'string' ? 'asc' : 'desc'
    }
    const next = { columnId: c.id, direction }
    if (sort === undefined) setInnerSort(next)
    onSortChange?.(next)
  }

  const startResize = (e: PointerEvent<HTMLSpanElement>, c: AmColumn<T>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: c.id, x: e.clientX, w: colW(c) }
    setResizing(c.id)
  }
  const moveResize = (e: PointerEvent<HTMLSpanElement>, c: AmColumn<T>) => {
    const d = drag.current
    if (!d || d.id !== c.id) return
    const min = c.minWidth ?? 64
    setWidths(w => ({ ...w, [c.id]: Math.max(min, Math.round(d.w + e.clientX - d.x)) }))
  }
  const endResize = (e: PointerEvent<HTMLSpanElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    // keep drag set until after the click event fired by this pointerup, so it doesn't sort
    setTimeout(() => {
      drag.current = null
    }, 0)
    setResizing(null)
  }

  const onRow = (e: MouseEvent<HTMLTableRowElement>, row: T) => {
    if (!onRowClick) return
    const target = e.target as HTMLElement
    if (target.closest('button, a, input, label, [role="switch"], [data-no-row-click]')) return
    onRowClick(row)
  }

  const renderCells = (row: T, isSub: boolean) =>
    columns.map((c, ci) => {
      const acts = !isSub && c.hoverActions ? c.hoverActions(row) : null
      const content = c.render(row)
      return (
        <td
          key={c.id}
          className={cx(stickyCls(c.id), c.align === 'right' && 'am-table-right', c.align === 'center' && 'am-table-center')}
          style={stickyStyle(c.id)}
        >
          {isSub && ci === 0 ? <span className="am-subrow-indent">{content}</span> : content}
          {acts && acts.length > 0 && (
            <div className="am-rowactions">
              {acts.map(a => (
                <button
                  key={a.label}
                  type="button"
                  className="am-rowaction"
                  disabled={a.disabled}
                  onClick={e => {
                    e.stopPropagation()
                    a.onClick()
                  }}
                >
                  {a.icon && renderIcon(a.icon, 12, 2)}
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </td>
      )
    })

  const colCount = columns.length + (selectable ? 1 : 0) + (toggle ? 1 : 0)
  // anything that changes how every sub-row is laid out (for memoized breakdown rows)
  const layoutSig = subRowSignature ? `${selectable ? 1 : 0}${toggle ? 1 : 0}:${columns.map(c => `${c.id}/${colW(c)}/${c.align ?? ''}/${c.sticky ? 1 : 0}`).join(',')}` : ''
  const n = sorted.length
  const noun = n === 1 ? entityName.singular : entityName.plural
  const footLabel = totalsLabel ?? (t === 'tiktak' ? `Total of ${n} ${noun}` : `Results from ${n} ${noun}`)
  const footSub = totalsSubLabel ?? (t === 'fadbook' ? 'Excludes deleted items' : undefined)
  const firstCol = columns[0]

  return (
    <div className={cx('am-table-wrap', attachedTop && 'am-table-wrap-flat', resizing && 'am-table-resizing', className)}>
      <div className="am-table-scroll" style={{ maxHeight }} onScroll={e => setScrolled((e.target as HTMLDivElement).scrollLeft > 0)}>
        <table className={cx('am-table', dense && 'am-table-dense', scrolled && 'am-table-scrolled')} style={{ width: tableWidth }}>
          <colgroup>
            {selectable && <col style={{ width: SEL_W }} />}
            {toggle && <col style={{ width: TOG_W }} />}
            {columns.map(c => <col key={c.id} style={{ width: colW(c) }} />)}
          </colgroup>
          <thead>
            <tr>
              {selectable && (
                <th className={cx('am-cell-check', stickyCls('__sel'))} style={stickyStyle('__sel')}>
                  <AmCheckbox
                    checked={allState}
                    ariaLabel={allState === true ? 'Deselect all' : 'Select all'}
                    disabled={!n}
                    onChange={() => setSel(allState === true ? sel.filter(id => !ids.includes(id)) : Array.from(new Set([...sel, ...ids])))}
                  />
                </th>
              )}
              {toggle && (
                <th className={cx('am-cell-toggle', stickyCls('__tog'))} style={stickyStyle('__tog')}>
                  <div className="am-th"><span className="am-th-label">{t === 'tiktak' ? 'On/Off' : 'Off / On'}</span></div>
                </th>
              )}
              {columns.map(c => {
                const isSorted = activeSort?.columnId === c.id
                return (
                  <th
                    key={c.id}
                    className={cx(stickyCls(c.id), c.align === 'right' && 'am-table-right', c.align === 'center' && 'am-table-center')}
                    style={stickyStyle(c.id)}
                    aria-sort={isSorted ? (activeSort!.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    <div className={cx('am-th', c.sortValue && 'am-th-sort')} onClick={() => onHeaderClick(c)}>
                      {c.align === 'right' && c.sortValue && (
                        <span className={cx('am-th-caret', !isSorted && 'am-th-caret-idle')}>
                          {isSorted && activeSort!.direction === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />}
                        </span>
                      )}
                      <span className="am-th-label">{c.header}</span>
                      {c.headerTip && <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex' }}><InfoTip content={c.headerTip} theme={t} size={12} /></span>}
                      {c.align !== 'right' && c.sortValue && (
                        <span className={cx('am-th-caret', !isSorted && 'am-th-caret-idle')}>
                          {isSorted && activeSort!.direction === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />}
                        </span>
                      )}
                    </div>
                    {c.resizable !== false && (
                      <span
                        className={cx('am-th-resize', resizing === c.id && 'am-th-resizing')}
                        onPointerDown={e => startResize(e, c)}
                        onPointerMove={e => moveResize(e, c)}
                        onPointerUp={endResize}
                        onPointerCancel={endResize}
                        onClick={e => e.stopPropagation()}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${typeof c.header === 'string' ? c.header : 'column'}`}
                      />
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {n === 0 ? (
              <tr className="am-table-empty">
                <td colSpan={colCount}>
                  <div className="am-table-empty-inner">{emptyState ?? `No ${entityName.plural} to show for this date range.`}</div>
                </td>
              </tr>
            ) : (
              sorted.map((row, i) => {
                const id = ids[i]
                const isSel = selSet.has(id)
                const subs = subRows?.(row)
                return (
                  <Fragment key={id}>
                    <tr
                      className={cx(
                        (isSel || highlightedId === id) && 'am-row-selected',
                        rowMuted?.(row) && 'am-row-muted',
                        onRowClick && 'am-row-click',
                      )}
                      onClick={e => onRow(e, row)}
                      aria-selected={selectable ? isSel : undefined}
                    >
                      {selectable && (
                        <td className={cx('am-cell-check', stickyCls('__sel'))} style={stickyStyle('__sel')}>
                          <AmCheckbox
                            checked={isSel}
                            ariaLabel={`Select ${entityName.singular}`}
                            onChange={on => setSel(on ? [...sel, id] : sel.filter(x => x !== id))}
                          />
                        </td>
                      )}
                      {toggle && (
                        <td className={cx('am-cell-toggle', stickyCls('__tog'))} style={stickyStyle('__tog')}>
                          <Toggle
                            checked={toggle.isOn(row)}
                            disabled={toggle.disabled?.(row)}
                            busy={toggle.busy?.(row)}
                            ariaLabel={`Turn ${entityName.singular} ${toggle.isOn(row) ? 'off' : 'on'}`}
                            onChange={on => toggle.onChange(row, on)}
                          />
                        </td>
                      )}
                      {renderCells(row, false)}
                    </tr>
                    {subs?.map((sr, si) => {
                      const key = subRowKey ? subRowKey(sr, si) : `${id}::${si}`
                      const tr = () => (
                        <tr className="am-subrow">
                          {selectable && <td className={cx(stickyCls('__sel'))} style={stickyStyle('__sel')} />}
                          {toggle && <td className={cx(stickyCls('__tog'))} style={stickyStyle('__tog')} />}
                          {renderCells(sr, true)}
                        </tr>
                      )
                      return subRowSignature
                        ? <MemoSubRow key={key} sig={`${layoutSig}|${subRowSignature(sr)}`} render={tr} />
                        : <Fragment key={key}>{tr()}</Fragment>
                    })}
                  </Fragment>
                )
              })
            )}
          </tbody>
          {totals && n > 0 && (
            <tfoot>
              <tr>
                {selectable && <td className={cx(stickyCls('__sel'))} style={stickyStyle('__sel')} />}
                {toggle && <td className={cx(stickyCls('__tog'))} style={stickyStyle('__tog')} />}
                {columns.map(c => (
                  <td
                    key={c.id}
                    className={cx(stickyCls(c.id), c.align === 'right' && 'am-table-right', c.align === 'center' && 'am-table-center')}
                    style={stickyStyle(c.id)}
                  >
                    {c === firstCol ? (
                      <span className="am-table-foot-label">
                        <span>{footLabel}</span>
                        {footSub && <small>{footSub}</small>}
                      </span>
                    ) : (
                      c.total?.(sorted)
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {loading && <div className="am-table-loading"><AmSpinner size={24} /></div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Name cell
// ---------------------------------------------------------------------------
export interface AmNameCellProps {
  name: ReactNode
  /** gray line under the name (id, "Advantage+ shopping", ad format) */
  sub?: ReactNode
  /** leading visual (creative thumbnail, icon) */
  leading?: ReactNode
  /** clicking the name drills down / opens the editor */
  onClick?: () => void
  /** badges after the name */
  badges?: ReactNode
}
/** Entity name column content: link-styled name, optional thumbnail and sub-line. */
export function AmNameCell({ name, sub, leading, onClick, badges }: AmNameCellProps) {
  return (
    <div className="am-name">
      <div className="am-name-main">
        {leading}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {onClick ? (
              <button type="button" className="am-name-link" onClick={e => { e.stopPropagation(); onClick() }} title={typeof name === 'string' ? name : undefined}>
                {name}
              </button>
            ) : (
              <span className="am-cell-clip" style={{ fontWeight: 600 }}>{name}</span>
            )}
            {badges}
          </span>
          {sub && <span className="am-name-sub">{sub}</span>}
        </div>
      </div>
    </div>
  )
}
