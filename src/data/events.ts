// Event tables & copy for the events module (sim/events). OWNER: sim-market-events.
// Chances are per in-game day on Normal; negative events scale with DIFFICULTY.dramaMult.
import type { Niche, Platform } from '../core/types'

export type EventCategory = 'market' | 'viral' | 'platform' | 'chargeback' | 'store' | 'life'

export interface RandomEventDef {
  kind: string
  /** player-facing name used in the event log */
  title: string
  category: EventCategory
  /** base probability per day when its condition holds */
  chancePerDay: number
  /** minimum days between two occurrences */
  cooldownDays: number
  /** bad news → frequency × DIFFICULTY.dramaMult */
  negative: boolean
  /** how long its effect lasts (days), 0 = instant */
  durationDays: number
  description: string
}

export const RANDOM_EVENTS: RandomEventDef[] = [
  // ---- market ----
  { kind: 'competitor_copy', title: 'Copycat stores', category: 'market', chancePerDay: 0.08, cooldownDays: 21, negative: true, durationDays: 30,
    description: 'A product doing $1k+/day for 3 days attracts copycats: more competitors and ~15% higher CPMs for a month.' },
  { kind: 'supplier_price_hike', title: 'Supplier price increase', category: 'market', chancePerDay: 0.012, cooldownDays: 45, negative: true, durationDays: 60,
    description: 'Your supplier raises the unit price ~8% for two months.' },
  { kind: 'trend_collapse', title: 'Trend collapse', category: 'market', chancePerDay: 0.06, cooldownDays: 20, negative: true, durationDays: 45,
    description: 'A fad you sell falls off a cliff after its peak.' },
  // ---- viral / organic ----
  { kind: 'influencer_offer', title: 'Influencer offer', category: 'viral', chancePerDay: 0.035, cooldownDays: 12, negative: false, durationDays: 0,
    description: 'A creator offers a paid post (or a post in exchange for free product).' },
  { kind: 'feature_post', title: 'Gift-guide feature', category: 'viral', chancePerDay: 0.02, cooldownDays: 30, negative: false, durationDays: 3,
    description: 'A deals/gift-guide blog links your product during a gifting season.' },
  { kind: 'creator_stole_ad', title: 'Ad ripped off', category: 'viral', chancePerDay: 0.02, cooldownDays: 30, negative: true, durationDays: 21,
    description: 'Another store reposts your best video — it fatigues ~30% faster.' },
  // ---- platform drama ----
  { kind: 'tracking_outage', title: 'Conversion tracking outage', category: 'platform', chancePerDay: 0.006, cooldownDays: 75, negative: true, durationDays: 4,
    description: 'A phone-OS privacy update breaks tracking: ad platforms under-report purchases for a few days while real sales hold.' },
  { kind: 'platform_outage', title: 'Ad platform outage', category: 'platform', chancePerDay: 0.006, cooldownDays: 60, negative: true, durationDays: 0,
    description: 'An ad platform stops delivering for ~6 hours.' },
  { kind: 'policy_crackdown', title: 'Ad policy crackdown', category: 'platform', chancePerDay: 0.005, cooldownDays: 60, negative: true, durationDays: 7,
    description: 'Stricter review of health & beauty claims for a week (claim risk ×1.5).' },
  // ---- store ----
  { kind: 'chargeback_wave', title: 'Friendly-fraud wave', category: 'chargeback', chancePerDay: 0.01, cooldownDays: 60, negative: true, durationDays: 10,
    description: 'Chargebacks on orders over $60 double for 10 days.' },
  { kind: 'payout_review', title: 'Payout review hold', category: 'store', chancePerDay: 0.004, cooldownDays: 90, negative: true, durationDays: 5,
    description: 'Shopifly Payments pauses payouts for a routine account review.' },
  // ---- life ----
  { kind: 'mom_help', title: 'Mom needs help', category: 'life', chancePerDay: 0.06, cooldownDays: 6, negative: false, durationDays: 0,
    description: 'Living in the basement comes with chores.' },
  { kind: 'roommate_party', title: 'Roommate party', category: 'life', chancePerDay: 0.07, cooldownDays: 5, negative: true, durationDays: 0,
    description: 'Loud party at your shared apartment: −20 energy tonight.' },
  { kind: 'friend_birthday', title: "Friend's birthday", category: 'life', chancePerDay: 0.02, cooldownDays: 25, negative: false, durationDays: 0,
    description: 'An invite to go out.' },
  { kind: 'phone_breaks', title: 'Cracked phone', category: 'life', chancePerDay: 0.004, cooldownDays: 120, negative: true, durationDays: 0,
    description: 'Your phone screen shatters.' },
  { kind: 'car_breaks', title: 'Car trouble', category: 'life', chancePerDay: 0.004, cooldownDays: 120, negative: true, durationDays: 0,
    description: 'Your car needs a repair.' },
]
export const RANDOM_EVENT_BY_KIND: Record<string, RandomEventDef> = Object.fromEntries(RANDOM_EVENTS.map(e => [e.kind, e]))

// ---------------------------------------------------------------------------
// Senders (parody names only)
// ---------------------------------------------------------------------------
export interface Sender { from: string; fromEmail: string }
export const SENDERS = {
  shopifly: { from: 'Shopifly', fromEmail: 'no-reply@shopifly.com' },
  shopiflyPayments: { from: 'Shopifly Payments', fromEmail: 'payments-risk@shopifly.com' },
  fadbook: { from: 'Fadbook for Business', fromEmail: 'noreply@business.fadbook.com' },
  tiktak: { from: 'TikTak for Business', fromEmail: 'no-reply@ads.tiktak.com' },
  coach: { from: 'Coach Kev', fromEmail: 'kev@coachkev.com' },
  chargeflo: { from: 'ChargeFlo', fromEmail: 'alerts@chargeflo.io' },
  mom: { from: 'Mom', fromEmail: 'lindamorrow58@inboxly.com' },
  grandma: { from: 'Grandma', fromEmail: 'grandma.june@inboxly.com' },
  bank: { from: 'Chaise Bank', fromEmail: 'alerts@chaisebank.com' },
  aliexprez: { from: 'AliExprez', fromEmail: 'transaction@notice.aliexprez.com' },
} satisfies Record<string, Sender>

export const PLATFORM_LABEL: Record<Platform, string> = { fadbook: 'Fadbook', tiktak: 'TikTak' }

// ---------------------------------------------------------------------------
// Influencers
// ---------------------------------------------------------------------------
export interface InfluencerSeed {
  handle: string
  name: string
  niches: Niche[]
  followers: [number, number]
  platform: Platform
  /** she / he / they */
  pronoun: 'she' | 'he' | 'they'
  pitch: string
}
export const INFLUENCERS: InfluencerSeed[] = [
  { handle: '@glowwithmaya', name: 'Maya', niches: ['beauty', 'wellness'], followers: [140_000, 260_000], platform: 'tiktak', pronoun: 'she', pitch: 'My followers love honest skincare & self-care finds — I only post things I actually use.' },
  { handle: '@thepetmomdiaries', name: 'Kayla', niches: ['pet'], followers: [80_000, 190_000], platform: 'tiktak', pronoun: 'she', pitch: 'Two huskies, a lot of fur, and 150k pet parents watching. Your product looks perfect for us!' },
  { handle: '@dadhacksdaily', name: 'Marcus', niches: ['home', 'car', 'kitchen', 'gadgets'], followers: [200_000, 420_000], platform: 'tiktak', pronoun: 'he', pitch: 'I review practical stuff for busy dads. Straight talk, no fluff — people trust my picks.' },
  { handle: '@cleanwithtess', name: 'Tess', niches: ['home', 'kitchen'], followers: [300_000, 650_000], platform: 'tiktak', pronoun: 'she', pitch: 'Satisfying cleaning content is my whole thing. My audience buys what makes cleaning easier.' },
  { handle: '@fitnessbyjay', name: 'Jay', niches: ['fitness', 'wellness'], followers: [90_000, 210_000], platform: 'fadbook', pronoun: 'he', pitch: 'Home workouts for people with zero time. I get asked about gear every day.' },
  { handle: '@momlife.with.ari', name: 'Ari', niches: ['baby', 'kids'], followers: [110_000, 240_000], platform: 'fadbook', pronoun: 'she', pitch: 'Real mom life with a toddler and a newborn. Parents in my comments buy what solves their problems.' },
  { handle: '@techunboxed', name: 'Leo', niches: ['gadgets'], followers: [250_000, 520_000], platform: 'tiktak', pronoun: 'he', pitch: 'Unboxings and quick reviews of cool tech. My audience is 18–30 and impulse-buys a lot.' },
  { handle: '@cozyhomecorner', name: 'Brielle', niches: ['home', 'outdoor'], followers: [70_000, 160_000], platform: 'fadbook', pronoun: 'she', pitch: 'Cozy decor and small upgrades that make a house feel like home.' },
  { handle: '@thetravelingtwins', name: 'Sam & Alex', niches: ['fashion', 'gadgets', 'outdoor'], followers: [180_000, 380_000], platform: 'tiktak', pronoun: 'they', pitch: 'Travel hacks and packing essentials — we get DMs asking where we got our gear.' },
  { handle: '@wellnesswithnoor', name: 'Noor', niches: ['wellness', 'beauty'], followers: [60_000, 140_000], platform: 'fadbook', pronoun: 'she', pitch: 'Sleep, stress and slow living. My community is small but they really listen.' },
  { handle: '@garagegearguy', name: 'Dustin', niches: ['car', 'outdoor'], followers: [95_000, 230_000], platform: 'fadbook', pronoun: 'he', pitch: 'Car stuff, camping stuff, useful stuff. My viewers are 30–55 and actually have money.' },
  { handle: '@kitchenwithrosa', name: 'Rosa', niches: ['kitchen'], followers: [150_000, 330_000], platform: 'tiktak', pronoun: 'she', pitch: 'Quick recipes and kitchen tools that save time. Gadget videos are my best performers.' },
  { handle: '@viralfindsbyzoe', name: 'Zoe', niches: ['gadgets', 'home', 'beauty', 'kitchen', 'pet'], followers: [400_000, 900_000], platform: 'tiktak', pronoun: 'she', pitch: '"TikTak made me buy it" is literally my brand. When I post, things sell out.' },
  { handle: '@playtimewithpapa', name: 'Chris', niches: ['kids', 'baby'], followers: [75_000, 170_000], platform: 'tiktak', pronoun: 'he', pitch: 'Stay-at-home dad, two kids under 5. Toy and gear content does great for me.' },
]

// ---------------------------------------------------------------------------
// Life
// ---------------------------------------------------------------------------
export const MOM_TASKS = [
  'clean out the garage', 'carry in a warehouse-club-sized grocery haul', 'fix the Wi-Fi (again)', 'drive Grandma to her appointment',
  'move the couch "just a few inches"', 'rake the backyard', 'assemble a flat-pack bookshelf', 'set up her new phone',
]
export const FRIENDS = ['Jordan', 'Marcus', 'Priya', 'Tyler', 'Destiny', 'Alex', 'Sam', 'Nina', 'Deshawn', 'Hailey']

export interface LifeExpenseDef { kind: string; title: string; cost: [number, number]; body: string; payLabel: string; deferLabel: string; deferMood: number }
export const LIFE_EXPENSES: Record<'phone' | 'car', LifeExpenseDef> = {
  phone: {
    kind: 'phone', title: 'Your phone screen shattered', cost: [150, 260],
    body: 'It slipped out of your hand in the McDoodle\'s parking lot. The screen is a spiderweb and touch barely works in one corner. The repair shop quotes {cost}.',
    payLabel: 'Repair it ({cost})', deferLabel: 'Live with it for now', deferMood: -8,
  },
  car: {
    kind: 'car', title: 'Your car won\'t start', cost: [260, 450],
    body: 'The mechanic says it\'s the alternator. Parts and labor come to {cost}. Until it\'s fixed you\'re taking the bus.',
    payLabel: 'Pay for the repair ({cost})', deferLabel: 'Take the bus for a while', deferMood: -10,
  },
}
