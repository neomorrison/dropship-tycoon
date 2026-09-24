// Merch helpers: the copywriter produces copy the real page grader rewards (and better
// writers answer more objections), and the product-editor draft round-trips cleanly.
import { describe, expect, it } from 'vitest'
import { createNewGame } from '../../../../../core/newGame'
import { createStore, gradePage, importProduct, realDeliveryWindow, updateProduct } from '../../../../../sim/store'
import { allProducts } from '../../../../../sim/market'
import { copywriterRewrite } from '../copywriter'
import { applyDraft, convertWeight, draftKey, draftPatch, toDraft } from '../draft'
import { addSection, moveSection, reorderSection, setDeliveryWindow } from '../sectionOps'

function setup() {
  const s = createNewGame({ playerName: 'Test Player', difficulty: 'normal', seed: 4242 })
  createStore(s, { name: 'Test Shop' })
  return s
}

describe('copywriter rewrite', () => {
  it('writes grader-approved copy for every catalog product', () => {
    const s = setup()
    const defs = allProducts()
    let sumBefore = 0
    let sumAfter = 0
    for (const def of defs) {
      const id = importProduct(s, def.id)
      const p = s.store.products.find(x => x.id === id)!
      sumBefore += gradePage(s, p).score
      const cw = copywriterRewrite(def, { quality: 0.95, revision: 1, window: realDeliveryWindow(s, def.id), freeShip: true })
      expect(cw.title.length).toBeGreaterThanOrEqual(20)
      expect(cw.title.length).toBeLessThanOrEqual(70)
      const next = { ...p, title: cw.title, descriptionHtml: cw.descriptionHtml, sections: [{ id: 'faq' as const, enabled: true, settings: { items: cw.faq } }] }
      const g = gradePage(s, next)
      const f = (k: string) => g.factors.find(x => x.key === k)!.score
      expect(f('title')).toBeGreaterThanOrEqual(70)
      expect(f('description')).toBeGreaterThanOrEqual(85)
      expect(g.copy?.claimTerms ?? []).toEqual([])
      expect(g.shippingLie).toBe(false)
      sumAfter += g.score
    }
    expect(sumAfter / defs.length).toBeGreaterThan(sumBefore / defs.length + 20)
  })

  it('better copywriters answer more buyer objections', () => {
    const def = allProducts().find(d => d.objections.length >= 4)!
    const weak = copywriterRewrite(def, { quality: 0.58, revision: 1, window: [9, 16], freeShip: true })
    const strong = copywriterRewrite(def, { quality: 1, revision: 1, window: [9, 16], freeShip: true })
    expect(strong.answered).toBeGreaterThan(weak.answered)
    expect(strong.answered).toBe(def.objections.length)
  })

  it('is deterministic per revision', () => {
    const def = allProducts()[0]
    const a = copywriterRewrite(def, { quality: 0.8, revision: 2, window: [7, 14], freeShip: false })
    const b = copywriterRewrite(def, { quality: 0.8, revision: 2, window: [7, 14], freeShip: false })
    expect(a).toEqual(b)
  })
})

describe('product draft', () => {
  it('round-trips a product and converts weight units', () => {
    const s = setup()
    const id = importProduct(s, allProducts()[0].id)
    const p = s.store.products.find(x => x.id === id)!
    const d = toDraft(p)
    expect(draftKey(d)).toBe(draftKey(toDraft(p, 'lb')))
    const lb = convertWeight(d, 'lb')
    expect(Math.abs(Number(lb.weight) - p.weightKg * 2.20462)).toBeLessThan(0.01)
    const edited = { ...d, price: '24.99', compareAtPrice: '0', title: '  Better   title here for the page ' }
    const patch = draftPatch(edited)
    expect(patch.price).toBe(24.99)
    expect(patch.compareAtPrice).toBeNull()
    updateProduct(s, id, patch)
    const saved = s.store.products.find(x => x.id === id)!
    expect(saved.title).toBe('Better title here for the page')
    expect(applyDraft(p, edited).price).toBe(24.99)
  })
})

describe('section ops', () => {
  it('adds, orders within a zone and sets the delivery window', () => {
    let secs = addSection([], 'faq')
    secs = addSection(secs, 'trust_badges')
    secs = addSection(secs, 'reviews')
    // reviews and faq share the "main" zone; trust badges sit in the info column
    expect(moveSection(secs, 'reviews', -1).map(x => x.id)).toEqual(['reviews', 'trust_badges', 'faq'])
    expect(reorderSection(secs, 'reviews', 'trust_badges')).toBe(secs)
    const withShip = setDeliveryWindow(secs, 8, 15)
    const ship = withShip.find(x => x.id === 'shipping_info')!
    expect(ship.enabled).toBe(true)
    expect(ship.settings).toMatchObject({ minDays: 8, maxDays: 15 })
  })
})
