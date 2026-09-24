// Ad accounts: opening (own / backup / rented agency), spend-limit ladder, billing thresholds,
// failed payments, account quality, bans & disapprovals risk, appeals.
import type { AdAccount, AdBillingRecord, GameModal, GameState, Platform } from '../../core/types'
import { chance, clamp, randInt, randRange } from '../../core/rng'
import { domOf, formatDate } from '../../core/time'
import { pay } from '../../core/money'
import { mail, notify, coachTip } from '../../core/notify'
import { pushModal, registerModalHandler } from '../../core/modals'
import { DIFFICULTY } from '../../core/difficulty'
import { uid } from '../../core/ids'
import { enqueueActivity } from '../life'
import {
  MAIL_FROM, PLATFORM_NAME, PNL_KEY, adRange, bench, billingThresholdOf, claimRiskMult, findAccount, findCreative, findStoreProduct,
  fmtMoney, productDef, spendLimitOf, today,
} from './shared'

/** One-time setup fee charged by the agency when renting an account. */
export const AGENCY_SETUP_FEE: Record<Platform, number> = { fadbook: 150, tiktak: 150 }
const AGENCIES = ['Blue Harbor Media', 'Apex Scale Partners', 'Northstar Ad Accounts', 'Kinetic Growth Agency', 'Meridian Media Group']
/** lifetime spend needed for each spend-limit step (with account quality > 60) */
const LIMIT_STEPS = [500, 5_000, 25_000, 100_000]
const HISTORY_CAP = 120
const BAN_MODAL = 'ads_account_ban'
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------
function digits(s: GameState, n: number): string {
  let out = String(randInt(s, 1, 9))
  while (out.length < n) out += String(randInt(s, 0, 9))
  return out
}

/** Why the player can't open an own account right now (null = allowed). */
export function openAccountBlocker(s: GameState, platform: Platform, rented = false): string | null {
  const day = today(s)
  const bannedUntil = s.ads.bannedUntil?.[platform]
  if (!rented && bannedUntil != null && day < bannedUntil) {
    return `You are banned from advertising on ${PLATFORM_NAME[platform]} until ${formatDate(bannedUntil, 'md')} after repeated account bans. An agency account is the only way to run ads there for now.`
  }
  const mine = s.ads.accounts.filter(a => a.platform === platform && a.rentedFeePct == null)
  if (!rented && mine.some(a => a.status === 'active' || a.status === 'payment_failed' || a.status === 'in_review')) {
    return `You already have a working ${PLATFORM_NAME[platform]} ad account.`
  }
  if (rented && s.ads.accounts.filter(a => a.platform === platform && a.rentedFeePct != null && a.status !== 'disabled').length >= 3) {
    return 'Agencies won\'t rent you more than 3 accounts on one platform.'
  }
  return null
}

export function openAdAccount(s: GameState, platform: Platform, opts: { rented?: boolean } = {}): string | null {
  const rented = !!opts.rented
  const block = openAccountBlocker(s, platform, rented)
  if (block) {
    notify(s, { kind: 'warning', title: `Can't open a ${PLATFORM_NAME[platform]} ad account`, body: block, site: platform })
    return null
  }
  const own = s.ads.accounts.filter(a => a.platform === platform && a.rentedFeePct == null)
  const storeName = s.store.name || s.meta.playerName || 'My Store'
  let agencyName: string | undefined
  let fee: number | null = null
  if (rented) {
    agencyName = AGENCIES[randInt(s, 0, AGENCIES.length - 1)]
    fee = +randRange(s, 0.03, 0.06).toFixed(3)
    const paid = pay(s, AGENCY_SETUP_FEE[platform], { category: 'fees', memo: `${agencyName}: ${PLATFORM_NAME[platform]} agency account setup`, business: true, pnl: PNL_KEY[platform] })
    if (!paid) {
      notify(s, { kind: 'warning', title: 'Agency setup fee declined', body: `${agencyName} needs ${fmtMoney(AGENCY_SETUP_FEE[platform])} to set up the account.`, site: platform })
      return null
    }
  }
  const acc: AdAccount = {
    id: uid(s, 'act'),
    platform,
    name: rented ? `${storeName} (${agencyName})` : own.length ? `${storeName} ${own.length + 1}` : storeName,
    status: 'active',
    createdDay: today(s),
    spendLimitTier: rented ? 2 : 0,
    lifetimeSpend: 0,
    unbilled: 0,
    billingTier: rented ? bench(platform).billingThresholds.length - 1 : 0,
    payWith: 'card',
    quality: rented ? 80 : 70,
    rentedFeePct: fee,
    appeal: null,
    disapprovals: 0,
    todaySpend: 0,
    displayId: platform === 'fadbook' ? digits(s, 15) : '7' + digits(s, 18),
    businessName: rented ? `${agencyName} Business Center` : own.length ? `${storeName} Business ${own.length + 1}` : `${storeName} Business`,
    agencyName,
    billingHistory: [],
    failedPayments: 0,
    banCount: 0,
    statusSinceHour: s.time.hour,
  }
  s.ads.accounts.push(acc)
  const limit = spendLimitOf(acc)
  notify(s, {
    kind: 'success',
    title: rented ? `Agency account ready on ${PLATFORM_NAME[platform]}` : `${PLATFORM_NAME[platform]} ad account created`,
    body: rented
      ? `${agencyName} added you to an aged account with a ${fmtMoney(limit)}/day limit. They take ${(fee! * 100).toFixed(1)}% of spend.`
      : `New accounts start with a ${fmtMoney(limit)} daily spending limit. It rises as you spend and pay on time.`,
    site: platform,
  })
  return acc.id
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------
function pushHistory(acc: AdAccount, rec: AdBillingRecord) {
  const h = (acc.billingHistory ??= [])
  h.push(rec)
  if (h.length > HISTORY_CAP) h.splice(0, h.length - HISTORY_CAP)
}

/** Try to charge the account's unbilled balance. Returns true if paid. */
export function chargeAccount(s: GameState, acc: AdAccount, reason: AdBillingRecord['reason']): boolean {
  const amount = Math.round(acc.unbilled * 100) / 100
  if (amount <= 0) return true
  const threshold = billingThresholdOf(acc)
  const memo = acc.rentedFeePct != null
    ? `${acc.agencyName ?? 'Agency'}: ${PLATFORM_NAME[acc.platform]} ad spend + ${(acc.rentedFeePct * 100).toFixed(1)}% fee`
    : `${PLATFORM_NAME[acc.platform]} Ads: ${acc.name} (${acc.displayId ?? acc.id})`
  const used = pay(s, amount, { category: 'ad_spend', memo, business: true, prefer: acc.payWith, pnl: PNL_KEY[acc.platform] })
  if (used) {
    acc.unbilled = 0
    pushHistory(acc, { id: uid(s, 'bill'), hour: s.time.hour, amount, status: 'paid', method: used, reason, threshold: reason === 'threshold' ? threshold : undefined })
    if (reason === 'threshold') acc.billingTier = Math.min(bench(acc.platform).billingThresholds.length - 1, acc.billingTier + 1)
    if (acc.status === 'payment_failed') {
      acc.status = 'active'
      acc.statusReason = undefined
      acc.statusSinceHour = s.time.hour
      notify(s, { kind: 'success', title: `${PLATFORM_NAME[acc.platform]} balance paid`, body: `${fmtMoney(amount)} paid. Your ads are delivering again.`, site: acc.platform, path: 'billing' })
    }
    return true
  }
  pushHistory(acc, { id: uid(s, 'bill'), hour: s.time.hour, amount, status: 'failed', method: null, reason, threshold: reason === 'threshold' ? threshold : undefined })
  acc.failedPayments = (acc.failedPayments ?? 0) + 1
  acc.lastFailedPaymentDay = today(s)
  acc.quality = clamp(acc.quality - 8, 0, 100)
  if (acc.status === 'active') {
    acc.status = 'payment_failed'
    acc.statusReason = `We couldn't charge ${fmtMoney(amount)} to your ${acc.payWith === 'card' ? 'Chaise Sapphire card' : 'checking account'}.`
    acc.statusSinceHour = s.time.hour
    notify(s, {
      kind: 'critical',
      title: `${PLATFORM_NAME[acc.platform]} payment failed: ads stopped`,
      body: `${fmtMoney(amount)} couldn't be charged. All ads in "${acc.name}" have stopped until you pay the balance.`,
      site: acc.platform, path: 'billing',
    })
    mail(s, {
      ...MAIL_FROM[acc.platform], tag: 'platform', site: acc.platform, path: 'billing',
      subject: `Action required: your ${PLATFORM_NAME[acc.platform]} ads payment failed`,
      body: `Hi,\n\nWe tried to charge ${fmtMoney(amount)} for your ad account "${acc.name}" (ID ${acc.displayId ?? acc.id}), but the payment was declined.\n\nYour ads have been paused. To resume delivery, go to Billing and pay your outstanding balance. Repeated failed payments can lead to restrictions on your account.\n\n${PLATFORM_NAME[acc.platform]} Ads Team`,
    })
    coachTip(s, `ads_payment_failed_${acc.platform}`, `Your ${PLATFORM_NAME[acc.platform]} card charge bounced, so every ad is off. Pay the balance in Billing, and keep a buffer: ad platforms bill before Shopifly pays you out.`, { app: acc.platform, cooldownHours: 72, essential: true })
  }
  return false
}

/** Retry a failed billing charge (or pay the balance early). Returns true if paid. */
export function payAdBalance(s: GameState, accountId: string): boolean {
  const acc = findAccount(s, accountId)
  if (!acc) return false
  if (acc.unbilled <= 0) {
    if (acc.status === 'payment_failed') { acc.status = 'active'; acc.statusReason = undefined }
    return true
  }
  const ok = chargeAccount(s, acc, 'manual')
  if (!ok) notify(s, { kind: 'critical', title: 'Payment declined again', body: `Add funds or pay down your card, then try again. Balance due: ${fmtMoney(acc.unbilled)}.`, site: acc.platform, path: 'billing' })
  return ok
}

/** Record delivered spend on the account (billing, spend limit, lifetime). */
export function accrueSpend(s: GameState, acc: AdAccount, spend: number): void {
  if (!(spend > 0)) return
  acc.todaySpend += spend
  acc.lifetimeSpend += spend
  acc.unbilled += spend * (1 + (acc.rentedFeePct ?? 0))
  if (acc.unbilled >= billingThresholdOf(acc)) chargeAccount(s, acc, 'threshold')
  maybeRaiseSpendLimit(s, acc)
}

function maybeRaiseSpendLimit(s: GameState, acc: AdAccount) {
  const ladder = bench(acc.platform).spendLimitLadder
  if (acc.spendLimitTier >= ladder.length - 1) return
  const step = LIMIT_STEPS[acc.spendLimitTier]
  if (step == null || acc.lifetimeSpend < step || acc.quality <= 60 || acc.status !== 'active') return
  if ((acc.failedPayments ?? 0) > 0) return
  acc.spendLimitTier++
  const lim = spendLimitOf(acc)
  notify(s, {
    kind: 'info',
    title: `${PLATFORM_NAME[acc.platform]} spending limit increased`,
    body: Number.isFinite(lim) ? `"${acc.name}" can now spend up to ${fmtMoney(lim)} per day.` : `"${acc.name}" no longer has a daily spending limit.`,
    site: acc.platform, path: 'billing',
  })
}

// ---------------------------------------------------------------------------
// Bans
// ---------------------------------------------------------------------------
const RISKY_HOOKS = new Set(['before_after', 'shock_stat', 'controversial'])

interface RiskFactors { p: number; claim: number; chargebackRatio: number; minHonesty: number; dominant: 'claims' | 'feedback' | 'payment' | 'quality' | 'new' | 'spend' }

/** Daily probability that this account gets restricted, with the dominant cause. */
export function accountBanRisk(s: GameState, acc: AdAccount): RiskFactors {
  const day = today(s)
  const D = DIFFICULTY[s.meta.difficulty]
  const crackdown = claimRiskMult(s)
  // live products promoted with risky claims
  let claim = 0
  let minHonesty = 1
  for (const ad of s.ads.ads) {
    if (ad.status !== 'active' || ad.review !== 'approved') continue
    const camp = s.ads.campaigns.find(c => c.id === ad.campaignId)
    if (!camp || camp.accountId !== acc.id || camp.status !== 'active') continue
    const recent = adRange(ad, day - 3, day)
    if (recent.spend <= 0) continue
    const cr = findCreative(s, ad.creativeId)
    const pd = cr ? productDef(cr.catalogId) : null
    if (pd && cr) {
      const risky = RISKY_HOOKS.has(cr.hook) || cr.angle === 'health'
      claim = Math.max(claim, Math.min(1, pd.claimRisk * crackdown) * (risky ? 1 : 0.3))
    }
    const sp = findStoreProduct(s, ad.storeProductId)
    if (sp?.grade) minHonesty = Math.min(minHonesty, sp.grade.honesty)
  }
  // store chargeback ratio (30 days)
  let orders = 0
  for (let d = day - 30; d < day; d++) orders += s.store.analytics.daily[d]?.orders ?? 0
  const disputes = s.store.chargebacks.filter(c => c.openedDay >= day - 30).length
  const chargebackRatio = orders > 20 ? disputes / orders : 0

  const ageDays = day - acc.createdDay
  const jump = acc.budgetJumpDay != null && day - acc.budgetJumpDay <= 3
  const f = {
    age: ageDays < 14 ? 2.5 : 1,
    claims: 1 + 4 * claim,
    jump: jump ? 2 : 1,
    feedback: (chargebackRatio > 0.01 ? 3 : 1) * (minHonesty < 0.6 ? 2 : 1),
    quality: acc.quality < 40 ? 2 : 1,
    payment: 1 + 0.5 * Math.min(4, acc.failedPayments ?? 0),
    rented: acc.rentedFeePct != null ? 0.4 : 1,
  }
  const p = 0.0015 * D.banRiskMult * f.age * f.claims * f.jump * f.feedback * f.quality * f.payment * f.rented
  const ranked: [RiskFactors['dominant'], number][] = [
    ['claims', f.claims], ['feedback', f.feedback], ['payment', f.payment], ['quality', f.quality], ['new', f.age], ['spend', f.jump],
  ]
  ranked.sort((a, b) => b[1] - a[1])
  return { p, claim, chargebackRatio, minHonesty, dominant: ranked[0][1] > 1 ? ranked[0][0] : 'new' }
}

const BAN_REASON: Record<RiskFactors['dominant'], string> = {
  claims: 'Your ads were found to violate our Advertising Standards on unrealistic outcomes and misleading claims.',
  feedback: 'We received too much negative feedback about your business from people who bought from your ads.',
  payment: 'We detected unusual payment activity on this account.',
  quality: 'This account has a history of ads that don\'t follow our Advertising Standards.',
  new: 'Your account activity doesn\'t follow our Advertising Standards on circumventing systems.',
  spend: 'We noticed unusual changes in how this account spends and restricted it to protect our community.',
}

export function banAccount(s: GameState, acc: AdAccount, cause: RiskFactors['dominant']): void {
  const kind: 'restricted' | 'disabled' = chance(s, 0.6) ? 'restricted' : 'disabled'
  acc.status = kind
  acc.statusReason = BAN_REASON[cause]
  acc.statusSinceHour = s.time.hour
  acc.banCount = (acc.banCount ?? 0) + 1
  acc.appeal = null
  acc.appealDenied = false
  acc.quality = clamp(acc.quality - 15, 0, 100)
  const bans = (s.ads.bans ??= {})
  bans[acc.platform] = (bans[acc.platform] ?? 0) + 1
  const P = PLATFORM_NAME[acc.platform]
  let banned = false
  if ((bans[acc.platform] ?? 0) > 2) {
    const until = today(s) + 30
    ;(s.ads.bannedUntil ??= {})[acc.platform] = until
    banned = true
  }
  notify(s, {
    kind: 'critical',
    title: `${P} ad account ${kind}`,
    body: `"${acc.name}" can no longer run ads. ${acc.statusReason}`,
    site: acc.platform, path: 'account_quality',
  })
  mail(s, {
    ...MAIL_FROM[acc.platform], tag: 'platform', site: acc.platform, path: 'account_quality',
    subject: `Your ad account ${acc.displayId ?? acc.id} has been ${kind}`,
    body: `Hi,\n\nYour ad account "${acc.name}" has been ${kind} and can no longer run ads.\n\nReason: ${acc.statusReason}\n\nIf you think this is a mistake, you can request a review in Account Quality. We'll review your request and let you know our decision.\n\n${P} Business Integrity`,
  })
  const choices: GameModal['choices'] = [
    { id: 'appeal', label: 'Request a review (appeal)', hint: '30-minute task at your computer. Decision in 2–4 days.', tone: 'primary' },
    { id: 'rent', label: 'Rent an agency account', hint: `${fmtMoney(AGENCY_SETUP_FEE[acc.platform])} setup, then 3–6% of spend. Higher limits, fewer bans.` },
  ]
  if (!banned) choices.push({ id: 'backup', label: 'Open a backup ad account', hint: 'New business manager. Starts over at the lowest spending limit.' })
  choices.push({ id: 'later', label: 'Decide later', hint: 'You can appeal from Account Quality at any time.' })
  pushModal(s, {
    kind: BAN_MODAL,
    title: `${P} ${kind} your ad account`,
    body: `${acc.statusReason}\n\nEvery campaign in "${acc.name}" has stopped delivering.${banned ? `\n\nThis is your ${ordinal(bans[acc.platform] ?? 3)} ban on ${P}: you can't open new ${P} ad accounts yourself for 30 days.` : ''}`,
    choices,
    data: { accountId: acc.id, platform: acc.platform },
  })
}

registerModalHandler(BAN_MODAL, (s, m, choice) => {
  const accountId = String(m.data?.accountId ?? '')
  const platform = (m.data?.platform ?? 'fadbook') as Platform
  if (choice === 'appeal') startAppeal(s, accountId)
  else if (choice === 'rent') openAdAccount(s, platform, { rented: true })
  else if (choice === 'backup') openAdAccount(s, platform)
})

// ---------------------------------------------------------------------------
// Appeals
// ---------------------------------------------------------------------------
export function startAppeal(s: GameState, accountId: string): void {
  const acc = findAccount(s, accountId)
  if (!acc) return
  const P = PLATFORM_NAME[acc.platform]
  if (acc.status !== 'restricted' && acc.status !== 'disabled') {
    notify(s, { kind: 'info', title: 'Nothing to appeal', body: `"${acc.name}" is in good standing.`, site: acc.platform, path: 'account_quality' })
    return
  }
  if (acc.appealDenied) {
    notify(s, { kind: 'warning', title: 'Appeal already decided', body: `${P} reviewed "${acc.name}" and the decision is final.`, site: acc.platform, path: 'account_quality' })
    return
  }
  if (acc.appeal) {
    notify(s, { kind: 'info', title: 'Appeal in review', body: `${P} is still reviewing "${acc.name}".`, site: acc.platform, path: 'account_quality' })
    return
  }
  if ([s.player.activity, ...s.player.queue].some(a => a?.kind === 'appeal_ad_account' && a.payload?.accountId === accountId)) return
  enqueueActivity(s, 'appeal_ad_account', { payload: { accountId }, label: `Appeal ${P} ad account` })
}

/** Called when the appeal activity completes. */
export function submitAppeal(s: GameState, accountId: string): void {
  const acc = findAccount(s, accountId)
  if (!acc || (acc.status !== 'restricted' && acc.status !== 'disabled') || acc.appeal || acc.appealDenied) return
  const day = today(s)
  acc.appeal = { submittedDay: day, resolveDay: day + randInt(s, 2, 4) }
  notify(s, { kind: 'info', title: 'Appeal submitted', body: `${PLATFORM_NAME[acc.platform]} usually decides within 2–4 days.`, site: acc.platform, path: 'account_quality' })
}

function resolveAppeal(s: GameState, acc: AdAccount): void {
  const P = PLATFORM_NAME[acc.platform]
  let p = acc.status === 'restricted' ? 0.7 : 0.45
  if (acc.quality >= 60) p += 0.05
  if ((s.ads.bans?.[acc.platform] ?? 0) > 2) p -= 0.15
  acc.appeal = null
  if (chance(s, clamp(p, 0.05, 0.9))) {
    acc.status = 'active'
    acc.statusReason = undefined
    acc.statusSinceHour = s.time.hour
    acc.quality = Math.max(acc.quality, 55)
    notify(s, { kind: 'success', title: `${P} reinstated your ad account`, body: `"${acc.name}" can run ads again. Your campaigns resume where they left off.`, site: acc.platform })
    mail(s, {
      ...MAIL_FROM[acc.platform], tag: 'platform', site: acc.platform,
      subject: 'Your ad account has been restored',
      body: `Hi,\n\nThanks for requesting a review. We've reviewed your ad account "${acc.name}" and it now complies with our Advertising Standards. You can advertise again.\n\n${P} Business Integrity`,
    })
  } else {
    acc.status = 'disabled'
    acc.appealDenied = true
    acc.statusSinceHour = s.time.hour
    notify(s, { kind: 'critical', title: `${P} rejected your appeal`, body: `"${acc.name}" stays disabled. Open a backup account or rent an agency account to keep advertising.`, site: acc.platform, path: 'account_quality' })
    mail(s, {
      ...MAIL_FROM[acc.platform], tag: 'platform', site: acc.platform, path: 'account_quality',
      subject: 'We reviewed your ad account',
      body: `Hi,\n\nWe've reviewed your ad account "${acc.name}" and confirmed it doesn't comply with our Advertising Standards. This decision is final and your account will stay disabled.\n\n${P} Business Integrity`,
    })
  }
}

// ---------------------------------------------------------------------------
// Daily upkeep
// ---------------------------------------------------------------------------
export function accountsDayRollover(s: GameState, day: number): void {
  const monthly = domOf(day) === 1
  for (const acc of s.ads.accounts) {
    const spentYesterday = acc.todaySpend
    acc.yesterdaySpend = spentYesterday
    acc.todaySpend = 0
    if (monthly && acc.unbilled > 0 && acc.status !== 'payment_failed') chargeAccount(s, acc, 'monthly')
    if (acc.failedPayments && acc.lastFailedPaymentDay != null && day - acc.lastFailedPaymentDay >= 14) {
      acc.failedPayments = Math.max(0, acc.failedPayments - 1)
      acc.lastFailedPaymentDay = day
    }
    if (acc.appeal && day >= acc.appeal.resolveDay) resolveAppeal(s, acc)
    if (acc.status === 'active' && spentYesterday > 0) {
      acc.quality = clamp(acc.quality + 0.4, 0, 90)
      const r = accountBanRisk(s, acc)
      if (r.p > 0 && chance(s, Math.min(0.5, r.p))) banAccount(s, acc, r.dominant)
    }
  }
  const bu = s.ads.bannedUntil
  if (bu) {
    for (const p of Object.keys(bu) as Platform[]) {
      if (bu[p] != null && day === bu[p]) {
        notify(s, { kind: 'info', title: `${PLATFORM_NAME[p]} advertising ban lifted`, body: 'You can open a new ad account again. Keep claims honest this time.', site: p })
        if (s.ads.bans) s.ads.bans[p] = 2
      }
    }
  }
}
