// Mocked neighbour modules + the test product. No runtime imports (vi.mock factories load this file).
import type { GameState, ProductDef, RecurringBill, SkillId } from '../../../core/types'

export const WINNER: ProductDef = {
  id: 'pet-hair-roller',
  name: 'Reusable Pet Hair Remover Roller',
  niche: 'pet',
  archetype: 'winner',
  supplierTitle: '2026 New Pet Hair Remover Roller Reusable Lint Brush Dog Cat Fur Sofa Carpet Cleaning Tool Hot Sale',
  supplierDescription:
    'Product Name: Pet Hair Remover Roller\nMaterial: ABS + Nylon\nColor: Grey, Blue\nSize: 22*11cm\n\nFeature:\n1. Reusable, no need sticky paper\n' +
    '2. Easy to clean, just open the dust box\n3. Suitable for sofa, bed, carpet, car seat\n\nPackage Include: 1 x Pet Hair Remover Roller\n\n' +
    'Note: Please allow 1-3cm error due to manual measurement. Due to the different display and different light, the picture may not reflect the actual color of the item.',
  specs: { Material: 'ABS + Nylon', Size: '22 x 11 cm' },
  variants: [{ name: 'Color', values: ['Grey', 'Blue'] }],
  cogs: 6.5,
  shipCost: 2.5,
  shipDays: [8, 14],
  weightKg: 0.25,
  bulkCogs: 4.4,
  moq: 200,
  privateLabelCogs: 5.1,
  privateLabelMoq: 500,
  perceivedValue: 34.99,
  amazonPrice: 32.99,
  baseDemand: 0.9,
  wow: 0.75,
  problemSolving: 0.85,
  impulse: 0.7,
  giftable: 0.3,
  repeatRate: 0,
  audience: { gender: 'female', ageMin: 25, ageMax: 54 },
  platformFit: { fadbook: 0.85, tiktak: 0.8 },
  bestFormats: ['demo_video', 'before_after_video'],
  bestHooks: ['problem_callout', 'before_after'],
  bestAngles: ['pain_point', 'pet_love'],
  seasonality: Array(12).fill(1),
  trend: { kind: 'evergreen', emergeDay: 0, peakDay: 0, halfLifeDays: 9999 },
  startSaturation: 0.2,
  startCompetitors: 10,
  defectRate: 0.05,
  claimRisk: 0.05,
  scaleCeiling: 3000,
  keywords: ['pet hair', 'fur', 'reusable', 'no sticky sheets', 'couch', 'self-cleaning', 'seconds', 'lint', 'mess-free'],
  objections: ['Does it work on long fur?', 'Will it damage my couch fabric?', 'How long does shipping take?', 'Is it easy to empty?', "What if it doesn't work for me?"],
  publicSignals: { ordersBase: 9000, rating: 4.7, reviews: 3200, supplierYears: 6, choice: true },
  releaseDay: 0,
  brandable: 0.6,
}

export const APPEAL = 0.8

export const marketMock = {
  getProduct: (id: string) => {
    if (id === WINNER.id) return WINNER
    throw new Error(`Unknown product ${id}`)
  },
  allProducts: () => [WINNER],
  productAppeal: () => APPEAL,
  fulfillmentFor: () => ({ mode: 'dropship' as const, unitCost: 8.45, shipCost: 2.5, shipDays: [8, 14] as [number, number], inStock: true }),
  takeInventory: () => false,
  publicListing: () => null,
}
export const financeMock = {
  upsertBill: (s: GameState, b: RecurringBill) => {
    const i = s.finance.bills.findIndex(x => x.ref === b.ref)
    if (i >= 0) s.finance.bills[i] = b
    else s.finance.bills.push(b)
  },
  removeBillByRef: (s: GameState, ref: string) => {
    s.finance.bills = s.finance.bills.filter(b => b.ref !== ref)
  },
}
export const lifeMock = {
  grantXp: (s: GameState, skill: SkillId, xp: number) => {
    s.skills[skill].xp += xp
  },
  enqueueActivity: () => 'act_test',
}
