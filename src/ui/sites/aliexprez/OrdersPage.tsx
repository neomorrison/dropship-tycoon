// AliExprez — My orders: sample orders with tracking, plus the supplier orders DSerz
// placed for your Shopifly store (AliExprez-dropship route only).
import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Clapperboard, Package, RotateCcw, Store, Truck } from 'lucide-react'
import type { Order, SampleOrder } from '../../../core/types'
import { useGS } from '../../../core/store'
import { openSite } from '../../../core/ui'
import { dayOf, formatClock, formatDate } from '../../../core/time'
import { findProduct, supplierName } from '../../../sim/market'
import { cx } from '../../kit/common'
import type { AxPageProps } from './index'
import { useToday } from './hooks'
import { SAMPLE_STEPS, hash32, hubCity, sampleStage, trackingNo, usd } from './lib'
import { ProductShot } from './components'

type SampleFilter = 'all' | 'shipping' | 'delivered'

export default function OrdersPage({ tab, navigate }: AxPageProps & { tab?: string }) {
  const view = tab === 'store' ? 'store' : 'samples'
  const samples = useGS(s => s.catalog.samples)
  const orders = useGS(s => s.store.orders)
  const aliOrders = useMemo(() => orders.filter(o => o.fulfilledBy === 'dropship' && (o.mode === undefined || o.mode === 'dropship')), [orders])
  // orders that went to the SourcePro agent or the US 3PL instead (not placed on AliExprez)
  const otherOrders = useMemo(() => orders.length - aliOrders.length, [orders, aliOrders])
  return (
    <div className="ax-wrap ax-orders">
      <div className="ax-results-head"><h1><Package size={20} /> My orders</h1></div>
      <div className="ax-tabs ax-tabs-page" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'samples'} className={cx('ax-tab', view === 'samples' && 'ax-tab-on')} onClick={() => navigate('orders')}>Samples ({samples.length})</button>
        <button type="button" role="tab" aria-selected={view === 'store'} className={cx('ax-tab', view === 'store' && 'ax-tab-on')} onClick={() => navigate('orders/store')}>Store orders via DSerz ({aliOrders.length.toLocaleString('en-US')})</button>
      </div>
      {view === 'samples' ? <Samples samples={samples} navigate={navigate} /> : <StoreOrders orders={aliOrders} otherOrders={otherOrders} navigate={navigate} />}
    </div>
  )
}

function Samples({ samples, navigate }: { samples: SampleOrder[]; navigate: (p: string) => void }) {
  const today = useToday()
  const [filter, setFilter] = useState<SampleFilter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const list = useMemo(() => [...samples]
    .filter(s => filter === 'all' || (filter === 'delivered' ? s.received : !s.received))
    .sort((a, b) => b.orderedDay - a.orderedDay || b.id.localeCompare(a.id)), [samples, filter])
  const counts = { all: samples.length, shipping: samples.filter(s => !s.received).length, delivered: samples.filter(s => s.received).length }
  if (!samples.length) {
    return (
      <div className="ax-empty">
        <Package size={44} strokeWidth={1.25} />
        <h3>No orders yet</h3>
        <p>Order a sample from any product page to check the quality yourself and film your own ad creatives.</p>
        <button type="button" className="ax-btn ax-btn-red" onClick={() => navigate('')}>Start shopping</button>
      </div>
    )
  }
  return (
    <>
      <div className="ax-chips">
        {([['all', 'All'], ['shipping', 'Shipped'], ['delivered', 'Delivered']] as [SampleFilter, string][]).map(([k, label]) => (
          <button key={k} type="button" className={cx('ax-chip', filter === k && 'ax-chip-on')} onClick={() => setFilter(k)}>{label} <span className="ax-chip-n">{counts[k]}</span></button>
        ))}
      </div>
      <div className="ax-olist">
        {list.map(smp => {
          const p = findProduct(smp.catalogId)
          if (!p) return null
          const store = supplierName(smp.catalogId)
          const st = sampleStage(smp, today, hubCity(store))
          const expanded = open === smp.id
          return (
            <article key={smp.id} className="ax-ocard">
              <header className="ax-ocard-head">
                <span className={cx('ax-ostatus', smp.received && 'ax-ostatus-done')}>{smp.received ? 'Completed' : st.step === 0 ? 'Awaiting shipment' : 'Shipped'}</span>
                <span className="ax-muted ax-small">Order date: {formatDate(smp.orderedDay, 'short')}</span>
                <span className="ax-muted ax-small">Order ID: {String(8_100_000_000 + (hash32(smp.id) % 899_999_999))}{String(hash32(smp.id, 'x') % 1_000_000).padStart(6, '0')}</span>
                <span className="ax-ocard-store"><Store size={13} /> {store}</span>
              </header>
              <div className="ax-ocard-body">
                <button type="button" className="ax-ocard-img" onClick={() => navigate(`item/${p.id}`)}><ProductShot p={p} variant={0} /></button>
                <div className="ax-ocard-info">
                  <button type="button" className="ax-ocard-title" onClick={() => navigate(`item/${p.id}`)}>{p.supplierTitle}</button>
                  <div className="ax-muted ax-small">Qty 1 · Sample</div>
                  <div className="ax-ocard-track">
                    <Truck size={14} />
                    <span><b>{st.label}</b> — {st.detail}</span>
                  </div>
                  <div className="ax-small">
                    {smp.received ? `Delivered ${formatDate(smp.arriveDay, 'md')}` : `Estimated delivery: ${formatDate(smp.arriveDay, 'md')}`}
                    <span className="ax-muted"> · Tracking {trackingNo(smp.id)}</span>
                  </div>
                </div>
                <div className="ax-ocard-side">
                  <div className="ax-ocard-total">Total: <b>{usd(smp.cost)}</b></div>
                  <button type="button" className="ax-btn ax-btn-outline ax-btn-sm" onClick={() => setOpen(expanded ? null : smp.id)}>
                    Track order {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {smp.received
                    ? <button type="button" className="ax-btn ax-btn-red ax-btn-sm" onClick={() => openSite('studio', `new/${encodeURIComponent(p.id)}`)}><Clapperboard size={14} /> Film a creative</button>
                    : null}
                  <button type="button" className="ax-btn ax-btn-ghost ax-btn-sm" onClick={() => navigate(`item/${p.id}`)}><RotateCcw size={13} /> Buy again</button>
                </div>
              </div>
              {expanded && (
                <ol className="ax-timeline">
                  {SAMPLE_STEPS.map((label, i) => {
                    const done = i <= st.step
                    const d = st.dates[i]
                    return (
                      <li key={label} className={cx(done && 'done', i === st.step && 'cur')}>
                        <span className="ax-tl-dot">{done ? <Check size={11} /> : null}</span>
                        <div><b>{label}</b><span className="ax-muted ax-small">{d !== null && d !== undefined ? (done ? formatDate(d, 'medium') : `Expected ${formatDate(d, 'md')}`) : ''}</span></div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </article>
          )
        })}
      </div>
    </>
  )
}

type StoreFilter = 'all' | 'waiting' | 'processing' | 'shipped' | 'delivered'
function orderStatus(o: Order): { key: Exclude<StoreFilter, 'all'> | 'cancelled'; label: string } {
  if (o.cancelled) return { key: 'cancelled', label: 'Cancelled' }
  if (o.fulfillment === 'delivered') return { key: 'delivered', label: 'Delivered' }
  if (o.fulfillment === 'fulfilled') return { key: 'shipped', label: 'Shipped' }
  if (o.supplierOrderedHour === null || o.supplierOrderedHour === undefined) return { key: 'waiting', label: 'Not ordered yet' }
  return { key: 'processing', label: 'Awaiting shipment' }
}

function StoreOrders({ orders, otherOrders, navigate }: { orders: Order[]; otherOrders: number; navigate: (p: string) => void }) {
  const [filter, setFilter] = useState<StoreFilter>('all')
  const [limit, setLimit] = useState(40)
  const rows = useMemo(() => [...orders].sort((a, b) => b.id - a.id).map(o => ({ o, st: orderStatus(o) })), [orders])
  const counts = useMemo(() => {
    const c: Record<StoreFilter, number> = { all: rows.length, waiting: 0, processing: 0, shipped: 0, delivered: 0 }
    for (const r of rows) if (r.st.key !== 'cancelled') c[r.st.key]++
    return c
  }, [rows])
  const list = rows.filter(r => filter === 'all' || r.st.key === filter)
  if (!orders.length && otherOrders > 0) {
    return (
      <div className="ax-empty">
        <Truck size={44} strokeWidth={1.25} />
        <h3>Your store orders don’t go through AliExprez anymore</h3>
        <p>{otherOrders.toLocaleString('en-US')} {otherOrders === 1 ? 'order was' : 'orders were'} fulfilled by your SourcePro agent or shipped from your US 3PL stock. Track those in the Dropshipping center and in Shopifly.</p>
        <button type="button" className="ax-btn ax-btn-red" onClick={() => navigate('business')}>Open Dropshipping center</button>
      </div>
    )
  }
  if (!orders.length) {
    return (
      <div className="ax-empty">
        <Truck size={44} strokeWidth={1.25} />
        <h3>No store orders placed through DSerz yet</h3>
        <p>When a customer buys from your Shopifly store, DSerz places and pays the matching AliExprez order here. Without DSerz you fulfill each order by hand from Shopifly.</p>
        <button type="button" className="ax-btn ax-btn-red" onClick={() => openSite('shopifly', 'orders')}>Open Shopifly orders</button>
      </div>
    )
  }
  return (
    <>
      {counts.waiting > 0 && (
        <div className="ax-alert">
          <b>{counts.waiting} {counts.waiting === 1 ? 'order hasn’t' : 'orders haven’t'} been placed with the supplier.</b> Without DSerz (or when your card declines) customer orders wait for a manual “Fulfill” in Shopifly — and every day waiting adds to delivery time.
          <button type="button" className="ax-btn ax-btn-red ax-btn-sm" onClick={() => openSite('shopifly', 'orders')}>Fulfill in Shopifly</button>
        </div>
      )}
      <div className="ax-chips">
        {([['all', 'All'], ['waiting', 'Not ordered'], ['processing', 'Awaiting shipment'], ['shipped', 'Shipped'], ['delivered', 'Delivered']] as [StoreFilter, string][]).map(([k, label]) => (
          <button key={k} type="button" className={cx('ax-chip', filter === k && 'ax-chip-on')} onClick={() => { setFilter(k); setLimit(40) }}>{label} <span className="ax-chip-n">{counts[k].toLocaleString('en-US')}</span></button>
        ))}
      </div>
      <div className="ax-table-wrap">
        <table className="ax-table">
          <thead><tr><th>Store order</th><th>Product</th><th>Placed with supplier</th><th>Supplier cost</th><th>Status</th><th>Tracking</th></tr></thead>
          <tbody>
            {list.slice(0, limit).map(({ o, st }) => {
              const p = findProduct(o.catalogId)
              return (
                <tr key={o.id}>
                  <td><button type="button" className="ax-link-plain" onClick={() => openSite('shopifly', `orders/${o.id}`)}>#{o.id}</button><div className="ax-muted ax-small">{o.customer.name}</div></td>
                  <td className="ax-td-prod"><div className="ax-td-prod-in">{p && <span className="ax-td-img"><ProductShot p={p} variant={0} /></span>}<span>{p?.name ?? o.catalogId} × {o.qty}</span></div></td>
                  <td>{o.supplierOrderedHour !== null && o.supplierOrderedHour !== undefined ? `${formatDate(dayOf(o.supplierOrderedHour), 'md')}, ${formatClock(o.supplierOrderedHour)}` : '—'}</td>
                  <td>{usd(o.supplierCost ?? o.cogs + o.shippingCost)}</td>
                  <td><span className={cx('ax-ostatus', `ax-os-${st.key}`)}>{st.label}</span>{st.key !== 'delivered' && st.key !== 'cancelled' && st.key !== 'waiting' && <div className="ax-muted ax-small">ETA {formatDate(o.deliverDay, 'md')}</div>}</td>
                  <td className="ax-mono">{st.key === 'shipped' || st.key === 'delivered' ? (o.tracking ?? trackingNo(`o${o.id}`)) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {limit < list.length && <div className="ax-center"><button type="button" className="ax-btn ax-btn-outline" onClick={() => setLimit(n => n + 40)}>Show more</button></div>}
    </>
  )
}
