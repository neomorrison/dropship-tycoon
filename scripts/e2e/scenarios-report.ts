// Headless check of the dev QA scenarios (src/dev/scenarios.ts): builds each one with
// the real sim and prints what it contains + build time. No browser needed.
//   npx tsx scripts/e2e/scenarios-report.ts            (all scenarios)
//   npx tsx scripts/e2e/scenarios-report.ts ads crisis (some)
import { buildScenario, scenarioChecks, isScenarioName, SCENARIO_NAMES } from '../../src/dev/scenarios'
import { dayOf, hourOfDay } from '../../src/core/time'
import type { GameState } from '../../src/core/types'

const usd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

function summary(s: GameState): string[] {
  const count = <T,>(arr: T[], f: (x: T) => boolean) => arr.filter(f).length
  const byStatus = <T extends { status: string }>(arr: T[]) => {
    const m: Record<string, number> = {}
    for (const x of arr) m[x.status] = (m[x.status] ?? 0) + 1
    return Object.entries(m).map(([k, v]) => `${k}:${v}`).join(' ') || '-'
  }
  const card = s.finance.card
  return [
    `day ${dayOf(s.time.hour)} ${String(hourOfDay(s.time.hour)).padStart(2, '0')}:00 · location ${s.player.location} · activity ${s.player.activity?.kind ?? '-'} · modals ${s.events.modals.length}`,
    `cash ${usd(s.finance.cash)} · card ${usd(card.balance)}/${usd(card.limit)} (${Math.round((card.balance / card.limit) * 100)}%) · home tier ${s.home.tier} · employed ${s.job.employed}`,
    `store ${s.store.created ? s.store.name : '-'} · products ${byStatus(s.store.products)} · apps ${s.store.apps.map(a => a.appId).join(',') || '-'}`,
    `orders ${s.store.orders.length} · tickets ${byStatus(s.store.tickets)} · chargebacks ${byStatus(s.store.chargebacks)} · payouts ${byStatus(s.store.payouts)}`,
    `ad accounts ${s.ads.accounts.map(a => `${a.platform}:${a.status}`).join(' ') || '-'} · campaigns ${s.ads.campaigns.length} · ad sets ${s.ads.adSets.length} · ads ${s.ads.ads.length}`,
    `creatives ${byStatus(s.creatives.creatives)} · samples owned ${s.catalog.samplesOwned.length} · Mineo until ${s.catalog.spyToolUntilDay ?? '-'}`,
    `unlocks ${Object.entries(s.catalog.unlocks).filter(([, v]) => v).map(([k]) => k).join(',') || '-'} · bulk orders ${byStatus(s.catalog.bulkOrders)} · inventory ${Object.values(s.catalog.inventory).reduce((a, x) => a + x.units, 0)} · modes ${Object.values(s.catalog.sourcing).map(x => x.mode).join(',') || '-'}`,
    `staff ${s.staff.members.map(m => m.role).join(',') || '-'} · mails ${s.inbox.length} (CNY ${count(s.inbox, m => /spring festival|new year/i.test(m.subject))}) · notifications ${s.notifications.length} · history ${s.history.length} days`,
  ]
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : [...SCENARIO_NAMES]
for (const name of names) {
  const t0 = performance.now()
  const s = buildScenario(name)
  const ms = performance.now() - t0
  console.log(`\n${name} (${ms.toFixed(0)} ms)`)
  for (const l of summary(s)) console.log(`  ${l}`)
  const missing = isScenarioName(name) ? scenarioChecks(name, s) : []
  console.log(missing.length ? `  MISSING: ${missing.join('; ')}` : '  all scenario promises met')
  const json = JSON.stringify(s)
  console.log(`  save size ${(json.length / 1024).toFixed(0)} KB`)
}
