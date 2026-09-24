import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../market', async () => (await import('./mocks')).marketMock)
vi.mock('../../finance', async () => (await import('./mocks')).financeMock)
vi.mock('../../life', async () => (await import('./mocks')).lifeMock)

import type { GameState } from '../../../core/types'
import { createStore, gradePage, importProduct, installApp, updateProduct, updateStoreSettings } from '../index'
import { fillPolicies, greatProductPatch, makeState, WINNER } from './fixtures'

function naive(s: GameState) {
  createStore(s, { name: 'Fur Free Co' })
  const id = importProduct(s, WINNER.id)
  return s.store.products.find(p => p.id === id)!
}
function great(s: GameState) {
  const p = naive(s)
  for (const a of ['dserz', 'judgyme', 'trustbadgz', 'fadbook-channel']) installApp(s, a)
  fillPolicies(s)
  updateStoreSettings(s, { payments: { ...s.store.payments, paypal: true } })
  updateProduct(s, p.id, greatProductPatch(p))
  return s.store.products.find(x => x.id === p.id)!
}

describe('gradePage', () => {
  let s: GameState
  beforeEach(() => { s = makeState() })

  it('scores an imported supplier-copy page below 45', () => {
    const p = naive(s)
    const g = gradePage(s, p)
    expect(p.title).toBe(WINNER.supplierTitle)
    // DSerz-style default: landed cost (8.45 unit incl. duty + 2.50 shipping) × 2, rounded up to .99
    expect(p.price).toBe(21.99)
    expect(g.score).toBeLessThan(45)
    expect(g.cvrMult).toBeLessThan(0.7)
    const title = g.factors.find(f => f.key === 'title')!
    const desc = g.factors.find(f => f.key === 'description')!
    expect(title.score).toBeLessThanOrEqual(15)
    expect(desc.score).toBeLessThanOrEqual(15)
    expect(g.copy!.supplierSimilarity).toBeGreaterThan(0.5)
    expect(title.tip).toMatch(/supplier/i)
  })

  it('scores a well-written page above 80', () => {
    const p = great(s)
    const g = gradePage(s, p)
    expect(g.score).toBeGreaterThan(80)
    expect(g.cvrMult).toBeGreaterThan(1.15)
    expect(g.honesty).toBe(1)
    expect(g.trust).toBeGreaterThan(0.75)
    expect(g.loadTime).toBeLessThanOrEqual(2.5)
    expect(g.copy!.words).toBeGreaterThanOrEqual(100)
    expect(g.copy!.words).toBeLessThanOrEqual(220)
    expect(g.copy!.bullets).toBe(5)
    expect(g.copy!.objections.filter(o => o.covered).length).toBeGreaterThanOrEqual(4)
    // every factor has a player-facing tip
    for (const f of g.factors) expect(f.tip.length).toBeGreaterThan(5)
  })

  it('grants copywriting XP once when a save improves the grade by 5+', () => {
    const p = naive(s)
    updateProduct(s, p.id, { title: 'Pet Hair Remover Roller: Lifts Fur Off Couches in Seconds' })
    const xp1 = s.skills.copywriting.xp
    updateProduct(s, p.id, greatProductPatch(p))
    const xp2 = s.skills.copywriting.xp
    expect(xp2).toBeGreaterThan(xp1)
    // tiny edit: no XP farming
    updateProduct(s, p.id, { compareAtPrice: 44.49 })
    expect(s.skills.copywriting.xp).toBe(xp2)
  })

  it('punishes promising faster shipping than fulfillment can do', () => {
    const p = great(s)
    const honest = gradePage(s, p)
    updateProduct(s, p.id, { promisedDays: [3, 5] })
    const lying = gradePage(s, s.store.products[0])
    expect(lying.shippingLie).toBe(true)
    expect(honest.honesty - lying.honesty).toBeGreaterThanOrEqual(0.3)
  })

  it('treats a perfect 5.0 as suspicious and slows the page with heavy apps', () => {
    const p = great(s)
    const base = gradePage(s, p)
    updateProduct(s, p.id, { reviews: { count: 60, avg: 5, photos: 14, source: 'imported' } })
    const perfect = gradePage(s, s.store.products[0])
    expect(perfect.factors.find(f => f.key === 'social_proof')!.score).toBeLessThan(base.factors.find(f => f.key === 'social_proof')!.score)
    for (const a of ['vitalz', 'lookz', 'salespop', 'currencyx', 'pagefli']) installApp(s, a)
    const heavy = gradePage(s, s.store.products[0])
    expect(heavy.loadTime).toBeGreaterThan(3)
    expect(heavy.factors.find(f => f.key === 'speed')!.score).toBeLessThan(70)
  })

  it('caps a copied title even when the rest of the page is good', () => {
    const p = great(s)
    updateProduct(s, p.id, { title: WINNER.supplierTitle })
    const g = gradePage(s, s.store.products[0])
    expect(g.factors.find(f => f.key === 'title')!.score).toBeLessThanOrEqual(15)
    expect(g.copy!.titleSimilarity).toBeGreaterThan(0.5)
  })
})
