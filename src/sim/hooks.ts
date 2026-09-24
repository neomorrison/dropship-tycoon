// Cross-module dispatch for completed activities. The life module calls
// onActivityComplete() when an activity finishes; business effects route here.
import type { Activity, GameState } from '../core/types'
import { completeCreative, postOrganic, submitAppeal } from './ads'
import { resolveTickets, submitChargeback } from './store'
import { completeResearch } from './market'
import { influencerOutreach } from './events'

export function onActivityComplete(s: GameState, a: Activity): void {
  const p = a.payload ?? {}
  switch (a.kind) {
    case 'film_creative':
    case 'edit_supplier_video':
      if (p.creativeId) completeCreative(s, String(p.creativeId))
      break
    case 'product_research':
      if (p.catalogId) completeResearch(s, String(p.catalogId))
      break
    case 'customer_support':
      resolveTickets(s, Number(p.count ?? 12))
      break
    case 'fight_chargeback':
      if (p.chargebackId) submitChargeback(s, String(p.chargebackId), 'self')
      break
    case 'appeal_ad_account':
      if (p.accountId) submitAppeal(s, String(p.accountId))
      break
    case 'post_organic':
      if (p.creativeId && p.storeProductId) postOrganic(s, String(p.creativeId), String(p.storeProductId))
      break
    case 'influencer_outreach':
      if (p.storeProductId) influencerOutreach(s, String(p.storeProductId))
      break
    default:
      break // needs-only activities are handled inside the life module
  }
}
