// Events Manager: the store's Fadbook pixel (data source status, connection method) and the
// website events it received per day. Events are what your store actually saw, not what ads
// were credited with, so comparing them with Ads Manager's reported purchases is a real check.
import { useMemo, useState } from 'react'
import { Cable, Globe, PlugZap, Store } from 'lucide-react'
import type { GameState } from '../../../../core/types'
import { openSite } from '../../../../core/ui'
import { dayOf, formatDate } from '../../../../core/time'
import { BENCHMARKS } from '../../../../data/benchmarks'
import { hasPixel } from '../../../../sim/ads'
import { AmButton, AmCard, AmNotice, AmSegmented, AmTag, StatusCell, amFmt } from '../../../kit/adsmanager'
import { BarChart, CHART_COLORS } from '../../../kit/charts'
import { entityNumericId, storeDomain } from '../data'

type EventId = 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase'
const EVENTS: { id: EventId; label: string; desc: string }[] = [
  { id: 'PageView', label: 'Page view', desc: 'Someone loaded a page on your website.' },
  { id: 'ViewContent', label: 'View content', desc: 'Someone viewed a product page.' },
  { id: 'AddToCart', label: 'Add to cart', desc: 'Someone added a product to their cart.' },
  { id: 'InitiateCheckout', label: 'Initiate checkout', desc: 'Someone started checkout.' },
  { id: 'Purchase', label: 'Purchase', desc: 'Someone completed a purchase. Used for Sales campaign optimization.' },
]

export default function EventsManager({ s }: { s: GameState }) {
  const today = dayOf(s.time.hour)
  const connected = hasPixel(s, 'fadbook')
  const app = s.store.apps.find(a => a.appId === 'fadbook-channel')
  const since = app?.installedDay ?? 0
  const [span, setSpan] = useState<'7' | '14' | '28'>('7')
  const [event, setEvent] = useState<EventId>('Purchase')
  const days = Number(span)
  const counts = useMemo(() => {
    const out: { day: number; v: Record<EventId, number> }[] = []
    for (let d = today - days + 1; d <= today; d++) {
      const sd = d >= since && connected ? s.store.analytics.daily[d] : undefined
      const vc = sd ? Object.values(sd.byProduct).reduce((a, p) => a + p.sessions, 0) : 0
      out.push({
        day: d,
        v: {
          // every landing counts, plus the cart, checkout and thank-you pages buyers load afterwards
          PageView: sd ? sd.sessions + sd.atc + sd.checkout + sd.orders : 0,
          ViewContent: sd ? vc || sd.sessions : 0,
          AddToCart: sd?.atc ?? 0,
          InitiateCheckout: sd?.checkout ?? 0,
          Purchase: sd?.orders ?? 0,
        },
      })
    }
    return out
  }, [s.store.analytics.daily, today, days, since, connected])
  const totals = EVENTS.map(e => ({ ...e, total: counts.reduce((a, c) => a + c.v[e.id], 0), last: [...counts].reverse().find(c => c.v[e.id] > 0)?.day }))
  const px = s.store.pixel.fadbook
  const pixelName = `${s.store.name || 'My Store'} Pixel`
  const pixelId = entityNumericId(`pixel:${s.meta.saveId}`).slice(0, 16)
  const recent = counts.slice(-2).some(c => c.v.PageView > 0)
  const need = BENCHMARKS.fadbook.lookalikeMinPurchasers

  if (!s.store.created || !connected) {
    return (
      <div className="fb-page">
        <div className="fb-page-head"><div><h1>Events Manager</h1><p className="fb-muted">Connect and manage the data your website sends to Fadbook.</p></div></div>
        <AmCard>
          <div className="fb-locked">
            <span className="fb-locked-icon"><PlugZap size={28} /></span>
            <h2>Connect your website</h2>
            <p>
              The pixel tells Fadbook when people view your products, add to cart and buy. Sales campaigns use those purchase events to find more
              buyers. Without them, delivery can only optimize for clicks.
            </p>
            {s.store.created ? (
              <>
                <p className="fb-small fb-muted">Your store runs on Shopifly: install the Fadbook &amp; Instaglam sales channel to set up the pixel and Conversions API in one step.</p>
                <AmButton variant="primary" icon={Store} onClick={() => openSite('shopifly', 'apps/fadbook-channel')}>Connect with Shopifly</AmButton>
              </>
            ) : (
              <>
                <p className="fb-small fb-muted">You don't have a website yet. Create your Shopifly store first.</p>
                <AmButton variant="primary" icon={Store} onClick={() => openSite('shopifly', '')}>Open Shopifly</AmButton>
              </>
            )}
          </div>
        </AmCard>
      </div>
    )
  }
  const chart = counts.map(c => ({ label: formatDate(c.day, 'md'), value: c.v[event] }))
  return (
    <div className="fb-page">
      <div className="fb-page-head"><div><h1>Events Manager</h1><p className="fb-muted">Data sources · {pixelName}</p></div></div>
      <AmCard>
        <div className="fb-ds">
          <span className="fb-ds-icon"><Cable size={24} /></span>
          <div className="fb-stack-tight">
            <strong>{pixelName}</strong>
            <span className="fb-small fb-muted">Dataset ID: {pixelId}</span>
            <span className="fb-inline fb-small"><Globe size={14} /> {storeDomain(s)}</span>
          </div>
          <div className="fb-ds-status">
            <StatusCell label={recent ? 'Active' : 'No recent activity'} tone={recent ? 'active' : 'warning'} detail={recent ? 'Receiving events' : 'No events in the last 48 hours'} />
            <AmTag tone="blue">Shopifly partner integration</AmTag>
          </div>
        </div>
        <dl className="fb-kv fb-mt">
          <dt>Connection method</dt><dd>Browser (pixel) and Conversions API</dd>
          <dt>Connected</dt><dd>{app ? formatDate(app.installedDay, 'short') : 'Connected'}</dd>
          <dt>Purchases received (lifetime)</dt>
          <dd>
            {amFmt.int(px.purchases)}
            {px.purchases < need
              ? <span className="fb-small fb-muted"> · Lookalike audiences need {need} purchasers ({need - px.purchases} to go)</span>
              : <span className="fb-small fb-muted"> · Enough purchasers for lookalike audiences</span>}
          </dd>
          <dt>Adds to cart received (lifetime)</dt><dd>{amFmt.int(px.atc)}</dd>
        </dl>
      </AmCard>
      <AmCard
        title="Overview"
        actions={<AmSegmented value={span} onChange={setSpan} options={[{ value: '7', label: 'Last 7 days' }, { value: '14', label: 'Last 14 days' }, { value: '28', label: 'Last 28 days' }]} ariaLabel="Period" />}
      >
        <div className="fb-inline fb-wrap fb-mb">
          {EVENTS.map(e => (
            <button key={e.id} type="button" className={`fb-evchip${event === e.id ? ' fb-evchip-on' : ''}`} onClick={() => setEvent(e.id)}>
              {e.label}
            </button>
          ))}
        </div>
        <BarChart data={chart} height={200} />
        <p className="fb-small fb-muted">
          <span className="fb-swatch" style={{ background: CHART_COLORS.current }} />
          {EVENTS.find(e => e.id === event)!.label} events received per day. These are every event on your website, from all traffic sources, not
          only people who saw your ads.
        </p>
      </AmCard>
      <AmCard title="Events" flush>
        <table className="fb-grid">
          <thead><tr><th>Event</th><th className="fb-hide-narrow">Integration</th><th className="fb-r">Total events</th><th>Last received</th></tr></thead>
          <tbody>
            {totals.map(e => (
              <tr key={e.id}>
                <td>
                  <div className="fb-stack-tight">
                    <strong>{e.label}</strong>
                    <span className="fb-small fb-muted">{e.desc}</span>
                  </div>
                </td>
                <td className="fb-hide-narrow">Browser · Server</td>
                <td className="fb-r">{amFmt.int(e.total)}</td>
                <td>{e.last == null ? <span className="fb-muted">No events</span> : e.last === today ? 'Today' : formatDate(e.last, 'md')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AmCard>
      {counts.every(c => c.v.Purchase === 0) && (
        <AmNotice tone="info" title="No purchase events yet">Once people buy from your store, purchase events appear here and Sales campaigns can start optimizing for buyers.</AmNotice>
      )}
    </div>
  )
}
