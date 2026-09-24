// Automated rules (Media Buying L4+), evaluated daily at 9 AM like Ads Manager's rule scheduler.
import type { AdLevel, AutomatedRule, GameState, RuleLogEntry } from '../../core/types'
import { dayOf } from '../../core/time'
import { notify } from '../../core/notify'
import { uid } from '../../core/ids'
import { deriveMetrics, emptyStats, addStats } from './metrics'
import { ADSET_WORD, PLATFORM_NAME, adsInAdSet, findAdSet, findCampaign, fmtMoney } from './shared'
import { featureUnlocked, setEntityStatus, updateAdSet, updateCampaign } from './structure'

const LOG_CAP = 200

function windowRange(day: number, w: NonNullable<AutomatedRule['window']>): [number, number] {
  switch (w) {
    case 'today': return [day, day]
    case 'yesterday': return [day - 1, day - 1]
    case 'last_7d': return [day - 7, day - 1]
    case 'lifetime': return [0, day]
    default: return [day - 3, day - 1]
  }
}

function entityStats(s: GameState, level: AdLevel, id: string, from: number, to: number) {
  const out = emptyStats()
  let freq = 0
  const ads = level === 'ad' ? s.ads.ads.filter(a => a.id === id)
    : level === 'adset' ? adsInAdSet(s, id)
    : s.ads.ads.filter(a => a.campaignId === id && a.status !== 'deleted')
  for (const ad of ads) {
    if (from <= 0) addStats(out, ad.lifetime)
    for (let d = Math.max(0, from); d <= to; d++) if (ad.stats[d]) addStats(out, ad.stats[d])
    freq = Math.max(freq, ad.frequency)
  }
  return { st: out, freq }
}

function metricValue(rule: AutomatedRule, st: ReturnType<typeof emptyStats>, freq: number): number {
  const m = deriveMetrics(st)
  switch (rule.metric) {
    case 'cpa': return st.purchases > 0 ? m.cpa : st.spend > 0 ? Infinity : 0
    case 'roas': return m.roas
    case 'spend': return st.spend
    case 'ctr': return m.ctrLink * 100
    case 'frequency': return freq
  }
}

function entitiesFor(s: GameState, rule: AutomatedRule): { level: AdLevel; id: string; name: string }[] {
  const pick = (id: string) => !rule.targetIds?.length || rule.targetIds.includes(id)
  if (rule.scope === 'campaign') return s.ads.campaigns.filter(c => c.platform === rule.platform && c.status === 'active' && pick(c.id)).map(c => ({ level: 'campaign' as const, id: c.id, name: c.name }))
  if (rule.scope === 'adset') return s.ads.adSets.filter(a => a.platform === rule.platform && a.status === 'active' && pick(a.id)).map(a => ({ level: 'adset' as const, id: a.id, name: a.name }))
  return s.ads.ads.filter(a => a.platform === rule.platform && a.status === 'active' && pick(a.id)).map(a => ({ level: 'ad' as const, id: a.id, name: a.name }))
}

export function runRules(s: GameState): void {
  if (!s.ads.rules.length || !featureUnlocked(s, 'rules')) return
  const day = dayOf(s.time.hour)
  const log = (s.ads.ruleLog ??= [])
  const fired: RuleLogEntry[] = []
  for (const rule of s.ads.rules) {
    if (!rule.enabled) continue
    const [from, to] = windowRange(day, rule.window ?? 'last_3d')
    for (const e of entitiesFor(s, rule)) {
      const { st, freq } = entityStats(s, e.level, e.id, from, to)
      if (st.spend < rule.minSpend) continue
      const v = metricValue(rule, st, freq)
      const hit = rule.op === '>' ? v > rule.value : v < rule.value
      if (!hit) continue
      const detail = applyAction(s, rule, e.level, e.id)
      if (!detail) continue
      const entry: RuleLogEntry = { id: uid(s, 'rl'), hour: s.time.hour, ruleId: rule.id, ruleName: rule.name, level: e.level, entityId: e.id, entityName: e.name, action: rule.action, detail }
      log.push(entry)
      fired.push(entry)
    }
    rule.lastRunHour = s.time.hour
  }
  if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP)
  if (fired.length) {
    const byPlat = new Set(fired.map(f => s.ads.rules.find(r => r.id === f.ruleId)?.platform ?? 'fadbook'))
    for (const p of byPlat) {
      const mine = fired.filter(f => s.ads.rules.find(r => r.id === f.ruleId)?.platform === p)
      notify(s, {
        kind: 'info',
        title: `${PLATFORM_NAME[p]} rules ran: ${mine.length} change${mine.length === 1 ? '' : 's'}`,
        body: mine.slice(0, 3).map(f => `${f.entityName}: ${f.detail}`).join(' · ') + (mine.length > 3 ? ` (+${mine.length - 3} more)` : ''),
        site: p, path: 'rules',
      })
    }
  }
}

function applyAction(s: GameState, rule: AutomatedRule, level: AdLevel, id: string): string | null {
  if (rule.action === 'pause') {
    setEntityStatus(s, level, id, 'paused')
    return 'Turned off'
  }
  const mult = rule.action === 'increase_budget' ? 1 + rule.actionPct / 100 : 1 - rule.actionPct / 100
  if (level === 'campaign') {
    const c = findCampaign(s, id)
    if (!c || c.budgetMode !== 'cbo' || c.dailyBudget == null) return null
    const prev = c.dailyBudget
    updateCampaign(s, id, { dailyBudget: Math.round(prev * mult * 100) / 100 })
    return c.dailyBudget !== prev ? `Budget ${fmtMoney(prev)} → ${fmtMoney(c.dailyBudget)}` : null
  }
  if (level === 'adset') {
    const set = findAdSet(s, id)
    const c = set && findCampaign(s, set.campaignId)
    if (!set || !c) return null
    if (c.budgetMode === 'cbo') return null
    const prev = set.dailyBudget ?? 0
    updateAdSet(s, id, { dailyBudget: Math.round(prev * mult * 100) / 100 })
    return set.dailyBudget !== prev ? `Budget ${fmtMoney(prev)} → ${fmtMoney(set.dailyBudget ?? 0)}` : null
  }
  return null
}

/** Human-readable rule summary for lists ("If CPA > $32 over last 3 days and spend > $20, turn off ad sets"). */
export function describeRule(rule: AutomatedRule): string {
  const metric = { cpa: 'cost per purchase', roas: 'purchase ROAS', spend: 'amount spent', ctr: 'link CTR (%)', frequency: 'frequency' }[rule.metric]
  const val = rule.metric === 'cpa' || rule.metric === 'spend' ? fmtMoney(rule.value) : String(rule.value)
  const win = { today: 'today', yesterday: 'yesterday', last_3d: 'the last 3 days', last_7d: 'the last 7 days', lifetime: 'lifetime' }[rule.window ?? 'last_3d']
  const what = rule.scope === 'campaign' ? 'campaigns' : rule.scope === 'adset' ? `${ADSET_WORD[rule.platform]}s` : 'ads'
  const act = rule.action === 'pause' ? `turn off ${what}` : `${rule.action === 'increase_budget' ? 'increase' : 'decrease'} ${what} daily budget by ${rule.actionPct}%`
  return `If ${metric} ${rule.op} ${val} over ${win}${rule.minSpend > 0 ? ` and spend ≥ ${fmtMoney(rule.minSpend)}` : ''}, ${act}. Runs daily at 9:00 AM.`
}
