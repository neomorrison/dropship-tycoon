// Fadbook Ads Manager view state (not saved with the game): selected ad account, tab level,
// row selections, date range, columns, breakdown and filters. Kept in a module store so it
// survives navigating between Ads Manager pages. Saved column presets persist per browser.
import { create } from 'zustand'
import type { AdLevel } from '../../../core/types'
import type { DatePresetId, DateRange } from '../../kit/common'

export interface SavedPreset { id: string; label: string; columns: string[]; custom: true }
export type FbView = 'table' | 'charts'
export type FbBreakdown = 'day' | 'week' | 'month' | null
export type FbFilter =
  | 'active' | 'learning' | 'learning_limited' | 'off' | 'in_review' | 'rejected' | 'not_delivering' | 'had_delivery'

interface FbUIState {
  /** the save these view settings belong to (selections are reset when another game is loaded) */
  saveId: string | null
  accountId: string | null
  level: AdLevel
  sel: Record<AdLevel, string[]>
  datePreset: DatePresetId | 'custom'
  customRange: DateRange | null
  columns: { presetId: string; columns: string[] }
  savedPresets: SavedPreset[]
  view: FbView
  breakdown: FbBreakdown
  query: string
  filters: FbFilter[]
  set: (p: Partial<Omit<FbUIState, 'set'>>) => void
}

const LS_KEY = 'dt.fadbook.columnPresets.v1'
function loadPresets(): SavedPreset[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedPreset[]
    return Array.isArray(parsed) ? parsed.filter(p => p && typeof p.id === 'string' && Array.isArray(p.columns)) : []
  } catch {
    return []
  }
}
export function persistPresets(list: SavedPreset[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch {
    /* storage unavailable (private window): presets live for this session only */
  }
}

export const DEFAULT_COLUMNS_PRESET = 'performance'

export const useFbUI = create<FbUIState>()(set => ({
  saveId: null,
  accountId: null,
  level: 'campaign',
  sel: { campaign: [], adset: [], ad: [] },
  datePreset: 'maximum',
  customRange: null,
  columns: { presetId: DEFAULT_COLUMNS_PRESET, columns: [] },
  savedPresets: loadPresets(),
  view: 'table',
  breakdown: null,
  query: '',
  filters: [],
  set: p => set(p),
}))

export const fbUI = () => useFbUI.getState()
