// UI-only state for the TikTak Ads Manager (not saved with the game): selected ad account,
// date ranges, table columns & presets, filters and selections. Survives page navigation
// inside the site and closing/reopening the tab.
import { create } from 'zustand'
import type { AdLevel, Day } from '../../../core/types'
import { resolvePreset, type DatePresetId, type DateRangeValue } from '../../kit/common'

export type StatusFilter =
  | 'all_but_deleted' | 'all' | 'active' | 'learning' | 'limited' | 'not_delivering' | 'in_review' | 'rejected' | 'inactive' | 'deleted'

export interface SavedPreset { id: string; label: string; columns: string[] }

interface StoredRange { preset: DatePresetId | 'custom'; from: Day; to: Day }

interface TtUiState {
  accountId: string | null
  ranges: Record<string, StoredRange>
  level: AdLevel
  /** selected ids per level (selection in a parent tab filters the child tabs) */
  selected: Record<AdLevel, string[]>
  statusFilter: StatusFilter
  search: string
  columnsPreset: string
  columns: string[] | null
  customPresets: SavedPreset[]
  breakdown: string | null
  showChart: boolean
  chartMetric: string
  /** color CPA / ROAS against the landing product's break-even (player opt-in) */
  beHighlight: boolean
  dashMetrics: string[]
  /** one-shot success message shown on the Campaign page after publishing */
  flash: string | null
  set: (p: Partial<TtUiState>) => void
}

export const useTtUi = create<TtUiState>()(set => ({
  accountId: null,
  ranges: {},
  level: 'campaign',
  selected: { campaign: [], adset: [], ad: [] },
  statusFilter: 'all_but_deleted',
  search: '',
  columnsPreset: 'default',
  columns: null,
  customPresets: [],
  breakdown: null,
  showChart: false,
  chartMetric: 'cost',
  beHighlight: false,
  dashMetrics: ['cost', 'conversions'],
  flash: null,
  set: p => set(p),
}))

export const ttUi = () => useTtUi.getState()

/** A date-range value remembered per page key; presets keep rolling with the in-game day. */
export function useStoredRange(key: string, today: Day, fallback: DatePresetId): [DateRangeValue, (v: DateRangeValue) => void] {
  const stored = useTtUi(st => st.ranges[key])
  const value: DateRangeValue = !stored
    ? { preset: fallback, range: clampRange(resolvePreset(fallback, today, 'ads'), today) }
    : stored.preset === 'custom'
      ? { preset: 'custom', range: clampRange({ from: stored.from, to: stored.to }, today) }
      : { preset: stored.preset, range: clampRange(resolvePreset(stored.preset, today, 'ads'), today) }
  const setValue = (v: DateRangeValue) => {
    const st = ttUi()
    st.set({ ranges: { ...st.ranges, [key]: { preset: v.preset, from: v.range.from, to: v.range.to } } })
  }
  return [value, setValue]
}

/** Keep ranges inside the game's calendar (day 0 … today) without inverting them. */
function clampRange(r: { from: Day; to: Day }, today: Day) {
  const to = Math.max(0, Math.min(today, r.to))
  const from = Math.max(0, Math.min(to, r.from))
  return { from, to }
}
