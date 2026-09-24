// Ads Manager toolbar pickers: date range (Today … Maximum), Columns (presets +
// "Customize columns" modal) and Breakdown (By day / week / delivery).
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, CalendarDays, Columns3, Lock, SlidersHorizontal, X } from 'lucide-react'
import type { Day } from '../../../core/types'
import { cx } from '../common/utils'
import { RangeCalendar } from '../common/RangeCalendar'
import {
  ADS_PRESETS, addMonths, formatRange, presetLabel, resolvePreset, ymOf,
  type DateRange, type DateRangeValue, type PresetDef,
} from '../common/dates'
import { useAmTheme, type AmTheme } from './theme'
import { AmButton, AmCheckbox, AmInput, AmSearch } from './controls'
import { AmMenu, AmModal, type AmMenuSection } from './overlays'
import './adsmanager.css'

// ---------------------------------------------------------------------------
// DateRangePicker (ads)
// ---------------------------------------------------------------------------
export interface AmDateRangePickerProps {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  /** current in-game day */
  today: Day
  /** presets (default Today, Yesterday, Last 7/14/30 days, This month, Last month, Maximum) */
  presets?: PresetDef[]
  /** earliest day with data (default 0) */
  minDay?: Day
  size?: 'sm' | 'md'
  align?: 'left' | 'right'
  theme?: AmTheme
}
/**
 * "Last 7 days: Mar 3, 2026 – Mar 9, 2026" button with presets + calendar.
 * Ads presets are complete days (exclude today) exactly like the real Ads Managers.
 */
export function AmDateRangePicker({
  value, onChange, today, presets = ADS_PRESETS, minDay = 0, size = 'md', align = 'right', theme,
}: AmDateRangePickerProps) {
  const t = useAmTheme(theme)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRangeValue>(value)
  const twoMonths = typeof window === 'undefined' || window.innerWidth >= 820
  const [view, setView] = useState(() => addMonths(ymOf(value.range.to), twoMonths ? -1 : 0))
  useEffect(() => {
    if (!open) return
    setDraft(value)
    setView(addMonths(ymOf(value.range.to), twoMonths ? -1 : 0))
  }, [open]) // only when opening: keep the draft while picking
  const clamp = (r: DateRange): DateRange => ({ from: Math.max(minDay, Math.min(today, r.from)), to: Math.max(minDay, Math.min(today, r.to)) })
  const pick = (id: PresetDef['id']) => {
    const r = clamp(resolvePreset(id, today, 'ads'))
    setDraft({ preset: id, range: r })
    setView(addMonths(ymOf(r.to), twoMonths ? -1 : 0))
  }
  const label = presetLabel(value)
  const trigger = (
    <AmButton size={size} icon={CalendarDays} caret pressed={open} className="am-drp-trigger">
      <span className="am-drp-trigger-label">
        {value.preset !== 'custom' && <b>{label}:</b>}
        <span className="am-drp-trigger-dates">{formatRange(value.range)}</span>
      </span>
    </AmButton>
  )
  return (
    <AmMenu
      trigger={trigger}
      open={open}
      onOpenChange={setOpen}
      closeOnSelect={false}
      placement={align === 'right' ? 'bottom-end' : 'bottom-start'}
      fluid
      theme={t}
    >
      <div className="am-drp" style={{ margin: -6 }}>
        <div className="am-drp-presets" role="radiogroup" aria-label="Date presets">
          <span className="am-drp-presets-title">{t === 'tiktak' ? 'Quick select' : 'Recently used'}</span>
          {presets.map(p => (
            <button key={p.id} type="button" role="radio" aria-checked={draft.preset === p.id} className={cx('am-drp-preset', draft.preset === p.id && 'am-drp-preset-on')} onClick={() => pick(p.id)}>
              <span className={cx('am-radio-dot', draft.preset === p.id && 'am-radio-dot-on')} aria-hidden />
              {p.label}
            </button>
          ))}
        </div>
        <div className="am-drp-main">
          <div className="am-drp-fields">
            <span className="am-drp-field">{formatRange({ from: draft.range.from, to: draft.range.from })}</span>
            <span style={{ color: 'var(--am-text-3)' }}>–</span>
            <span className="am-drp-field">{formatRange({ from: draft.range.to, to: draft.range.to })}</span>
          </div>
          <RangeCalendar
            value={draft.range}
            onChange={r => setDraft({ preset: 'custom', range: r })}
            view={view}
            onViewChange={setView}
            months={twoMonths ? 2 : 1}
            minDay={minDay}
            maxDay={today}
            today={today}
          />
          <div className="am-drp-foot">
            <span className="am-drp-tz">Dates are shown in Pacific Time</span>
            <AmButton size="sm" onClick={() => setOpen(false)}>Cancel</AmButton>
            <AmButton
              size="sm"
              variant="primary"
              onClick={() => {
                onChange(draft)
                setOpen(false)
              }}
            >
              Update
            </AmButton>
          </div>
        </div>
      </div>
    </AmMenu>
  )
}

// ---------------------------------------------------------------------------
// ColumnsMenu
// ---------------------------------------------------------------------------
export interface AmColumnDef {
  id: string
  label: string
  /** grouping in the customize modal ("Performance", "Engagement", "Conversions", "Video"…) */
  category?: string
  description?: string
}
export interface AmColumnPreset {
  id: string
  label: string
  columns: string[]
  /** player-saved preset (shows a remove button) */
  custom?: boolean
}
export interface ColumnsValue {
  /** preset id, or 'custom' for an unsaved customization */
  presetId: string
  columns: string[]
}
export interface ColumnsMenuProps {
  presets: AmColumnPreset[]
  /** every column the player can pick in "Customize columns" */
  allColumns: AmColumnDef[]
  value: ColumnsValue
  onChange: (value: ColumnsValue) => void
  /** always shown, not removable (e.g. 'name', 'delivery') */
  locked?: string[]
  /**
   * saving a named preset from the customize modal; return the new preset's id so the menu
   * selects it (otherwise the value becomes `custom:<name>`)
   */
  onSavePreset?: (name: string, columns: string[]) => string | void
  onDeletePreset?: (presetId: string) => void
  size?: 'sm' | 'md'
  theme?: AmTheme
}
/** "Columns: Performance ▾" with presets and a full column customizer. */
export function ColumnsMenu({ presets, allColumns, value, onChange, locked = [], onSavePreset, onDeletePreset, size = 'md', theme }: ColumnsMenuProps) {
  const t = useAmTheme(theme)
  const [modal, setModal] = useState(false)
  const current = presets.find(p => p.id === value.presetId)
  const label = t === 'tiktak' ? (current ? current.label : 'Custom columns') : `Columns: ${current ? current.label : 'Custom'}`
  const builtIn = presets.filter(p => !p.custom)
  const saved = presets.filter(p => p.custom)
  const sections: AmMenuSection[] = [
    { title: t === 'tiktak' ? 'Default' : 'Presets', items: builtIn.map(p => ({ id: p.id, label: p.label, checked: p.id === value.presetId, onSelect: () => onChange({ presetId: p.id, columns: p.columns }) })) },
  ]
  if (saved.length) {
    sections.push({
      title: 'Saved presets',
      items: saved.map(p => ({
        id: p.id,
        label: p.label,
        checked: p.id === value.presetId,
        suffix: onDeletePreset ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Delete ${p.label}`}
            onClick={e => {
              e.stopPropagation()
              onDeletePreset(p.id)
            }}
            style={{ display: 'inline-flex' }}
          >
            <X size={14} strokeWidth={2} />
          </span>
        ) : undefined,
        onSelect: () => onChange({ presetId: p.id, columns: p.columns }),
      })),
    })
  }
  sections.push({ items: [{ id: '__customize', label: 'Customize columns…', icon: SlidersHorizontal, onSelect: () => setModal(true) }] })
  return (
    <>
      <AmMenu trigger={<AmButton size={size} icon={Columns3} caret>{label}</AmButton>} sections={sections} checkable width={240} theme={t} />
      {modal && (
        <CustomizeColumnsModal
          allColumns={allColumns}
          initial={value.columns}
          locked={locked}
          canSave={!!onSavePreset}
          theme={t}
          onClose={() => setModal(false)}
          onApply={(cols, saveName) => {
            const savedId = saveName && onSavePreset ? onSavePreset(saveName, cols) : undefined
            onChange({ presetId: saveName ? savedId || `custom:${saveName}` : 'custom', columns: cols })
            setModal(false)
          }}
        />
      )}
    </>
  )
}

function CustomizeColumnsModal({ allColumns, initial, locked, canSave, theme, onClose, onApply }: {
  allColumns: AmColumnDef[]
  initial: string[]
  locked: string[]
  canSave: boolean
  theme: AmTheme
  onClose: () => void
  onApply: (columns: string[], saveName: string | null) => void
}) {
  const [picked, setPicked] = useState<string[]>(() => Array.from(new Set([...locked, ...initial])))
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<string>('all')
  const [save, setSave] = useState(false)
  const [name, setName] = useState('')
  const byId = useMemo(() => new Map(allColumns.map(c => [c.id, c])), [allColumns])
  const categories = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of allColumns) m.set(c.category ?? 'Other', (m.get(c.category ?? 'Other') ?? 0) + 1)
    return [...m.entries()]
  }, [allColumns])
  const q = query.trim().toLowerCase()
  const visible = allColumns.filter(
    c => (cat === 'all' || (c.category ?? 'Other') === cat) && (!q || c.label.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)),
  )
  const groups = new Map<string, AmColumnDef[]>()
  for (const c of visible) {
    const g = c.category ?? 'Other'
    groups.set(g, [...(groups.get(g) ?? []), c])
  }
  const toggle = (id: string, on: boolean) => {
    if (locked.includes(id)) return
    setPicked(p => (on ? [...p, id] : p.filter(x => x !== id)))
  }
  const move = (i: number, d: -1 | 1) =>
    setPicked(p => {
      const j = i + d
      if (j < 0 || j >= p.length || locked.includes(p[j]) || locked.includes(p[i])) return p
      const n = [...p]
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
  return (
    <AmModal
      open
      onClose={onClose}
      title="Customize columns"
      subtitle="Choose the metrics you want to see, then use the arrows to put them in order."
      size="xl"
      flush
      theme={theme}
      footerLeft={
        canSave ? (
          <span className="am-cols-save">
            <AmCheckbox checked={save} onChange={setSave} label="Save as preset" />
            {save && <AmInput value={name} onChange={setName} placeholder="Preset name" size="sm" width={200} maxLength={40} />}
          </span>
        ) : undefined
      }
      footer={
        <>
          <AmButton onClick={onClose}>Cancel</AmButton>
          <AmButton variant="primary" disabled={!picked.length || (save && !name.trim())} onClick={() => onApply(picked, save ? name.trim() : null)}>
            Apply
          </AmButton>
        </>
      }
    >
      <div className="am-cols">
        <div className="am-cols-cats">
          <button type="button" className={cx('am-cols-cat', cat === 'all' && 'am-cols-cat-on')} onClick={() => setCat('all')}>
            All metrics <small>{allColumns.length}</small>
          </button>
          {categories.map(([c, n]) => (
            <button key={c} type="button" className={cx('am-cols-cat', cat === c && 'am-cols-cat-on')} onClick={() => setCat(c)}>
              {c} <small>{n}</small>
            </button>
          ))}
        </div>
        <div className="am-cols-list">
          <AmSearch value={query} onChange={setQuery} placeholder="Search metrics" />
          {[...groups.entries()].map(([g, cols]) => (
            <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="am-cols-group-title">{g}</span>
              {cols.map(c => (
                <AmCheckbox
                  key={c.id}
                  checked={picked.includes(c.id)}
                  disabled={locked.includes(c.id)}
                  onChange={on => toggle(c.id, on)}
                  label={c.label}
                  description={c.description}
                />
              ))}
            </div>
          ))}
          {!visible.length && <span style={{ color: 'var(--am-text-2)' }}>No metrics match “{query}”.</span>}
        </div>
        <div className="am-cols-picked">
          <div className="am-cols-picked-head">{picked.length} columns selected</div>
          <div className="am-cols-picked-list">
            {picked.map((id, i) => {
              const isLocked = locked.includes(id)
              return (
                <div key={id} className={cx('am-cols-picked-item', isLocked && 'am-cols-picked-item-locked')}>
                  {isLocked && <Lock size={12} strokeWidth={2} />}
                  <span>{byId.get(id)?.label ?? id}</span>
                  <button type="button" aria-label="Move up" disabled={isLocked || i === 0 || locked.includes(picked[i - 1])} onClick={() => move(i, -1)}>
                    <ArrowUp size={14} strokeWidth={2} />
                  </button>
                  <button type="button" aria-label="Move down" disabled={isLocked || i === picked.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown size={14} strokeWidth={2} />
                  </button>
                  <button type="button" aria-label="Remove" disabled={isLocked} onClick={() => toggle(id, false)}>
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </AmModal>
  )
}

// ---------------------------------------------------------------------------
// BreakdownMenu
// ---------------------------------------------------------------------------
export interface BreakdownOption {
  id: string
  label: string
  disabled?: boolean
  /** tooltip for disabled options (e.g. "Unlocks at Media buying level 3") */
  disabledReason?: ReactNode
}
export interface BreakdownSection {
  title: string
  items: BreakdownOption[]
}
/** Default breakdowns: By time (Day/Week/Month) and By delivery (Age/Gender/Placement/Device). */
export const DEFAULT_BREAKDOWNS: BreakdownSection[] = [
  { title: 'By time', items: [{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }] },
  {
    title: 'By delivery',
    items: [
      { id: 'age', label: 'Age' }, { id: 'gender', label: 'Gender' }, { id: 'placement', label: 'Placement' },
      { id: 'device', label: 'Impression device' },
    ],
  },
]
export interface BreakdownMenuProps {
  /** selected breakdown id, or null */
  value: string | null
  onChange: (id: string | null) => void
  sections?: BreakdownSection[]
  disabled?: boolean
  size?: 'sm' | 'md'
  theme?: AmTheme
}
/** "Breakdown ▾" menu; shows the active breakdown with a clear button. */
export function BreakdownMenu({ value, onChange, sections = DEFAULT_BREAKDOWNS, disabled, size = 'md', theme }: BreakdownMenuProps) {
  const t = useAmTheme(theme)
  const all = sections.flatMap(s => s.items)
  const cur = all.find(i => i.id === value)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <AmMenu
        trigger={<AmButton size={size} caret disabled={disabled} pressed={!!cur}>{cur ? `Breakdown: ${cur.label}` : 'Breakdown'}</AmButton>}
        disabled={disabled}
        width={220}
        theme={t}
        sections={sections.map(s => ({
          title: s.title,
          items: s.items.map(i => ({
            id: i.id, label: i.label, checked: i.id === value, disabled: i.disabled, disabledReason: i.disabledReason,
            onSelect: () => onChange(i.id),
          })),
        }))}
        footer={cur ? <AmButton size="sm" variant="tertiary" onClick={() => onChange(null)}>Clear breakdown</AmButton> : undefined}
      />
      {cur && <AmButton size={size} variant="tertiary" icon={X} ariaLabel="Clear breakdown" onClick={() => onChange(null)} />}
    </span>
  )
}
