// Money primitives shared by every sim module. All cash movement MUST go through here
// so the ledger, P&L and bank/card balances stay consistent.
import type { AccountRef, DailyPnl, GameState, LedgerCategory } from './types'
import { dayOf } from './time'
import { uid } from './ids'

const LEDGER_CAP = 800

export const emptyPnl = (): DailyPnl => ({
  revenue: 0, refunds: 0, chargebacks: 0, cogs: 0, shipping: 0, adSpendFadbook: 0, adSpendTiktak: 0,
  paymentFees: 0, apps: 0, creatives: 0, staff: 0, inventory: 0, otherBusiness: 0, personalIncome: 0, personalSpend: 0,
})

export function pnlFor(s: GameState, day = dayOf(s.time.hour)): DailyPnl {
  return (s.finance.pnl[day] ??= emptyPnl())
}
export function addPnl(s: GameState, key: keyof DailyPnl, amount: number, day?: number) {
  const p = pnlFor(s, day)
  p[key] += amount
}

const DEFAULT_PNL_KEY: Partial<Record<LedgerCategory, keyof DailyPnl>> = {
  cogs: 'cogs', shipping: 'shipping', apps: 'apps', creative: 'creatives', staff: 'staff', inventory: 'inventory',
  fees: 'paymentFees', refund: 'refunds', chargeback: 'chargebacks', samples: 'otherBusiness',
  rent: 'personalSpend', food: 'personalSpend', gear: 'personalSpend', fun: 'personalSpend', moving: 'personalSpend',
  wage: 'personalIncome',
}

export interface PayOpts {
  category: LedgerCategory
  memo: string
  /** business expense (shows in P&L) vs personal */
  business?: boolean
  /** which account to try first. 'auto' = card for business spend, bank for personal */
  prefer?: AccountRef | 'auto'
  /** only use the preferred account; fail instead of falling back */
  strict?: boolean
  /** override the P&L bucket (e.g. 'adSpendFadbook'); null = don't record in P&L */
  pnl?: keyof DailyPnl | null
}

function pushLedger(s: GameState, account: AccountRef, amount: number, o: PayOpts) {
  s.finance.ledger.push({ id: uid(s, 'tx'), hour: s.time.hour, account, amount, category: o.category, memo: o.memo, business: !!o.business })
  if (s.finance.ledger.length > LEDGER_CAP) s.finance.ledger.splice(0, s.finance.ledger.length - LEDGER_CAP)
}

export const cardAvailable = (s: GameState) => (s.finance.card.frozen ? 0 : Math.max(0, s.finance.card.limit - s.finance.card.balance))

/** Spend money. Returns the account used, or null if neither account could cover it. */
export function pay(s: GameState, amount: number, o: PayOpts): AccountRef | null {
  if (!(amount > 0)) return amount === 0 ? 'bank' : null
  const first: AccountRef = o.prefer && o.prefer !== 'auto' ? o.prefer : o.business ? 'card' : 'bank'
  const order: AccountRef[] = o.strict ? [first] : [first, first === 'bank' ? 'card' : 'bank']
  for (const acct of order) {
    if (acct === 'bank' && s.finance.cash >= amount) {
      s.finance.cash -= amount
      pushLedger(s, 'bank', -amount, o)
      recordPnl(s, amount, o)
      return 'bank'
    }
    if (acct === 'card' && cardAvailable(s) >= amount) {
      s.finance.card.balance += amount
      pushLedger(s, 'card', -amount, o)
      recordPnl(s, amount, o)
      return 'card'
    }
  }
  return null
}

function recordPnl(s: GameState, amount: number, o: PayOpts) {
  if (o.pnl === null) return
  const key = o.pnl ?? DEFAULT_PNL_KEY[o.category] ?? (o.business ? 'otherBusiness' : 'personalSpend')
  addPnl(s, key, amount)
}

/** Money in to the bank account (wages, payouts, refunds received...). */
export function receive(s: GameState, amount: number, o: Omit<PayOpts, 'prefer' | 'strict'>) {
  if (!(amount > 0)) return
  s.finance.cash += amount
  pushLedger(s, 'bank', amount, o)
  if (o.pnl !== undefined && o.pnl !== null) addPnl(s, o.pnl, amount)
  else if (o.category === 'wage') addPnl(s, 'personalIncome', amount)
}

/** Move money bank -> credit card. Returns amount actually paid. */
export function payCard(s: GameState, amount: number): number {
  const amt = Math.min(amount, s.finance.cash, s.finance.card.balance)
  if (amt <= 0) return 0
  s.finance.cash -= amt
  s.finance.card.balance -= amt
  pushLedger(s, 'bank', -amt, { category: 'transfer', memo: 'Payment to Chaise Sapphire card', business: false })
  pushLedger(s, 'card', amt, { category: 'transfer', memo: 'Payment received — thank you', business: false })
  return amt
}

/** Value of inventory on hand + in transit at cost. */
export function inventoryValue(s: GameState): number {
  let v = 0
  for (const inv of Object.values(s.catalog.inventory)) v += inv.units * inv.avgCost
  for (const o of s.catalog.bulkOrders) if (o.status !== 'received') v += o.total
  return v
}

export function netWorth(s: GameState): number {
  const pendingPayouts = s.store.payouts.filter(p => p.status !== 'paid').reduce((a, p) => a + p.amount, 0)
  const loans = s.finance.loans.reduce((a, l) => a + l.remaining, 0)
  const unbilledAds = s.ads.accounts.reduce((a, acc) => a + acc.unbilled, 0)
  return s.finance.cash - s.finance.card.balance + s.store.pendingBalance + pendingPayouts + inventoryValue(s) - loans - unbilledAds
}
