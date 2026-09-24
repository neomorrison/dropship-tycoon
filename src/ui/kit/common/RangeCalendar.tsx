// Month-grid range calendar for the in-game calendar (Day 0 = Mon Mar 2, 2026).
// Themed through CSS variables so Polaris (dark endpoints) and Ads Manager
// (blue / teal endpoints) share one implementation:
//   --kx-cal-accent, --kx-cal-accent-text, --kx-cal-range, --kx-cal-radius, --kx-cal-font
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Day } from '../../../core/types'
import { cx } from './utils'
import { addMonths, monthGrid, monthTitle, WEEKDAY_INITIALS, ymOf, type DateRange } from './dates'
import './common.css'

export interface RangeCalendarProps {
  /** selected range (null = nothing selected yet) */
  value: DateRange | null
  /** fires on every click: first click → single-day range, second click → full range */
  onChange: (range: DateRange) => void
  /** first visible month (controlled); defaults to the month of value.to */
  view?: { year: number; month0: number }
  onViewChange?: (v: { year: number; month0: number }) => void
  /** 1 or 2 months side by side (default 2) */
  months?: 1 | 2
  /** earliest selectable day (default 0 = game start) */
  minDay?: Day
  /** latest selectable day (usually today) */
  maxDay?: Day
  /** mark this day with a dot (today) */
  today?: Day
  className?: string
}

/** Two-click range calendar with hover preview. */
export function RangeCalendar({ value, onChange, view, onViewChange, months = 2, minDay = 0, maxDay, today, className }: RangeCalendarProps) {
  const initial = ymOf(value?.to ?? today ?? 0)
  const [innerView, setInnerView] = useState(() => (months === 2 ? addMonths(initial, -1) : initial))
  const v = view ?? innerView
  const setView = (nv: { year: number; month0: number }) => {
    if (!view) setInnerView(nv)
    onViewChange?.(nv)
  }
  // anchor = first click of a new range
  const [anchor, setAnchor] = useState<Day | null>(null)
  const [hover, setHover] = useState<Day | null>(null)

  const lo = anchor !== null && hover !== null ? Math.min(anchor, hover) : value?.from ?? null
  const hi = anchor !== null && hover !== null ? Math.max(anchor, hover) : anchor !== null ? anchor : value?.to ?? null
  const shown = Array.from({ length: months }, (_, i) => addMonths(v, i))
  const disabled = (d: Day) => d < minDay || (maxDay !== undefined && d > maxDay)
  const canPrev = monthGridFirst(v) > minDay
  const lastShown = shown[shown.length - 1]
  const canNext = maxDay === undefined || monthGridFirst(addMonths(lastShown, 1)) <= maxDay

  const click = (d: Day) => {
    if (disabled(d)) return
    if (anchor === null) {
      setAnchor(d)
      onChange({ from: d, to: d })
    } else {
      onChange({ from: Math.min(anchor, d), to: Math.max(anchor, d) })
      setAnchor(null)
      setHover(null)
    }
  }

  return (
    <div className={cx('kx-cal', className)} onMouseLeave={() => setHover(null)}>
      {shown.map((m, mi) => (
        <div key={`${m.year}-${m.month0}`} className="kx-cal-month">
          <div className="kx-cal-head">
            {mi === 0 ? (
              <button type="button" className="kx-cal-nav" aria-label="Previous month" disabled={!canPrev} onClick={() => setView(addMonths(v, -1))}>
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
            ) : (
              <span className="kx-cal-nav-spacer" />
            )}
            <span className="kx-cal-title">{monthTitle(m.year, m.month0)}</span>
            {mi === shown.length - 1 ? (
              <button type="button" className="kx-cal-nav" aria-label="Next month" disabled={!canNext} onClick={() => setView(addMonths(v, 1))}>
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            ) : (
              <span className="kx-cal-nav-spacer" />
            )}
          </div>
          <div className="kx-cal-grid" role="grid">
            {WEEKDAY_INITIALS.map(w => (
              <span key={w} className="kx-cal-wd" role="columnheader">{w}</span>
            ))}
            {monthGrid(m.year, m.month0).flat().map(c => {
              if (!c.inMonth) return <span key={c.day} className="kx-cal-blank" />
              const dis = disabled(c.day)
              const inRange = lo !== null && hi !== null && c.day >= lo && c.day <= hi
              const isStart = lo !== null && c.day === lo
              const isEnd = hi !== null && c.day === hi
              return (
                <button
                  key={c.day}
                  type="button"
                  role="gridcell"
                  disabled={dis}
                  aria-selected={inRange}
                  className={cx(
                    'kx-cal-day',
                    inRange && 'kx-cal-in',
                    isStart && 'kx-cal-start',
                    isEnd && 'kx-cal-end',
                    today === c.day && 'kx-cal-today',
                  )}
                  onMouseEnter={() => anchor !== null && setHover(c.day)}
                  onClick={() => click(c.day)}
                >
                  <span>{c.dom}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function monthGridFirst(ym: { year: number; month0: number }): Day {
  const g = monthGrid(ym.year, ym.month0).flat()
  return g.find(c => c.inMonth)!.day
}
