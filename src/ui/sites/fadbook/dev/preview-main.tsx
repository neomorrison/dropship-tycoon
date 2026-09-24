// Dev-only visual QA harness for the Fadbook Ads Manager (not part of the production build):
//   http://localhost:5317/src/ui/sites/fadbook/dev/preview.html            seeded store + running campaigns
//   …/preview.html?fresh=1     brand-new game (onboarding: no ad account, no store)
//   …/preview.html?compact=1   phone frame (390px, compact mode)
//   …/preview.html?mb=4        media buying level (unlocks Advantage+, cost cap, breakdowns, rules)
//   …/preview.html?days=10     days of simulated delivery before rendering
//   …/preview.html?status=restricted | payment_failed   account problem states
import { StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { GameState } from '../../../../core/types'
import { createNewGame } from '../../../../core/newGame'
import { useGame } from '../../../../core/store'
import { tickHour } from '../../../../sim'
import { getProduct } from '../../../../sim/market'
import { createStore, importProduct, installApp, setProductStatus, updateProduct } from '../../../../sim/store'
import { completeCreative, createAd, createAdSet, createCampaign, openAdAccount, orderCreative } from '../../../../sim/ads'
import FadbookAdsManager from '../index'

const q = new URLSearchParams(location.search)

function seed(): GameState {
  const s = createNewGame({ playerName: 'Neo', difficulty: 'normal', seed: 4242 })
  if (q.get('fresh')) return s
  s.finance.cash = 6000
  s.finance.card.limit = 8000
  const mb = Number(q.get('mb') ?? 1)
  s.skills.media_buying.level = mb
  createStore(s, { name: 'Cozy Paws' })
  const catalogId = s.catalog.available[0]
  const p = getProduct(catalogId)
  const spId = importProduct(s, catalogId)
  updateProduct(s, spId, { title: `${p.name} for a calmer home`, price: Math.round(p.perceivedValue * 0.9) - 0.01 })
  setProductStatus(s, spId, 'active')
  installApp(s, 'dserz')
  installApp(s, 'fadbook-channel')
  s.catalog.samplesOwned.push(catalogId)
  const briefs = [
    { name: 'POV hook v1', format: p.bestFormats[0], hook: p.bestHooks[0], angle: p.bestAngles[0] },
    { name: 'Problem callout v2', format: p.bestFormats[1] ?? p.bestFormats[0], hook: p.bestHooks[1] ?? p.bestHooks[0], angle: p.bestAngles[1] ?? p.bestAngles[0] },
    { name: 'Slideshow test', format: 'slideshow' as const, hook: 'question' as const, angle: 'curiosity' as const },
  ]
  const creativeIds: string[] = []
  for (const b of briefs) {
    const id = orderCreative(s, {
      catalogId, name: b.name, format: b.format, hook: b.hook, angle: b.angle, beats: ['hook', 'problem', 'demo', 'social_proof', 'offer', 'cta'],
      hookText: `POV: you finally fixed the ${p.keywords[0] ?? 'mess'}`, script: `I tried everything. This ${p.name.toLowerCase()} actually works. 30-day guarantee, free shipping.`,
      producer: b.format === 'slideshow' ? 'supplier_edit' : 'self',
    })
    if (id) {
      completeCreative(s, id)
      creativeIds.push(id)
    }
  }
  s.player.queue = []
  s.player.activity = null
  const acc = openAdAccount(s, 'fadbook')!
  const c1 = createCampaign(s, { platform: 'fadbook', accountId: acc, name: 'TEST | Broad | CBO', budgetMode: 'cbo', dailyBudget: 40 })!
  const set1 = createAdSet(s, { campaignId: c1, name: 'Broad 18-65+ US' })!
  for (const cid of creativeIds) createAd(s, { adSetId: set1, name: s.creatives.creatives.find(c => c.id === cid)!.name, creativeId: cid, storeProductId: spId, primaryText: 'Finally, a fix that works. Free US shipping + 30-day guarantee.', headline: p.name })
  const c2 = createCampaign(s, { platform: 'fadbook', accountId: acc, name: 'TEST | Interests | ABO', budgetMode: 'abo' })!
  const set2 = createAdSet(s, { campaignId: c2, name: 'Pet owners 25-54', dailyBudget: 20, targeting: { type: 'interest', interests: ['Dogs', 'Cats'], ageMin: 25, ageMax: 54 } })
  if (set2 && creativeIds[0]) createAd(s, { adSetId: set2, name: 'POV hook v1 - interests', creativeId: creativeIds[0], storeProductId: spId, primaryText: 'Your couch deserves better.', headline: p.name })
  const days = Number(q.get('days') ?? 8)
  for (let i = 0; i < days * 24; i++) {
    try {
      tickHour(s)
    } catch (e) {
      console.warn('tick failed', e)
      break
    }
    s.player.queue = []
  }
  s.events.modals = []
  const st = q.get('status')
  const a = s.ads.accounts.find(x => x.id === acc)
  if (a && st === 'restricted') {
    a.status = 'restricted'
    a.statusReason = 'Your ads were found to violate our Advertising Standards on unrealistic outcomes and misleading claims.'
    a.statusSinceHour = s.time.hour - 20
    a.banCount = 1
  } else if (a && st === 'payment_failed') {
    a.status = 'payment_failed'
    a.statusReason = 'We couldn\'t charge $250.00 to your Chaise Sapphire card.'
    a.billingHistory = [...(a.billingHistory ?? []), { id: 'bill_dev', hour: s.time.hour - 3, amount: 250, status: 'failed', method: null, reason: 'threshold', threshold: 250 }]
    a.unbilled = 250
  }
  return s
}

useGame.getState().load(seed())

function Harness() {
  const [path, setPath] = useState(q.get('path') ?? '')
  const compact = !!q.get('compact')
  const tick = (h: number) => useGame.getState().act(s => { for (let i = 0; i < h; i++) tickHour(s) })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12, gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#fff', fontSize: 12 }}>
        <strong>Fadbook dev preview</strong>
        <span>path: “{path}”</span>
        <button onClick={() => tick(1)}>+1h</button>
        <button onClick={() => tick(24)}>+1 day</button>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0, width: compact ? 390 : '100%', maxWidth: compact ? 390 : 1400, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
          <FadbookAdsManager tabId="dev" path={path} navigate={setPath} compact={compact} />
        </div>
      </div>
    </div>
  )
}

// reuse the root across hot reloads of this entry module
const el = document.getElementById('root') as HTMLElement & { __fbRoot?: Root }
const root = el.__fbRoot ?? (el.__fbRoot = createRoot(el))
root.render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
