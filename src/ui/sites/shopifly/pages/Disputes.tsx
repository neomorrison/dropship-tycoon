// Chargebacks: dispute-rate monitor + list, and the dispute page (evidence checklist,
// respond via the fight_chargeback activity, accept, or hand it to ChargeFlo).
import { useMemo, useState } from 'react'
import { CircleCheck, CircleX, Gavel, ShieldCheck } from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import type { Chargeback, Day } from '../../../../core/types'
import { act, getGS, useGS, useGSShallow } from '../../../../core/store'
import { formatDate } from '../../../../core/time'
import { BENCHMARKS } from '../../../../data/benchmarks'
import {
  chargebackEvidencePreview, chargebackRatio, respondChargeback, submitChargeback,
} from '../../../../sim/store'
import {
  Badge, Banner, BlockStack, Button, Card, EmptyState, IndexFilters, IndexTable, InlineStack, Layout, Link, Modal, Page,
  PolarisProvider, ProgressBar, Text, type BadgeTone,
} from '../../../kit/polaris'
import { fulfillmentBadge, productThumb, productTitle } from '../core/orders'
import { ProductCell, StatusBadgeView, SummaryLine, useToday } from '../core/ui'
import { dayDistance, pct2, usd } from '../core/format'

const REASON_LABEL: Record<Chargeback['reason'], string> = {
  not_received: 'Product not received',
  not_as_described: 'Product unacceptable',
  fraudulent: 'Fraudulent',
  unrecognized: 'Unrecognized',
}

function statusOf(c: Chargeback): { label: string; tone?: BadgeTone } {
  switch (c.status) {
    case 'needs_response': return { label: 'Needs response', tone: 'critical' }
    case 'submitted': return { label: 'Under review', tone: 'info' }
    case 'won': return { label: 'Won', tone: 'success' }
    case 'lost': return { label: 'Lost', tone: 'critical' }
    case 'accepted': return { label: 'Accepted' }
  }
}

function deadline(c: Chargeback, today: Day): string {
  if (c.status === 'needs_response') return c.respondByDay === today ? 'Due today' : `Due ${formatDate(c.respondByDay, 'md')} (${dayDistance(c.respondByDay, today)})`
  if (c.status === 'submitted') return c.decideDay != null ? `Decision by ~${formatDate(c.decideDay, 'md')}` : 'Awaiting decision'
  return c.decideDay != null ? `Closed ${formatDate(c.decideDay, 'md')}` : 'Closed'
}

/** Is a fight_chargeback activity already queued/running for this dispute? */
function useQueued(id: string): boolean {
  const { act: cur, queue } = useGSShallow(s => ({ act: s.player.activity, queue: s.player.queue }))
  return [cur, ...queue].some(a => a && a.kind === 'fight_chargeback' && a.payload?.chargebackId === id)
}

export default function Disputes(props: ShopiflyPageProps) {
  const id = props.params[0]
  return id ? <DisputeDetail {...props} id={id} /> : <DisputeList {...props} />
}

function DisputeList({ navigate }: ShopiflyPageProps) {
  const today = useToday()
  const { chargebacks, daily, chargeflo } = useGSShallow(s => ({ chargebacks: s.store.chargebacks, daily: s.store.analytics.daily, chargeflo: s.store.apps.some(a => a.appId === 'chargeflo') }))
  const ratio = useMemo(() => chargebackRatio(getGS()), [chargebacks, daily]) // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState(0)
  const views = ['All', 'Needs response', 'Under review', 'Won', 'Lost'] as const
  const rows = useMemo(() => {
    const v = views[tab]
    return chargebacks.filter(c => v === 'All' || (v === 'Needs response' && c.status === 'needs_response') || (v === 'Under review' && c.status === 'submitted') || (v === 'Won' && c.status === 'won') || (v === 'Lost' && (c.status === 'lost' || c.status === 'accepted')))
  }, [chargebacks, tab]) // eslint-disable-line react-hooks/exhaustive-deps
  const closed = chargebacks.filter(c => c.status === 'won' || c.status === 'lost' || c.status === 'accepted')
  const won = closed.filter(c => c.status === 'won').length
  const { warnRatio, thresholdRatio } = BENCHMARKS.chargebacks
  const due = chargebacks.filter(c => c.status === 'needs_response')
  // responses you've started (a fight_chargeback activity is running or queued)
  const { act: curAct, queue } = useGSShallow(s => ({ act: s.player.activity, queue: s.player.queue }))
  const preparing = useMemo(() => new Set([curAct, ...queue].filter(a => a?.kind === 'fight_chargeback').map(a => String(a!.payload?.chargebackId ?? ''))), [curAct, queue])
  const toAnswer = due.filter(c => !preparing.has(c.id))

  return (
    <PolarisProvider>
      <Page title="Chargebacks" subtitle="Disputes opened by your customers' banks" backAction={{ content: 'Finance', onAction: () => navigate('finances') }} fullWidth>
        {toAnswer.length > 0 && (
          <Banner tone="critical" title={`${toAnswer.length} chargeback${toAnswer.length === 1 ? ' needs' : 's need'} a response`}>
            If you don't submit evidence before the deadline, the dispute closes in the cardholder's favor.
          </Banner>
        )}
        <div className="sf-dispute-stats">
          <Card>
            <BlockStack gap="150">
              <Text as="h2" variant="headingSm">Dispute rate, last 30 days</Text>
              <Text as="p" variant="headingXl">{pct2(ratio)}</Text>
              <div className="sf-rate-track">
                <div className="sf-rate-fill" style={{ width: `${Math.min(100, (ratio / (thresholdRatio * 1.5)) * 100)}%`, background: ratio > thresholdRatio ? '#e51c00' : ratio > warnRatio ? '#e8a200' : '#29845a' }} />
                <span className="sf-rate-mark" style={{ left: `${(warnRatio / (thresholdRatio * 1.5)) * 100}%` }} title={`${pct2(warnRatio)} excessive`} />
                <span className="sf-rate-mark" style={{ left: `${(thresholdRatio / (thresholdRatio * 1.5)) * 100}%` }} title={`${pct2(thresholdRatio)} reserve`} />
              </div>
              <Text as="p" variant="bodySm" tone="subdued">Card networks treat {pct2(warnRatio)} as excessive. Above {pct2(thresholdRatio)}, Shopifly Payments holds a reserve on your payouts.</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="150">
              <Text as="h2" variant="headingSm">Outcomes</Text>
              <InlineStack gap="600">
                <BlockStack gap="0"><Text as="span" variant="headingLg">{won}</Text><Text as="span" variant="bodySm" tone="subdued">Won</Text></BlockStack>
                <BlockStack gap="0"><Text as="span" variant="headingLg">{closed.length - won}</Text><Text as="span" variant="bodySm" tone="subdued">Lost or accepted</Text></BlockStack>
                <BlockStack gap="0"><Text as="span" variant="headingLg">{chargebacks.filter(c => c.status === 'submitted').length}</Text><Text as="span" variant="bodySm" tone="subdued">Under review</Text></BlockStack>
              </InlineStack>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="150">
              <InlineStack gap="200" blockAlign="center"><ShieldCheck size={16} /><Text as="h2" variant="headingSm">Automatic responses</Text></InlineStack>
              {chargeflo
                ? <Text as="p" tone="subdued">ChargeFlo is installed and responds to new chargebacks for you.</Text>
                : <Text as="p" tone="subdued">Respond to each chargeback yourself, or install a dispute app to respond automatically.</Text>}
              {!chargeflo && <div><Button onClick={() => navigate('apps/chargeflo')}>View ChargeFlo</Button></div>}
            </BlockStack>
          </Card>
        </div>

        <Card padding="0">
          {chargebacks.length === 0 ? (
            <EmptyState heading="No chargebacks" image="generic" compact>
              When a customer disputes a charge with their bank, it shows up here with a deadline to respond.
            </EmptyState>
          ) : (
            <>
              <IndexFilters tabs={views.map(v => ({ id: v, content: v, badge: v === 'Needs response' && due.length ? due.length : undefined }))} selected={tab} onSelect={setTab} />
              <IndexTable
                rows={rows}
                rowKey={c => c.id}
                selectable={false}
                resourceName={{ singular: 'chargeback', plural: 'chargebacks' }}
                onRowClick={c => navigate(`disputes/${c.id}`)}
                defaultSort={{ columnId: 'opened', direction: 'descending' }}
                pageSize={50}
                resetPageKey={tab}
                rowTone={c => (c.status === 'needs_response' && c.respondByDay - today <= 2 ? 'critical' : undefined)}
                emptyState={<EmptyState heading="No chargebacks in this view" image="search" compact />}
                columns={[
                  { id: 'order', title: 'Order', sortValue: c => c.orderId, render: c => <Text as="span" fontWeight="semibold">#{c.orderId}</Text> },
                  { id: 'customer', title: 'Customer', nowrap: true, render: c => c.customer ?? '—' },
                  { id: 'reason', title: 'Reason', nowrap: true, render: c => REASON_LABEL[c.reason] },
                  { id: 'amount', title: 'Amount', numeric: true, sortValue: c => c.amount, render: c => usd(c.amount) },
                  {
                    id: 'status', title: 'Status', nowrap: true,
                    render: c => {
                      if (c.status === 'needs_response' && preparing.has(c.id)) return <Badge tone="attention">Preparing response</Badge>
                      const st = statusOf(c)
                      return <Badge tone={st.tone}>{st.label}</Badge>
                    },
                  },
                  { id: 'deadline', title: 'Deadline', nowrap: true, sortValue: c => (c.status === 'needs_response' ? c.respondByDay : 9e9), render: c => deadline(c, today) },
                  { id: 'opened', title: 'Opened', nowrap: true, sortValue: c => c.openedDay, render: c => formatDate(c.openedDay, 'md') },
                ]}
              />
            </>
          )}
        </Card>
      </Page>
    </PolarisProvider>
  )
}

function DisputeDetail({ navigate, id }: ShopiflyPageProps & { id: string }) {
  const today = useToday()
  const { chargebacks, orders, products, tickets, chargeflo } = useGSShallow(s => ({
    chargebacks: s.store.chargebacks, orders: s.store.orders, products: s.store.products, tickets: s.store.tickets,
    chargeflo: s.store.apps.some(a => a.appId === 'chargeflo'),
  }))
  const opsLevel = useGS(s => s.skills.operations.level)
  const queued = useQueued(id)
  const [accepting, setAccepting] = useState(false)
  const cb = chargebacks.find(c => c.id === id)
  const order = cb ? orders.find(o => o.id === cb.orderId) : undefined
  const preview = useMemo(() => (cb && cb.status === 'needs_response' ? chargebackEvidencePreview(getGS(), cb.id) : null), [cb, orders, tickets]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!cb) {
    return (
      <PolarisProvider>
        <Page title="Chargeback not found" backAction={{ content: 'Chargebacks', onAction: () => navigate('disputes') }}>
          <Card><EmptyState heading="This chargeback can't be found" image="generic" action={{ content: 'View chargebacks', onAction: () => navigate('disputes') }} /></Card>
        </Page>
      </PolarisProvider>
    )
  }
  const st = statusOf(cb)
  const items = preview?.items ?? cb.evidenceItems ?? []
  const strength = preview?.evidence ?? cb.evidence
  const msgs = tickets.filter(t => t.orderId === cb.orderId)
  const openMsg = msgs.find(t => t.status !== 'solved')
  const fee = cb.fee ?? BENCHMARKS.chargebacks.feePerDispute

  return (
    <PolarisProvider>
      <Page
        backAction={{ content: 'Chargebacks', onAction: () => navigate('disputes') }}
        title={`Chargeback for #${cb.orderId}`}
        titleMetadata={<Badge tone={st.tone}>{st.label}</Badge>}
        subtitle={`Opened ${formatDate(cb.openedDay, 'long')} · ${REASON_LABEL[cb.reason]}`}
      >
        {cb.status === 'needs_response' && (
          <Banner tone="critical" title={queued ? 'You\'re preparing your response' : `Respond by ${formatDate(cb.respondByDay, 'long')}`}>
            {queued
              ? 'Gathering evidence is in your activity queue (about 30 minutes). The response is submitted when it finishes.'
              : `${dayDistance(cb.respondByDay, today) === 'today' ? 'The deadline is today.' : `The deadline is ${dayDistance(cb.respondByDay, today)}.`} If you don't respond, the bank rules for the cardholder automatically.`}
          </Banner>
        )}
        {cb.status === 'submitted' && (
          <Banner tone="info" title="Response submitted">
            The cardholder's bank is reviewing your evidence{cb.decideDay != null ? ` and usually decides by ${formatDate(cb.decideDay, 'long')}` : ''}.
          </Banner>
        )}
        {cb.status === 'won' && <Banner tone="success" title="You won this chargeback">{usd(cb.amount)} and the {usd(fee)} dispute fee were returned to your balance.</Banner>}
        {(cb.status === 'lost' || cb.status === 'accepted') && (
          <Banner tone="critical" title={cb.status === 'accepted' ? 'You accepted this chargeback' : 'This chargeback was lost'}>
            {usd(cb.amount)} went back to the cardholder. The {usd(fee)} dispute fee isn't refunded.
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Card title="Dispute details">
                <BlockStack gap="150">
                  <SummaryLine label="Disputed amount" value={usd(cb.amount)} />
                  <SummaryLine label="Chargeback fee" value={usd(fee)} />
                  <SummaryLine label="Withheld from your balance" value={usd(cb.amount + fee)} strong />
                  <div className="sf-dispute-reason">
                    <Text as="h3" variant="headingXs">Reason given by the bank</Text>
                    <Text as="p">{cb.reasonText ?? REASON_LABEL[cb.reason]}</Text>
                  </div>
                </BlockStack>
              </Card>

              <Card title={cb.status === 'needs_response' ? 'Evidence you can submit' : 'Evidence submitted'}>
                <BlockStack gap="300">
                  <ul className="sf-evidence">
                    {items.map(it => (
                      <li key={it.label} className={it.ok ? 'is-ok' : 'is-missing'}>
                        {it.ok ? <CircleCheck size={16} /> : <CircleX size={16} />}
                        <span>{it.label}</span>
                        <span className="sf-evidence-state">
                          {it.ok ? 'Included'
                            // an unanswered message can still become evidence: answer it before submitting
                            : cb.status === 'needs_response' && it.label === 'Customer communication' && openMsg
                              ? <Link onClick={() => navigate(`inbox/${openMsg.id}`)}>Reply to the customer first</Link>
                              : 'Not available'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <BlockStack gap="100">
                    <InlineStack align="space-between">
                      <Text as="span" fontWeight="medium">{cb.status === 'needs_response' ? 'Estimated evidence strength' : 'Evidence strength'}</Text>
                      <Text as="span" fontWeight="semibold">{Math.round(strength * 100)}%</Text>
                    </InlineStack>
                    <ProgressBar progress={strength * 100} size="small" tone={strength >= 0.7 ? 'success' : strength >= 0.45 ? 'warning' : 'critical'} />
                    {cb.status === 'needs_response' && (
                      <Text as="p" variant="bodySm" tone="subdued">
                        {chargeflo ? 'ChargeFlo builds the response package for you and takes a share of recovered funds.' : `Your response is written by you (Operations level ${opsLevel}).`} Strength depends on tracking, delivery proof, your policies, an honest product page and your replies to the customer.
                      </Text>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>

              {cb.status === 'needs_response' && (
                <Card>
                  <InlineStack align="space-between" blockAlign="center" gap="300">
                    <BlockStack gap="050">
                      <Text as="h2" variant="headingSm">Respond to this chargeback</Text>
                      <Text as="p" tone="subdued">Submit evidence to challenge it, or accept it to close it now.</Text>
                    </BlockStack>
                    <InlineStack gap="200">
                      <Button tone="critical" variant="tertiary" onClick={() => setAccepting(true)} disabled={queued}>Accept chargeback</Button>
                      {chargeflo && <Button onClick={() => act(s => { submitChargeback(s, cb.id, 'app') })} disabled={queued}>Respond with ChargeFlo</Button>}
                      <Button variant="primary" icon={Gavel} onClick={() => act(s => { respondChargeback(s, cb.id, 'self') })} disabled={queued}>
                        {queued ? 'Response queued' : 'Submit response (30 min)'}
                      </Button>
                    </InlineStack>
                  </InlineStack>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card title="Order" actions={order && <Link onClick={() => navigate(`orders/${order.id}`)}>View order</Link>}>
                {order ? (
                  <BlockStack gap="200">
                    <ProductCell src={productThumb(products, order.storeProductId, order.catalogId)} title={productTitle(products, order)} sub={`${order.qty} × ${usd(order.subtotal / Math.max(1, order.qty))}`} size="extraSmall" />
                    <SummaryLine label="Order total" value={usd(order.total)} />
                    <SummaryLine label="Placed" value={formatDate(Math.floor(order.hour / 24), 'md')} />
                    <SummaryLine label="Fulfillment" value={<StatusBadgeView b={fulfillmentBadge(order)} />} />
                    {order.deliveredDay != null && <SummaryLine label="Delivered" value={formatDate(order.deliveredDay, 'md')} />}
                    {order.promisedMaxDays != null && <SummaryLine label="Promised delivery" value={`${order.promisedMaxDays} days`} />}
                  </BlockStack>
                ) : (
                  <Text as="p" tone="subdued">Order #{cb.orderId} is no longer in your order history.</Text>
                )}
              </Card>
              <Card title="Customer">
                <BlockStack gap="100">
                  <Text as="p">{cb.customer ?? order?.customer.name ?? 'Unknown'}</Text>
                  <Text as="p" tone="subdued">{msgs.length ? `${msgs.length} message${msgs.length === 1 ? '' : 's'} about this order` : 'No messages about this order'}</Text>
                  {msgs[0] && <Link onClick={() => navigate(`inbox/${msgs[0].id}`)}>View conversation</Link>}
                </BlockStack>
              </Card>
              <Card title="How chargebacks work">
                <BlockStack gap="150">
                  <Text as="p" variant="bodySm" tone="subdued">The disputed amount and a {usd(fee)} fee are withheld as soon as the bank opens a chargeback.</Text>
                  <Text as="p" variant="bodySm" tone="subdued">After you respond, the bank decides in about 10–20 days. If you win, the amount and the fee come back.</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Refunding an unhappy customer before they call their bank avoids the fee and keeps your dispute rate down.</Text>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
      <Modal
        open={accepting}
        onClose={() => setAccepting(false)}
        title="Accept chargeback?"
        pauseGame
        sectioned
        primaryAction={{ content: 'Accept chargeback', destructive: true, onAction: () => { act(s => { respondChargeback(s, cb.id, 'accept') }); setAccepting(false) } }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setAccepting(false) }]}
      >
        <Text as="p">{usd(cb.amount)} stays with the cardholder and the {usd(fee)} fee isn't refunded. Accepted chargebacks still count toward your dispute rate.</Text>
      </Modal>
    </PolarisProvider>
  )
}
