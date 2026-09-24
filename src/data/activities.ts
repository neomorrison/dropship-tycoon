// Everything the player can spend time on. Needs deltas are PER HOUR while the activity runs
// (SPEC §3 table); totals from the spec are converted with perHour(total, minutes).
// OWNER: sim-life-finance.
import type { ActivityKind } from '../core/types'
import type { ActivityDef } from '../sim/life/types'

const perHour = (total: number, minutes: number) => +(total / (minutes / 60)).toFixed(3)

/** baseline awake decay (idle / light activity) */
export const IDLE_NEEDS = { energy: -4, hunger: -4.5 }
/** business tasks (research, filming, support …) */
const BIZ = { energy: -5, hunger: -5, mood: 0 }

export const ACTIVITY_DEFS: Record<ActivityKind, ActivityDef> = {
  // ---- life ----
  sleep: {
    kind: 'sleep', label: 'Sleep', duration: 480, energy: 11, hunger: -1.5, mood: 0.5, cost: 0, atHome: true,
    group: 'life', interruptible: false, location: 'home',
    description: 'Recharge +11 energy/h (better beds recharge faster). You wake up on your own once rested, or after 10 hours.',
  },
  nap: {
    kind: 'nap', label: 'Power nap', duration: 60, energy: 12, hunger: -3, mood: 1, cost: 0, atHome: true,
    group: 'life', interruptible: true, location: 'home',
    description: '+12 energy in an hour. Takes the edge off; it won\'t replace a night\'s sleep.',
  },
  eat_home: {
    kind: 'eat_home', label: 'Cook at home', duration: 30, energy: IDLE_NEEDS.energy, hunger: perHour(55, 30), mood: perHour(1, 30), cost: 5, atHome: true,
    group: 'life', interruptible: true, location: 'home', costCategory: 'food', costMemo: 'Groceries — Grocerly',
    description: '+55 hunger for about $5 of groceries. Cheap, filling, not exciting.',
  },
  eat_takeout: {
    kind: 'eat_takeout', label: 'Order takeout', duration: 20, energy: IDLE_NEEDS.energy, hunger: perHour(65, 20), mood: perHour(4, 20), cost: 19, atHome: true,
    group: 'life', interruptible: true, location: 'home', costCategory: 'food', costMemo: 'DoorDashr — takeout order',
    description: '+65 hunger and +4 mood. $19 once the delivery fee and tip are in.',
  },
  relax: {
    kind: 'relax', label: 'Relax', duration: 60, energy: -2, hunger: IDLE_NEEDS.hunger, mood: 8, cost: 0, atHome: false,
    group: 'life', interruptible: true, location: 'home', phoneOk: true,
    description: '+8 mood. Couch, playlist, zero notifications.',
  },
  gym: {
    kind: 'gym', label: 'Hit the gym', duration: 90, energy: perHour(-8, 90), hunger: -6, mood: perHour(10, 90), cost: 0, atHome: false,
    group: 'life', interruptible: true, location: 'out',
    description: '+10 mood and −8 energy now, then +5% energy recovery from sleep for 3 days. Covered by your gym membership.',
  },
  socialize: {
    kind: 'socialize', label: 'See friends', duration: 180, energy: IDLE_NEEDS.energy, hunger: -3, mood: perHour(25, 180), cost: 35, atHome: false,
    group: 'life', interruptible: true, location: 'out', window: [17, 1], costCategory: 'fun', costMemo: 'Night out with friends',
    description: '+25 mood for about $35. Friends only answer between 5 PM and 1 AM. Going too long without it drags your mood down.',
  },
  shower: {
    kind: 'shower', label: 'Shower', duration: 20, energy: 0, hunger: IDLE_NEEDS.hunger, mood: perHour(4, 20), cost: 0, atHome: true,
    group: 'life', interruptible: true, location: 'home',
    description: '+4 mood. Where the best hook ideas happen.',
  },

  // ---- work ----
  work_shift: {
    kind: 'work_shift', label: "Shift at McDoodle's", duration: 420, energy: -6.5, hunger: -6, mood: -1.5, cost: 0, atHome: false,
    group: 'work', interruptible: false, location: 'work',
    description: 'You leave automatically when a shift starts. Crew get a free meal halfway through.',
  },

  // ---- business ----
  product_research: {
    kind: 'product_research', label: 'Product research', duration: 60, ...BIZ, cost: 0, atHome: true, skill: 'research', xp: 40,
    group: 'business', interruptible: true, resumable: true, scalesWithProductivity: true,
    description: 'Dig into one product: competitor pricing, reviews, ad libraries. Each session reveals deeper insights.',
  },
  film_creative: {
    kind: 'film_creative', label: 'Film a creative', duration: 180, ...BIZ, cost: 0, atHome: true, skill: 'creative', xp: 50,
    group: 'business', interruptible: false, scalesWithProductivity: true,
    description: 'Shoot and edit a video yourself. Needs the product in hand. Quality depends on gear, skill, apartment and mood.',
  },
  edit_supplier_video: {
    kind: 'edit_supplier_video', label: 'Edit supplier footage', duration: 90, ...BIZ, cost: 0, atHome: true, skill: 'creative', xp: 20,
    group: 'business', interruptible: true, resumable: true, scalesWithProductivity: true,
    description: 'Re-cut the supplier\'s clips into an ad. Fast and free, but other stores run the same footage.',
  },
  customer_support: {
    kind: 'customer_support', label: 'Answer support tickets', duration: 60, ...BIZ, cost: 0, atHome: false, skill: 'operations', xp: 5,
    group: 'business', interruptible: true, resumable: true, phoneOk: true, scalesWithProductivity: true,
    description: 'Work through ~12 open tickets (more as your Operations skill grows). +5 Operations XP per ticket. Works from your phone.',
  },
  fight_chargeback: {
    kind: 'fight_chargeback', label: 'Fight a chargeback', duration: 30, ...BIZ, cost: 0, atHome: true, skill: 'operations', xp: 20,
    group: 'business', interruptible: true, resumable: true, scalesWithProductivity: true,
    description: 'Assemble tracking, delivery proof and your policies into a dispute response.',
  },
  appeal_ad_account: {
    kind: 'appeal_ad_account', label: 'Appeal ad account', duration: 30, ...BIZ, cost: 0, atHome: true, skill: 'media_buying', xp: 10,
    group: 'business', interruptible: true, resumable: true, scalesWithProductivity: true,
    description: 'Write a calm, specific appeal to the platform\'s review team.',
  },
  post_organic: {
    kind: 'post_organic', label: 'Post on TikTak', duration: 60, ...BIZ, cost: 0, atHome: false, skill: 'creative', xp: 10,
    group: 'business', interruptible: true, resumable: true, phoneOk: true, scalesWithProductivity: true,
    description: 'Post a video organically, reply to comments and ride the first hour. Works from your phone.',
  },
  influencer_outreach: {
    kind: 'influencer_outreach', label: 'Influencer outreach', duration: 90, ...BIZ, cost: 0, atHome: true, skill: 'copywriting', xp: 15,
    group: 'business', interruptible: true, resumable: true, scalesWithProductivity: true,
    description: 'DM creators in your niche with a pitch they might actually answer.',
  },
  study: {
    kind: 'study', label: 'Study', duration: 120, ...BIZ, cost: 0, atHome: true, xp: 60,
    group: 'business', interruptible: true, resumable: true, scalesWithProductivity: false,
    description: '+60 XP in the skill you pick. Ecom Academy courses, case studies and teardown videos.',
  },
}

