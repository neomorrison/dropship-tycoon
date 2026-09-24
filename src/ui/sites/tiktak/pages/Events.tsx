// Tools › Events: the TikTak Pixel (connected through the TikTak app in Shopifly) and the
// web events it receives.
import { useMemo } from 'react'
import { CircleCheck, CircleDashed, Code2, ExternalLink, Radio } from 'lucide-react'
import { openSite } from '../../../../core/ui'
import { formatDate } from '../../../../core/time'
import { hasPixel } from '../../../../sim/ads'
import { AmButton, AmNotice, AmTable, MetricCell, amFmt, type AmColumn } from '../../../kit/adsmanager'
import { BarChart, CHART_COLORS } from '../../../kit/charts'
import { Panel, PageHead, Pill, useGame, useToday } from '../common'
import { entityDisplayId, storeDomain } from '../data'

interface EventRow { id: string; name: string; code: string; desc: string; total: number; last7: number }

export default function Events() {
  const s = useGame()
  const today = useToday()
  const connected = hasPixel(s, 'tiktak')
  const px = s.store.pixel?.tiktak
  const daily = s.store.analytics.daily
  const pixelId = entityDisplayId(`pixel_${s.meta.saveId}`).slice(0, 19).toUpperCase().replace(/^17/, 'C')

  const last7 = useMemo(() => {
    const out = { views: 0, atc: 0, checkout: 0, purchases: 0, checkoutAll: 0 }
    for (const k in daily) out.checkoutAll += daily[k].checkout
    const series: { label: string; value: number }[] = []
    for (let d = Math.max(0, today - 6); d <= today; d++) {
      const day = daily[d]
      if (day) {
        out.views += day.sessions
        out.atc += day.atc
        out.checkout += day.checkout
        out.purchases += day.orders
      }
      series.push({ label: formatDate(d, "md"), value: day ? day.sessions + day.atc + day.checkout + day.orders : 0 })
    }
    return { ...out, series }
  }, [daily, today])

  const rows: EventRow[] = [
    { id: 'pv', name: 'Page view', code: 'PageView', desc: 'A visitor loads any page of your store.', total: px?.views ?? 0, last7: last7.views },
    { id: 'vc', name: 'View content', code: 'ViewContent', desc: 'A visitor views a product page.', total: px?.views ?? 0, last7: last7.views },
    { id: 'atc', name: 'Add to cart', code: 'AddToCart', desc: 'A product is added to the cart.', total: px?.atc ?? 0, last7: last7.atc },
    { id: 'ic', name: 'Initiate checkout', code: 'InitiateCheckout', desc: 'Checkout starts.', total: last7.checkoutAll, last7: last7.checkout },
    { id: 'cp', name: 'Complete payment', code: 'CompletePayment', desc: 'An order is paid. Used for Web conversions optimization and ROAS.', total: px?.purchases ?? 0, last7: last7.purchases },
  ]
  const cols: AmColumn<EventRow>[] = [
    { id: 'name', header: 'Event', width: 220, sticky: true, render: r => <div className="tt-col" style={{ gap: 1 }}><b style={{ fontSize: 13 }}>{r.name}</b><span className="tt-faint tt-small">{r.code}</span></div> },
    { id: 'desc', header: 'Description', width: 320, render: r => <span className="tt-muted" style={{ fontSize: 12, whiteSpace: 'normal' }}>{r.desc}</span> },
    { id: 'status', header: 'Status', width: 120, render: r => connected ? (r.last7 > 0 ? <Pill tone="success" dot>Active</Pill> : <Pill tone="neutral">No recent activity</Pill>) : <Pill tone="warning">Not set up</Pill> },
    { id: 'last7', header: 'Last 7 days', align: 'right', width: 120, render: r => <MetricCell value={connected ? amFmt.int(r.last7) : amFmt.dash} /> },
    { id: 'total', header: 'Total received', align: 'right', width: 140, render: r => <MetricCell value={connected ? amFmt.int(r.total) : amFmt.dash} /> },
  ]

  return (
    <div className="tt-page tt-page-narrow">
      <PageHead title="Events" sub="Web events" crumbs={[{ label: 'Tools' }, { label: 'Events' }]} />
      <Panel>
        <div className="tt-pixel-head">
          <span className="tt-pixel-icon"><Radio size={22} /></span>
          <div className="tt-col" style={{ gap: 2, flex: 1, minWidth: 200 }}>
            <b style={{ fontSize: 15 }}>{s.store.name ? `${s.store.name} Pixel` : 'TikTak Pixel'}</b>
            <span className="tt-faint tt-small">Pixel ID: {pixelId} · Connection: Shopifly partner integration · Events API</span>
          </div>
          {connected ? <Pill tone="success" dot>Connected</Pill> : <Pill tone="warning" dot>Not connected</Pill>}
        </div>
        <div style={{ marginTop: 14 }}>
          {connected ? (
            <div className="tt-col" style={{ gap: 12 }}>
              <div className="tt-grid-3">
                <div className="tt-kpi tt-kpi-static"><span className="tt-kpi-label">Complete payment (all time)</span><span className="tt-kpi-value">{amFmt.int(px?.purchases ?? 0)}</span><span className="tt-kpi-foot">Data for optimization and lookalikes</span></div>
                <div className="tt-kpi tt-kpi-static"><span className="tt-kpi-label">Add to cart (all time)</span><span className="tt-kpi-value">{amFmt.int(px?.atc ?? 0)}</span></div>
                <div className="tt-kpi tt-kpi-static"><span className="tt-kpi-label">Page views (all time)</span><span className="tt-kpi-value">{amFmt.int(px?.views ?? 0)}</span></div>
              </div>
              <span className="tt-muted tt-small">The pixel counts every visitor on {storeDomain(s)}, not just people from your TikTak ads. The more purchases it has seen, the better delivery gets at finding buyers.</span>
            </div>
          ) : (
            <div className="tt-col" style={{ gap: 12 }}>
              <AmNotice tone="warning" title="Your website isn't sending events">
                Web conversions campaigns need the Complete payment event. Without it, delivery optimizes for clicks, ad groups never leave the learning phase and you can&apos;t build lookalike or website traffic audiences.
              </AmNotice>
              <ol className="tt-col" style={{ gap: 8, margin: 0, paddingLeft: 18, fontSize: 13 }}>
                <li>Open the Shopifly App Store and install the <b>TikTak</b> sales channel app (free).</li>
                <li>Connect this ad account. The app installs the pixel and the Events API on every page, including checkout.</li>
                <li>Come back here: events show up as soon as people visit your store.</li>
              </ol>
              <div className="tt-row">
                <AmButton variant="primary" icon={ExternalLink} onClick={() => openSite('shopifly', 'apps/tiktak-channel')}>Set up with Shopifly</AmButton>
              </div>
              <div className="tt-col" style={{ gap: 6 }}>
                <span className="tt-row tt-small tt-muted" style={{ gap: 6 }}><Code2 size={14} /> Manual setup (for custom websites)</span>
                <code className="tt-code">{`<script>\n  !function (w, d, t) { w.TiktakAnalyticsObject = t; /* … */ }(window, document, 'ttq');\n  ttq.load('${pixelId}'); ttq.page();\n</script>`}</code>
                <span className="tt-faint tt-small">Shopifly stores use the partner integration instead: it also sends checkout events, which a pasted script can&apos;t.</span>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Events" pad={false}>
        <div style={{ padding: '12px 16px 16px' }}>
          <AmTable rows={rows} columns={cols} rowKey={r => r.id} selectable={false} totals={false} maxHeight={420} />
        </div>
      </Panel>

      {connected && (
        <Panel title="Events received, last 7 days">
          <BarChart data={last7.series} height={180} format="number" color={CHART_COLORS.tiktak} />
          <div className="tt-row tt-small tt-muted" style={{ marginTop: 8, gap: 14 }}>
            <span className="tt-row" style={{ gap: 4 }}><CircleCheck size={13} color="#00b578" /> Deduplicated across browser pixel and Events API</span>
            <span className="tt-row" style={{ gap: 4 }}><CircleDashed size={13} /> Attribution: 7-day click, 1-day view</span>
          </div>
        </Panel>
      )}
    </div>
  )
}
