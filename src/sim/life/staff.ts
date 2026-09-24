// Staff (UpWorx): weekly candidates, hiring/firing, weekly salary bills, morale, and role automation:
// VA → tickets & chargebacks · media buyer → 9 AM kill/scale/duplicate rules with skill-based mistakes ·
// UGC creator → weekly creatives · ops manager → bulk reorders & CNY stock-up · designer/copywriter → flags.
import type {
  AdLevel, AngleId, BeatId, FormatId, GameState, HookId, Platform, StaffCandidate, StaffMember, StaffRole,
} from '../../core/types'
import { addPnl, cardAvailable, pay, receive } from '../../core/money'
import { notify } from '../../core/notify'
import { uid } from '../../core/ids'
import { chance, clamp, lerp, pick, rand, randInt, randn, randRange, shuffle, stochRound, weightedPick } from '../../core/rng'
import { hourOfDay, nextCny, weekday, type DateRange } from '../../core/time'
import { BENCHMARKS } from '../../data/benchmarks'
import { ANGLE_LIST, FORMATS, FORMAT_LIST, HOOKS, HOOK_LIST } from '../../data/creativeTaxonomy'
import { BIOS, HEADLINES, PERSONAS, STAFF_ROLES, STAFF_ROLE_LIST, STAFF_RULES, UPWORX_FEE_PCT, skillTier, type Persona } from '../../data/staff'
import { registerBillHandler, removeBillByRef, upsertBill } from '../finance/bills'
import { breakEven, resolveTickets, submitChargeback } from '../store'
import { createAd, duplicateEntity, orderCreative, setEntityStatus, statsFor, updateAdSet, updateCampaign } from '../ads'
import { getProduct, placeBulkOrder } from '../market'
import { apartment, ensureLife, firstName, nowHour, round2, send, today, usd } from './util'

const UPWORX = { from: 'UpWorx', fromEmail: 'notifications@upworx.com', tag: 'creator' as const, site: 'upworx' as const }
const first = (name: string) => name.split(' ')[0]
const billRef = (id: string) => `staff:${id}`

// ---------------------------------------------------------------------------
// queries other modules read
// ---------------------------------------------------------------------------
export const staffByRole = (s: GameState, role: StaffRole): StaffMember[] => s.staff.members.filter(m => m.role === role)
const moraleF = (m: StaffMember) => 0.6 + 0.4 * clamp(m.morale / 100, 0, 1)
const best = (s: GameState, role: StaffRole) => staffByRole(s, role).sort((a, b) => b.skill - a.skill)[0]

/** Page-design points added to every product page (designer: +2 × skill, scaled by morale). */
export function designerBonus(s: GameState): number {
  const d = best(s, 'designer')
  return d ? Math.round(2 * d.skill * moraleF(d)) : 0
}
/** Seconds shaved off store load time by a designer. */
export const designerLoadTimeCut = (s: GameState) => (staffByRole(s, 'designer').length ? 0.1 : 0)
export const hasCopywriter = (s: GameState) => staffByRole(s, 'copywriter').length > 0
/** 0 (none) … 10 */
export const copywriterSkill = (s: GameState) => best(s, 'copywriter')?.skill ?? 0
/** Copy quality 0..1 for "Rewrite with copywriter" (0 = no copywriter). */
export function copywriterQuality(s: GameState): number {
  const c = best(s, 'copywriter')
  return c ? clamp(0.55 + 0.045 * c.skill * (0.85 + 0.15 * moraleF(c)), 0, 1) : 0
}
/** Bulk COGS discount the ops manager negotiates (0.05–0.10), 0 without one. */
export function opsBulkDiscountPct(s: GameState): number {
  const o = best(s, 'ops_manager')
  return o ? clamp(0.05 + 0.005 * o.skill, 0.05, 0.1) : 0
}
/** Weekly payroll incl. UpWorx fee. */
export const weeklyPayroll = (s: GameState) => round2(s.staff.members.reduce((a, m) => a + m.salaryWeekly * (1 + UPWORX_FEE_PCT), 0))
/** Tickets a VA clears per day. */
export const vaDailyCapacity = (m: StaffMember) => Math.round(m.skill * STAFF_RULES.ticketsPerSkillPerDay * moraleF(m))
export const ugcWeeklyQuota = (skill: number) => (skill >= 9 ? 4 : skill >= 5 ? 3 : 2)
export const ugcQuality = (m: StaffMember) => clamp(0.45 + 0.05 * m.skill - (m.morale < 40 ? 0.05 : 0), 0.3, 0.95)

// ---------------------------------------------------------------------------
// candidates
// ---------------------------------------------------------------------------
function fill(t: string, p: Persona, years: number, hours: number) {
  return t.replace(/\{city\}/g, p.city).replace(/\{country\}/g, p.country).replace(/\{years\}/g, String(years)).replace(/\{hours\}/g, String(hours))
}

function makeCandidate(s: GameState, role: StaffRole, persona: Persona, day: number): StaffCandidate {
  const def = STAFF_ROLES[role]
  const skill = clamp(Math.round(1 + 9 * ((rand(s) + rand(s) + rand(s)) / 3) + randn(s) * 0.6), 1, 10)
  // price tracks skill loosely: there are bargains and overpriced profiles to spot
  const pos = clamp((skill - 1) / 9 + randn(s) * 0.14, 0, 1)
  const salaryWeekly = Math.round((def.rate[0] + (def.rate[1] - def.rate[0]) * pos) / 5) * 5
  const tier = skillTier(skill)
  const years = tier === 'junior' ? randInt(s, 1, 2) : tier === 'mid' ? randInt(s, 2, 5) : randInt(s, 6, 11)
  const hours = randInt(s, def.hoursPerWeek[0], def.hoursPerWeek[1])
  const isNew = skill <= 3 && chance(s, 0.45)
  const rating = isNew ? 0 : Math.round(clamp(4.25 + skill * 0.07 + randn(s) * 0.12, 3.9, 5) * 10) / 10
  const jobsDone = isNew ? 0 : Math.round(Math.pow(skill, 1.7) * randRange(s, 2, 6))
  return {
    id: uid(s, 'staff'), name: persona.name, role, skill, salaryWeekly, portrait: persona.portrait,
    config: { ...def.defaults }, headline: pick(s, HEADLINES[role][tier]), country: persona.country, rating, jobsDone,
    hoursPerWeek: hours, bio: fill(pick(s, BIOS[role][tier]), persona, years, hours), expiresDay: day + 7,
  }
}

export function refreshCandidates(s: GameState): void {
  ensureLife(s)
  const t = today(s)
  const n = randInt(s, STAFF_RULES.candidatesPerWeek[0], STAFF_RULES.candidatesPerWeek[1])
  const roles: StaffRole[] = ['va']
  while (roles.length < n) roles.push(weightedPick(s, STAFF_ROLE_LIST, r => r.weight).id)
  shuffle(s, roles)
  const takenPortraits = new Set(s.staff.members.map(m => m.portrait))
  const takenNames = new Set(s.staff.members.map(m => m.name))
  const pool = shuffle(s, PERSONAS.filter(p => !takenNames.has(p.name)))
  const out: StaffCandidate[] = []
  for (const role of roles) {
    const persona = pool.find(p => !takenPortraits.has(p.portrait)) ?? pool[0]
    if (!persona) break
    takenPortraits.add(persona.portrait)
    pool.splice(pool.indexOf(persona), 1)
    out.push(makeCandidate(s, role, persona, t))
  }
  s.staff.candidates = out
  s.staff.lastRefreshDay = t
}

// ---------------------------------------------------------------------------
// hire / fire / configure
// ---------------------------------------------------------------------------
function helloEmail(s: GameState, m: StaffMember) {
  const tier = skillTier(m.skill)
  const you = firstName(s)
  const lines: Record<StaffRole, Record<'junior' | 'mid' | 'senior', string>> = {
    va: {
      junior: `Hi ${you}!! Thank you so much for hiring me 🙏 I'll answer every ticket as fast as I can. If a customer is angry should I just refund them? Let me know!`,
      mid: `Hi ${you}, thanks for the contract. I'll work the support inbox 9–5 and send you a short daily summary. Quick question: what's your refund policy and your max for replacements without asking you?`,
      senior: `Hi ${you} — glad to be on board. First week I'll build macros for WISMO and defect tickets, tag customers who look likely to dispute, and file evidence on any open chargebacks before their deadlines. I'll flag product issues that keep showing up in tickets.`,
    },
    ugc_creator: {
      junior: `Hey ${you}! So excited 😍 Send me the product and I'll start filming right away!`,
      mid: `Hey ${you}, thanks! Once the product arrives I'll film a few hook variations so you can test openers. Who's the buyer — age, and what problem does it solve for them?`,
      senior: `Hi ${you}. Before I film: I'll read your product's reviews and competitors' ads, then shoot the angle that matches the buyer's pain, with three hooks per concept. Make sure I have a unit — sample or 3PL stock.`,
    },
    media_buyer: {
      junior: `Hi ${you}! I'm going to get your ROAS way up 🚀 My plan is to double budgets on anything that gets a sale so we scale fast!`,
      mid: `Hi ${you}, thanks for having me. I review accounts daily at 9 AM: kill ads past 2× break-even CPA, scale winners 15–20% so learning doesn't reset. What's your break-even ROAS per product?`,
      senior: `Hi ${you}. Ground rules I work by: no ad gets killed before it spends its break-even CPA, no budget moves more than 20% a day, and I reconcile platform ROAS against real Shopifly sales — the platforms over-report. I'll also hold budgets if the card gets tight.`,
    },
    designer: {
      junior: `Hi ${you}! I'll make the store look super clean and pretty ✨`,
      mid: `Hi ${you}, I'll start with your product pages on mobile — that's where ~78% of your traffic lands — then clean up the theme and compress images.`,
      senior: `Hi ${you}. I'll audit load time and mobile layout first, then tighten trust and design across every product page. Expect a faster, more credible store within the week.`,
    },
    copywriter: {
      junior: `Hi ${you}! Excited to write for you. Just send me the product and I'll make it sound amazing!`,
      mid: `Hi ${you}, thanks. For each page I'll lead with the outcome, keep bullets scannable and answer objections in the FAQ. "Rewrite with copywriter" is live in your product editor.`,
      senior: `Hi ${you}. I'll mine your reviews and support tickets for the exact words customers use, then rebuild titles, descriptions and FAQs around outcomes and objections. Use "Rewrite with copywriter" in the product editor whenever you're ready.`,
    },
    ops_manager: {
      junior: `Hi ${you}! I'll keep an eye on stock and let you know if anything runs low.`,
      mid: `Hi ${you}, I'll set reorder points from your sales velocity, place bulk orders before you run out and push suppliers on unit price. Heads-up: we should plan for Chinese New Year early.`,
      senior: `Hi ${you}. I'll own inventory end-to-end: reorder points, sea vs. air decisions, supplier negotiation (usually 8–10% off repeat orders) and a CNY stock-up plan starting ~10 weeks out.`,
    },
  }
  send(s, {
    from: m.name, fromEmail: `${m.name.toLowerCase().replace(/[^a-z]+/g, '.')}@upworx.com`, tag: 'creator', site: 'upworx', path: 'team',
    subject: `Hi from ${first(m.name)} (${STAFF_ROLES[m.role].label})`,
    body: `${lines[m.role][tier]}\n\n— ${m.name}`,
  })
}

export function hireStaff(s: GameState, candidateId: string): { ok: boolean; reason?: string } {
  ensureLife(s)
  const t = today(s)
  const c = s.staff.candidates.find(x => x.id === candidateId)
  if (!c) return { ok: false, reason: 'That freelancer is no longer available.' }
  if (c.expiresDay < t) return { ok: false, reason: 'That proposal expired.' }
  if (s.staff.members.length >= STAFF_RULES.maxTeam) return { ok: false, reason: `Team is full (${STAFF_RULES.maxTeam}).` }
  const weekly = round2(c.salaryWeekly * (1 + UPWORX_FEE_PCT))
  if (s.finance.cash + cardAvailable(s) < weekly) return { ok: false, reason: `UpWorx needs a payment method that covers one week (${usd(weekly)}).` }
  const def = STAFF_ROLES[c.role]
  const { bio: _bio, expiresDay: _exp, ...rest } = c
  const m: StaffMember = {
    ...rest, hiredDay: t, morale: clamp(STAFF_RULES.moraleTarget + apartment(s).staffMoraleBonus, 0, 100),
    config: { ...def.defaults, ...(c.config ?? {}) }, unpaidDays: 0, producedThisWeek: 0,
    weeklyQuota: c.role === 'ugc_creator' ? ugcWeeklyQuota(c.skill) : undefined,
    lastReport: 'Just started — getting set up.', lastReportDay: t,
  }
  s.staff.members.push(m)
  s.staff.candidates = s.staff.candidates.filter(x => x.id !== candidateId)
  upsertBill(s, {
    id: uid(s, 'bill'), name: `UpWorx — ${c.name} (${def.label})`, amount: weekly, cadence: 'weekly', nextDueDay: t + 7,
    payWith: 'bank', category: 'staff', business: true, ref: billRef(m.id),
  })
  notify(s, { kind: 'success', title: `Hired ${c.name}`, body: `${def.label} · ${usd(c.salaryWeekly, false)}/week + ${Math.round(UPWORX_FEE_PCT * 100)}% UpWorx fee, billed weekly from checking.`, site: 'upworx', path: 'team' })
  send(s, {
    ...UPWORX, path: 'team', subject: `Contract started: ${c.name}`,
    body: `Your contract with ${c.name} (${def.label}) is active.\n\nWeekly rate: ${usd(c.salaryWeekly)}\nUpWorx marketplace fee (${Math.round(UPWORX_FEE_PCT * 100)}%): ${usd(weekly - c.salaryWeekly)}\nBilled every 7 days to your checking account, first charge in one week.\n\nFreelancers who aren't paid stop working within a few days. Manage your team at UpWorx → My team.\n\n— The UpWorx team`,
  })
  helloEmail(s, m)
  return { ok: true }
}

export function fireStaff(s: GameState, staffId: string): void {
  ensureLife(s)
  const m = s.staff.members.find(x => x.id === staffId)
  if (!m) return
  const t = today(s)
  const bill = s.finance.bills.find(b => b.ref === billRef(m.id))
  const since = bill?.lastPaidDay ?? m.hiredDay
  const weekly = m.salaryWeekly * (1 + UPWORX_FEE_PCT)
  const final = round2(weekly * Math.min(7, Math.max(0, t - since)) / 7 + (bill?.arrears ?? 0))
  if (final > 0) pay(s, final, { category: 'staff', memo: `UpWorx — final payment, ${m.name}`, business: true, prefer: 'bank' })
  removeBillByRef(s, billRef(m.id))
  s.staff.members = s.staff.members.filter(x => x.id !== m.id)
  for (const o of s.staff.members) o.morale = clamp(o.morale - 5, 0, 100)
  notify(s, { kind: 'info', title: `Ended contract: ${m.name}`, body: final > 0 ? `Final payment ${usd(final)} for days worked.` : 'No final payment due.', site: 'upworx', path: 'team' })
  send(s, { ...UPWORX, path: 'team', subject: `Contract ended: ${m.name}`, body: `You ended your contract with ${m.name}.${final > 0 ? ` A final payment of ${usd(final)} covered days worked since the last invoice.` : ''}\n\nPlease leave feedback — it helps other clients.\n\n— The UpWorx team` })
}

export function configureStaff(s: GameState, staffId: string, config: Record<string, string | number | boolean>): void {
  const m = s.staff.members.find(x => x.id === staffId)
  if (!m) return
  m.config = { ...(m.config ?? {}), ...config }
}

function staffLeaves(s: GameState, m: StaffMember, why: 'unpaid' | 'morale') {
  removeBillByRef(s, billRef(m.id))
  s.staff.members = s.staff.members.filter(x => x.id !== m.id)
  const msg = why === 'unpaid'
    ? `I haven't been paid for ${m.unpaidDays} days, so I've closed the contract. I hope things turn around for the store.`
    : `I've accepted another contract. Honestly the workload and the vibe haven't been great lately. Best of luck.`
  notify(s, { kind: 'critical', title: `${m.name} quit`, body: why === 'unpaid' ? 'Unpaid salary.' : 'Morale hit rock bottom.', site: 'upworx', path: 'team' })
  send(s, { from: m.name, fromEmail: `${m.name.toLowerCase().replace(/[^a-z]+/g, '.')}@upworx.com`, tag: 'creator', site: 'upworx', path: 'team', subject: 'Closing our contract', body: `Hi ${firstName(s)},\n\n${msg}\n\n— ${m.name}` })
}

registerBillHandler('staff:', {
  onPaid: (s, bill, info) => {
    const m = s.staff.members.find(x => billRef(x.id) === bill.ref)
    if (!m) return
    if (info.wasLate) m.morale = clamp(m.morale + 5, 0, 100)
    m.unpaidDays = 0
  },
  onFailed: (s, bill, info) => {
    const m = s.staff.members.find(x => billRef(x.id) === bill.ref)
    if (!m) { removeBillByRef(s, bill.ref ?? ''); return true }
    m.unpaidDays = info.daysFailed + 1
    m.morale = clamp(m.morale - (info.daysFailed === 0 ? 20 : 10), 0, 100)
    if ((m.unpaidDays ?? 0) > STAFF_RULES.unpaidQuitDays) { staffLeaves(s, m, 'unpaid'); return true }
    if (info.daysFailed === 0) {
      notify(s, { kind: 'critical', title: `Couldn't pay ${m.name}`, body: `${usd(info.amount)} salary failed. Freelancers walk after ${STAFF_RULES.unpaidQuitDays} unpaid days.`, site: 'bank', path: 'bills' })
      send(s, { ...UPWORX, path: 'team', subject: `Payment failed — ${m.name}`, body: `We couldn't charge ${usd(info.amount)} for ${m.name}'s weekly invoice. We'll retry daily. Freelancers may pause or end contracts that go unpaid.\n\n— The UpWorx team` })
    }
    return true
  },
})

// ---------------------------------------------------------------------------
// daily
// ---------------------------------------------------------------------------
export function staffDayRollover(s: GameState, day: number): void {
  ensureLife(s)
  if (s.staff.lastRefreshDay < 0 || day - s.staff.lastRefreshDay >= 7) {
    refreshCandidates(s)
    if (s.store?.created) {
      const roles = [...new Set(s.staff.candidates.map(c => STAFF_ROLES[c.role].label))]
      send(s, { ...UPWORX, path: '', subject: `${s.staff.candidates.length} new freelancers match your job post`, body: `This week's proposals: ${roles.join(', ')}.\n\nTop Rated freelancers get hired fast — proposals expire in 7 days.\n\n— The UpWorx team` })
    }
  } else {
    s.staff.candidates = s.staff.candidates.filter(c => c.expiresDay >= day)
  }
  const apt = apartment(s)
  for (const m of [...s.staff.members]) {
    const def = STAFF_ROLES[m.role]
    const mid = (def.rate[0] + def.rate[1]) / 2
    let target = STAFF_RULES.moraleTarget + apt.staffMoraleBonus + (m.salaryWeekly >= mid * 1.1 ? 5 : m.salaryWeekly < def.rate[0] + (def.rate[1] - def.rate[0]) * 0.2 ? -5 : 0)
    if ((m.unpaidDays ?? 0) > 0) target -= 30
    if (m.role === 'va') {
      const open = s.store?.tickets?.filter(t => t.status !== 'solved').length ?? 0
      if (open > vaDailyCapacity(m) * 2) target -= 10
    }
    m.morale = clamp(m.morale + (target - m.morale) * 0.15, 0, 100)
    if (m.morale < STAFF_RULES.quitMorale) { staffLeaves(s, m, 'morale'); continue }
    try {
      if (m.role === 'va') {
        const disputes = vaChargebacks(s, m)
        const n = Number(m.config?._ticketsToday ?? 0)
        m.lastReport = `Solved ${n} ticket${n === 1 ? '' : 's'} yesterday${disputes ? `, filed evidence on ${disputes} chargeback${disputes === 1 ? '' : 's'} this morning` : ''}.`
        m.lastReportDay = day
        m.config = { ...(m.config ?? {}), _ticketsToday: 0 }
      } else if (m.role === 'ugc_creator') ugcProduce(s, m, day)
      else if (m.role === 'ops_manager') opsReorder(s, m, day)
      else if (m.role === 'designer') {
        const pages = s.store?.products?.filter(p => p.status !== 'archived').length ?? 0
        m.lastReport = pages
          ? `Polishing ${pages} product page${pages === 1 ? '' : 's'}: +${designerBonus(s)} design points each, ${designerLoadTimeCut(s).toFixed(1)} s faster loads.`
          : 'Theme is tuned. Waiting for product pages to design.'
        m.lastReportDay = day
      } else if (m.role === 'copywriter') {
        const drafts = s.store?.products?.filter(p => p.status !== 'archived').length ?? 0
        m.lastReport = drafts
          ? `Available for rewrites on ${drafts} product${drafts === 1 ? '' : 's'} — use "Rewrite with copywriter" in the product editor.`
          : 'Waiting for a product to write for.'
        m.lastReportDay = day
      }
    } catch (err) {
      // another module is mid-implementation; never let staff automation crash the day
      m.lastReport = 'Couldn\'t get their work done today (tools unavailable).'
      m.lastReportDay = day
      if (typeof console !== 'undefined') console.warn('[staff]', m.role, err)
    }
  }
}

function vaChargebacks(s: GameState, m: StaffMember): number {
  if (m.config?.fightChargebacks === false) return 0
  const t = today(s)
  const open = (s.store?.chargebacks ?? []).filter(c => c.status === 'needs_response' && c.respondByDay >= t)
  const cap = Math.max(1, Math.round(m.skill * 3 * moraleF(m)))
  let n = 0
  // VA craft replaces the player's operations-skill bonus: a senior VA assembles every piece of proof,
  // a junior one misses some (≈ SPEC "evidence 0.5 + skill × 0.04" relative to an average packet)
  const evidenceBonus = (m.skill - 5) * 0.02 * moraleF(m)
  for (const cb of open.slice(0, cap)) {
    submitChargeback(s, cb.id, 'staff', { evidenceBonus })
    const after = s.store.chargebacks.find(c => c.id === cb.id)
    if (after && after.status !== 'needs_response') n++
  }
  return n
}

// ---- UGC creator ----
const PRODUCE_DAYS: Record<number, number[]> = { 2: [1, 4], 3: [0, 2, 4], 4: [0, 2, 4, 6] }
const hasUnit = (s: GameState, cid: string) => s.catalog.samplesOwned.includes(cid) || (s.catalog.inventory[cid]?.units ?? 0) > 0

function unitsSold(s: GameState, catalogId: string, days: number): number {
  const t = today(s)
  const ids = new Set(s.store.products.filter(p => p.catalogId === catalogId).map(p => p.id))
  let units = 0
  for (let d = t - days; d < t; d++) {
    const sd = s.store.analytics?.daily?.[d]
    if (!sd?.byProduct) continue
    for (const [k, v] of Object.entries(sd.byProduct)) if (ids.has(k) || k === catalogId) units += v.units || 0
  }
  return units
}

function chooseUgcProduct(s: GameState, m: StaffMember): string | null {
  const cfg = String(m.config?.catalogId ?? '')
  if (cfg) return hasUnit(s, cfg) ? cfg : null
  const live = [...new Set(s.store.products.filter(p => p.status === 'active').map(p => p.catalogId))].filter(cid => hasUnit(s, cid))
  if (!live.length) {
    const any = [...new Set(s.store.products.map(p => p.catalogId))].filter(cid => hasUnit(s, cid))
    return any[0] ?? null
  }
  return live.sort((a, b) => unitsSold(s, b, 7) - unitsSold(s, a, 7))[0]
}

function fillPattern(pattern: string, phrase: string) { return pattern.includes('___') ? pattern.replace('___', phrase) : pattern }

function ugcBrief(s: GameState, m: StaffMember, catalogId: string) {
  const p = getProduct(catalogId)
  const smart = m.skill / 10
  const staffOk = (id: FormatId) => (FORMATS[id]?.producers ?? []).includes('staff')
  const fmtCfg = String(m.config?.format ?? 'auto')
  const hookCfg = String(m.config?.hook ?? 'auto')
  const angleCfg = String(m.config?.angle ?? 'auto')
  const bestF = p.bestFormats.filter(staffOk)
  const allF = FORMAT_LIST.map(f => f.id).filter(staffOk)
  const format: FormatId = fmtCfg !== 'auto' && FORMATS[fmtCfg as FormatId] ? (fmtCfg as FormatId)
    : bestF.length && chance(s, 0.25 + 0.65 * smart) ? pick(s, bestF) : pick(s, allF.length ? allF : (['ugc_testimonial'] as FormatId[]))
  const hook: HookId = hookCfg !== 'auto' && HOOKS[hookCfg as HookId] ? (hookCfg as HookId)
    : p.bestHooks.length && chance(s, 0.2 + 0.7 * smart) ? pick(s, p.bestHooks) : pick(s, HOOK_LIST).id
  const angle: AngleId = angleCfg !== 'auto' && ANGLE_LIST.some(a => a.id === angleCfg) ? (angleCfg as AngleId)
    : p.bestAngles.length && chance(s, 0.2 + 0.7 * smart) ? pick(s, p.bestAngles) : pick(s, ANGLE_LIST).id
  let beats: BeatId[]
  if (m.skill >= 7) beats = angle === 'pain_point' ? ['hook', 'problem', 'demo', 'social_proof', 'offer', 'cta'] : ['hook', 'demo', 'benefits', 'social_proof', 'offer', 'cta']
  else if (m.skill >= 4) beats = ['hook', 'demo', 'benefits', 'cta']
  else beats = shuffle(s, ['hook', 'demo', 'benefits', 'unboxing', 'cta'] as BeatId[]).slice(0, 3)
  const phrase = (p.keywords[0] ?? p.name).toLowerCase()
  const patterns = HOOKS[hook]?.textPatterns ?? ['Wait for it…']
  const hookText = m.skill <= 2 && chance(s, 0.5) ? 'OMG you NEED this!!' : fillPattern(pick(s, patterns), phrase)
  const title = s.store.products.find(x => x.catalogId === catalogId && x.status === 'active')?.title ?? p.name
  // "Electric Spin Scrubber: No More Scrubbing" → "Electric Spin Scrubber" (cut at the benefit, not mid-phrase)
  const shortName = title.split(/\s+[—–|-]\s+|:\s/)[0].split(/\s+/).slice(0, 4).join(' ').replace(/[,:;]+$/, '')
  return {
    catalogId, name: `${shortName} · ${FORMATS[format]?.name ?? format} · ${first(m.name)}`,
    format, hook, angle, beats, hookText, script: '', producer: 'staff' as const, creatorId: m.id,
  }
}

function ugcProduce(s: GameState, m: StaffMember, day: number) {
  m.weeklyQuota = ugcWeeklyQuota(m.skill)
  m.producedThisWeek = weeklyOutput(s, m, day)
  if (m.config?.autoProduce === false) return
  if (!s.store?.created) return
  if (!(PRODUCE_DAYS[m.weeklyQuota] ?? [1, 4]).includes(weekday(day))) return
  if (m.producedThisWeek >= m.weeklyQuota) return
  const cid = chooseUgcProduct(s, m)
  if (!cid) {
    m.lastReport = 'Waiting on product: I need a sample or 3PL stock of the product you want filmed.'
    m.lastReportDay = day
    if (Number(m.config?._nudged ?? -99) < day - 6) {
      m.config = { ...(m.config ?? {}), _nudged: day }
      notify(s, { kind: 'warning', title: `${first(m.name)} has nothing to film`, body: 'Order a sample on AliExprez (or stock your 3PL) and set their product focus.', site: 'upworx', path: 'team' })
    }
    return
  }
  const brief = ugcBrief(s, m, cid)
  const id = orderCreative(s, brief)
  if (!id) { m.lastReport = 'Couldn\'t start today\'s video — CreatorHub rejected the brief.'; m.lastReportDay = day; return }
  // CreatorHub sets quality/timing for staff briefs; an unhappy creator phones it in
  const c = s.creatives.creatives.find(x => x.id === id)
  if (c && m.morale < 40) c.quality = Math.max(0.2, c.quality - 0.05)
  m.producedThisWeek = weeklyOutput(s, m, day)
  m.lastReport = `Filming "${brief.name}" (${m.producedThisWeek}/${m.weeklyQuota} this week).`
  m.lastReportDay = day
}

/** Staff creatives this member started since Monday (auto quota + briefs you sent from CreatorHub). */
function weeklyOutput(s: GameState, m: StaffMember, day: number): number {
  const weekStart = (day - weekday(day)) * 24
  return s.creatives.creatives.filter(c => c.producer === 'staff' && c.creatorId === m.id && c.orderedHour >= weekStart).length
}

// ---- ops manager ----
function opsReorder(s: GameState, m: StaffMember, day: number) {
  if (m.config?.autoReorder === false) return
  const cat = s.catalog
  const ids = new Set<string>([...Object.keys(cat.inventory ?? {}), ...Object.entries(cat.sourcing ?? {}).filter(([, v]) => v.mode === 'bulk' || v.mode === 'private_label').map(([k]) => k)])
  const cover = clamp(Number(m.config?.coverDays ?? 45), 15, 120)
  const pct = opsBulkDiscountPct(s)
  const lines: string[] = []
  for (const cid of ids) {
    const src = cat.sourcing[cid]
    const mode = src?.mode
    const units = cat.inventory[cid]?.units ?? 0
    if (mode !== 'bulk' && mode !== 'private_label' && units <= 0) continue
    const rate = unitsSold(s, cid, 14) / 14
    const est = rate * (1 + (rand(s) - 0.5) * (1 - m.skill / 10) * 0.6)
    if (est < 0.3) continue
    const inbound = cat.bulkOrders.filter(o => o.catalogId === cid && o.status !== 'received').reduce((a, o) => a + o.qty, 0)
    const delay = s.events?.modifiers?.supplierDelayDays ?? 0
    const leadSea = 8 + 34 + delay
    const leadAir = 8 + 11 + delay
    const reorderPoint = Math.ceil(est * (leadSea + 10))
    if (src) src.reorderPoint = reorderPoint
    const cny = nextCny(day)
    const cnyKey = cny ? `_cny${cny.year}_${cid}` : ''
    const cnyWindow = !!cny && m.config?.cnyStockUp !== false && cny.day - day >= 35 && cny.day - day <= 75 && !m.config?.[cnyKey]
    if (units + inbound >= reorderPoint && !cnyWindow) continue
    const p = getProduct(cid)
    const kind = mode === 'private_label' ? 'private_label' : 'bulk'
    const moq = kind === 'private_label' ? p.privateLabelMoq : p.moq
    const extra = cnyWindow ? Math.ceil(est * 35) : 0
    const qty = Math.max(moq, Math.ceil(est * cover) + extra)
    const shipCfg = String(m.config?.shipMethod ?? 'auto')
    const daysLeft = units / Math.max(0.01, est)
    const method: 'sea' | 'air' = shipCfg === 'sea' ? 'sea' : shipCfg === 'air' ? 'air' : daysLeft < leadSea && daysLeft >= 0 && units + inbound < est * leadAir * 1.5 ? 'air' : 'sea'
    const before = cat.bulkOrders.length
    const ok = placeBulkOrder(s, cid, qty, method, kind, src?.brandName)
    if (!ok) {
      lines.push(`Couldn't reorder ${p.name} (${qty} units) — not enough cash or card.`)
      if (Number(m.config?._failWarn ?? -99) < day - 2) {
        m.config = { ...(m.config ?? {}), _failWarn: day }
        notify(s, { kind: 'warning', title: `${first(m.name)} couldn't reorder ${p.name}`, body: `Stock ${units}, reorder point ${reorderPoint}. Free up cash or card room.`, site: 'bank', path: '' })
      }
      continue
    }
    const order = cat.bulkOrders.length > before ? cat.bulkOrders[cat.bulkOrders.length - 1] : undefined
    if (order && order.catalogId === cid && pct > 0) {
      const rebate = round2(order.qty * order.unitCost * pct)
      order.unitCost = round2(order.unitCost * (1 - pct))
      order.total = round2(order.total - rebate)
      receive(s, rebate, { category: 'inventory', memo: `Supplier discount negotiated by ${m.name}`, business: true, pnl: null })
      addPnl(s, 'inventory', -rebate)
    }
    if (cnyWindow) m.config = { ...(m.config ?? {}), [cnyKey]: true }
    lines.push(`Ordered ${qty} × ${p.name} by ${method}${cnyWindow ? ' (CNY stock-up)' : ''}${pct > 0 ? `, ${Math.round(pct * 100)}% off negotiated` : ''}.`)
    notify(s, { kind: 'info', title: `${first(m.name)} reordered ${p.name}`, body: `${qty} units by ${method} freight.${cnyWindow ? ' Stocking up before Chinese New Year.' : ''}`, site: 'aliexprez', path: '' })
  }
  if (!lines.length) {
    const stocked = Object.entries(cat.inventory ?? {}).filter(([, v]) => v.units > 0).length
    const inbound = cat.bulkOrders.filter(o => o.status !== 'received').length
    lines.push(stocked || inbound
      ? `Watching ${stocked} stocked product${stocked === 1 ? '' : 's'}${inbound ? ` and ${inbound} inbound shipment${inbound === 1 ? '' : 's'}` : ''} — nothing below its reorder point.`
      : 'No bulk inventory yet — everything ships dropship. I take over reorders once you stock a 3PL.')
  }
  m.lastReport = lines.join(' ')
  m.lastReportDay = day
}

// ---------------------------------------------------------------------------
// hourly
// ---------------------------------------------------------------------------
export function staffTickHour(s: GameState): void {
  if (!s.staff?.members?.length) return
  const h = hourOfDay(nowHour(s))
  for (const m of s.staff.members) {
    try {
      if (m.role === 'va' && h >= STAFF_RULES.vaHours[0] && h < STAFF_RULES.vaHours[1]) vaWork(s, m)
      else if (m.role === 'media_buyer' && h === STAFF_RULES.mediaBuyerHour) mediaBuyerReview(s, m)
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[staff]', m.role, err)
    }
  }
}

function vaWork(s: GameState, m: StaffMember) {
  if (!s.store?.created) return
  const open = s.store.tickets.filter(t => t.status !== 'solved').length
  if (!open) return
  const perHour = vaDailyCapacity(m) / (STAFF_RULES.vaHours[1] - STAFF_RULES.vaHours[0])
  const n = stochRound(s, perHour)
  if (n <= 0) return
  const solved = resolveTickets(s, n, 'staff') || 0
  if (solved > 0) m.config = { ...(m.config ?? {}), _ticketsToday: Number(m.config?._ticketsToday ?? 0) + solved }
}

// ---- media buyer ----
interface Holder { level: AdLevel; id: string; budget: number; platform: Platform; storeProductId: string | null; lastChange?: number; learning?: string }

function mediaBuyerReview(s: GameState, m: StaffMember) {
  const cfg = m.config ?? {}
  const t = today(s)
  const now = nowHour(s)
  const range: DateRange = { from: t - 3, to: t }
  const trust = clamp((m.skill - 2) / 8, 0, 1) // reconcile platform numbers with Shopifly truth
  const mistakeP = clamp(0.32 - m.skill * 0.032, 0, 0.3)
  const plat = String(cfg.platform ?? 'both')
  const platOk = (p: Platform) => plat === 'both' || plat === p
  const maxBudget = Math.max(20, Number(cfg.maxDailyBudget ?? 1000))
  const acctActive = (id: string) => s.ads.accounts.find(a => a.id === id)?.status === 'active'
  const liveCamp = new Map(s.ads.campaigns.filter(c => c.status === 'active' && platOk(c.platform) && acctActive(c.accountId)).map(c => [c.id, c]))
  if (!liveCamp.size) return
  const liveSets = new Map(s.ads.adSets.filter(a => a.status === 'active' && liveCamp.has(a.campaignId)).map(a => [a.id, a]))
  const judged = (spend: number, rep: number, tru: number, repV: number, truV: number) => {
    const purchases = lerp(rep, tru, trust)
    const value = lerp(repV, truV, trust)
    return { purchases, roas: spend > 0 ? value / spend : 0 }
  }
  let paused = 0, scaled = 0, dup = 0
  const notes: string[] = []

  // 1) kill losers + fatigue
  if (cfg.autoKill !== false) {
    for (const ad of s.ads.ads) {
      if (ad.status !== 'active' || !liveSets.has(ad.adSetId)) continue
      const be = breakEven(s, ad.storeProductId)
      if (!(be.breakEvenCpa > 0) || !(be.breakEvenRoas > 0)) continue
      const st = statsFor(s, 'ad', ad.id, range)
      const j = judged(st.spend, st.purchases, st.truePurchases, st.purchaseValue, st.trueRevenue)
      const siblings = s.ads.ads.filter(x => x.adSetId === ad.adSetId && x.status === 'active' && x.id !== ad.id).length
      if (st.spend > 2 * be.breakEvenCpa && j.roas < 0.7 * be.breakEvenRoas) {
        setEntityStatus(s, 'ad', ad.id, 'paused'); paused++
      } else if (chance(s, mistakeP) && st.spend > 0.4 * be.breakEvenCpa && st.spend < be.breakEvenCpa && j.purchases < 1) {
        setEntityStatus(s, 'ad', ad.id, 'paused'); paused++
        notes.push(`killed "${ad.name}" before it spent its break-even CPA`)
      } else if (m.skill >= 6 && siblings > 0 && ad.frequency > BENCHMARKS[ad.platform].fatigueFrequency + 0.5 && st.impressions > 3000 && st.linkClicks / st.impressions < BENCHMARKS[ad.platform].ctrLink.avg) {
        setEntityStatus(s, 'ad', ad.id, 'paused'); paused++
        notes.push(`retired fatigued "${ad.name}" (freq ${ad.frequency.toFixed(1)})`)
      }
    }
  }

  // 2) scale winners (budget lives on CBO campaigns or ABO ad sets)
  const holders: Holder[] = []
  for (const c of liveCamp.values()) {
    const firstAd = s.ads.ads.find(a => a.campaignId === c.id && a.status === 'active')
    if (c.budgetMode === 'cbo' && c.dailyBudget) holders.push({ level: 'campaign', id: c.id, budget: c.dailyBudget, platform: c.platform, storeProductId: firstAd?.storeProductId ?? null, lastChange: c.lastBudgetChangeHour })
    else for (const a of liveSets.values()) if (a.campaignId === c.id && a.dailyBudget) {
      const ad = s.ads.ads.find(x => x.adSetId === a.id && x.status === 'active')
      holders.push({ level: 'adset', id: a.id, budget: a.dailyBudget, platform: a.platform, storeProductId: ad?.storeProductId ?? null, lastChange: a.lastBudgetChangeHour, learning: a.learning?.state })
    }
  }
  if (cfg.autoScale !== false) {
    const totalBudget = holders.reduce((a, h) => a + h.budget, 0)
    const headroom = s.finance.cash + cardAvailable(s)
    for (const h of holders) {
      if (!h.storeProductId) continue
      const be = breakEven(s, h.storeProductId)
      if (!(be.breakEvenCpa > 0) || !(be.breakEvenRoas > 0)) continue
      const st = statsFor(s, h.level, h.id, range)
      const j = judged(st.spend, st.purchases, st.truePurchases, st.purchaseValue, st.trueRevenue)
      const minGap = h.platform === 'tiktak' ? BENCHMARKS.tiktak.minHoursBetweenBudgetChanges : 24
      const tooSoon = h.lastChange !== undefined && now - h.lastChange < minGap
      let pct = 0
      if (j.roas > 1.3 * be.breakEvenRoas && st.spend >= be.breakEvenCpa) {
        if (m.skill >= 5 && (tooSoon || h.learning === 'learning')) continue
        if (m.skill >= 5 && headroom < 3 * totalBudget) { notes.push('held budgets — cash/card too tight to scale safely'); continue }
        pct = randRange(s, 0.15, 0.2)
        if (chance(s, mistakeP)) { pct = 0.4; notes.push('jumped a budget 40% (reset learning)') }
      } else if (chance(s, mistakeP * 0.5) && st.spend > 0 && st.spend < be.breakEvenCpa && j.purchases >= 1) {
        pct = 0.4
        notes.push('scaled 40% on one lucky sale')
      }
      if (pct <= 0) continue
      const nb = Math.min(maxBudget, Math.round(h.budget * (1 + pct)))
      if (nb <= h.budget) continue
      if (h.level === 'campaign') updateCampaign(s, h.id, { dailyBudget: nb })
      else updateAdSet(s, h.id, { dailyBudget: nb })
      scaled++
    }
  }

  // 3) duplicate the strongest ABO ad set (max 1/day, each set once a week)
  if (cfg.duplicateWinners !== false) {
    for (const h of holders) {
      if (dup >= 1 || h.level !== 'adset' || !h.storeProductId) continue
      const key = `_dup_${h.id}`
      if (now - Number(cfg[key] ?? -1e9) < 7 * 24) continue
      const be = breakEven(s, h.storeProductId)
      if (!(be.breakEvenCpa > 0)) continue
      const st = statsFor(s, 'adset', h.id, range)
      const j = judged(st.spend, st.purchases, st.truePurchases, st.purchaseValue, st.trueRevenue)
      if (j.roas > 1.6 * be.breakEvenRoas && st.spend >= 3 * be.breakEvenCpa) {
        const id = duplicateEntity(s, 'adset', h.id)
        if (id) { dup++; m.config = { ...(m.config ?? {}), [key]: now } }
      }
    }
  }

  // 4) creative refresh: ad sets running on fewer than 2 live ads get the newest unused creative
  //    (one per set per day; low-skill buyers forget to do this half the time)
  let launched = 0
  if (cfg.launchCreatives !== false) {
    const used = new Set(s.ads.ads.filter(a => a.status !== 'deleted').map(a => `${a.platform}:${a.creativeId}`))
    for (const set of liveSets.values()) {
      if (m.skill < 5 && chance(s, 0.5)) continue
      const setAds = s.ads.ads.filter(a => a.adSetId === set.id && a.status !== 'deleted')
      const liveAds = setAds.filter(a => a.status === 'active' && a.review !== 'rejected').length
      const template = setAds[setAds.length - 1]
      if (liveAds >= 2 || !template) continue
      const sp = s.store.products.find(p => p.id === template.storeProductId)
      if (!sp) continue
      const fresh = s.creatives.creatives
        .filter(c => c.status === 'ready' && c.catalogId === sp.catalogId && !used.has(`${set.platform}:${c.id}`))
        .sort((a, b) => (b.readyHour ?? 0) - (a.readyHour ?? 0))[0]
      if (!fresh) continue
      const id = createAd(s, {
        adSetId: set.id, name: fresh.name, creativeId: fresh.id, storeProductId: sp.id,
        primaryText: template.primaryText, headline: template.headline, cta: template.cta,
      })
      if (id) { launched++; used.add(`${set.platform}:${fresh.id}`) }
    }
  }

  const summary = `9 AM review: paused ${paused}, scaled ${scaled}, duplicated ${dup}${launched ? `, launched ${launched} new creative${launched === 1 ? '' : 's'}` : ''}.`
  m.lastReport = notes.length ? `${summary} Note: ${[...new Set(notes)].slice(0, 2).join('; ')}.` : summary
  m.lastReportDay = t
  if (paused + scaled + dup + launched > 0) {
    notify(s, { kind: 'info', title: `${first(m.name)}'s ad review`, body: m.lastReport, site: liveCamp.values().next().value?.platform === 'tiktak' ? 'tiktak' : 'fadbook', path: '' })
  }
}
