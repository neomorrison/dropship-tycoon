import { describe, expect, it } from 'vitest'
import type { GameState } from '../../../core/types'
import { resolveModal } from '../../../core/modals'
import {
  adsDayRollover, createAd, createAdSet, createCampaign, deliveryLabel, openAdAccount, payAdBalance, submitAppeal,
} from '..'
import { banAccount, accountBanRisk } from '../accounts'
import { findAd } from '../shared'
import { makeGame, runHours, strongCreative } from './helpers'

function launch(s: GameState, budget: number, platform: 'fadbook' | 'tiktak' = 'fadbook') {
  const cr = strongCreative(s)
  const campaignId = createCampaign(s, { platform, name: 'Prospecting', budgetMode: 'abo' })!
  const adSetId = createAdSet(s, { campaignId, name: 'Broad', dailyBudget: budget })!
  const adId = createAd(s, { adSetId, name: 'Ad 1', creativeId: cr.id, storeProductId: 'sp_test', primaryText: 'Pet hair everywhere? One swipe and it is gone.', headline: 'Pet hair gone' })!
  findAd(s, adId)!.review = 'approved'
  return { campaignId, adSetId, adId }
}

describe('ad accounts', () => {
  it('new accounts are capped by the spend-limit ladder, which rises with spend', () => {
    const { s, sp } = makeGame({ seed: 4 })
    const id = openAdAccount(s, 'fadbook')!
    const acc = s.ads.accounts.find(a => a.id === id)!
    expect(acc.spendLimitTier).toBe(0)
    launch(s, 400)
    runHours(s, 17, sp.price) // through midnight of day 0
    expect(acc.todaySpend).toBeLessThanOrEqual(50.01)
    runHours(s, 24 * 12, sp.price)
    expect(acc.lifetimeSpend).toBeGreaterThan(500)
    expect(acc.spendLimitTier).toBeGreaterThanOrEqual(1)
    expect(s.notifications.some(n => /spending limit increased/i.test(n.title))).toBe(true)
  })

  it('bills at rising thresholds through pay() with the right P&L bucket', () => {
    const { s, sp } = makeGame({ seed: 6 })
    openAdAccount(s, 'tiktak')
    launch(s, 60, 'tiktak')
    runHours(s, 24 * 4, sp.price)
    const acc = s.ads.accounts[0]
    const paid = (acc.billingHistory ?? []).filter(b => b.status === 'paid')
    expect(paid.length).toBeGreaterThanOrEqual(2)
    expect(paid[0].threshold).toBe(50)
    expect(paid[1].threshold).toBe(100)
    const pnl = Object.values(s.finance.pnl).reduce((a, p) => a + p.adSpendTiktak, 0)
    expect(pnl).toBeGreaterThan(140)
    expect(s.finance.ledger.some(l => l.category === 'ad_spend')).toBe(true)
  })

  it('rented agency accounts start higher and add a fee on spend', () => {
    const { s, sp } = makeGame({ seed: 9 })
    const id = openAdAccount(s, 'fadbook', { rented: true })!
    const acc = s.ads.accounts.find(a => a.id === id)!
    expect(acc.rentedFeePct).toBeGreaterThanOrEqual(0.03)
    expect(acc.rentedFeePct).toBeLessThanOrEqual(0.06)
    expect(acc.spendLimitTier).toBe(2)
    launch(s, 100)
    runHours(s, 20, sp.price)
    const billed = (acc.billingHistory ?? []).filter(b => b.status === 'paid').reduce((a, b) => a + b.amount, 0) + acc.unbilled
    expect(billed).toBeCloseTo(acc.lifetimeSpend * (1 + acc.rentedFeePct!), 1)
    const own = accountBanRisk(s, { ...acc, rentedFeePct: null })
    expect(accountBanRisk(s, acc).p).toBeLessThan(own.p)
  })

  it('a ban stops delivery and opens a decision modal; backup accounts start over', () => {
    const { s, sp } = makeGame({ seed: 10 })
    const id = openAdAccount(s, 'fadbook')!
    const acc = s.ads.accounts.find(a => a.id === id)!
    const x = launch(s, 50)
    runHours(s, 10, sp.price)
    banAccount(s, acc, 'claims')
    expect(['restricted', 'disabled']).toContain(acc.status)
    expect(deliveryLabel(s, 'ad', x.adId).tone).toBe('critical')
    const spent = acc.lifetimeSpend
    runHours(s, 10, sp.price)
    expect(acc.lifetimeSpend).toBe(spent)
    const modal = s.events.modals.find(m => m.kind === 'ads_account_ban')!
    expect(modal.choices.map(c => c.id)).toEqual(expect.arrayContaining(['appeal', 'rent', 'backup']))
    resolveModal(s, modal.id, 'backup')
    const backup = s.ads.accounts.find(a => a.id !== id)!
    expect(backup.status).toBe('active')
    expect(backup.spendLimitTier).toBe(0)
  })

  it('three bans lock the player out of new own accounts for 30 days', () => {
    const { s } = makeGame({ seed: 12 })
    for (let i = 0; i < 3; i++) {
      const id = openAdAccount(s, 'fadbook')!
      banAccount(s, s.ads.accounts.find(a => a.id === id)!, 'feedback')
    }
    expect(s.ads.bannedUntil?.fadbook).toBe(Math.floor(s.time.hour / 24) + 30)
    expect(openAdAccount(s, 'fadbook')).toBeNull()
    expect(openAdAccount(s, 'fadbook', { rented: true })).toBeTruthy()
  })

  it('appeals resolve after 2–4 days', () => {
    const { s } = makeGame({ seed: 14 })
    const id = openAdAccount(s, 'fadbook')!
    const acc = s.ads.accounts.find(a => a.id === id)!
    banAccount(s, acc, 'new')
    submitAppeal(s, id)
    expect(acc.appeal).toBeTruthy()
    const resolveDay = acc.appeal!.resolveDay
    for (let d = Math.floor(s.time.hour / 24) + 1; d <= resolveDay; d++) {
      s.time.hour = d * 24
      adsDayRollover(s, d)
    }
    expect(acc.appeal).toBeNull()
    expect(acc.status === 'active' || (acc.status === 'disabled' && acc.appealDenied)).toBe(true)
  })

  it('failed payments pause delivery until the balance is paid', () => {
    const { s, sp } = makeGame({ seed: 15 })
    const id = openAdAccount(s, 'fadbook')!
    launch(s, 45)
    s.finance.cash = 0
    s.finance.card.limit = 5
    runHours(s, 20, sp.price)
    const acc = s.ads.accounts.find(a => a.id === id)!
    expect(acc.status).toBe('payment_failed')
    expect(s.notifications.some(n => n.kind === 'critical' && /payment failed/i.test(n.title))).toBe(true)
    expect(payAdBalance(s, id)).toBe(false)
    s.finance.cash = 1000
    expect(payAdBalance(s, id)).toBe(true)
    expect(acc.status).toBe('active')
    expect(acc.unbilled).toBe(0)
  })
})
