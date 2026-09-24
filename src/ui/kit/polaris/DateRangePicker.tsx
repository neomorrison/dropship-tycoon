// Shopify-analytics style date range picker: preset list + Starting/Ending fields +
// two-month calendar + Cancel/Apply. Also the "Compare to" picker.
import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays } from 'lucide-react'
import type { Day } from '../../../core/types'
import { formatDate } from '../../../core/time'
import { RangeCalendar } from '../common/RangeCalendar'
import {
  SHOP_PRESETS, comparisonRange, formatRange, parseDayInput, presetLabel, resolvePreset, ymOf, addMonths,
  type ComparisonMode, type DateRange, type DateRangeValue, type PresetDef,
} from '../common/dates'
import { Button } from './Button'
import { TextField } from './forms'
import { ActionList, Popover } from './overlays'
import './polaris.css'
import './date.css'

export interface DateRangePickerProps {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  /** current in-game day (last selectable day) */
  today: Day
  /** preset list (default Shopify analytics presets) */
  presets?: PresetDef[]
  /** 'shop' = last-N includes today (Shopify); 'ads' = complete days only */
  presetStyle?: 'shop' | 'ads'
  /** earliest selectable day (default 0 = game start) */
  minDay?: Day
  disabled?: boolean
  size?: 'slim' | 'medium'
  alignment?: 'left' | 'right'
}

/**
 * `const [range, setRange] = useDateRangeState(today, 'last30')`
 * `<DateRangePicker value={range} onChange={setRange} today={today} />`
 */
export function DateRangePicker({
  value, onChange, today, presets = SHOP_PRESETS, presetStyle = 'shop', minDay = 0, disabled, size = 'medium', alignment = 'left',
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRangeValue>(value)
  const [view, setView] = useState(() => addMonths(ymOf(value.range.to), -1))
  const [fromText, setFromText] = useState('')
  const [toText, setToText] = useState('')
  // two months side by side when the window can fit ~760px of popover
  const twoMonths = typeof window === 'undefined' || window.innerWidth >= 820

  // reset the draft whenever the popover opens
  useEffect(() => {
    if (!open) return
    setDraft(value)
    setView(addMonths(ymOf(value.range.to), -1))
  }, [open]) // only on open: keep the draft while the popover is up
  useEffect(() => {
    setFromText(formatDate(draft.range.from, 'iso'))
    setToText(formatDate(draft.range.to, 'iso'))
  }, [draft.range.from, draft.range.to])

  const clampDay = (d: Day) => Math.max(minDay, Math.min(today, d))
  const pickPreset = (id: PresetDef['id']) => {
    const r = resolvePreset(id, today, presetStyle)
    const range = { from: clampDay(r.from), to: clampDay(r.to) }
    setDraft({ preset: id, range })
    setView(addMonths(ymOf(range.to), twoMonths ? -1 : 0))
  }
  const setCustom = (range: DateRange) => setDraft({ preset: 'custom', range })
  const commitText = (which: 'from' | 'to', text: string) => {
    const d = parseDayInput(text)
    if (d === null) return
    const c = clampDay(d)
    const r = which === 'from' ? { from: c, to: Math.max(c, draft.range.to) } : { from: Math.min(c, draft.range.from), to: c }
    setCustom(r)
    setView(addMonths(ymOf(r.to), twoMonths ? -1 : 0))
  }

  return (
    <Popover
      active={open}
      onClose={() => setOpen(false)}
      preferredAlignment={alignment}
      fluidContent
      maxHeight={640}
      activator={
        <Button icon={CalendarDays} size={size === 'slim' ? 'slim' : 'medium'} disabled={disabled} pressed={open} onClick={() => setOpen(o => !o)}>
          {presetLabel(value)}
        </Button>
      }
    >
      <div className="p-drp">
        <div className="p-drp-presets">
          <ActionList
            items={presets.map(p => ({ content: p.label, active: draft.preset === p.id, onAction: () => pickPreset(p.id) }))}
          />
        </div>
        <div className="p-drp-main">
          <div className="p-drp-inputs">
            <TextField
              label="Starting"
              labelHidden
              value={fromText}
              onChange={setFromText}
              onBlur={() => commitText('from', fromText)}
              onEnter={() => commitText('from', fromText)}
              prefix={<CalendarDays size={16} strokeWidth={1.75} />}
              size="slim"
            />
            <span className="p-drp-arrow"><ArrowRight size={16} strokeWidth={2} /></span>
            <TextField
              label="Ending"
              labelHidden
              value={toText}
              onChange={setToText}
              onBlur={() => commitText('to', toText)}
              onEnter={() => commitText('to', toText)}
              prefix={<CalendarDays size={16} strokeWidth={1.75} />}
              size="slim"
            />
          </div>
          <RangeCalendar
            className="p-drp-cal"
            value={draft.range}
            onChange={setCustom}
            view={view}
            onViewChange={setView}
            months={twoMonths ? 2 : 1}
            minDay={minDay}
            maxDay={today}
            today={today}
          />
          <div className="p-drp-foot">
            <span className="p-drp-summary">{formatRange(draft.range)}</span>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                onChange(draft)
                setOpen(false)
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// ComparisonPicker
// ---------------------------------------------------------------------------
export interface ComparisonPickerProps {
  value: ComparisonMode
  onChange: (mode: ComparisonMode) => void
  /** the primary range, used to show the actual comparison dates */
  range: DateRange
  disabled?: boolean
  size?: 'slim' | 'medium'
}
const COMPARE_LABEL: Record<ComparisonMode, string> = {
  previous_period: 'Previous period',
  previous_year: 'Previous year',
  none: 'No comparison',
}
/** "Compare to: Previous period" dropdown next to the DateRangePicker. */
export function ComparisonPicker({ value, onChange, range, disabled, size = 'medium' }: ComparisonPickerProps) {
  const [open, setOpen] = useState(false)
  const cmp = comparisonRange(range, value)
  return (
    <Popover
      active={open}
      onClose={() => setOpen(false)}
      activator={
        <Button size={size === 'slim' ? 'slim' : 'medium'} disabled={disabled} pressed={open} onClick={() => setOpen(o => !o)} disclosure>
          {cmp ? `Compare to: ${formatRange(cmp)}` : 'No comparison'}
        </Button>
      }
    >
      <ActionList
        items={(Object.keys(COMPARE_LABEL) as ComparisonMode[]).map(m => {
          const r = comparisonRange(range, m)
          return {
            content: COMPARE_LABEL[m],
            helpText: r ? formatRange(r) : undefined,
            active: m === value,
            checkable: true,
            onAction: () => onChange(m),
          }
        })}
        onActionAnyItem={() => setOpen(false)}
      />
    </Popover>
  )
}

export type { ComparisonMode }
