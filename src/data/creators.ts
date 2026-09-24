// UGC creator marketplace (CreatorHub). OWNER: sim-ads.
// Profiles are the stable "people" (portrait p01..p18, see docs/ART.md); each weekly refresh
// (sim/ads/creatives.ts → refreshCreators) lists 8–12 of them with a tier, price, turnaround and
// quality band drawn from CREATOR_TIERS. Prices follow BENCHMARKS.creatives.ugcCreatorCost
// ($150–400/video; Billo 2025 average ≈ $198, median ≈ $175).
import type { Niche } from './productList'
import type { UgcCreator } from '../core/types'

export interface CreatorProfile {
  id: string
  name: string
  /** people/<portrait>.webp */
  portrait: string
  handle: string
  location: string
  /** content niches they film well (a niche match adds a little quality) */
  niches: Niche[]
  style: UgcCreator['style']
  /** tiers this person can be listed at (newer creators move up over time) */
  tiers: UgcCreator['tier'][]
  bio: string
}

export interface CreatorTierDef {
  label: string
  price: [number, number]
  quality: [number, number]
  /** creator turnaround after the product arrives (days) */
  deliveryDays: [number, number]
  rating: [number, number]
  jobs: [number, number]
  /** share of marketplace listings */
  weight: number
}

export const CREATOR_TIERS: Record<UgcCreator['tier'], CreatorTierDef> = {
  newbie: { label: 'Rising talent', price: [150, 200], quality: [0.45, 0.65], deliveryDays: [3, 6], rating: [4.3, 4.9], jobs: [1, 24], weight: 0.4 },
  pro: { label: 'Pro creator', price: [220, 320], quality: [0.6, 0.8], deliveryDays: [4, 7], rating: [4.6, 4.95], jobs: [30, 190], weight: 0.4 },
  star: { label: 'Top rated', price: [350, 400], quality: [0.75, 0.9], deliveryDays: [5, 8], rating: [4.8, 5.0], jobs: [160, 640], weight: 0.2 },
}

/** Marketplace size per weekly refresh. */
export const CREATOR_LISTINGS_PER_WEEK: [number, number] = [8, 12]

// p12 (COACH_PORTRAIT) is Coach Kev, so it is not used for a creator.
export const CREATOR_PROFILES: CreatorProfile[] = [
  {
    id: 'cr_amara', name: 'Amara Okafor', portrait: 'p01', handle: '@amaratriesit', location: 'Atlanta, GA',
    niches: ['beauty', 'fashion', 'wellness'], style: 'native', tiers: ['newbie', 'pro', 'star'],
    bio: 'Honest "does it actually work" reviews. Braids, skincare and the occasional kitchen gadget. Films in natural light, fast replies.',
  },
  {
    id: 'cr_kenji', name: 'Kenji Watanabe', portrait: 'p02', handle: '@kenjiunboxes', location: 'San Jose, CA',
    niches: ['gadgets', 'car', 'outdoor'], style: 'native', tiers: ['newbie', 'pro'],
    bio: 'Tech and desk-setup creator. Crisp ASMR unboxings, quick-cut demos, captions on everything.',
  },
  {
    id: 'cr_lucia', name: 'Lucía Hernández', portrait: 'p03', handle: '@mamalucia.home', location: 'San Antonio, TX',
    niches: ['home', 'kitchen', 'baby'], style: 'native', tiers: ['pro', 'star'],
    bio: 'Mom of three filming real family life. Cleaning hacks, kitchen tools and "things that saved my sanity" videos.',
  },
  {
    id: 'cr_walt', name: 'Walt Brennan', portrait: 'p04', handle: '@grandpawalt', location: 'Bozeman, MT',
    niches: ['outdoor', 'car', 'home'], style: 'native', tiers: ['newbie', 'pro'],
    bio: 'Retired shop teacher. Tests tools and outdoor gear in the garage and on the trail. Viewers trust the beard.',
  },
  {
    id: 'cr_marcus', name: 'Marcus Reed', portrait: 'p06', handle: '@dadmodemarcus', location: 'Charlotte, NC',
    niches: ['kids', 'car', 'fitness', 'gadgets'], style: 'native', tiers: ['newbie', 'pro', 'star'],
    bio: 'Girl dad, weekend griller, garage gym guy. Relatable skits and straight-talk testimonials.',
  },
  {
    id: 'cr_hazel', name: 'Hazel Quinn', portrait: 'p07', handle: '@hazelcurlsandco', location: 'Portland, OR',
    niches: ['beauty', 'pet', 'wellness'], style: 'native', tiers: ['newbie', 'pro', 'star'],
    bio: 'Curly-hair routines, cozy self-care and two very photogenic cats. Great on camera, voiceovers included.',
  },
  {
    id: 'cr_meiling', name: 'Mei-Ling Chen', portrait: 'p08', handle: '@auntiemei.cooks', location: 'Queens, NY',
    niches: ['kitchen', 'home', 'wellness'], style: 'polished', tiers: ['pro', 'star'],
    bio: 'Former caterer. Beautifully lit cooking and kitchen-tool videos with a calm, trustworthy voice.',
  },
  {
    id: 'cr_omar', name: 'Omar Haddad', portrait: 'p09', handle: '@omarfixesthings', location: 'Dearborn, MI',
    niches: ['gadgets', 'car', 'fitness'], style: 'native', tiers: ['newbie', 'pro'],
    bio: 'Car detailing, gym gear and gadget tests. Energetic hooks, lots of before-and-after footage.',
  },
  {
    id: 'cr_rio', name: 'Rio Park', portrait: 'p10', handle: '@rio.makes.stuff', location: 'Austin, TX',
    niches: ['fashion', 'beauty', 'gadgets', 'home'], style: 'native', tiers: ['newbie', 'pro', 'star'],
    bio: 'Trend-native creator: green screen, POV skits and slideshow edits that look like organic posts.',
  },
  {
    id: 'cr_karen', name: 'Karen Lindqvist', portrait: 'p11', handle: '@karen.reviews', location: 'Scottsdale, AZ',
    niches: ['home', 'wellness', 'fashion', 'beauty'], style: 'polished', tiers: ['pro', 'star'],
    bio: 'Former local TV host. Studio-quality testimonials and founder-style explainers. Very clean, very on-brand.',
  },
  {
    id: 'cr_zara', name: 'Zara Malik', portrait: 'p05', handle: '@zaratestsit', location: 'Houston, TX',
    niches: ['gadgets', 'outdoor', 'car', 'fitness'], style: 'native', tiers: ['newbie', 'pro'],
    bio: 'Fast-talking demo creator. Road-trip gear, gym gadgets and product tests outside, with a strong first three seconds.',
  },
  {
    id: 'cr_bernice', name: 'Bernice Coleman', portrait: 'p13', handle: '@nanabernice', location: 'Baltimore, MD',
    niches: ['kitchen', 'home', 'kids', 'wellness'], style: 'native', tiers: ['pro', 'star'],
    bio: 'Grandma energy. Warm testimonials, gift-idea videos and kitchen reviews that feel like advice from family.',
  },
  {
    id: 'cr_arjun', name: 'Arjun Mehta', portrait: 'p14', handle: '@arjun.explains', location: 'Edison, NJ',
    niches: ['gadgets', 'wellness', 'home'], style: 'polished', tiers: ['newbie', 'pro', 'star'],
    bio: 'Engineer turned explainer. Clear side-by-side comparisons and "here is how it works" breakdowns.',
  },
  {
    id: 'cr_linh', name: 'Linh Tran', portrait: 'p15', handle: '@linhinthecity', location: 'Seattle, WA',
    niches: ['beauty', 'fashion', 'pet', 'baby'], style: 'native', tiers: ['newbie', 'pro', 'star'],
    bio: 'Apartment-life vlogger. Aesthetic morning routines, pet content and very saveable slideshows.',
  },
  {
    id: 'cr_margaret', name: 'Margaret Ellis', portrait: 'p16', handle: '@margaretgardens', location: 'Asheville, NC',
    niches: ['outdoor', 'home', 'pet', 'wellness'], style: 'polished', tiers: ['pro', 'star'],
    bio: 'Garden and home content with a gentle, trustworthy voice. Slow, beautiful b-roll and calm voiceovers.',
  },
  {
    id: 'cr_tahoma', name: 'Tahoma Begay', portrait: 'p17', handle: '@tahoma.outside', location: 'Flagstaff, AZ',
    niches: ['outdoor', 'fitness', 'car', 'pet'], style: 'native', tiers: ['newbie', 'pro'],
    bio: 'Trail runner and camper. Rugged field tests, dog adventures and gear that has to survive real use.',
  },
  {
    id: 'cr_steven', name: 'Steven Cho', portrait: 'p18', handle: '@stevenbuildsit', location: 'Irvine, CA',
    niches: ['gadgets', 'home', 'kids', 'baby'], style: 'polished', tiers: ['newbie', 'pro', 'star'],
    bio: 'Dad and product designer. Tidy tabletop demos, unboxings and "setting up the nursery" series.',
  },
]

export const creatorProfile = (id: string) => CREATOR_PROFILES.find(p => p.id === id)
