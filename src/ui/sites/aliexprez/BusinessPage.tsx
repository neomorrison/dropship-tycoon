// AliExprez — Dropshipping center (Business). Locked until the sourcing agent reaches out
// (100 store orders). Tabs: Sourcing (agent quotes + fulfillment per product), Bulk orders
// (sea/air POs with CNY-aware ETAs), 3PL inventory, Private label.
import { useEffect, useMemo, useState } from 'react'
import { produce } from 'immer'
import {
  AlertTriangle, ArrowRight, Boxes, Check, CircleDollarSign, Factory, Lock, MessageSquareQuote, PackageCheck, Plane, Ship,
  Sparkles, Tag, Truck, Warehouse,
} from 'lucide-react'
import type { FulfillmentMode, GameState } from '../../../core/types'
import { act, getGS, useGS } from '../../../core/store'
import { openSite } from '../../../core/ui'
import { formatDate } from '../../../core/time'
import {
  AGENT_UNLOCK_ORDERS, PRIVATE_LABEL_UNLOCK_ORDERS, bulkQuote, findProduct, fulfillmentFor, lifetimeStoreOrders, placeBulkOrder,
  recentSales, requestAgentQuote, setFulfillmentMode, type BulkQuote, type Fulfillment,
} from '../../../sim/market'
import { cnyWindowAt, upcomingCny } from '../../../sim/events'
import { BENCHMARKS } from '../../../data/benchmarks'
import { cx, initials } from '../../kit/common'
import type { AxPageProps } from './index'
import { useToday } from './hooks'
import { hash32, usd } from './lib'
import { Dialog, ProductShot } from './components'

const THREE_PL = 'ParcelPeak Fulfillment'
type BizTab = 'sourcing' | 'bulk' | 'inventory' | 'private-label'
const asTab = (x?: string): BizTab => (x === 'bulk' || x === 'inventory' || x === 'private-label' ? x : 'sourcing')

const MODE_LABEL: Record<FulfillmentMode, string> = { dropship: 'AliExprez dropship', agent: 'SourcePro agent', bulk: 'US 3PL stock', private_label: 'Private label (3PL)' }

/** Fulfillment a product WOULD have under another mode (pure: computed on a throwaway draft). */
function whatIf(s: GameState, id: string, mode: FulfillmentMode): Fulfillment {
  const h = produce(s, d => {
    const src = (d.catalog.sourcing[id] ??= { mode: 'dropship' })
    src.mode = mode
    d.catalog.unlocks.agent = true
    d.catalog.unlocks.threePL = true
    if (mode === 'bulk' || mode === 'private_label') d.catalog.inventory[id] = { units: 1, avgCost: 0 }
  })
  return fulfillmentFor(h, id)
}

/** Catalog ids relevant to the business: products in the store, with stock, or on order. */
function useBizProducts(): string[] {
  const products = useGS(s => s.store.products)
  const inventory = useGS(s => s.catalog.inventory)
  const bulk = useGS(s => s.catalog.bulkOrders)
  return useMemo(() => {
    const ids: string[] = []
    const add = (id: string) => { if (!ids.includes(id) && findProduct(id)) ids.push(id) }
    for (const p of products) if (p.status !== 'archived') add(p.catalogId)
    for (const id of Object.keys(inventory)) add(id)
    for (const o of bulk) add(o.catalogId)
    return ids
  }, [products, inventory, bulk])
}

function useFunds() {
  const cash = useGS(s => s.finance.cash)
  const card = useGS(s => s.finance.card)
  return useMemo(() => ({ cash, card: card.frozen ? 0 : Math.max(0, card.limit - card.balance), frozen: card.frozen }), [cash, card])
}

// ---------------------------------------------------------------------------
export default function BusinessPage({ tab: tabParam, q, navigate }: AxPageProps & { tab?: string; q: URLSearchParams }) {
  const tab = asTab(tabParam)
  const unlocks = useGS(s => s.catalog.unlocks)
  const salesMap = useGS(s => s.catalog.sales)
  const lifetime = useMemo(() => lifetimeStoreOrders(getGS()), [salesMap])

  if (!unlocks.agent) return <Locked lifetime={lifetime} navigate={navigate} />
  const tabs: [BizTab, string, typeof Factory][] = [
    ['sourcing', 'Sourcing', MessageSquareQuote], ['bulk', 'Bulk orders', Ship], ['inventory', '3PL inventory', Warehouse], ['private-label', 'Private label', Tag],
  ]
  return (
    <div className="ax-wrap ax-biz">
      <div className="ax-biz-hero">
        <div>
          <div className="ax-biz-kicker"><Factory size={14} /> Dropshipping center</div>
          <h1>Your supply chain</h1>
          <p>Agent dropshipping, bulk stock at a US warehouse and your own brand. Every China-origin shipment pays US import duty.</p>
        </div>
        <AgentCard />
      </div>
      <CnyBanner />
      <div className="ax-tabs ax-tabs-page" role="tablist">
        {tabs.map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={cx('ax-tab', tab === k && 'ax-tab-on')} onClick={() => navigate(k === 'sourcing' ? 'business' : `business/${k}`)}>
            <Icon size={15} /> {label}{k === 'private-label' && !unlocks.privateLabel && <Lock size={12} />}
          </button>
        ))}
      </div>
      {tab === 'sourcing' && <Sourcing navigate={navigate} />}
      {tab === 'bulk' && <BulkTab initialProduct={q.get('product')} initialKind="bulk" navigate={navigate} />}
      {tab === 'inventory' && <Inventory navigate={navigate} />}
      {tab === 'private-label' && <PrivateLabel q={q} navigate={navigate} />}
    </div>
  )
}

function AgentCard() {
  return (
    <div className="ax-agent">
      <span className="ax-agent-avatar">{initials('Lily Chen')}</span>
      <div>
        <b>Lily Chen · SourcePro</b>
        <div className="ax-muted ax-small">Sourcing agent · Shenzhen · replies within 12h</div>
        <div className="ax-agent-tags"><span><Check size={11} /> QC on every unit</span><span><Check size={11} /> Duty cleared</span><span><Check size={11} /> US 3PL partner</span></div>
      </div>
      <button type="button" className="ax-btn ax-btn-outline ax-btn-sm" onClick={() => openSite('mail', '')}>Messages</button>
    </div>
  )
}

function CnyBanner() {
  const today = useToday()
  const now = cnyWindowAt(today)
  const next = upcomingCny(today)
  if (now) {
    return (
      <div className="ax-alert ax-alert-red">
        <AlertTriangle size={18} />
        <div>
          <b>{now.phase === 'shutdown' ? 'Factories are closed for Spring Festival' : 'Factories are restarting after Spring Festival'}</b>
          <div className="ax-small">
            {now.phase === 'shutdown'
              ? `Production resumes around ${formatDate(now.shutdownEnd + 1, 'md')}. Dropship orders placed now ship late; bulk production is paused.`
              : `Backlog and missing workers until about ${formatDate(now.backlogEnd, 'md')}. Expect slower production and delayed parcels.`}
          </div>
        </div>
      </div>
    )
  }
  if (!next || next.shutdownStart - today > 100) return null
  const days = next.shutdownStart - today
  return (
    <div className="ax-alert ax-alert-amber">
      <AlertTriangle size={18} />
      <div>
        <b>Chinese New Year {next.year}: factories close {formatDate(next.shutdownStart, 'md')} – {formatDate(next.shutdownEnd, 'md')} ({days} days from now)</b>
        <div className="ax-small">Sea freight takes 5–7 weeks door to door. Stock up on your best sellers before the closure — dropship delivery gets 10–20 days slower during the shutdown.</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Locked landing
// ---------------------------------------------------------------------------
function Locked({ lifetime, navigate }: { lifetime: number; navigate: (p: string) => void }) {
  const apps = useGS(s => s.store.apps)
  const created = useGS(s => s.store.created)
  const dserz = apps.some(a => a.appId === 'dserz')
  const pct = Math.min(100, (lifetime / AGENT_UNLOCK_ORDERS) * 100)
  const tiers = [
    { icon: Truck, title: 'AliExprez dropship', text: `Supplier ships each order from China: ${BENCHMARKS.shipping.aliStandard[0]}–${BENCHMARKS.shipping.aliStandard[1]} days standard, 7–12 with Choice, plus import duty per parcel.`, state: 'Active now' },
    { icon: MessageSquareQuote, title: 'Sourcing agent', text: 'Factory-direct unit prices, QC on every unit, express line in about a week.', state: `${AGENT_UNLOCK_ORDERS} store orders` },
    { icon: Warehouse, title: 'Bulk stock at a US 3PL', text: `Ship by sea or air to ${THREE_PL}; customers get orders in ${BENCHMARKS.shipping.usWarehouse3pl[0]}–${BENCHMARKS.shipping.usWarehouse3pl[1]} days.`, state: 'With your agent' },
    { icon: Tag, title: 'Private label', text: 'Your logo on the product and box. Harder to copy, easier to trust.', state: `${PRIVATE_LABEL_UNLOCK_ORDERS} orders of one product` },
  ]
  return (
    <div className="ax-wrap ax-biz">
      <div className="ax-biz-locked">
        <div className="ax-biz-kicker"><Factory size={14} /> Dropshipping center</div>
        <h1>Grow past AliExprez shipping times</h1>
        <p>Sourcing agents only work with stores that already sell. Reach {AGENT_UNLOCK_ORDERS} orders and an agent will contact you with quotes.</p>
        <div className="ax-unlock">
          <div className="ax-unlock-row"><b>{lifetime.toLocaleString('en-US')} / {AGENT_UNLOCK_ORDERS} store orders</b><span className="ax-muted ax-small">{Math.max(0, AGENT_UNLOCK_ORDERS - lifetime)} to go</span></div>
          <span className="ax-unlock-bar"><i style={{ width: `${pct}%` }} /></span>
        </div>
        <div className="ax-tiers">
          {tiers.map((t, i) => (
            <div key={t.title} className={cx('ax-tier', i === 0 && 'ax-tier-on')}>
              <t.icon size={20} />
              <b>{t.title}</b>
              <p>{t.text}</p>
              <span className="ax-tier-state">{i === 0 ? <Check size={12} /> : <Lock size={11} />} {t.state}</span>
            </div>
          ))}
        </div>
        <div className="ax-dserz-box">
          <PackageCheck size={20} />
          <div>
            <b>DSerz {dserz ? 'is connected' : created ? 'is not installed' : 'needs a Shopifly store'}</b>
            <div className="ax-small ax-muted">{dserz ? 'Supplier orders are placed and paid automatically when customers buy.' : 'Install DSerz from the Shopifly App Store so supplier orders are placed automatically. Otherwise you fulfill each order by hand.'}</div>
          </div>
          {!dserz && <button type="button" className="ax-btn ax-btn-red ax-btn-sm" onClick={() => openSite('shopifly', created ? 'apps' : '')}>{created ? 'Open App Store' : 'Create store'}</button>}
        </div>
      </div>
      <CnyBanner />
      <div className="ax-center"><button type="button" className="ax-btn ax-btn-outline" onClick={() => navigate('')}>Back to shopping</button></div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sourcing: agent quotes & fulfillment mode per product
// ---------------------------------------------------------------------------
function Sourcing({ navigate }: { navigate: (p: string) => void }) {
  const ids = useBizProducts()
  const sourcing = useGS(s => s.catalog.sourcing)
  const inventory = useGS(s => s.catalog.inventory)
  const bulk = useGS(s => s.catalog.bulkOrders)
  const unlocks = useGS(s => s.catalog.unlocks)
  const sales = useGS(s => s.catalog.sales)
  const events = useGS(s => s.events.active)
  const rows = useMemo(() => {
    const s = getGS()
    return ids.map(id => {
      const p = findProduct(id)!
      const cur = fulfillmentFor(s, id)
      const ali = whatIf(s, id, 'dropship')
      const agent = whatIf(s, id, 'agent')
      const quoted = !!sourcing[id]?.agentQuote
      const orders30 = recentSales(s, id, 30).orders
      const hasStock = (inventory[id]?.units ?? 0) > 0 || bulk.some(o => o.catalogId === id && o.status !== 'received')
      const hasPl = !!sourcing[id]?.brandName && ((inventory[id]?.units ?? 0) > 0 || bulk.some(o => o.catalogId === id && o.kind === 'private_label' && o.status !== 'received'))
      return { id, p, cur, ali, agent, quoted, orders30, hasStock, hasPl, configured: sourcing[id]?.mode ?? 'dropship' }
    })
  }, [ids, sourcing, inventory, bulk, sales, events])

  if (!rows.length) {
    return (
      <div className="ax-empty">
        <MessageSquareQuote size={40} strokeWidth={1.25} />
        <h3>No products in your store yet</h3>
        <p>Import products into Shopifly first. Lily quotes the products you actually sell.</p>
        <button type="button" className="ax-btn ax-btn-red" onClick={() => navigate('')}>Find products</button>
      </div>
    )
  }
  const quote = (id: string) => act(s => { requestAgentQuote(s, id) })
  const setMode = (id: string, mode: FulfillmentMode) => act(s => setFulfillmentMode(s, id, mode))
  return (
    <div className="ax-card-box">
      <div className="ax-box-head">
        <h3>Fulfillment by product</h3>
        <span className="ax-muted ax-small">Landed cost = unit price + import duty + shipping to the customer. Change the promise on your product page when delivery times change.</span>
      </div>
      <div className="ax-table-wrap">
        <table className="ax-table ax-table-biz">
          <thead>
            <tr><th>Product</th><th>Orders (30d)</th><th>AliExprez</th><th>SourcePro agent</th><th>Now fulfilled by</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="ax-td-prod">
                  <span className="ax-td-img"><ProductShot p={r.p} variant={0} /></span>
                  <button type="button" className="ax-link-plain" onClick={() => navigate(`item/${r.id}`)}>{r.p.name}</button>
                </td>
                <td>{r.orders30.toLocaleString('en-US')}</td>
                <td><CostCell f={r.ali} /></td>
                <td>
                  {r.quoted ? (
                    <>
                      <CostCell f={r.agent} />
                      <AgentDelta ali={r.ali} agent={r.agent} />
                    </>
                  ) : (
                    <button type="button" className="ax-btn ax-btn-outline ax-btn-sm" onClick={() => quote(r.id)}>Request quote</button>
                  )}
                </td>
                <td>
                  <select className="ax-select" value={r.configured} onChange={e => setMode(r.id, e.target.value as FulfillmentMode)} aria-label={`Fulfillment for ${r.p.name}`}>
                    <option value="dropship">{MODE_LABEL.dropship}</option>
                    <option value="agent" disabled={!unlocks.agent}>{MODE_LABEL.agent}{r.quoted ? '' : ' (requests a quote)'}</option>
                    <option value="bulk" disabled={!r.hasStock}>{MODE_LABEL.bulk}{r.hasStock ? '' : ' — place a bulk order first'}</option>
                    <option value="private_label" disabled={!unlocks.privateLabel || !r.hasPl}>{MODE_LABEL.private_label}{unlocks.privateLabel ? (r.hasPl ? '' : ' — order branded stock first') : ' — locked'}</option>
                  </select>
                  <div className="ax-small ax-muted">{usd(r.cur.unitCost + r.cur.shipCost)} landed · {r.cur.shipDays[0]}–{r.cur.shipDays[1]} days{!r.cur.inStock ? ' · OUT OF STOCK, using AliExprez' : ''}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AgentDelta({ ali, agent }: { ali: Fulfillment; agent: Fulfillment }) {
  const diff = ali.unitCost + ali.shipCost - (agent.unitCost + agent.shipCost)
  const faster = agent.shipDays[1] < ali.shipDays[1]
  const extras = [faster ? `${ali.shipDays[1] - agent.shipDays[1]} days faster` : null, 'QC-inspected'].filter(Boolean).join(' · ')
  return (
    <div className={cx('ax-small', diff > 0.005 ? 'ax-green' : 'ax-muted')}>
      {diff > 0.005 ? `Saves ${usd(diff)}/order` : `${usd(-diff)} more/order`} · {extras}
    </div>
  )
}

function CostCell({ f }: { f: Fulfillment }) {
  return (
    <div className="ax-costcell">
      <b>{usd(f.unitCost + f.shipCost)}</b>
      <span className="ax-muted ax-small">{usd(f.unitCost - (f.duty ?? 0))} + duty {usd(f.duty ?? 0)} + ship {usd(f.shipCost)}</span>
      <span className="ax-small">{f.shipDays[0]}–{f.shipDays[1]} days</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bulk / private-label purchase orders
// ---------------------------------------------------------------------------
function BulkTab({ initialProduct, initialKind, navigate }: { initialProduct: string | null; initialKind: 'bulk' | 'private_label'; navigate: (p: string) => void }) {
  return (
    <>
      <BulkForm initialProduct={initialProduct} initialKind={initialKind} navigate={navigate} />
      <PurchaseOrders navigate={navigate} />
    </>
  )
}

function BulkForm({ initialProduct, initialKind, lockKind, navigate }: {
  initialProduct: string | null; initialKind: 'bulk' | 'private_label'; lockKind?: boolean; navigate: (p: string) => void
}) {
  const ids = useBizProducts()
  const today = useToday()
  const unlocks = useGS(s => s.catalog.unlocks)
  const sourcing = useGS(s => s.catalog.sourcing)
  const inventory = useGS(s => s.catalog.inventory)
  const sales = useGS(s => s.catalog.sales)
  const events = useGS(s => s.events.active)
  const staff = useGS(s => s.staff.members)
  const funds = useFunds()
  const [product, setProduct] = useState<string>(initialProduct && ids.includes(initialProduct) ? initialProduct : ids[0] ?? '')
  useEffect(() => { if (initialProduct && ids.includes(initialProduct)) setProduct(initialProduct) }, [initialProduct, ids])
  useEffect(() => { if (!product && ids[0]) setProduct(ids[0]) }, [ids, product])
  const [kind, setKind] = useState<'bulk' | 'private_label'>(initialKind)
  const [method, setMethod] = useState<'sea' | 'air'>('sea')
  const [brand, setBrand] = useState('')
  const [qtyText, setQtyText] = useState('')
  const [confirm, setConfirm] = useState(false)
  const p = product ? findProduct(product) : undefined
  const moq = p ? (kind === 'bulk' ? p.moq : p.privateLabelMoq) : 0
  useEffect(() => { setQtyText(moq ? String(moq) : '') }, [product, kind, moq])
  const savedBrand = sourcing[product]?.brandName ?? ''
  useEffect(() => { setBrand(savedBrand) }, [product, savedBrand])
  const qty = Math.max(0, Math.floor(Number(qtyText) || 0))

  const calc = useMemo(() => {
    if (!p) return null
    const s = getGS()
    const perDay = recentSales(s, p.id, 7).units / 7
    const quotes = { sea: bulkQuote(s, p.id, qty, 'sea', kind), air: bulkQuote(s, p.id, qty, 'air', kind) }
    const threePl = whatIf(s, p.id, kind === 'bulk' ? 'bulk' : 'private_label')
    const ali = whatIf(s, p.id, 'dropship')
    return { perDay, quotes, threePlShip: threePl.shipCost, threePlDays: threePl.shipDays, ali }
  }, [p, qty, kind, sales, events, staff, inventory])

  if (!ids.length || !p || !calc) {
    return (
      <div className="ax-empty">
        <Boxes size={40} strokeWidth={1.25} />
        <h3>Nothing to stock yet</h3>
        <p>Bulk orders are for products you already sell. Import a product into Shopifly and make some sales first.</p>
        <button type="button" className="ax-btn ax-btn-red" onClick={() => navigate('')}>Find products</button>
      </div>
    )
  }
  const qte: BulkQuote = calc.quotes[method]
  // pay() charges ONE account: the card when it has room, otherwise checking (no split payments)
  const payFrom: 'card' | 'bank' | null = funds.card >= qte.total ? 'card' : funds.cash >= qte.total ? 'bank' : null
  const perOrder3pl = qte.landedUnit + calc.threePlShip
  const perOrderAli = calc.ali.unitCost + calc.ali.shipCost
  const onHand = inventory[p.id]?.units ?? 0
  const coverDays = calc.perDay > 0.05 ? (onHand + qty) / calc.perDay : null
  const cnyNext = upcomingCny(today)
  const cnyHit = !!cnyNext && qte.expectedShipDay >= cnyNext.shutdownStart && today <= cnyNext.shutdownEnd
  const presets = [30, 60, 90].map(d => ({ d, n: Math.max(moq, Math.ceil((calc.perDay * (d + (method === 'sea' ? 45 : 20))) / 50) * 50) }))
  const plBlocked = kind === 'private_label' && !unlocks.privateLabel
  const brandOk = kind === 'bulk' || brand.trim().length >= 2
  const canPay = payFrom !== null
  const disabled = !qte.ok || !brandOk || !canPay || plBlocked
  const place = () => {
    let ok = false
    act(s => { ok = placeBulkOrder(s, p.id, qty, method, kind, kind === 'private_label' ? brand.trim() : undefined) })
    setConfirm(false)
    if (ok) navigate('business/bulk')
  }

  return (
    <div className="ax-card-box ax-po-form">
      <div className="ax-box-head">
        <h3>{kind === 'private_label' ? 'New private-label order' : 'New bulk purchase order'}</h3>
        <span className="ax-muted ax-small">Paid in full up front from one account (your card if it has room, otherwise checking). Goods go to {THREE_PL}, then ship to customers from the US.</span>
      </div>
      <div className="ax-po-grid">
        <div className="ax-po-fields">
          <label className="ax-field">
            <span>Product</span>
            <select className="ax-select" value={p.id} onChange={e => setProduct(e.target.value)}>
              {ids.map(id => <option key={id} value={id}>{findProduct(id)?.name ?? id}</option>)}
            </select>
          </label>
          {!lockKind && (
            <div className="ax-field">
              <span>Order type</span>
              <div className="ax-seg">
                <button type="button" className={cx(kind === 'bulk' && 'on')} onClick={() => setKind('bulk')}>Generic bulk</button>
                <button type="button" className={cx(kind === 'private_label' && 'on')} disabled={!unlocks.privateLabel} onClick={() => setKind('private_label')}>
                  {!unlocks.privateLabel && <Lock size={11} />} Private label
                </button>
              </div>
            </div>
          )}
          {kind === 'private_label' && (
            <label className="ax-field">
              <span>Brand name (printed on product & box)</span>
              <input className="ax-input" value={brand} maxLength={24} onChange={e => setBrand(e.target.value)} placeholder="e.g. FurAway" />
            </label>
          )}
          <label className="ax-field">
            <span>Quantity <em className="ax-muted">MOQ {moq.toLocaleString('en-US')} units</em></span>
            <input className="ax-input" inputMode="numeric" value={qtyText} onChange={e => setQtyText(e.target.value.replace(/[^\d]/g, ''))} />
          </label>
          <div className="ax-presets">
            <button type="button" onClick={() => setQtyText(String(moq))}>MOQ</button>
            {calc.perDay > 0.05 && presets.map(x => <button key={x.d} type="button" onClick={() => setQtyText(String(x.n))}>{x.d} days of sales</button>)}
          </div>
          <div className="ax-muted ax-small">
            {calc.perDay > 0.05
              ? `You sell ≈ ${calc.perDay.toFixed(1)} units/day (last 7 days). ${onHand ? `${onHand.toLocaleString('en-US')} on hand. ` : ''}Presets include stock to cover the transit time.`
              : 'No recent sales — size the first order conservatively.'}
          </div>
          <div className="ax-field">
            <span>Freight</span>
            <div className="ax-methods">
              {(['sea', 'air'] as const).map(m => {
                const mq = calc.quotes[m]
                return (
                  <button key={m} type="button" className={cx('ax-method', method === m && 'on')} onClick={() => setMethod(m)}>
                    {m === 'sea' ? <Ship size={18} /> : <Plane size={18} />}
                    <b>{m === 'sea' ? 'Sea freight' : 'Air freight'}</b>
                    <span>{mq.transitDays[0]}–{mq.transitDays[1]} days transit</span>
                    <span>{usd(mq.freight)} freight</span>
                    <span className="ax-muted">Arrives ~{formatDate(mq.expectedArriveDay, 'md')}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="ax-po-quote">
          <div className="ax-quote-h"><ProductShot p={p} variant={0} className="ax-quote-img" /><div><b>{p.name}</b><div className="ax-muted ax-small">{qty.toLocaleString('en-US')} units · {method === 'sea' ? 'sea' : 'air'} freight</div></div></div>
          <dl className="ax-co-lines">
            <div><dt>Goods ({usd(qte.unitCost)}/unit{qte.opsDiscountPct ? `, ops manager −${Math.round(qte.opsDiscountPct * 100)}%` : ''})</dt><dd>{usd(qte.goods)}</dd></div>
            <div><dt>{method === 'sea' ? 'Sea' : 'Air'} freight</dt><dd>{usd(qte.freight)}</dd></div>
            <div><dt>US import duty ({Math.round(qte.dutyPct * 100)}%)</dt><dd>{usd(qte.duty)}</dd></div>
            <div><dt>Customs entry{qte.goods > 2500 ? ' & bond (formal)' : ' (informal)'}</dt><dd>{usd(qte.customsFee)}</dd></div>
            <div className="ax-co-total"><dt>Total due now</dt><dd>{usd(qte.total)}</dd></div>
          </dl>
          <div className="ax-compare">
            <div><span>Per order from 3PL</span><b>{usd(perOrder3pl)}</b><em>{usd(qte.landedUnit)} landed + {usd(calc.threePlShip)} pick/pack & postage · {calc.threePlDays[0]}–{calc.threePlDays[1]} days</em></div>
            <div><span>Per order via AliExprez</span><b>{usd(perOrderAli)}</b><em>{calc.ali.shipDays[0]}–{calc.ali.shipDays[1]} days</em></div>
          </div>
          <div className="ax-eta">
            <div><Factory size={14} /> Production {qte.productionDays[0]}–{qte.productionDays[1]} days · done ~{formatDate(qte.expectedShipDay, 'md')}</div>
            <div>{method === 'sea' ? <Ship size={14} /> : <Plane size={14} />} At {THREE_PL} ~{formatDate(qte.expectedArriveDay, 'md')}</div>
            {coverDays !== null && <div><Warehouse size={14} /> Stock after arrival covers ≈ {Math.round(coverDays)} days of sales</div>}
            <div className="ax-muted ax-small">Storage {usd(BENCHMARKS.shipping.threePlStoragePerUnitMonth)}/unit/month → ≈ {usd(qty * BENCHMARKS.shipping.threePlStoragePerUnitMonth)}/month at full stock.</div>
          </div>
          {cnyHit && cnyNext && <div className="ax-warnline">Production overlaps the Spring Festival closure ({formatDate(cnyNext.shutdownStart, 'md')} – {formatDate(cnyNext.shutdownEnd, 'md')}). The ETA above already includes the shutdown and restart backlog.</div>}
          {!qte.ok && <div className="ax-warnline">{qte.reason}</div>}
          {plBlocked && <div className="ax-warnline">Private label unlocks once one product passes {PRIVATE_LABEL_UNLOCK_ORDERS} orders.</div>}
          {!brandOk && <div className="ax-warnline">Choose a brand name (at least 2 characters).</div>}
          {qte.ok && !canPay && <div className="ax-warnline">Not enough funds in one account: {usd(funds.card)} available on your card{funds.frozen ? ' (frozen)' : ''}, {usd(funds.cash)} in checking. Suppliers need the full amount from a single payment method.</div>}
          <button type="button" className="ax-btn ax-btn-red ax-btn-block" disabled={disabled} onClick={() => setConfirm(true)}>
            <CircleDollarSign size={16} /> Place order · {usd(qte.total)}
          </button>
        </div>
      </div>
      {confirm && (
        <Dialog
          title="Confirm purchase order" onClose={() => setConfirm(false)}
          footer={<>
            <button type="button" className="ax-btn ax-btn-outline" onClick={() => setConfirm(false)}>Back</button>
            <button type="button" className="ax-btn ax-btn-red" onClick={place}>Pay {usd(qte.total)}</button>
          </>}
        >
          <p className="ax-dialog-p">{qty.toLocaleString('en-US')} × {kind === 'private_label' ? `"${brand.trim()}" ` : ''}{p.name} by {method} freight.</p>
          <p className="ax-dialog-p ax-muted">{usd(qte.total)} is charged now ({payFrom === 'card' ? 'to your Chaise Sapphire card' : 'from your Chaise checking account'}). Expected at {THREE_PL} around {formatDate(qte.expectedArriveDay, 'long')}. When it arrives, orders for this product switch to 3PL fulfillment automatically.</p>
        </Dialog>
      )}
    </div>
  )
}

const PO_STEPS = ['Production', 'In transit', 'Received']
function PurchaseOrders({ navigate }: { navigate: (p: string) => void }) {
  const orders = useGS(s => s.catalog.bulkOrders)
  const today = useToday()
  const list = useMemo(() => [...orders].sort((a, b) => b.orderedDay - a.orderedDay || b.id.localeCompare(a.id)), [orders])
  if (!list.length) return null
  return (
    <div className="ax-card-box">
      <div className="ax-box-head"><h3>Purchase orders</h3></div>
      <div className="ax-table-wrap">
        <table className="ax-table">
          <thead><tr><th>PO</th><th>Product</th><th>Qty</th><th>Freight</th><th>Ordered</th><th>Status</th><th>Total</th></tr></thead>
          <tbody>
            {list.map(o => {
              const p = findProduct(o.catalogId)
              const step = o.status === 'production' ? 0 : o.status === 'in_transit' ? 1 : 2
              const eta = o.status === 'production' ? `Ships ~${formatDate(o.shipDay, 'md')}` : o.status === 'in_transit' ? `ETA ${formatDate(o.arriveDay, 'md')}` : `Received ${formatDate(o.arriveDay, 'md')}`
              const late = o.status !== 'received' && today > o.arriveDay
              return (
                <tr key={o.id}>
                  <td className="ax-mono">PO-{10000 + (hash32(o.id, 'po') % 90000)}</td>
                  <td className="ax-td-prod">
                    {p && <span className="ax-td-img"><ProductShot p={p} variant={0} /></span>}
                    <span><button type="button" className="ax-link-plain" onClick={() => navigate(`item/${o.catalogId}`)}>{p?.name ?? o.catalogId}</button>{o.brandName && <div className="ax-small"><Sparkles size={11} /> {o.brandName}</div>}</span>
                  </td>
                  <td>{o.qty.toLocaleString('en-US')}</td>
                  <td>{o.method === 'sea' ? <><Ship size={14} /> Sea</> : <><Plane size={14} /> Air</>}</td>
                  <td>{formatDate(o.orderedDay, 'md')}</td>
                  <td>
                    <div className="ax-po-steps">{PO_STEPS.map((l, i) => <span key={l} className={cx(i <= step && 'on')}>{l}</span>)}</div>
                    <div className={cx('ax-small', late ? 'ax-red' : 'ax-muted')}>{eta}{late ? ' · delayed' : ''}</div>
                  </td>
                  <td>{usd(o.total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3PL inventory
// ---------------------------------------------------------------------------
function Inventory({ navigate }: { navigate: (p: string) => void }) {
  const inventory = useGS(s => s.catalog.inventory)
  const bulk = useGS(s => s.catalog.bulkOrders)
  const sourcing = useGS(s => s.catalog.sourcing)
  const sales = useGS(s => s.catalog.sales)
  const today = useToday()
  const rows = useMemo(() => {
    const s = getGS()
    const ids = new Set([...Object.keys(inventory), ...bulk.filter(o => o.status !== 'received').map(o => o.catalogId)])
    return [...ids].map(id => {
      const inv = inventory[id] ?? { units: 0, avgCost: 0 }
      const incoming = bulk.filter(o => o.catalogId === id && o.status !== 'received')
      const perDay = recentSales(s, id, 7).units / 7
      const cover = perDay > 0.05 ? inv.units / perDay : null
      return { id, p: findProduct(id), inv, incoming, incomingUnits: incoming.reduce((a, o) => a + o.qty, 0), nextArrival: incoming.length ? Math.min(...incoming.map(o => o.arriveDay)) : null, perDay, cover, mode: sourcing[id]?.mode ?? 'dropship' }
    }).sort((a, b) => b.inv.units - a.inv.units)
  }, [inventory, bulk, sourcing, sales])
  const totalUnits = rows.reduce((a, r) => a + r.inv.units, 0)
  const value = rows.reduce((a, r) => a + r.inv.units * r.inv.avgCost, 0)
  const storage = totalUnits * BENCHMARKS.shipping.threePlStoragePerUnitMonth
  return (
    <>
      <div className="ax-kpis">
        <div><span>Units on hand</span><b>{totalUnits.toLocaleString('en-US')}</b></div>
        <div><span>Inventory value (landed)</span><b>{usd(value)}</b></div>
        <div><span>Storage next month</span><b>{usd(storage)}</b></div>
        <div><span>Warehouse</span><b className="ax-kpi-sm">{THREE_PL}</b></div>
      </div>
      {!rows.length ? (
        <div className="ax-empty">
          <Warehouse size={40} strokeWidth={1.25} />
          <h3>No stock at the 3PL yet</h3>
          <p>Place a bulk order and your goods are received, counted and stored in the US. Orders then ship in {BENCHMARKS.shipping.usWarehouse3pl[0]}–{BENCHMARKS.shipping.usWarehouse3pl[1]} days.</p>
          <button type="button" className="ax-btn ax-btn-red" onClick={() => navigate('business/bulk')}>New bulk order</button>
        </div>
      ) : (
        <div className="ax-card-box">
          <div className="ax-table-wrap">
            <table className="ax-table">
              <thead><tr><th>SKU</th><th>On hand</th><th>Incoming</th><th>Avg landed cost</th><th>Sales/day (7d)</th><th>Days of cover</th><th>Fulfilled by</th><th /></tr></thead>
              <tbody>
                {rows.map(r => {
                  const fromStock = r.mode === 'bulk' || r.mode === 'private_label'
                  const low = fromStock && r.cover !== null && r.cover < 21 && !r.incomingUnits
                  const out = fromStock && r.inv.units === 0
                  const runsOut = r.cover !== null ? today + Math.floor(r.cover) : null
                  return (
                    <tr key={r.id} className={cx(out && 'ax-row-bad')}>
                      <td className="ax-td-prod">{r.p && <span className="ax-td-img"><ProductShot p={r.p} variant={0} /></span>}<span>{r.p?.name ?? r.id}{sourcing[r.id]?.brandName && <div className="ax-small"><Sparkles size={11} /> {sourcing[r.id]?.brandName}</div>}</span></td>
                      <td><b className={cx(out && 'ax-red')}>{r.inv.units.toLocaleString('en-US')}</b></td>
                      <td>{r.incomingUnits ? <>{r.incomingUnits.toLocaleString('en-US')}<div className="ax-muted ax-small">~{formatDate(r.nextArrival!, 'md')}</div></> : '—'}</td>
                      <td>{r.inv.units ? usd(r.inv.avgCost) : '—'}</td>
                      <td>{r.perDay.toFixed(1)}</td>
                      <td>
                        {out ? <span className="ax-red">Out of stock</span> : r.inv.units === 0 ? <span className="ax-muted">Awaiting first delivery</span> : r.cover === null ? '—' : <span className={cx(low && 'ax-red')}>{Math.round(r.cover)} days</span>}
                        {runsOut !== null && r.inv.units > 0 && <div className="ax-muted ax-small">Runs out ~{formatDate(runsOut, 'md')}</div>}
                      </td>
                      <td>{MODE_LABEL[r.mode]}{out && <div className="ax-small ax-red">Falling back to AliExprez</div>}</td>
                      <td><button type="button" className="ax-btn ax-btn-outline ax-btn-sm" onClick={() => navigate(`business/bulk?product=${r.id}`)}>Reorder <ArrowRight size={13} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="ax-muted ax-small ax-box-foot">Sea freight takes 5–7 weeks door to door, air about 2–3 weeks. Reorder while you still have enough cover for the transit time.</p>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Private label
// ---------------------------------------------------------------------------
function PrivateLabel({ q, navigate }: { q: URLSearchParams; navigate: (p: string) => void }) {
  const unlocked = useGS(s => s.catalog.unlocks.privateLabel)
  const sales = useGS(s => s.catalog.sales)
  const sourcing = useGS(s => s.catalog.sourcing)
  const best = useMemo(() => Object.entries(sales ?? {}).sort((a, b) => b[1].orders - a[1].orders)[0], [sales])
  const brands = useMemo(() => Object.entries(sourcing).filter(([, v]) => v.brandName), [sourcing])
  const bestP = best ? findProduct(best[0]) : undefined
  const bestOrders = best?.[1].orders ?? 0
  return (
    <>
      <div className="ax-card-box ax-pl">
        <div className="ax-pl-copy">
          <h3><Tag size={18} /> Put your own brand on it</h3>
          <p>The factory prints your logo on the product and the box and adds an insert card. A real brand earns more trust than a generic gadget, copycat stores can’t buy the identical item on AliExprez, and shoppers can’t compare your price 1:1.</p>
          <ul>
            <li><Check size={14} /> Better conversion and fewer refunds from a trusted brand</li>
            <li><Check size={14} /> Fewer copycats undercutting you</li>
            <li><Check size={14} /> Stocked at {THREE_PL}: {BENCHMARKS.shipping.usWarehouse3pl[0]}–{BENCHMARKS.shipping.usWarehouse3pl[1]} day delivery</li>
          </ul>
        </div>
        {!unlocked ? (
          <div className="ax-unlock ax-pl-unlock">
            <div className="ax-unlock-row"><b><Lock size={13} /> Unlocks at {PRIVATE_LABEL_UNLOCK_ORDERS} orders of one product</b></div>
            <div className="ax-small">{bestP ? `Your best seller: ${bestP.name} — ${bestOrders.toLocaleString('en-US')} orders` : 'No sales yet.'}</div>
            <span className="ax-unlock-bar"><i style={{ width: `${Math.min(100, (bestOrders / PRIVATE_LABEL_UNLOCK_ORDERS) * 100)}%` }} /></span>
          </div>
        ) : brands.length > 0 ? (
          <div className="ax-pl-brands">
            <b>Your brands</b>
            {brands.map(([id, v]) => <div key={id}><Sparkles size={13} /> {v.brandName} <span className="ax-muted">· {findProduct(id)?.name}</span></div>)}
          </div>
        ) : null}
      </div>
      {unlocked && <BulkForm initialProduct={q.get('product') ?? best?.[0] ?? null} initialKind="private_label" lockKind navigate={navigate} />}
    </>
  )
}
