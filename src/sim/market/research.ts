// Product research: the 1-hour activity deepens research on a product (0 → 3) and
// unlocks player-facing insights. Wording and precision scale with the research SKILL:
// a novice gets vague, noisier reads; an expert gets tight numbers. Insights only ever
// point at real signals — interpreting them is the player's job.
import type { GameState, HookId, Niche, ProductDef } from '../../core/types'
import { dayOf, monthName } from '../../core/time'
import { clamp } from '../../core/rng'
import { money } from '../../core/format'
import { notify } from '../../core/notify'
import { angleName, formatName } from '../../data/creativeTaxonomy'
import { enqueueActivity, grantXp } from '../life'
import { findProduct } from './catalog'
import { hnorm, hrand } from './noise'
import { dropshipFulfillment, dutyPctFor } from './sourcing'

export const MAX_RESEARCH = 3
const RESEARCH_XP = 40

/** Typical review complaints: [powered product, unpowered product] */
const COMPLAINTS: Record<Niche, [string, string]> = {
  pet: ['it broke quickly or was too loud for their pet', "it broke quickly or did nothing for their pet's coat"],
  beauty: ['it did nothing, irritated their skin, or stopped charging', "it felt cheap or didn't work like the video"],
  home: ['it arrived damaged or stopped working after a few weeks', 'it arrived damaged or felt flimsy'],
  kitchen: ['the motor died or it broke within weeks', 'it broke, leaked, or felt cheap'],
  fitness: ['the electronics failed or it felt flimsy', 'it broke or felt flimsy'],
  wellness: ['it was uncomfortable or stopped working', 'it was uncomfortable or did nothing'],
  car: ["it stopped working or didn't fit their car", "it didn't fit their car or broke"],
  gadgets: ['it stopped charging, dropped connection, or died early', 'it broke quickly'],
  baby: ['it was weaker than expected or stopped working', 'it felt cheap or broke'],
  kids: ['it stopped working or arrived damaged', 'parts came loose or it arrived damaged'],
  fashion: ['the electronics failed', 'it ran small or the zippers/clasps broke'],
  outdoor: ['it stopped charging or failed in bad weather', 'it broke in bad weather'],
}
const isPowered = (p: ProductDef) => Object.entries(p.specs).some(([k, v]) => /battery|power|charging|output|input|voltage/i.test(k) && !/no battery/i.test(v))
const HOOK_PHRASE: Record<HookId, string> = {
  problem_callout: 'problem call-out', pov: 'POV', tiktak_made_me_buy: '"TikTak made me buy it"', before_after: 'before/after',
  asmr: 'ASMR', shock_stat: 'shock-stat', unboxing: 'unboxing', us_vs_them: 'us-vs-them comparison', testimonial: 'testimonial',
  gift_idea: 'gift-idea', life_hack: 'life-hack', controversial: 'hot-take', question: 'question',
}
const COMPLAINT_OVERRIDE: Record<string, string> = {
  'moon-lamp': 'it stopped floating or arrived cracked',
  'blackhead-vacuum': 'it left red marks and bruises or barely had suction',
  'retro-earbuds': 'one earbud died or kept disconnecting',
  'heated-vest': 'it runs two sizes small and the power bank is not included',
  'jump-starter': "it wouldn't hold a charge after a few months",
  'heatless-curler': "it slipped off overnight or didn't hold a curl in thick hair",
  'ice-face-roller': 'it leaked or cracked in the freezer',
  'claw-clip-set': 'the clips snapped within weeks',
  'magnetic-screen-door': "the magnets didn't line up or it tore at the seam",
  'solar-firefly-lights': 'they stopped charging after a few weeks',
}

const skillOf = (s: GameState) => clamp(s.skills?.research?.level ?? 1, 1, 10)
const r0 = (x: number) => Math.round(x)
const monthsList = (ms: number[]) => {
  if (!ms.length) return ''
  // compress consecutive months (wrapping Dec→Jan) into "Nov–Jan" style ranges
  const set = new Set(ms)
  const start = ms.find(m => !set.has((m + 11) % 12)) ?? ms[0]
  const ordered: number[] = []
  for (let i = 0; i < 12; i++) if (set.has((start + i) % 12)) ordered.push((start + i) % 12)
  const runs: number[][] = []
  for (const m of ordered) {
    const last = runs[runs.length - 1]
    if (last && (last[last.length - 1] + 1) % 12 === m) last.push(m)
    else runs.push([m])
  }
  return runs.map(r => (r.length === 1 ? monthName(r[0]) : `${monthName(r[0])}–${monthName(r[r.length - 1])}`)).join(', ')
}

/** Player-facing research notes (more/better with research depth + skill). */
export function researchInsights(s: GameState, catalogId: string): string[] {
  const p = findProduct(catalogId)
  const m = s.catalog.market[catalogId]
  if (!p || !m) return []
  const depth = s.catalog.research[catalogId] ?? 0
  const skill = skillOf(s)
  const day = dayOf(s.time.hour)
  const week = Math.floor(day / 7)
  const seed = s.meta.seed
  const out: string[] = []
  if (depth <= 0) {
    return ['Not researched yet. One hour of research reveals what competitors charge, how many stores advertise it, the Amazin price anchor and your real landed cost.']
  }

  // ---------------- Level 1: pricing & competition ----------------
  const ali = dropshipFulfillment(s, p)
  const landed = ali.unitCost + ali.shipCost
  const hiPrice = Math.floor(m.competitorPrice * (1.3 + 0.2 * hrand(p.id, 'hiP', week))) + 0.99
  out.push(`Stores advertising it charge ${money(m.competitorPrice)}–${money(hiPrice)}.`)
  if (p.amazonPrice !== null) {
    out.push(`Amazin lists comparable items around ${money(p.amazonPrice)} — that's the price shoppers will compare you against (${(p.amazonPrice / landed).toFixed(1)}× your landed cost).`)
  } else {
    out.push('No close match on Amazin — shoppers have no price anchor, so perceived value comes entirely from your page and creatives.')
  }
  out.push(`Landed cost via AliExprez ≈ ${money(landed)} per order (item ${money(ali.unitCost - (ali.duty ?? 0))} + shipping ${money(ali.shipCost)} + ${Math.round(dutyPctFor(p) * 100)}% import duty ${money(ali.duty ?? 0)}).`)
  const advNoise = 1 + hnorm(p.id, 'advN', week, seed) * (0.35 / Math.sqrt(skill))
  const advEst = Math.max(0, m.competitors * advNoise)
  out.push(
    advEst < 3 ? 'Almost nobody is running ads on it yet.'
      : skill >= 4 ? `About ${r0(advEst)} stores are running ads on it right now.`
        : advEst < 7 ? 'A handful of stores are running ads on it.'
          : advEst < 15 ? 'Several stores (roughly ten) are running ads on it.'
          : advEst < 40 ? 'Quite a few stores (a few dozen) are running ads on it.'
            : 'Lots of stores are running ads on it — it is a crowded product.',
  )
  if (depth < 2) {
    out.push('Research again to read the demand trend and customer complaints.')
    return out
  }

  // ---------------- Level 2: trend & quality ----------------
  const slope = m.trendIndex14 > 0 ? m.trendIndex / m.trendIndex14 - 1 : 0
  const seen = slope + hnorm(p.id, 'trendN', week, seed) * (0.3 / Math.sqrt(skill))
  const conf = skill >= 6 ? '' : skill >= 3 ? ' (moderate confidence)' : ' (low confidence — your research skill is still basic)'
  const pctTxt = skill >= 4 ? ` (${seen >= 0 ? '+' : '−'}${r0(Math.abs(seen) * 100)}% over two weeks)` : ''
  out.push(
    (seen > 0.25 ? `Interest is climbing fast${pctTxt}.`
      : seen > 0.08 ? `Interest is picking up${pctTxt}.`
        : seen < -0.25 ? `Interest is dropping fast${pctTxt}.`
          : seen < -0.08 ? `Interest is cooling off${pctTxt}.`
            : `Interest looks steady${pctTxt}.`) + conf,
  )
  const complaintShare = clamp(p.defectRate * (1 + hnorm(p.id, 'cmpN', seed) * (0.3 / Math.sqrt(skill))) + 0.015, 0.01, 0.6)
  const complaint = COMPLAINT_OVERRIDE[p.id] ?? COMPLAINTS[p.niche][isPowered(p) ? 0 : 1]
  out.push(skill >= 3
    ? `About ${r0(complaintShare * 100)}% of recent reviews say ${complaint}.`
    : complaintShare > 0.15 ? `A worrying number of reviews say ${complaint}.` : complaintShare > 0.07 ? `Some reviews say ${complaint}.` : `Few reviews complain; most buyers seem happy.`)
  if (p.claimRisk >= 0.35) {
    out.push('Most competitor ads lean on health/skin claims or before/after shots — ad platforms reject those often. Expect disapprovals unless your creatives avoid medical wording and dramatic transformations.')
  } else if (p.claimRisk >= 0.15) {
    out.push('Some competitor ads make wellness claims; keep your copy factual to avoid ad disapprovals.')
  }
  if (depth < 3) {
    out.push('Research once more for perceived value, the angles that work, and who buys it.')
    return out
  }

  // ---------------- Level 3: value, creative angles, audience ----------------
  const halfWidth = clamp(0.42 - 0.035 * skill, 0.07, 0.4)
  const center = p.perceivedValue * (1 + hnorm(p.id, 'pvN', seed) * halfWidth * 0.35)
  out.push(`Shoppers seem willing to pay roughly ${money(Math.max(1, Math.floor(center * (1 - halfWidth)) + 0.99))}–${money(Math.floor(center * (1 + halfWidth)) + 0.99)} for it.`)
  const hookPick = skill >= 5 ? p.bestHooks[0] : p.bestHooks[Math.floor(hrand(p.id, 'hookPick', seed) * p.bestHooks.length)]
  let adsLine = `The best-performing competitor ads mostly open with ${HOOK_PHRASE[hookPick]} hooks`
  if (skill >= 3) adsLine += ` and sell the ${angleName(p.bestAngles[0]).toLowerCase()} angle`
  if (skill >= 6) adsLine += `, usually as ${formatName(p.bestFormats[0]).toLowerCase()} videos`
  out.push(adsLine + '.')
  const g = p.audience.gender === 'all' ? 'both men and women' : p.audience.gender === 'female' ? 'mostly women' : 'mostly men'
  const fitDiff = p.platformFit.tiktak - p.platformFit.fadbook
  const platformLine = fitDiff > 0.15 ? ' It clearly performs better on TikTak than on Fadbook.' : fitDiff < -0.15 ? ' It performs better on Fadbook/Instaglam than on TikTak.' : ''
  out.push(`Buyers are ${g}, roughly ${p.audience.ageMin}–${p.audience.ageMax}.${platformLine}`)
  const peaks = p.seasonality.map((v, i) => (v >= 1.3 ? i : -1)).filter(i => i >= 0)
  const lows = p.seasonality.map((v, i) => (v <= 0.55 ? i : -1)).filter(i => i >= 0)
  if (peaks.length) out.push(`Demand peaks in ${monthsList(peaks)}${lows.length ? ` and nearly disappears in ${monthsList(lows)}` : ''}.`)
  else if (p.giftable >= 0.6) out.push('Strong gift appeal: expect a Q4 lift (and smaller bumps around gifting holidays).')
  if (skill >= 5) out.push(`Market saturation ≈ ${r0(m.saturation * 100)}% — the later you enter, the more each customer costs.`)
  if (p.repeatRate >= 0.2) out.push('Consumable — buyers come back for refills, which raises customer lifetime value.')
  if (p.brandable >= 0.7 && skill >= 4) out.push('No dominant brand in the space yet — a strong private-label candidate once it sells.')
  if (p.weightKg >= 1.2) out.push(`Heavy/bulky (${p.weightKg} kg): shipping eats margin and air freight gets expensive.`)
  return out
}

/** Enqueue a product_research activity (1h). */
export function startResearch(s: GameState, catalogId: string): void {
  const p = findProduct(catalogId)
  if (!p) return
  const depth = s.catalog.research[catalogId] ?? 0
  if (depth >= MAX_RESEARCH) {
    notify(s, { kind: 'info', title: `Nothing more to dig up on ${p.name}`, body: 'Research is maxed out for this product. Level up your research skill to sharpen the numbers.', site: 'aliexprez', path: `item/${catalogId}` })
    return
  }
  const queued = [s.player.activity, ...s.player.queue].some(a => a?.kind === 'product_research' && a.payload?.catalogId === catalogId)
  if (queued) return
  enqueueActivity(s, 'product_research', { payload: { catalogId }, label: `Research: ${p.name}` })
}

/** Activity completion (called from sim/hooks). */
export function completeResearch(s: GameState, catalogId: string): void {
  const p = findProduct(catalogId)
  if (!p) return
  const before = s.catalog.research[catalogId] ?? 0
  const depth = Math.min(MAX_RESEARCH, before + 1)
  s.catalog.research[catalogId] = depth
  grantXp(s, 'research', RESEARCH_XP)
  const unlocked = depth === 1 ? 'Competitor prices, Amazin anchor, landed cost and advertiser count.'
    : depth === 2 ? 'Demand trend, review complaints and ad-policy risk.'
      : 'Perceived value range, winning ad angles, audience and seasonality.'
  notify(s, { kind: 'success', title: `Research ${depth}/${MAX_RESEARCH}: ${p.name}`, body: unlocked, site: 'aliexprez', path: `item/${catalogId}` })
}
