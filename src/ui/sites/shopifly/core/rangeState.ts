// Date-range + comparison selections for Shopifly analytics screens. Like the real admin,
// the chosen range follows you between Analytics, Reports and Marketing during a session.
// UI-only (not saved with the game).
import { useCallback, useMemo } from 'react'
import { create } from 'zustand'
import type { Day } from '../../../../core/types'
import {
  comparisonRange, resolvePreset, type ComparisonMode, type DatePresetId, type DateRange, type DateRangeValue, type PresetDef,
} from '../../../kit/common'

/** Shopifly analytics presets (ranges include today, like Shopify). */
export const SF_PRESETS: PresetDef[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'last90', label: 'Last 90 days' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'monthToDate', label: 'Month to date' },
  { id: 'yearToDate', label: 'Year to date' },
]

export type RangeScope = 'analytics' | 'home' | 'orders' | 'marketing' | 'finance' | 'live'

interface Entry { preset: DatePresetId | 'custom'; custom: DateRange | null; compare: ComparisonMode }
interface RangeStore {
  entries: Partial<Record<RangeScope, Entry>>
  set: (scope: RangeScope, e: Partial<Entry>) => void
}

const DEFAULTS: Record<RangeScope, Entry> = {
  analytics: { preset: 'last30', custom: null, compare: 'previous_period' },
  home: { preset: 'today', custom: null, compare: 'previous_period' },
  orders: { preset: 'today', custom: null, compare: 'previous_period' },
  marketing: { preset: 'last30', custom: null, compare: 'previous_period' },
  finance: { preset: 'last30', custom: null, compare: 'previous_period' },
  live: { preset: 'today', custom: null, compare: 'previous_period' },
}

const useRangeStore = create<RangeStore>()(set => ({
  entries: {},
  set: (scope, e) => set(st => ({ entries: { ...st.entries, [scope]: { ...(st.entries[scope] ?? DEFAULTS[scope]), ...e } } })),
}))

export interface SfRange {
  value: DateRangeValue
  setValue: (v: DateRangeValue) => void
  compare: ComparisonMode
  setCompare: (m: ComparisonMode) => void
  range: DateRange
  /** comparison range (null = no comparison) */
  cmp: DateRange | null
}

/** Current range for a screen, re-resolved against the in-game day as time passes. */
export function useSfRange(scope: RangeScope, today: Day): SfRange {
  const entry = useRangeStore(st => st.entries[scope]) ?? DEFAULTS[scope]
  const setEntry = useRangeStore(st => st.set)
  const range = useMemo<DateRange>(() => {
    if (entry.preset === 'custom' && entry.custom) return { from: entry.custom.from, to: Math.min(entry.custom.to, today) }
    return resolvePreset(entry.preset === 'custom' ? 'last30' : entry.preset, today, 'shop')
  }, [entry.preset, entry.custom, today])
  const value = useMemo<DateRangeValue>(() => ({ preset: entry.preset, range }), [entry.preset, range])
  const setValue = useCallback(
    (v: DateRangeValue) => setEntry(scope, { preset: v.preset, custom: v.preset === 'custom' ? v.range : null }),
    [setEntry, scope],
  )
  const setCompare = useCallback((m: ComparisonMode) => setEntry(scope, { compare: m }), [setEntry, scope])
  const cmp = useMemo(() => comparisonRange(range, entry.compare), [range, entry.compare])
  return { value, setValue, compare: entry.compare, setCompare, range, cmp }
}
