// Display metadata for activities (icons, grouping, where they happen in the room).
// Durations/costs/labels come from sim/life activityDefs() when available; these are
// only the presentation layer + fallbacks while defs are missing.
import type { ActivityKind, SiteId } from '../../core/types'
import { activityDefs, type ActivityDef } from '../../sim/life'

export type HotspotKey = 'bed' | 'computer' | 'fridge' | 'door' | 'garage' | 'counter' | 'fryer' | 'exit'

export interface ActivityMeta {
  emoji: string
  label: string
  /** fallback duration (minutes) if the life module has no def yet */
  minutes: number
  cost: number
  group: 'life' | 'business' | 'work'
  /** where in the room the activity visibly happens */
  spot: HotspotKey | null
  /** activities that need a target (product, creative, dispute...) are started from an app */
  app?: { site: SiteId; path: string; cta: string }
  /** one-line flavour for the "now" card */
  doing: string
}

export const ACTIVITY_META: Record<ActivityKind, ActivityMeta> = {
  sleep: { emoji: '😴', label: 'Sleep', minutes: 480, cost: 0, group: 'life', spot: 'bed', doing: 'Out cold. Time flies 4× faster while you sleep.' },
  nap: { emoji: '💤', label: 'Power nap', minutes: 60, cost: 0, group: 'life', spot: 'bed', doing: 'Just resting your eyes…' },
  eat_home: { emoji: '🍳', label: 'Cook at home', minutes: 30, cost: 5, group: 'life', spot: 'fridge', doing: 'Eggs, rice, hot sauce. Budget cuisine.' },
  eat_takeout: { emoji: '🥡', label: 'Order takeout', minutes: 20, cost: 19, group: 'life', spot: 'fridge', doing: 'Waiting on the delivery driver…' },
  relax: { emoji: '🛋️', label: 'Relax', minutes: 60, cost: 0, group: 'life', spot: 'bed', doing: 'Scrolling, stretching, breathing.' },
  gym: { emoji: '🏋️', label: 'Hit the gym', minutes: 90, cost: 0, group: 'life', spot: 'door', doing: 'Leg day. Rent-free endorphins.' },
  socialize: { emoji: '🍻', label: 'See friends', minutes: 180, cost: 35, group: 'life', spot: 'door', doing: 'Catching up with the crew.' },
  shower: { emoji: '🚿', label: 'Shower', minutes: 20, cost: 0, group: 'life', spot: null, doing: 'Best business ideas happen in here.' },
  work_shift: { emoji: '🍟', label: "Shift at McDoodle's", minutes: 420, cost: 0, group: 'work', spot: 'door', doing: 'Would you like fries with that?' },
  product_research: {
    emoji: '🔎', label: 'Product research', minutes: 60, cost: 0, group: 'business', spot: 'computer',
    app: { site: 'aliexprez', path: '', cta: 'Pick a product on AliExprez' }, doing: 'Digging through listings, reviews and ad libraries.',
  },
  film_creative: {
    emoji: '🎬', label: 'Film a creative', minutes: 180, cost: 0, group: 'business', spot: 'computer',
    app: { site: 'studio', path: '', cta: 'Write a brief in CreatorHub' }, doing: 'Take 14. Hook needs more energy.',
  },
  edit_supplier_video: {
    emoji: '✂️', label: 'Edit supplier footage', minutes: 90, cost: 0, group: 'business', spot: 'computer',
    app: { site: 'studio', path: '', cta: 'Brief an edit in CreatorHub' }, doing: 'Cutting supplier clips into something scroll-stopping.',
  },
  customer_support: { emoji: '💬', label: 'Answer support tickets', minutes: 60, cost: 0, group: 'business', spot: 'computer', doing: '"Where is my order?" — for the 9th time today.' },
  fight_chargeback: {
    emoji: '⚖️', label: 'Fight a chargeback', minutes: 30, cost: 0, group: 'business', spot: 'computer',
    app: { site: 'shopifly', path: 'disputes', cta: 'Open disputes in Shopifly' }, doing: 'Assembling tracking, delivery proof and policies.',
  },
  appeal_ad_account: {
    emoji: '📝', label: 'Appeal ad account', minutes: 30, cost: 0, group: 'business', spot: 'computer',
    app: { site: 'fadbook', path: 'account_quality', cta: 'Open Account quality' }, doing: 'Writing a very polite appeal.',
  },
  post_organic: {
    emoji: '📲', label: 'Post on TikTak', minutes: 60, cost: 0, group: 'business', spot: 'computer',
    app: { site: 'tiktak', path: '', cta: 'Pick a video in TikTak' }, doing: 'Posting, replying to comments, praying to the algorithm.',
  },
  influencer_outreach: {
    emoji: '🤝', label: 'Influencer outreach', minutes: 90, cost: 0, group: 'business', spot: 'computer',
    app: { site: 'shopifly', path: 'marketing', cta: 'Choose a product in Marketing' }, doing: 'DMing creators who might actually reply.',
  },
  study: {
    emoji: '📚', label: 'Study', minutes: 120, cost: 0, group: 'business', spot: 'computer',
    app: { site: 'academy', path: '', cta: 'Pick a course in Ecom Academy' }, doing: 'Taking notes. Future you says thanks.',
  },
}

let cachedDefs: Partial<Record<ActivityKind, ActivityDef>> | null = null
/** Life-module definitions (cached once they exist). */
export function defsSafe(): Partial<Record<ActivityKind, ActivityDef>> {
  if (cachedDefs && Object.keys(cachedDefs).length) return cachedDefs
  try {
    const d = activityDefs() as Partial<Record<ActivityKind, ActivityDef>>
    cachedDefs = d ?? {}
  } catch {
    cachedDefs = {}
  }
  return cachedDefs
}

export function activityInfo(kind: ActivityKind): { label: string; emoji: string; minutes: number; cost: number; description: string } {
  const meta = ACTIVITY_META[kind]
  const def = defsSafe()[kind]
  return {
    label: def?.label || meta.label,
    emoji: meta.emoji,
    minutes: def?.duration ?? meta.minutes,
    cost: def?.cost ?? meta.cost,
    description: def?.description || meta.doing,
  }
}

/** Life actions shown as quick buttons (direct enqueue). */
export const LIFE_QUICK: ActivityKind[] = ['eat_home', 'eat_takeout', 'nap', 'sleep', 'shower', 'relax', 'gym', 'socialize']
