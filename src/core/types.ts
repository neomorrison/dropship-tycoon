// ============================================================================
// Dropship Tycoon — GAME STATE CONTRACT
// Every module reads/writes this shape. Add OPTIONAL fields if you must extend;
// never rename or remove existing fields (other agents depend on them).
// Time unit: absolute in-game HOUR since 00:00 of day 0 (2026-03-02, a Monday).
// Money: USD numbers (floats, round only for display).
// ============================================================================

import type { Niche, Archetype } from '../data/productList'
export type { Niche, Archetype }

export type Difficulty = 'chill' | 'normal' | 'realistic'
export type Platform = 'fadbook' | 'tiktak'
export type TrafficSource =
  | 'fadbook' | 'tiktak'           // paid social
  | 'tiktak_organic' | 'influencer' // organic social / creator shoutouts
  | 'organic' | 'direct' | 'email'  // search/brand, typed URL, email flows
export type Device = 'mobile' | 'desktop' | 'tablet'
export type Hour = number
export type Day = number

// ---------------------------------------------------------------------------
// Catalog (static data, see src/data/products.ts)
// ---------------------------------------------------------------------------
export type FormatId =
  | 'ugc_testimonial' | 'demo_video' | 'green_screen' | 'slideshow' | 'static_image'
  | 'carousel' | 'before_after_video' | 'asmr_unboxing' | 'founder_story' | 'supplier_edit' | 'skit'
export type HookId =
  | 'problem_callout' | 'pov' | 'tiktak_made_me_buy' | 'before_after' | 'asmr' | 'shock_stat'
  | 'unboxing' | 'us_vs_them' | 'testimonial' | 'gift_idea' | 'life_hack' | 'controversial' | 'question'
export type AngleId =
  | 'pain_point' | 'convenience' | 'gift' | 'social_proof' | 'savings' | 'aspirational'
  | 'curiosity' | 'health' | 'time_saving' | 'pet_love' | 'parenting' | 'self_care'
export type BeatId =
  | 'hook' | 'problem' | 'agitate' | 'demo' | 'benefits' | 'social_proof' | 'offer'
  | 'urgency' | 'cta' | 'unboxing' | 'comparison' | 'testimonial'

export interface ProductDef {
  id: string
  name: string
  niche: Niche
  /** HIDDEN design intent */
  archetype: Archetype
  /** keyword-stuffed supplier title as shown on AliExprez (copying it verbatim is bad) */
  supplierTitle: string
  /** Chinglish spec-sheet style supplier description (copy-pasting it is bad) */
  supplierDescription: string
  specs: Record<string, string>
  variants: { name: string; values: string[] }[]
  /** AliExprez unit price, USD */
  cogs: number
  /** per-unit shipping to US via AliExprez standard/Choice */
  shipCost: number
  shipDays: [number, number]
  weightKg: number
  /** unit cost via sourcing agent at MOQ (bulk) */
  bulkCogs: number
  moq: number
  privateLabelCogs: number
  privateLabelMoq: number
  /** what US shoppers feel it's worth (USD) — HIDDEN; inferable from amazonPrice/specs */
  perceivedValue: number
  /** visible price anchor shoppers compare against (null = not on Amazin) */
  amazonPrice: number | null
  /** 0..1 HIDDEN product-market fit */
  baseDemand: number
  /** 0..1 scroll-stopping / demo-ability */
  wow: number
  /** 0..1 solves a real pain */
  problemSolving: number
  /** 0..1 low-consideration purchase */
  impulse: number
  /** 0..1 gift appeal (boosts Q4 / holidays) */
  giftable: number
  /** 0..1 chance a customer re-orders within ~60 days (consumables) */
  repeatRate: number
  audience: { gender: 'female' | 'male' | 'all'; ageMin: number; ageMax: number }
  platformFit: { fadbook: number; tiktak: number }
  bestFormats: FormatId[]
  bestHooks: HookId[]
  bestAngles: AngleId[]
  /** demand multiplier by month Jan..Dec (1 = neutral) */
  seasonality: number[]
  trend: {
    kind: 'evergreen' | 'rising' | 'fad' | 'declining'
    /** day demand starts rising (can be negative = already underway) */
    emergeDay: number
    peakDay: number
    /** days for demand to halve after peak (Infinity-like large for evergreen) */
    halfLifeDays: number
  }
  startSaturation: number
  startCompetitors: number
  /** 0..1 share of units that arrive defective / disappoint */
  defectRate: number
  /** 0..1 risk ads get disapproved (health/beauty claims, before/after) */
  claimRisk: number
  /** daily ad spend (USD) where efficiency starts to drop sharply, at peak demand */
  scaleCeiling: number
  /** benefit vocabulary the copy grader rewards */
  keywords: string[]
  /** buyer objections a good FAQ/description addresses */
  objections: string[]
  publicSignals: { ordersBase: number; rating: number; reviews: number; supplierYears: number; choice: boolean }
  /** day it appears on AliExprez (0 = at start) */
  releaseDay: number
  /** 0..1 how much private-labeling/branding lifts CVR & AOV */
  brandable: number
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
export interface GameState {
  version: number
  meta: {
    saveId: string
    playerName: string
    difficulty: Difficulty
    seed: number
    /** ISO date of day 0 */
    startDate: string
    createdAtReal: number
    lastSavedReal: number
  }
  /** mutable RNG state (mulberry32) — use core/rng helpers, never Math.random in sim */
  rng: number
  time: { hour: Hour }
  player: PlayerState
  job: JobState
  home: HomeState
  gear: GearState
  skills: Record<SkillId, SkillState>
  staff: StaffState
  finance: FinanceState
  catalog: CatalogState
  store: StoreState
  ads: AdsState
  creatives: CreativeState
  events: EventsState
  coach: CoachState
  notifications: GameNotification[]
  inbox: MailMessage[]
  milestones: Record<string, Day>
  history: DailySnapshot[]
  flags: Record<string, boolean | number | string>
  seq: number
}

// ---------------------------------------------------------------------------
// Life
// ---------------------------------------------------------------------------
export type ActivityKind =
  | 'sleep' | 'nap' | 'eat_home' | 'eat_takeout' | 'relax' | 'gym' | 'socialize' | 'shower'
  | 'work_shift'
  | 'product_research' | 'film_creative' | 'edit_supplier_video' | 'customer_support'
  | 'fight_chargeback' | 'appeal_ad_account' | 'post_organic' | 'influencer_outreach' | 'study'

export interface Activity {
  id: string
  kind: ActivityKind
  label: string
  durationMin: number
  remainingMin: number
  startedHour?: Hour
  /** e.g. { creativeId }, { chargebackId }, { catalogId } */
  payload?: Record<string, string | number | boolean>
}

export interface PlayerState {
  name: string
  /** 0..100 */
  energy: number
  /** 0..100 (100 = full) */
  hunger: number
  /** 0..100 */
  mood: number
  location: 'home' | 'work' | 'out'
  activity: Activity | null
  queue: Activity[]
  /** days remaining of burnout debuff */
  burnoutDays: number
  sickDays: number
  lastSleepHour: Hour
  /** consecutive hours awake */
  awakeHours: number
  // ---- optional (sim-life-finance) ----
  /** gym buff (+5% energy regen) lasts until this hour */
  gymBuffUntil?: Hour
  /** consecutive days whose average mood was < 25 (3 → burnout) */
  lowMoodDays?: number
  /** consecutive days with ≥ 6 awake hours at energy < 20 (3 → sickness) */
  lowEnergyDays?: number
  /** last day the player socialized (social mood penalty) */
  lastSocialDay?: Day
  /** running needs stats for the current day (reset at midnight) */
  today?: { moodSum: number; hours: number; lowEnergyHours: number }
}

export type JobRank = 'crew' | 'shift_lead' | 'manager'
export type JobSchedule = 'full' | 'part' | 'weekends' | 'none'
export interface Shift {
  day: Day
  startHour: number // 0..23 local
  hours: number
  status: 'scheduled' | 'in_progress' | 'worked' | 'missed' | 'called_out'
  // ---- optional (sim-life-finance) ----
  /** hours actually worked (late arrival / leaving early) */
  hoursWorked?: number
  /** minutes late clocking in */
  lateMin?: number
  /** included in a paycheck already */
  paid?: boolean
  /** shift started while the player was busy (sleeping/filming): waiting up to 1h before it counts as missed */
  pendingSince?: Hour
  /** hourly wage when the shift was worked (paychecks use it) */
  rate?: number
}
export interface PayStub {
  id: string
  payDay: Day
  periodStart: Day
  periodEnd: Day
  hours: number
  rate: number
  gross: number
  socialSecurity: number
  medicare: number
  federal: number
  net: number
}
export interface JobState {
  employed: boolean
  rank: JobRank
  hourlyWage: number
  schedule: JobSchedule
  shifts: Shift[]
  shiftsWorked: number
  /** 0..100 */
  reliability: number
  strikes: number
  hoursUnpaid: number
  lastPayDay: Day
  quitDay: Day | null
  firedDay: Day | null
  timesRehired: number
  // ---- optional (sim-life-finance) ----
  payStubs?: PayStub[]
  /** days the player called out sick (2 free per rolling 30 days) */
  callOutDays?: Day[]
  /** last day a strike was issued (strikes expire after 60 clean days) */
  lastStrikeDay?: Day | null
  lateCount?: number
  /** manager promotion declined on this day (re-offered 30 days later) */
  promotionDeclinedDay?: Day | null
}

export interface HomeState {
  tier: number // 0..5, see data/apartments
  rentMonthly: number
  movedInDay: Day
  /** day rent is next due */
  rentDueDay: Day
  missedRent: number
  // ---- optional (sim-life-finance) ----
  /** security deposit held by the landlord */
  deposit?: number
  /** consecutive on-time rent payments (3 forgives one missed-rent strike) */
  onTimeRentStreak?: number
}

export type GearSlot = 'phone' | 'lighting' | 'camera' | 'computer' | 'audio'
export interface GearState {
  owned: string[]
  equipped: Partial<Record<GearSlot, string>>
}

export type SkillId = 'research' | 'copywriting' | 'creative' | 'media_buying' | 'operations'
export interface SkillState { level: number; xp: number }

export type StaffRole = 'va' | 'ugc_creator' | 'media_buyer' | 'designer' | 'copywriter' | 'ops_manager'
export interface StaffMember {
  id: string
  name: string
  role: StaffRole
  /** 1..10 */
  skill: number
  salaryWeekly: number
  hiredDay: Day
  portrait: string
  /** 0..100 */
  morale: number
  /** role-specific settings, e.g. media buyer rules or creator product focus */
  config?: Record<string, string | number | boolean>
  // ---- optional (sim-life-finance) ----
  /** UpWorx profile details */
  headline?: string
  country?: string
  rating?: number
  jobsDone?: number
  hoursPerWeek?: number
  /** consecutive days salary went unpaid */
  unpaidDays?: number
  /** ugc_creator: creatives owed / delivered this week */
  weeklyQuota?: number
  producedThisWeek?: number
  /** latest automation summary shown on the My team page */
  lastReport?: string
  lastReportDay?: Day
}
export interface StaffCandidate extends Omit<StaffMember, 'hiredDay' | 'morale'> { bio: string; expiresDay: Day }
export interface StaffState { members: StaffMember[]; candidates: StaffCandidate[]; lastRefreshDay: Day }

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------
export type LedgerCategory =
  | 'wage' | 'payout' | 'ad_spend' | 'cogs' | 'shipping' | 'apps' | 'subscription' | 'rent' | 'food'
  | 'gear' | 'staff' | 'creative' | 'samples' | 'inventory' | 'fees' | 'refund' | 'chargeback'
  | 'interest' | 'tax' | 'loan' | 'transfer' | 'fun' | 'moving' | 'misc'
export type AccountRef = 'bank' | 'card'

export interface LedgerEntry {
  id: string
  hour: Hour
  account: AccountRef
  /** positive = money in (or card payment/credit), negative = money out (or card charge) */
  amount: number
  category: LedgerCategory
  memo: string
  business: boolean
}
export interface RecurringBill {
  id: string
  name: string
  amount: number
  cadence: 'weekly' | 'monthly' | 'yearly'
  nextDueDay: Day
  payWith: AccountRef
  category: LedgerCategory
  business: boolean
  /** app/plan/staff id this bill belongs to */
  ref?: string
  // ---- optional (sim-life-finance) ----
  /** first day a payment attempt failed (null/undefined = current) */
  failedSince?: Day | null
  /** unpaid amount carried forward (rent, salaries) */
  arrears?: number
  lastPaidDay?: Day
  /** monthly/yearly anchor day-of-month */
  dom?: number
}
export interface Loan {
  id: string
  lender: 'shopifly_capital' | 'bank'
  principal: number
  remaining: number
  /** share of each Shopifly payout withheld until repaid (capital) */
  withholdPct: number
  takenDay: Day
  // ---- optional (sim-life-finance) ----
  /** flat fee as a share of principal (capital) */
  feePct?: number
  /** payouts already withheld against (idempotency) */
  withheldPayoutIds?: string[]
  repaid?: number
}
export interface CardStatement {
  closeDay: Day
  balance: number
  minDue: number
  dueDay: Day
  interest: number
  fees: number
  paid: number
  status: 'open' | 'paid_full' | 'paid_min' | 'late'
}
export interface DailyPnl {
  revenue: number
  refunds: number
  chargebacks: number
  cogs: number
  shipping: number
  adSpendFadbook: number
  adSpendTiktak: number
  paymentFees: number
  apps: number
  creatives: number
  staff: number
  inventory: number
  otherBusiness: number
  personalIncome: number
  personalSpend: number
}
export interface FinanceState {
  cash: number
  card: {
    limit: number
    balance: number
    apr: number
    /** day-of-month statement closes */
    statementDom: number
    statementBalance: number
    minDue: number
    dueDay: Day | null
    autopay: 'none' | 'min' | 'full'
    lateCount: number
    frozen: boolean
    // ---- optional (sim-life-finance) ----
    statements?: CardStatement[]
    /** card payments received since the last statement closed */
    paidSinceStatement?: number
    /** minimum payments missed and still owed */
    pastDue?: number
    /** consecutive statements paid at least the minimum on time */
    onTimeStreak?: number
    /** last statement not paid in full → interest accrues at next close */
    carriedBalance?: boolean
    /** APR before any penalty rate */
    baseApr?: number
    lastIncreaseDay?: Day | null
  }
  loans: Loan[]
  ledger: LedgerEntry[]
  bills: RecurringBill[]
  pnl: Record<Day, DailyPnl>
  taxes: {
    ytdBusinessProfit: number; paidYtd: number; nextDueDay: Day; lastEstimate: number
    // ---- optional (sim-life-finance) ----
    year?: number
    /** unpaid estimated tax (+ penalties) */
    owed?: number
    owedSinceDay?: Day | null
    penalties?: number
    priorYearProfit?: number
    priorYearPaid?: number
    /** debit estimated payments from checking on the due date */
    autopay?: boolean
    payments?: { day: Day; amount: number; label: string }[]
    /** estimated payment due on nextDueDay (set by the 14-day reminder, reduced by payments) */
    pending?: number
  }
  // ---- optional (sim-life-finance) ----
  /** last day the Shopifly Capital offer email was sent */
  capitalOfferMailDay?: Day | null
  /** last day a low-balance warning was sent */
  lowBalanceWarnDay?: Day | null
  /** real-time business cash "in flight" snapshot helpers are derived, not stored */
}

// ---------------------------------------------------------------------------
// Catalog / sourcing / market
// ---------------------------------------------------------------------------
/** dropship = AliExprez; agent = sourcing-agent dropship (faster/cheaper); bulk = own stock at US 3PL; private_label = branded bulk */
export type FulfillmentMode = 'dropship' | 'agent' | 'bulk' | 'private_label'
export interface ProductMarket {
  /** other stores running ads on this product */
  competitors: number
  /** 0..1 */
  saturation: number
  /** current demand multiplier from trend × season (not incl. saturation) */
  trendIndex: number
  /** trendIndex 14 days ago (for "rising/falling" signals) */
  trendIndex14: number
  /** public AliExprez stats (dynamic) */
  orders30d: number
  rating: number
  reviews: number
  /** competitor floor price seen in Mineo */
  competitorPrice: number
  /** your store's share of recent ad-driven sales in this product (0..1) */
  yourShare: number
  // ---- optional (sim-market-events) ----
  /** compact history for charts, one sample every 2 days (last ~90 days): [day, orders30d, competitors, trendIndex×100] */
  hist?: [Day, number, number, number][]
}
export interface SampleOrder { id: string; catalogId: string; orderedDay: Day; arriveDay: Day; received: boolean; cost: number }
export interface BulkOrder {
  id: string
  catalogId: string
  qty: number
  unitCost: number
  method: 'sea' | 'air'
  kind: 'bulk' | 'private_label'
  orderedDay: Day
  /** production done (delayed by CNY) */
  shipDay: Day
  arriveDay: Day
  status: 'production' | 'in_transit' | 'received'
  total: number
  // ---- optional (sim-market-events) ----
  /** cost breakdown of `total` */
  goods?: number
  freight?: number
  duty?: number
  customsFee?: number
  brandName?: string
}
export interface SourcingState {
  mode: FulfillmentMode
  brandName?: string
  /** agent quote (unit cost) if requested */
  agentQuote?: number
  /** 3PL reorder point automation (ops manager) */
  reorderPoint?: number
}
export interface CatalogState {
  /** product ids currently listed on AliExprez */
  available: string[]
  market: Record<string, ProductMarket>
  favorites: string[]
  samples: SampleOrder[]
  /** catalog ids you physically have a sample of */
  samplesOwned: string[]
  bulkOrders: BulkOrder[]
  inventory: Record<string, { units: number; avgCost: number }>
  sourcing: Record<string, SourcingState>
  unlocks: { agent: boolean; threePL: boolean; privateLabel: boolean; spyTool: boolean }
  spyToolUntilDay: Day | null
  /** research depth per product 0..3 (reveals insights) */
  research: Record<string, number>
  // ---- optional (sim-market-events) ----
  /** your store's sales per catalog product, counted by the market module from store.orders */
  sales?: Record<string, CatalogSales>
  /** highest store order id already counted into `sales` */
  salesCountedOrderId?: number
  /** Mineo subscription renews monthly while true */
  spyToolAutoRenew?: boolean
}
export interface CatalogSales {
  orders: number
  units: number
  revenue: number
  /** product + shipping + fees recorded on the orders */
  costs: number
  /** units fulfilled via AliExprez/agent dropship (these show up in the supplier's public order count) */
  dropshipUnits: number
  /** last 30 days: [day, orders, units, revenue] */
  daily: [Day, number, number, number][]
}

// ---------------------------------------------------------------------------
// Store (Shopifly)
// ---------------------------------------------------------------------------
export type PlanId = 'trial' | 'basic' | 'shopifly' | 'advanced'
export type SectionId =
  | 'reviews' | 'trust_badges' | 'faq' | 'shipping_info' | 'guarantee' | 'bundle_offer' | 'sticky_atc'
  | 'countdown' | 'comparison' | 'as_seen_on' | 'size_chart' | 'benefits_icons' | 'ugc_gallery'
  | 'stock_scarcity' | 'free_shipping_bar' | 'how_it_works' | 'founder_note'

export interface MediaItem {
  id: string
  kind: 'supplier' | 'lifestyle' | 'ugc_photo' | 'video' | 'gif'
  /** asset url (product image path or creative thumbnail) */
  src: string
  alt: string
  /** CSS treatment for supplier-gallery variants (crop/zoom/background) */
  variant?: number
}
export interface PageSection { id: SectionId; enabled: boolean; settings?: Record<string, unknown> }
export interface StoreProduct {
  id: string
  catalogId: string
  status: 'draft' | 'active' | 'archived'
  title: string
  /** limited HTML: p, ul, ol, li, strong, em, h3, br */
  descriptionHtml: string
  media: MediaItem[]
  price: number
  compareAtPrice: number | null
  costPerItem: number
  variants: { name: string; values: string[] }[]
  trackInventory: boolean
  weightKg: number
  seo: { title: string; description: string; handle: string }
  productType: string
  vendor: string
  tags: string[]
  sections: PageSection[]
  reviews: { count: number; avg: number; photos: number; source: 'none' | 'imported' | 'organic' }
  /** delivery window the page promises customers (from shipping section / description) */
  promisedDays: [number, number] | null
  createdDay: Day
  publishedDay: Day | null
  /** cached result of grading at last save */
  grade?: PageGrade
  // ---- optional (sim-store) ----
  /** best page score that has earned copywriting XP (anti-farming) */
  xpBestScore?: number
}
export interface PageGradeFactor {
  key: string
  label: string
  /** 0..100 */
  score: number
  weight: number
  /** player-facing tip (why + how to fix) */
  tip: string
  // ---- optional (sim-store) ----
  /** 'good' ≥ 75, 'warn' 45–74, 'bad' < 45 */
  status?: 'good' | 'warn' | 'bad'
  /** specific findings, most important first (editor reveals more with copywriting skill) */
  details?: string[]
}
/** Text-analysis readout of a product page (sim-store), for skill-gated editor helpers. */
export interface CopyMetrics {
  words: number
  bullets: number
  headings: number
  paragraphs: number
  avgParagraphWords: number
  /** "you"/"your" count */
  youCount: number
  /** distinct benefit words found (product keywords + generic benefit vocabulary) */
  benefitWords: string[]
  /** product keywords found in title/description */
  keywordHits: string[]
  /** spec-sheet / feature-only words count */
  featureWords: number
  /** 0..1 similarity of the description to the supplier copy */
  supplierSimilarity: number
  /** 0..1 similarity of the title to the supplier title */
  titleSimilarity: number
  mentionsGuarantee: boolean
  mentionsShipping: boolean
  /** supplier/spam phrases found ("hot sale", "please allow 1-3cm error"…) */
  spamTerms: string[]
  /** risky medical/absolute claims found ("cure", "guaranteed results"…) */
  claimTerms: string[]
  /** buyer objections and whether the description or FAQ answers them */
  objections: { text: string; covered: boolean }[]
}
export interface PageGrade {
  score: number
  /** multiplier applied to base CVR (≈0.45..1.35) */
  cvrMult: number
  /** multiplier on AOV from offers (bundles/upsells) */
  aovMult: number
  /** 0..1 trust (affects high-ticket CVR, chargebacks) */
  trust: number
  /** seconds */
  loadTime: number
  /** 0..1 honesty (promised shipping vs real, fake scarcity) — low honesty raises chargebacks */
  honesty: number
  factors: PageGradeFactor[]
  gradedHour: Hour
  // ---- optional (sim-store) ----
  copy?: CopyMetrics
  /** page promises faster delivery than fulfillment can do */
  shippingLie?: boolean
}
export interface InstalledApp { appId: string; installedDay: Day; planIdx: number; settings?: Record<string, unknown> }
export interface Discount {
  id: string
  code: string
  kind: 'percent' | 'fixed' | 'free_shipping' | 'bxgy' | 'quantity_break'
  value: number
  automatic: boolean
  active: boolean
  usage: number
  createdDay: Day
}
export interface Order {
  id: number
  hour: Hour
  storeProductId: string
  catalogId: string
  qty: number
  variant?: string
  subtotal: number
  discount: number
  shippingCharged: number
  total: number
  upsell: number
  source: TrafficSource
  adId?: string
  device: Device
  customer: { name: string; email: string; city: string; region: string; returning: boolean }
  financial: 'paid' | 'refunded' | 'partially_refunded' | 'disputed' | 'chargeback_lost' | 'chargeback_won'
  fulfillment: 'unfulfilled' | 'fulfilled' | 'delivered'
  fulfilledBy: '3pl' | 'dropship'
  shipDay: Day | null
  /** planned delivery day */
  deliverDay: Day
  deliveredDay: Day | null
  promisedMaxDays: number | null
  /** real costs for profit reports */
  cogs: number
  shippingCost: number
  fees: number
  refunded: number
  /** hidden: will this unit disappoint */
  defective: boolean
  // ---- optional (sim-store) ----
  /** fulfillment route used for this order */
  mode?: FulfillmentMode
  /** hour the supplier/3PL order was placed & paid; null = waiting (no DSerz → manual Fulfill, or payment failed) */
  supplierOrderedHour?: Hour | null
  /** owed to the supplier for this order (unit cost incl. import duty + shipping) */
  supplierCost?: number
  /** carrier tracking number once shipped */
  tracking?: string
  paymentMethod?: 'card' | 'shop_pay' | 'paypal' | 'bnpl'
  discountCode?: string
  /** delivered after the promised window */
  late?: boolean
  /** page honesty when the customer bought (lying about shipping raises disputes) */
  honesty?: number
  /** internal schedule: customer contact / dispute days (hidden) */
  wismoDay?: Day | null
  issueDay?: Day | null
  questionDay?: Day | null
  cbDay?: Day | null
  escalated?: boolean
  /** a support ticket for this order was answered */
  ticketAnswered?: boolean
  replacementSent?: boolean
  reviewed?: boolean
  /** refunded before shipping: supplier order cancelled */
  cancelled?: boolean
  /** Klavio abandoned-checkout recovery */
  recovered?: boolean
}
export interface SupportTicket {
  id: string
  orderId: number
  kind: 'wismo' | 'defect' | 'refund_request' | 'question' | 'angry'
  subject: string
  body: string
  createdHour: Hour
  status: 'open' | 'solved' | 'escalated'
  /** unanswered past this → escalates (chargeback risk / bad review) */
  dueHour: Hour
  resolution?: 'answered' | 'refunded' | 'replacement' | 'partial_refund'
  // ---- optional (sim-store) ----
  customer?: string
  email?: string
  productTitle?: string
  solvedHour?: Hour
  /** who closed it: the player, staff, or an app auto-reply */
  solvedBy?: 'you' | 'staff' | 'auto'
  // ---- optional (ui-shopifly-core) ----
  /** text of the reply the merchant sent from the Inbox */
  reply?: string
}
export interface Chargeback {
  id: string
  orderId: number
  amount: number
  reason: 'not_received' | 'not_as_described' | 'fraudulent' | 'unrecognized'
  openedDay: Day
  respondByDay: Day
  status: 'needs_response' | 'submitted' | 'won' | 'lost' | 'accepted'
  handledBy?: 'self' | 'app' | 'staff'
  /** 0..1 evidence strength (tracking, delivery, policies, honest page) */
  evidence: number
  decideDay?: Day
  // ---- optional (sim-store) ----
  /** dispute fee charged when opened (returned on a win) */
  fee?: number
  submittedDay?: Day
  customer?: string
  /** issuer-facing reason text */
  reasonText?: string
  /** evidence checklist shown on the dispute page */
  evidenceItems?: { label: string; ok: boolean }[]
}
export interface Payout {
  id: string
  amount: number
  createdDay: Day
  arriveDay: Day
  status: 'pending' | 'paid' | 'held'
  /** gross/fees breakdown for the payouts table */
  gross: number
  fees: number
  refunds: number
  adjustments: number
  // ---- optional (sim-store) ----
  kind?: 'sales' | 'reserve_release'
  /** explanation for held/adjusted payouts */
  note?: string
  /** Shopifly Capital repayment withheld from this payout */
  capitalWithheld?: number
  /** chargeback reserve withheld from this payout */
  reserveWithheld?: number
}
export interface StoreDay {
  sessions: number
  sessionsBySource: Partial<Record<TrafficSource, number>>
  sessionsByDevice: Record<Device, number>
  /** sessions with add-to-cart */
  atc: number
  /** sessions that reached checkout */
  checkout: number
  /** sessions converted */
  converted: number
  orders: number
  units: number
  grossSales: number
  discounts: number
  returns: number
  netSales: number
  shipping: number
  taxes: number
  totalSales: number
  newCustomers: number
  returningCustomers: number
  ordersBySource: Partial<Record<TrafficSource, number>>
  salesBySource: Partial<Record<TrafficSource, number>>
  byProduct: Record<string, { sessions: number; atc: number; orders: number; units: number; sales: number }>
  cogs: number
  fees: number
}
export interface StoreHour { sessions: number; orders: number; sales: number; atc: number; checkout: number; visitors: number }
export interface StoreState {
  created: boolean
  name: string
  /** e.g. "cozy-paws.myshopifly.com" */
  subdomain: string
  customDomain: string | null
  plan: PlanId
  trialEndsDay: Day | null
  createdDay: Day | null
  theme: {
    id: string; primaryColor: string; font: string; logoText: string
    // ---- optional (ui-shopifly-merch: theme editor / preferences) ----
    /** sale badges, links, highlights (default: the theme preset accent) */
    accentColor?: string
    /** page background (default: the theme preset background) */
    background?: string
    /** announcement bar text above the header ('' hides it; undefined = automatic from shipping settings) */
    announcement?: string
  }
  policies: { refund: string; shipping: string; privacy: string; terms: string; contact: string }
  payments: { paypal: boolean; shopPay: boolean; bnpl: boolean }
  shipping: { freeShipping: boolean; flatRate: number; freeOver: number | null }
  products: StoreProduct[]
  apps: InstalledApp[]
  discounts: Discount[]
  orders: Order[]
  orderSeq: number
  customers: { total: number; returning: number }
  emailSubscribers: number
  tickets: SupportTicket[]
  chargebacks: Chargeback[]
  payouts: Payout[]
  /** sales captured but not yet in a payout */
  pendingBalance: number
  hold: {
    active: boolean; reason: string; untilDay: Day; reservePct: number
    // ---- optional (sim-store) ----
    /** all payouts paused (risk review) until pauseUntilDay */
    paused?: boolean
    pauseUntilDay?: Day
    kind?: 'review' | 'reserve' | 'review_reserve'
  } | null
  analytics: { daily: Record<Day, StoreDay>; hourly: Record<Hour, StoreHour> }
  /** purchases seen by each pixel (data maturity) */
  pixel: Record<Platform, { installed: boolean; purchases: number; atc: number; views: number }>
  /** visitors on site right now (Live View) */
  liveVisitors: number
  /** repeat-purchase pipeline for consumables: customers expected to reorder */
  repeatPipeline: { catalogId: string; storeProductId: string; day: Day; count: number }[]
  // ---- optional (sim-store) ----
  /** purchased premium themes (free themes are always available) */
  themesOwned?: string[]
  /** money captured since the last payout (payout breakdown) */
  balanceBreakdown?: { gross: number; fees: number; refunds: number; adjustments: number }
  /** chargeback reserve slices held back from payouts */
  reserves?: { id: string; amount: number; releaseDay: Day }[]
  /** Klavio abandoned-checkout recoveries scheduled as email orders */
  recovery?: { storeProductId: string; hour: Hour; count: number }[]
  /** checkouts abandoned per product today (Klavio recovery pool) */
  abandoned?: { day: Day; byProduct: Record<string, number> }
  /** hourly batch for the "new orders" notification */
  saleBatch?: { hour: Hour; count: number; amount: number; notifId: string }
  cbWarnDay?: Day | null
  lifetimeOrders?: number
  lifetimeSales?: number
  domainRenewDay?: Day | null
  /** support desk stats (Inbox header) */
  support?: { solved: number; escalated: number; responseHoursSum: number; answered: number }
}

// ---------------------------------------------------------------------------
// Ads (Fadbook + TikTak)
// ---------------------------------------------------------------------------
export type EntityStatus = 'active' | 'paused' | 'deleted'
export type AdLevel = 'campaign' | 'adset' | 'ad'
export interface AdAccount {
  id: string
  platform: Platform
  name: string
  status: 'active' | 'restricted' | 'disabled' | 'in_review' | 'payment_failed'
  createdDay: Day
  /** index into BENCHMARKS[platform].spendLimitLadder */
  spendLimitTier: number
  lifetimeSpend: number
  /** spend accrued since last billing charge */
  unbilled: number
  /** index into billingThresholds */
  billingTier: number
  payWith: AccountRef
  /** 0..100 */
  quality: number
  /** agency-rented account: fee on spend, higher limits, fewer bans */
  rentedFeePct: number | null
  appeal: { submittedDay: Day; resolveDay: Day } | null
  disapprovals: number
  todaySpend: number
  // ---- optional (sim-ads) ----
  /** numeric account id as shown in Ads Manager ("Ad account ID: 1029…") */
  displayId?: string
  /** business manager label shown in the account switcher */
  businessName?: string
  /** agency renting out the account (rented accounts only) */
  agencyName?: string
  /** player-facing reason for restricted / disabled / payment_failed */
  statusReason?: string
  statusSinceHour?: Hour
  /** billing charges & failures, oldest first (capped) */
  billingHistory?: AdBillingRecord[]
  /** failed charges (decays daily; ban-risk & quality signal) */
  failedPayments?: number
  lastFailedPaymentDay?: Day
  /** day of the last >3x budget jump (ban-risk signal for 3 days) */
  budgetJumpDay?: Day
  /** appeal rejected: the decision is final */
  appealDenied?: boolean
  /** times this account was restricted/disabled */
  banCount?: number
  yesterdaySpend?: number
}
export interface AdBillingRecord {
  id: string
  hour: Hour
  amount: number
  status: 'paid' | 'failed'
  /** account charged (null when the charge failed) */
  method: AccountRef | null
  reason: 'threshold' | 'monthly' | 'manual'
  /** billing threshold that triggered the charge */
  threshold?: number
}
export interface Targeting {
  type: 'broad' | 'interest' | 'lookalike' | 'retargeting'
  interests: string[]
  audienceId: string | null
  ageMin: number
  ageMax: number
  gender: 'all' | 'female' | 'male'
  geo: 'US' | 'T1'
  placements: 'advantage' | 'feeds' | 'reels_stories'
}
export interface Campaign {
  id: string
  platform: Platform
  accountId: string
  name: string
  objective: 'sales'
  kind: 'manual' | 'advantage'
  status: EntityStatus
  budgetMode: 'cbo' | 'abo'
  dailyBudget: number | null
  bidStrategy: 'lowest_cost' | 'cost_cap'
  costCap: number | null
  createdHour: Hour
  // ---- optional (sim-ads) ----
  pausedHour?: Hour | null
  lastBudgetChangeHour?: Hour
}
export interface LearningState {
  state: 'learning' | 'learning_limited' | 'active'
  /** conversions per day for the last 7 days (index 0 = today) */
  window: number[]
  resetHour: Hour
  budgetAtReset: number
}
export interface AdSet {
  id: string
  campaignId: string
  platform: Platform
  name: string
  status: EntityStatus
  dailyBudget: number | null
  targeting: Targeting
  optimization: 'purchase' | 'add_to_cart'
  createdHour: Hour
  learning: LearningState
  /** unique people reached lifetime (approx) */
  reach: number
  impressions: number
  // ---- optional (sim-ads) ----
  pausedHour?: Hour | null
  lastBudgetChangeHour?: Hour
  /** CBO: share of the campaign budget the optimizer gave this ad set last hour (0..1) */
  allocShare?: number
}
export interface AdDayStats {
  spend: number
  impressions: number
  reach: number
  clicks: number
  linkClicks: number
  lpv: number
  /** Fadbook: 3-second plays; TikTak: 2-second views */
  videoViewsShort: number
  /** Fadbook: ThruPlays (15s); TikTak: 6-second views */
  videoViewsLong: number
  v25: number; v50: number; v75: number; v100: number
  atc: number
  checkouts: number
  /** platform-REPORTED purchases (inflated/delayed) */
  purchases: number
  purchaseValue: number
  /** ground truth (hidden from Ads Manager; Shopifly shows reality) */
  truePurchases: number
  trueRevenue: number
  likes: number
  comments: number
  shares: number
}
export interface Ad {
  id: string
  adSetId: string
  campaignId: string
  platform: Platform
  name: string
  status: EntityStatus
  creativeId: string
  storeProductId: string
  primaryText: string
  headline: string
  cta: 'shop_now' | 'learn_more' | 'order_now' | 'get_offer'
  review: 'in_review' | 'approved' | 'rejected'
  rejectReason?: string
  createdHour: Hour
  /** daily stats keyed by Day (pruned after 120 days into `lifetime`) */
  stats: Record<Day, AdDayStats>
  lifetime: AdDayStats
  /** rolling 7-day frequency on this ad's audience */
  frequency: number
  // ---- optional (sim-ads) ----
  firstDeliveryHour?: Hour | null
  /** hour the policy review finishes (while review === 'in_review') */
  reviewDoneHour?: Hour
  /** TikTak Spark Ad: boosted organic post id */
  sparkPostId?: string
  /** share of the ad set's delivery this ad got last hour (0..1) */
  allocShare?: number
  pausedHour?: Hour | null
  /** daily auction noise draws (hidden) */
  noise?: { day: Day; cpm: number; ctr: number }
}
export interface CustomAudience {
  id: string
  platform: Platform
  kind: 'lookalike' | 'retargeting'
  name: string
  /** lookalike % (1..10) or retargeting window days */
  param: number
  size: number
  createdDay: Day
}
export interface PendingReport { adId: string; day: Day; releaseHour: Hour; purchases: number; value: number }
export interface AutomatedRule {
  id: string
  platform: Platform
  name: string
  enabled: boolean
  scope: AdLevel
  metric: 'cpa' | 'roas' | 'spend' | 'ctr' | 'frequency'
  op: '>' | '<'
  value: number
  minSpend: number
  action: 'pause' | 'increase_budget' | 'decrease_budget'
  actionPct: number
  // ---- optional (sim-ads) ----
  /** evaluation window for the metric (default last_3d) */
  window?: 'today' | 'yesterday' | 'last_3d' | 'last_7d' | 'lifetime'
  /** limit to these entity ids (empty/undefined = every entity at `scope` on the platform) */
  targetIds?: string[]
  lastRunHour?: Hour
}
export interface RuleLogEntry {
  id: string
  hour: Hour
  ruleId: string
  ruleName: string
  level: AdLevel
  entityId: string
  entityName: string
  action: AutomatedRule['action']
  detail: string
}
export interface AdsState {
  accounts: AdAccount[]
  campaigns: Campaign[]
  adSets: AdSet[]
  ads: Ad[]
  audiences: CustomAudience[]
  reportQueue: PendingReport[]
  rules: AutomatedRule[]
  /** organic TikTak posts */
  organicPosts: OrganicPost[]
  // ---- optional (sim-ads) ----
  /** account bans per platform (3+ → temporary advertising ban) */
  bans?: Partial<Record<Platform, number>>
  /** player may not open own accounts on this platform until this day */
  bannedUntil?: Partial<Record<Platform, Day>>
  /** automated rule executions, oldest first (capped) */
  ruleLog?: RuleLogEntry[]
  /** media_buying XP accounting (1 XP / $10 spend, capped daily) */
  mbXp?: { day: Day; granted: number; carry: number }
}
export interface OrganicPost {
  id: string
  creativeId: string
  storeProductId: string
  postedHour: Hour
  views: number
  likes: number
  shares: number
  /** remaining viral curve (views per hour decaying) */
  velocity: number
  sparked: boolean
  // ---- optional (sim-ads) ----
  viral?: boolean
  /** hourly velocity decay factor */
  decay?: number
  /** hour a viral post takes off */
  popHour?: Hour | null
  /** hourly decay of the viral curve once it takes off */
  viralDecay?: number
  /** views the post will reach (hidden) */
  targetViews?: number
  comments?: number
  /** store sessions sent from the post (approx) */
  sessions?: number
}

/** traffic produced by ads/organic for the store to convert (sim-internal, not saved) */
export interface TrafficPacket {
  source: TrafficSource
  platform?: Platform
  adId?: string
  storeProductId: string
  sessions: number
  /** traffic-quality multiplier on CVR (audience fit, retargeting, email ≈ 0.5..3) */
  intent: number
  /** creative angle ↔ page message match multiplier (≈0.85..1.15) */
  messageMatch: number
  // ---- optional (sim-store) ----
  /** repeat-customer traffic (orders count as returning customers) */
  returning?: boolean
}
/** conversions the store reports back for attribution (sim-internal) */
export interface ConversionEvent { adId: string; atc: number; checkouts: number; purchases: number; revenue: number }

// ---------------------------------------------------------------------------
// Creatives
// ---------------------------------------------------------------------------
export type CreativeProducer = 'self' | 'supplier_edit' | 'ugc' | 'agency' | 'staff'
export interface CreativeScores {
  /** 0..1 each */
  hook: number
  body: number
  cta: number
  /** product/format/hook/angle fit */
  fit: number
  /** overall creative strength (≈0.3..2.2 multiplier scale, 1 = average) */
  power: Record<Platform, number>
  tips: string[]
}
export interface Creative {
  id: string
  catalogId: string
  name: string
  format: FormatId
  hook: HookId
  angle: AngleId
  beats: BeatId[]
  /** on-screen hook text the player wrote */
  hookText: string
  /** optional script/voiceover the player wrote */
  script: string
  producer: CreativeProducer
  creatorId: string | null
  /** 0..1 production quality */
  quality: number
  status: 'waiting_sample' | 'in_production' | 'ready' | 'failed'
  orderedHour: Hour
  readyHour: Hour | null
  cost: number
  isVideo: boolean
  durationSec: number
  scores: CreativeScores | null
  /** product image path used for the thumbnail/mockup */
  thumb: string
  /** other stores also use this footage (supplier edits) → faster fatigue */
  shared: boolean
  // ---- optional (sim-ads) ----
  /** UGC: hour the product reaches the creator */
  sampleArriveHour?: Hour | null
  /** agency pack id (3 variations share it) */
  packId?: string
  /** delivery style (native feels organic; polished looks like an ad) */
  style?: 'native' | 'polished'
  /** > 1 = fatigues faster (e.g. a creator stole the ad) */
  fatigueBoost?: number
  failReason?: string
}
export interface UgcCreator {
  id: string
  name: string
  portrait: string
  tier: 'newbie' | 'pro' | 'star'
  pricePerVideo: number
  deliveryDays: [number, number]
  quality: [number, number]
  niches: Niche[]
  rating: number
  jobs: number
  style: 'native' | 'polished'
  // ---- optional (sim-ads) ----
  handle?: string
  bio?: string
  location?: string
  /** marketplace listing expires (weekly refresh) */
  expiresDay?: Day
}
export interface CreativeState { creatives: Creative[]; creators: UgcCreator[]; lastCreatorRefreshDay: Day }

// ---------------------------------------------------------------------------
// Events, coach, notifications, mail
// ---------------------------------------------------------------------------
export interface Modifiers {
  cpmMult: Record<Platform, number>
  ctrMult: Record<Platform, number>
  cvrMult: number
  /** multiplier on platform-reported purchases (tracking outages < 1) */
  attributionMult: Record<Platform, number>
  /** extra days added to new dropship orders (CNY etc.) */
  dropshipDelayDays: number
  /** supplier production delay for bulk orders */
  supplierDelayDays: number
  /** extra organic sessions per hour by storeProductId (viral, influencer) */
  organicBoost: Record<string, number>
  /** per catalogId CPM/CVR pressure from competitors (1 = none) */
  competitionMult: Record<string, number>
  // ---- optional (read by sim-ads) ----
  /** platform outage: no ad delivery while true */
  deliveryPaused?: Partial<Record<Platform, boolean>>
  // ---- optional (sim-market-events) ----
  /** policy crackdown: multiply product claimRisk for ad review / ban risk (1 = normal) */
  claimRiskMult?: number
  /** friendly-fraud wave: multiply chargeback probability on orders with total ≥ chargebackMinOrder */
  chargebackMult?: number
  chargebackMinOrder?: number
  /** extra creative fatigue by creativeId (e.g. another store ripped your ad) — divide fatigue frequency by this */
  creativeFatigueMult?: Record<string, number>
}
export interface ActiveEvent {
  id: string
  kind: string
  title: string
  startDay: Day
  endDay: Day
  data?: Record<string, unknown>
}
export interface ModalChoice { id: string; label: string; hint?: string; tone?: 'primary' | 'critical' | 'default' }
export interface GameModal {
  id: string
  kind: string
  title: string
  body: string
  image?: string
  choices: ModalChoice[]
  data?: Record<string, unknown>
}
export interface EventsState {
  active: ActiveEvent[]
  log: { day: Day; kind: string; title: string }[]
  cooldowns: Record<string, Day>
  modals: GameModal[]
  modifiers: Modifiers
}
export interface CoachState {
  enabled: boolean
  shown: Record<string, Hour>
  /** tips queued for the coach bubble */
  queue: { id: string; text: string; hour: Hour; app?: SiteId }[]
}
export type SiteId =
  | 'shopifly' | 'storefront' | 'fadbook' | 'tiktak' | 'aliexprez' | 'mineo' | 'studio'
  | 'bank' | 'mail' | 'mcdoodles' | 'zillo' | 'amazin' | 'upworx' | 'academy'
export interface GameNotification {
  id: string
  hour: Hour
  kind: 'sale' | 'info' | 'success' | 'warning' | 'critical' | 'coach'
  title: string
  body?: string
  /** clicking opens this site/path */
  site?: SiteId
  path?: string
  /** amount for sale toasts */
  amount?: number
  read: boolean
}
export interface MailMessage {
  id: string
  hour: Hour
  from: string
  fromEmail: string
  subject: string
  body: string
  read: boolean
  tag: 'supplier' | 'platform' | 'coach' | 'bank' | 'job' | 'landlord' | 'shopifly' | 'customer' | 'creator' | 'misc'
  /** optional deep link */
  site?: SiteId
  path?: string
}
export interface DailySnapshot {
  day: Day
  cash: number
  netWorth: number
  revenue: number
  adSpend: number
  profit: number
  orders: number
}
