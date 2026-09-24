// The in-progress brief lives in a small UI-only store (not saved with the game) so it survives
// hopping between the brief, the library and the creator marketplace.
import { create } from 'zustand'
import type { AngleId, BeatId, Creative, CreativeProducer, FormatId, HookId } from '../../../core/types'
import type { AdPlatform } from '../../kit/phone'

export interface DraftBeat { key: number; id: BeatId }

export interface BriefDraft {
  /** save the draft belongs to (reset when another game loads) */
  saveId: string | null
  storeProductId: string | null
  format: FormatId | null
  hook: HookId | null
  angle: AngleId | null
  beats: DraftBeat[]
  hookText: string
  script: string
  name: string
  producer: CreativeProducer | null
  creatorId: string | null
  platform: AdPlatform
  /** creative id of the last successful order (success banner) */
  lastOrderedId: string | null
}

interface DraftStore extends BriefDraft {
  patch: (p: Partial<BriefDraft>) => void
  reset: (opts?: { keepProduct?: boolean; saveId?: string | null }) => void
  addBeat: (id: BeatId) => void
  removeBeat: (key: number) => void
  moveBeat: (from: number, to: number) => void
  clearBeats: () => void
  loadFromCreative: (c: Creative, storeProductId: string | null) => void
}

export const MAX_BEATS = 12
export const HOOK_TEXT_MAX = 120
export const SCRIPT_MAX = 3000

let beatSeq = 1
const nextKey = () => beatSeq++

const EMPTY: BriefDraft = {
  saveId: null,
  storeProductId: null,
  format: null,
  hook: null,
  angle: null,
  beats: [],
  hookText: '',
  script: '',
  name: '',
  producer: null,
  creatorId: null,
  platform: 'tiktak',
  lastOrderedId: null,
}

export const useBriefDraft = create<DraftStore>()((set, get) => ({
  ...EMPTY,
  patch: p => set(p),
  reset: (opts = {}) => {
    const cur = get()
    set({
      ...EMPTY,
      saveId: opts.saveId !== undefined ? opts.saveId : cur.saveId,
      storeProductId: opts.keepProduct ? cur.storeProductId : null,
      platform: cur.platform,
    })
  },
  addBeat: id => {
    const beats = get().beats
    if (beats.length >= MAX_BEATS) return
    set({ beats: [...beats, { key: nextKey(), id }] })
  },
  removeBeat: key => set({ beats: get().beats.filter(b => b.key !== key) }),
  moveBeat: (from, to) => {
    const beats = [...get().beats]
    if (from < 0 || from >= beats.length) return
    const target = Math.max(0, Math.min(beats.length - 1, to))
    if (target === from) return
    const [b] = beats.splice(from, 1)
    beats.splice(target, 0, b)
    set({ beats })
  },
  clearBeats: () => set({ beats: [] }),
  loadFromCreative: (c, storeProductId) =>
    set({
      storeProductId,
      format: c.format,
      hook: c.hook,
      angle: c.angle,
      beats: c.beats.map(id => ({ key: nextKey(), id })),
      hookText: c.hookText,
      script: c.script,
      name: '',
      producer: c.producer === 'agency' ? 'agency' : c.producer,
      creatorId: c.producer === 'ugc' || c.producer === 'staff' ? c.creatorId : null,
      lastOrderedId: null,
    }),
}))
