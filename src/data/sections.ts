// Product-page sections (Shopifly theme editor blocks).
// OWNER: sim-store. The grader reads these settings shapes; the Theme Editor /
// Product Editor / storefront render them. Availability rules are enforced by
// `sectionAvailability()` in sim/store (apps installed, theme built-ins, UGC).
import type { SectionId } from '../core/types'

// ---- per-section settings shapes (PageSection.settings) ----
export interface FaqItem { q: string; a: string }
export interface FaqSettings { items: FaqItem[] }
export interface ShippingInfoSettings {
  /** delivery window promised to customers, in days after purchase */
  minDays: number | null
  maxDays: number | null
  /** extra copy, e.g. "Ships from our partner warehouse with tracking" */
  text: string
}
export interface GuaranteeSettings { days: number; text: string }
export interface BundleTier { qty: number; discountPct: number; label: string; badge?: string }
export interface BundleOfferSettings { tiers: BundleTier[] }
export interface CountdownSettings { minutes: number; text: string }
export interface StockScarcitySettings { unitsLeft: number }
export interface ComparisonRow { feature: string; us: boolean; them: boolean }
export interface ComparisonSettings { themLabel: string; rows: ComparisonRow[] }
export interface AsSeenOnSettings { outlets: string[] }
export interface SizeChartSettings { unit: 'in' | 'cm'; rows: { size: string; values: string[] }[]; columns: string[] }
export interface BenefitItem { icon: string; title: string; text: string }
export interface BenefitsIconsSettings { items: BenefitItem[] }
export interface UgcGallerySettings { creativeIds: string[] }
export interface FreeShippingBarSettings { threshold: number }
export interface HowItWorksStep { title: string; text: string }
export interface HowItWorksSettings { steps: HowItWorksStep[] }
export interface FounderNoteSettings { name: string; text: string }
export interface ReviewsSettings { layout: 'grid' | 'list' | 'carousel'; showPhotos: boolean }
export type TrustBadgeId = 'secure_checkout' | 'money_back' | 'free_returns' | 'fast_shipping' | 'support_247' | 'made_safe'
export interface TrustBadgesSettings { badges: TrustBadgeId[] }
export interface StickyAtcSettings { showPrice: boolean }

export interface SectionSettingsMap {
  reviews: ReviewsSettings
  trust_badges: TrustBadgesSettings
  faq: FaqSettings
  shipping_info: ShippingInfoSettings
  guarantee: GuaranteeSettings
  bundle_offer: BundleOfferSettings
  sticky_atc: StickyAtcSettings
  countdown: CountdownSettings
  comparison: ComparisonSettings
  as_seen_on: AsSeenOnSettings
  size_chart: SizeChartSettings
  benefits_icons: BenefitsIconsSettings
  ugc_gallery: UgcGallerySettings
  stock_scarcity: StockScarcitySettings
  free_shipping_bar: FreeShippingBarSettings
  how_it_works: HowItWorksSettings
  founder_note: FounderNoteSettings
}

export type SectionCategory = 'social_proof' | 'trust' | 'offer' | 'urgency' | 'info' | 'layout'

export interface SectionDef<K extends SectionId = SectionId> {
  id: K
  name: string
  /** lucide-react icon name */
  icon: string
  category: SectionCategory
  /** what it is (theme-editor description) */
  description: string
  /** neutral CRO note shown in the editor's help popover */
  cro: string
  requires?: {
    /** any one of these apps installed */
    apps?: string[]
    /** …or one of these themes published (built-in feature) */
    themes?: string[]
    /** needs UGC photos or UGC/self-shot creatives for this product */
    ugc?: boolean
  }
  /** human-readable requirement for locked sections */
  requirementText?: string
  /** extra product-page load time in seconds when enabled */
  loadCost: number
  defaultSettings: SectionSettingsMap[K]
}

type SectionTable = { [K in SectionId]: SectionDef<K> }

const TABLE: SectionTable = {
  reviews: {
    id: 'reviews', name: 'Product reviews', icon: 'Star', category: 'social_proof',
    description: 'Star rating under the title and a reviews widget below the description.',
    cro: 'Most shoppers read reviews before buying from a store they have never heard of. A few dozen believable reviews do more than a perfect 5.0.',
    requires: { apps: ['judgyme', 'lookz', 'vitalz'] },
    requirementText: 'Install a reviews app (Judgy.me, Lookz or Vitalz).',
    loadCost: 0,
    defaultSettings: { layout: 'grid', showPhotos: true },
  },
  trust_badges: {
    id: 'trust_badges', name: 'Trust badges', icon: 'ShieldCheck', category: 'trust',
    description: 'Secure-checkout and guarantee icons under the Add to cart button.',
    cro: 'Reassures first-time buyers right where they decide. Only show promises you actually keep.',
    requires: { apps: ['trustbadgz', 'vitalz'], themes: ['shrined'] },
    requirementText: 'Install TrustBadgz or Vitalz, or use a theme with built-in trust icons (Shrined).',
    loadCost: 0,
    defaultSettings: { badges: ['secure_checkout', 'money_back', 'free_returns'] },
  },
  faq: {
    id: 'faq', name: 'FAQ', icon: 'HelpCircle', category: 'info',
    description: 'Collapsible questions and answers.',
    cro: 'Answer the questions that stop people from buying (does it work, will it fit, how long is shipping, what if I hate it).',
    loadCost: 0,
    defaultSettings: { items: [] },
  },
  shipping_info: {
    id: 'shipping_info', name: 'Shipping & delivery', icon: 'Truck', category: 'info',
    description: 'Estimated delivery window shown next to the buy button.',
    cro: 'A clear delivery window cuts "where is my order?" emails. Promise what your supplier can really do; late orders turn into refunds and chargebacks.',
    loadCost: 0,
    defaultSettings: { minDays: null, maxDays: null, text: 'Ships with tracking. You will get an email as soon as your order is on its way.' },
  },
  guarantee: {
    id: 'guarantee', name: 'Money-back guarantee', icon: 'BadgeCheck', category: 'trust',
    description: 'Risk-reversal block ("Try it for 30 days").',
    cro: 'Removes the risk of trying an unknown brand. Your refund policy has to match it.',
    loadCost: 0,
    defaultSettings: { days: 30, text: 'Love it or get your money back. No questions asked.' },
  },
  bundle_offer: {
    id: 'bundle_offer', name: 'Quantity breaks', icon: 'Layers', category: 'offer',
    description: 'Buy more, save more tiers above the buy button.',
    cro: 'Raises average order value, which lets you pay more per customer on ads. Keep the discounts believable (5–20%).',
    requires: { apps: ['bundlr', 'vitalz'], themes: ['impulsive'] },
    requirementText: 'Install Bundlr or Vitalz, or use a theme with built-in quantity breaks (Impulsive).',
    loadCost: 0.03,
    defaultSettings: {
      tiers: [
        { qty: 1, discountPct: 0, label: 'Buy 1' },
        { qty: 2, discountPct: 10, label: 'Buy 2, save 10%', badge: 'Most popular' },
        { qty: 3, discountPct: 15, label: 'Buy 3, save 15%', badge: 'Best value' },
      ],
    },
  },
  sticky_atc: {
    id: 'sticky_atc', name: 'Sticky add to cart', icon: 'PanelBottom', category: 'layout',
    description: 'Keeps the Add to cart bar visible while scrolling on mobile.',
    cro: 'Most paid-social traffic is on phones. Keeping the button in reach helps shoppers who scroll through the whole page.',
    loadCost: 0.02,
    defaultSettings: { showPrice: true },
  },
  countdown: {
    id: 'countdown', name: 'Countdown timer', icon: 'Timer', category: 'urgency',
    description: 'A timer counting down to the end of the offer.',
    cro: 'A little urgency can help undecided shoppers. Timers that reset on every visit are easy to spot and cost you trust.',
    requires: { apps: ['tickr', 'vitalz'] },
    requirementText: 'Install Tickr or Vitalz.',
    loadCost: 0.02,
    defaultSettings: { minutes: 15, text: 'Sale ends in' },
  },
  comparison: {
    id: 'comparison', name: 'Us vs. them', icon: 'Columns2', category: 'info',
    description: 'A comparison table against the usual alternative.',
    cro: 'Makes the value obvious when shoppers are comparing options (for example versus disposable rollers).',
    loadCost: 0.03,
    defaultSettings: { themLabel: 'Others', rows: [] },
  },
  as_seen_on: {
    id: 'as_seen_on', name: 'As seen on', icon: 'Newspaper', category: 'trust',
    description: 'A strip of press and publication logos.',
    cro: 'Real press builds trust. Invented press logos on a brand-new store are a classic scam signal.',
    loadCost: 0.05,
    defaultSettings: { outlets: ['The Daily Scroll', 'Trendline Weekly', 'HomeHacks Magazine'] },
  },
  size_chart: {
    id: 'size_chart', name: 'Size chart', icon: 'Ruler', category: 'info',
    description: 'A measurements table in a drawer.',
    cro: 'Essential for anything that has to fit. Cuts returns and "will it fit" emails.',
    loadCost: 0,
    defaultSettings: { unit: 'in', columns: ['Chest', 'Length'], rows: [] },
  },
  benefits_icons: {
    id: 'benefits_icons', name: 'Benefit icons', icon: 'Sparkles', category: 'info',
    description: '3–4 icons with a short benefit each.',
    cro: 'Lets people who skim get the main benefits at a glance. Lead with outcomes, not specs.',
    loadCost: 0.03,
    defaultSettings: { items: [] },
  },
  ugc_gallery: {
    id: 'ugc_gallery', name: 'Customer photos & videos', icon: 'Images', category: 'social_proof',
    description: 'A gallery of real customers using the product.',
    cro: 'Real people using the product are some of the strongest proof you can show. It needs your own UGC or creator content.',
    requires: { ugc: true },
    requirementText: 'Needs customer/UGC photos or a finished UGC or self-shot creative for this product.',
    loadCost: 0.2,
    defaultSettings: { creativeIds: [] },
  },
  stock_scarcity: {
    id: 'stock_scarcity', name: 'Low stock alert', icon: 'Flame', category: 'urgency',
    description: '"Only 7 left in stock" under the price.',
    cro: 'Honest scarcity works. A number that never changes on a dropshipped item is fake scarcity.',
    requires: { apps: ['tickr', 'vitalz'] },
    requirementText: 'Install Tickr or Vitalz.',
    loadCost: 0.01,
    defaultSettings: { unitsLeft: 7 },
  },
  free_shipping_bar: {
    id: 'free_shipping_bar', name: 'Free shipping bar', icon: 'PackageCheck', category: 'offer',
    description: '"You are $12 away from free shipping" progress bar.',
    cro: 'Nudges shoppers to add a second item when free shipping starts at a threshold above one unit.',
    loadCost: 0.02,
    defaultSettings: { threshold: 50 },
  },
  how_it_works: {
    id: 'how_it_works', name: 'How it works', icon: 'ListOrdered', category: 'info',
    description: 'A three-step visual explanation.',
    cro: 'Great for anything new or unfamiliar. If shoppers can picture using it, they are more likely to buy.',
    loadCost: 0.08,
    defaultSettings: { steps: [] },
  },
  founder_note: {
    id: 'founder_note', name: 'Founder note', icon: 'PenLine', category: 'trust',
    description: 'A short personal note from the person behind the store.',
    cro: 'A human face makes a new brand feel accountable. Keep it short and genuine.',
    loadCost: 0.05,
    defaultSettings: { name: '', text: '' },
  },
}

/** Section catalog in theme-editor order. */
export const SECTIONS: SectionDef[] = [
  TABLE.shipping_info, TABLE.reviews, TABLE.trust_badges, TABLE.guarantee, TABLE.bundle_offer, TABLE.sticky_atc,
  TABLE.faq, TABLE.benefits_icons, TABLE.how_it_works, TABLE.comparison, TABLE.ugc_gallery, TABLE.free_shipping_bar,
  TABLE.size_chart, TABLE.founder_note, TABLE.countdown, TABLE.stock_scarcity, TABLE.as_seen_on,
] as SectionDef[]

export function sectionDef<K extends SectionId>(id: K): SectionDef<K> {
  return TABLE[id] as SectionDef<K>
}

/** Typed settings accessor (falls back to defaults for missing/invalid settings). */
export function sectionSettings<K extends SectionId>(id: K, settings: Record<string, unknown> | undefined): SectionSettingsMap[K] {
  const def = TABLE[id].defaultSettings as SectionSettingsMap[K]
  if (!settings || typeof settings !== 'object') return def
  return { ...def, ...(settings as Partial<SectionSettingsMap[K]>) }
}

/** Trust badge labels for the storefront. */
export const TRUST_BADGE_LABELS: Record<TrustBadgeId, string> = {
  secure_checkout: 'Secure checkout',
  money_back: 'Money-back guarantee',
  free_returns: 'Free returns',
  fast_shipping: 'Fast shipping',
  support_247: '24/7 support',
  made_safe: 'Safety tested',
}
