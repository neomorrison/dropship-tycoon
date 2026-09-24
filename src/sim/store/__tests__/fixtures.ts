// Test fixtures: a deterministic winner product, mocked neighbour modules, and a minimal GameState.
import type { Difficulty, GameState, StoreProduct, TrafficPacket } from '../../../core/types'
import {
  createStore, createStoreState, importProduct, installApp, setProductStatus, storeDayRollover, storeProcessTraffic, storeTickHour,
  updateProduct, updateStoreSettings,
} from '../index'
import { dayOf, hourOfDay } from '../../../core/time'
import { WINNER } from './mocks'
export { WINNER, APPEAL } from './mocks'

export function makeState(difficulty: Difficulty = 'normal', seed = 424242): GameState {
  const skills = { research: { level: 1, xp: 0 }, copywriting: { level: 1, xp: 0 }, creative: { level: 1, xp: 0 }, media_buying: { level: 1, xp: 0 }, operations: { level: 1, xp: 0 } }
  return {
    version: 1,
    meta: { saveId: 'test', playerName: 'Neo Tester', difficulty, seed, startDate: '2026-03-02', createdAtReal: 0, lastSavedReal: 0 },
    rng: seed,
    time: { hour: 2 * 24 + 7 },
    player: { name: 'Neo Tester', energy: 80, hunger: 70, mood: 60, location: 'home', activity: null, queue: [], burnoutDays: 0, sickDays: 0, lastSleepHour: 0, awakeHours: 0 },
    job: {} as GameState['job'],
    home: {} as GameState['home'],
    gear: { owned: [], equipped: {} },
    skills,
    staff: { members: [], candidates: [], lastRefreshDay: -1 },
    finance: {
      cash: 5000,
      card: { limit: 20000, balance: 0, apr: 0.28, statementDom: 25, statementBalance: 0, minDue: 0, dueDay: null, autopay: 'min', lateCount: 0, frozen: false },
      loans: [], ledger: [], bills: [], pnl: {},
      taxes: { ytdBusinessProfit: 0, paidYtd: 0, nextDueDay: 44, lastEstimate: 0 },
    },
    catalog: { available: [WINNER.id], market: {}, favorites: [], samples: [], samplesOwned: [], bulkOrders: [], inventory: {}, sourcing: {}, unlocks: { agent: false, threePL: false, privateLabel: false, spyTool: false }, spyToolUntilDay: null, research: {} },
    store: createStoreState(),
    ads: { accounts: [], campaigns: [], adSets: [], ads: [], audiences: [], reportQueue: [], rules: [], organicPosts: [] },
    creatives: { creatives: [], creators: [], lastCreatorRefreshDay: -1 },
    events: {
      active: [], log: [], cooldowns: {}, modals: [],
      modifiers: { cpmMult: { fadbook: 1, tiktak: 1 }, ctrMult: { fadbook: 1, tiktak: 1 }, cvrMult: 1, attributionMult: { fadbook: 1, tiktak: 1 }, dropshipDelayDays: 0, supplierDelayDays: 0, organicBoost: {}, competitionMult: {} },
    },
    coach: { enabled: true, shown: {}, queue: [] },
    notifications: [], inbox: [], milestones: {}, history: [], flags: {}, seq: 0,
  }
}

export const GREAT_DESCRIPTION = [
  '<p>Tired of finding dog and cat fur on your couch five minutes after you cleaned it? This reusable roller lifts pet hair in seconds with no sticky sheets and no refills. Just roll, open, empty. Done.</p>',
  '<h3>Why pet owners love it</h3>',
  '<ul>',
  '<li><strong>Works in seconds:</strong> a few back-and-forth strokes pull deep-set fur and lint out of couch fabric, bedding and car seats.</li>',
  '<li><strong>Reusable forever:</strong> no sticky sheets to buy. It saves you money every single week.</li>',
  '<li><strong>Mess-free to empty:</strong> open the self-cleaning chamber and drop the hair straight in the trash.</li>',
  '<li><strong>Gentle on your furniture:</strong> safe on upholstery, wool and delicate fabric, with no scratches and no residue.</li>',
  '<li><strong>Great on long fur too:</strong> tested on huskies, Maine Coons and everything in between.</li>',
  '</ul>',
  '<p>You get your couch back and your guests stop leaving covered in fur.</p>',
  '<p>Ships free with tracking and arrives in 8–14 days. Try it for 30 days: if it doesn\'t work for you, our money-back guarantee has you covered.</p>',
].join('')

/** A well-built page (what an expert would publish). */
export function greatProductPatch(p: StoreProduct): Partial<StoreProduct> {
  return {
    title: 'Pet Hair Remover Roller: Lifts Fur Off Couches in Seconds',
    descriptionHtml: GREAT_DESCRIPTION,
    price: 31.49,
    compareAtPrice: 44.99,
    media: [
      { id: 'm1', kind: 'supplier', src: p.media[0]?.src ?? '', alt: 'Roller front', variant: 0 },
      { id: 'm2', kind: 'supplier', src: p.media[0]?.src ?? '', alt: 'Roller open', variant: 1 },
      { id: 'm3', kind: 'lifestyle', src: '', alt: 'Rolling fur off a gray couch' },
      { id: 'm4', kind: 'lifestyle', src: '', alt: 'Emptying the chamber' },
      { id: 'm5', kind: 'ugc_photo', src: '', alt: 'Customer photo with a husky' },
      { id: 'm6', kind: 'video', src: '', alt: 'Demo video' },
    ],
    reviews: { count: 60, avg: 4.6, photos: 14, source: 'imported' },
    promisedDays: [8, 14],
    sections: [
      { id: 'shipping_info', enabled: true, settings: { minDays: 8, maxDays: 14, text: 'Free tracked shipping.' } },
      { id: 'reviews', enabled: true, settings: { layout: 'grid', showPhotos: true } },
      { id: 'guarantee', enabled: true, settings: { days: 30, text: 'Love it or your money back.' } },
      { id: 'trust_badges', enabled: true, settings: { badges: ['secure_checkout', 'money_back', 'free_returns'] } },
      { id: 'sticky_atc', enabled: true, settings: { showPrice: true } },
      {
        id: 'faq', enabled: true, settings: {
          items: [
            { q: 'Does it work on long fur?', a: 'Yes. It grabs long and short hair from dogs and cats alike.' },
            { q: 'Will it damage my couch?', a: 'No, it is gentle on upholstery and delicate fabric and leaves no residue.' },
            { q: 'How long does shipping take?', a: 'Orders arrive in 8–14 days with free tracked shipping.' },
            { q: 'How do I empty it?', a: 'Open the chamber and tip the hair into the trash. It takes two seconds.' },
          ],
        },
      },
    ],
  }
}

export function fillPolicies(s: GameState) {
  const long = (k: string) => `${k} policy: `.padEnd(160, 'We keep our promises to every customer. ')
  s.store.policies = { refund: long('Refund'), shipping: long('Shipping'), privacy: long('Privacy'), terms: long('Terms'), contact: 'support@furfreeco.com · Mon–Fri 9–6 ET' }
}

/** Paid-social packets distributed over the day like real delivery. */
export function adPackets(spId: string, perDay: number, hour: number, intent: number, messageMatch: number, adId = 'ad_1'): TrafficPacket[] {
  const share = [0.023, 0.015, 0.009, 0.007, 0.007, 0.011, 0.019, 0.032, 0.042, 0.047, 0.051, 0.053, 0.055, 0.054, 0.053, 0.053, 0.054, 0.057, 0.061, 0.065, 0.067, 0.066, 0.058, 0.041][hour % 24]
  return [{ source: 'fadbook', platform: 'fadbook', adId, storeProductId: spId, sessions: perDay * share, intent, messageMatch }]
}

/** Advance the store sim hour by hour (rollover → traffic → tick), like sim/index.ts does. */
export function runHours(s: GameState, hours: number, packets: (hour: number) => TrafficPacket[] = () => []) {
  for (let i = 0; i < hours; i++) {
    s.time.hour++
    if (hourOfDay(s.time.hour) === 0) storeDayRollover(s, dayOf(s.time.hour))
    storeProcessTraffic(s, packets(hourOfDay(s.time.hour)))
    storeTickHour(s)
  }
}

/** Naive player: import, keep supplier copy and the 2× price, install DSerz, publish. */
export function setupNaiveStore(s: GameState): string {
  createStore(s, { name: 'Fur Free Co' })
  const id = importProduct(s, WINNER.id)
  installApp(s, 'dserz')
  setProductStatus(s, id, 'active')
  return id
}

/** Expert player: the greatProductPatch page, policies, PayPal, reviews/trust/pixel apps, published. */
export function setupGreatStore(s: GameState): string {
  createStore(s, { name: 'Fur Free Co' })
  const id = importProduct(s, WINNER.id)
  for (const a of ['dserz', 'judgyme', 'trustbadgz', 'fadbook-channel']) installApp(s, a)
  fillPolicies(s)
  updateStoreSettings(s, { payments: { ...s.store.payments, paypal: true } })
  updateProduct(s, id, greatProductPatch(s.store.products.find(p => p.id === id)!))
  setProductStatus(s, id, 'active')
  return id
}
