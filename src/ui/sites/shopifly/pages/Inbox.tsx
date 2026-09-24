// Inbox (Shopifly Inbox look): conversation list, thread with the order context, reply composer
// with resolution templates, customer panel, and "Work through queue" (customer_support activity).
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Clock, Headphones, MessageCircle, Package, Search, Send, TriangleAlert } from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import type { GameState, Order, SupportTicket } from '../../../../core/types'
import { act, useGS, useGSShallow } from '../../../../core/store'
import { usePauseWhileMounted } from '../../../../core/ui'
import { dayOf, formatDate } from '../../../../core/time'
import { answerTicket, REPLY_TEMPLATES } from '../../../../sim/store'
import { enqueueActivity, ticketsPerSupportSession, vaDailyCapacity } from '../../../../sim/life'
import { Avatar, Badge, BlockStack, Button, EmptyState, InlineStack, Link, PolarisProvider, Text, Tooltip, type BadgeTone } from '../../../kit/polaris'
import { cx, useElementWidth } from '../../../kit/common'
import { fulfillmentBadge, needsFulfillment, paymentBadge, productThumb, productTitle } from '../core/orders'
import { ProductCell, StatusBadgeView, useNow, useToday } from '../core/ui'
import { capMinute, clock, inboxTime, minuteOf, usd } from '../core/format'

type Resolution = NonNullable<SupportTicket['resolution']>
type View = 'open' | 'overdue' | 'solved' | 'all'

const KIND_LABEL: Record<SupportTicket['kind'], string> = {
  wismo: 'Where is my order?',
  defect: 'Item defective',
  refund_request: 'Refund request',
  question: 'Product question',
  angry: 'Complaint',
}
const KIND_TONE: Record<SupportTicket['kind'], BadgeTone | undefined> = {
  wismo: 'info', defect: 'warning', refund_request: 'warning', question: undefined, angry: 'critical',
}

const fill = (tpl: string, first: string, order: number) => tpl.replace(/\{first\}/g, first).replace(/\{order\}/g, String(order))

/** Canned reply text for a resolution, adapted to the ticket and order state. */
function draftFor(t: SupportTicket, o: Order | undefined, res: Resolution): string {
  const first = (t.customer ?? o?.customer.name ?? 'there').split(' ')[0]
  const order = t.orderId
  if (res !== 'answered') return fill(REPLY_TEMPLATES[res], first, order)
  if (t.kind === 'question') {
    return `Hi ${first}, thanks for your question! Happy to help. Your order #${order} is covered by our return policy, and you can reply here any time if something isn't right.`
  }
  if (o && o.fulfillment === 'unfulfilled' && !o.cancelled) {
    return `Hi ${first}, thanks for your patience! Your order #${order} is being prepared and will ship within the next few days. We'll email your tracking number as soon as it's on the way.`
  }
  if (o && o.fulfillment === 'delivered') {
    return `Hi ${first}, thanks for reaching out! Our records show order #${order} was delivered on ${o.deliveredDay != null ? formatDate(o.deliveredDay, 'md') : 'its delivery date'}. Could you check with neighbors or your building's mailroom? If it doesn't turn up, let us know and we'll make it right.`
  }
  return fill(REPLY_TEMPLATES.answered, first, order)
}

function ticketDue(t: SupportTicket, now: number): { text: string; urgent: boolean } {
  if (t.status === 'solved') return { text: 'Solved', urgent: false }
  if (t.status === 'escalated') return { text: 'Overdue', urgent: true }
  const h = t.dueHour - now
  return { text: h <= 1 ? 'Reply within 1h' : `Reply within ${h}h`, urgent: h <= 12 }
}

export default function Inbox({ params, navigate }: ShopiflyPageProps) {
  const now = useNow()
  const today = useToday()
  const { tickets, orders, products, support, activity, queue, staff } = useGSShallow(s => ({
    tickets: s.store.tickets, orders: s.store.orders, products: s.store.products, support: s.store.support,
    activity: s.player.activity, queue: s.player.queue, staff: s.staff.members,
  }))
  const perSession = useGS(s => ticketsPerSupportSession(s))
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const narrow = width > 0 && width < 900
  // "inbox/overdue" (etc.) opens that view; "inbox/<ticketId>" opens a conversation
  const routeView = (['open', 'overdue', 'solved', 'all'] as const).find(x => x === params[0])
  const [view, setView] = useState<View>(routeView ?? 'open')
  useEffect(() => { if (routeView) setView(routeView) }, [routeView])
  const [q, setQ] = useState('')
  const routeId = routeView ? params[1] : params[0]

  const counts = useMemo(() => ({
    open: tickets.filter(t => t.status !== 'solved').length,
    overdue: tickets.filter(t => t.status === 'escalated').length,
    solved: tickets.filter(t => t.status === 'solved').length,
  }), [tickets])
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase().replace(/^#/, '')
    return tickets
      .filter(t => (view === 'all' || (view === 'open' && t.status !== 'solved') || (view === 'overdue' && t.status === 'escalated') || (view === 'solved' && t.status === 'solved')) &&
        (!ql || `${t.customer ?? ''} ${t.subject} ${t.orderId} ${t.email ?? ''}`.toLowerCase().includes(ql)))
      .sort((a, b) => {
        if (view === 'solved' || view === 'all') return (b.solvedHour ?? b.createdHour) - (a.solvedHour ?? a.createdHour)
        // open: overdue first, then the ones closest to their deadline
        return (a.status === 'escalated' ? 0 : 1) - (b.status === 'escalated' ? 0 : 1) || a.dueHour - b.dueHour
      })
  }, [tickets, view, q])
  // desktop shows the first conversation when none is picked (without adding a history entry)
  const selectedId = routeId ?? (!narrow ? list[0]?.id : undefined)
  const selected = selectedId ? tickets.find(t => t.id === selectedId) : undefined
  const order = selected ? orders.find(o => o.id === selected.orderId) : undefined

  const sessionQueued = [activity, ...queue].some(a => a?.kind === 'customer_support')
  const sessionRunning = activity?.kind === 'customer_support'
  const vas = staff.filter(m => m.role === 'va')
  const vaCap = vas.reduce((a, m) => a + vaDailyCapacity(m), 0)
  const avgResponse = support && support.answered ? support.responseHoursSum / support.answered : null

  // enqueueActivity checks availability itself and notifies the player if the session can't start
  const workQueue = () => act(s => {
    const n = ticketsPerSupportSession(s)
    enqueueActivity(s, 'customer_support', { payload: { count: n }, label: `Answer support tickets (up to ${n})` })
  })

  const showList = !narrow || !selected
  const showThread = !narrow || !!selected

  return (
    <PolarisProvider className={cx('sf-inbox-app', narrow && 'is-narrow')}>
      <div ref={ref} className={cx('sf-inbox', narrow && 'is-narrow')}>
        <header className="sf-inbox-head">
          <div className="sf-inbox-title">
            <MessageCircle size={20} />
            <Text as="h1" variant="headingLg">Inbox</Text>
          </div>
          <div className="sf-inbox-stats">
            <span><strong>{counts.open}</strong> open</span>
            <span className={counts.overdue ? 'is-bad' : undefined}><strong>{counts.overdue}</strong> overdue</span>
            <span><strong>{avgResponse === null ? '—' : `${avgResponse.toFixed(1)}h`}</strong> avg. response</span>
            <span><strong>{support?.solved ?? counts.solved}</strong> solved</span>
          </div>
          <div className="sf-inbox-actions">
            {vas.length > 0 && (
              <Tooltip content={`${vas.map(v => v.name).join(', ')} answer${vas.length === 1 ? 's' : ''} about ${vaCap} tickets a day, 9 AM–5 PM.`}>
                <span className="sf-inbox-va"><Headphones size={14} /> VA: ~{vaCap}/day</span>
              </Tooltip>
            )}
            <Tooltip content={sessionQueued ? 'A support session is already in your activity queue.' : `A 1-hour session answers up to ${perSession} tickets, picking a resolution for each.`}>
              <Button icon={Headphones} onClick={workQueue} disabled={sessionQueued || counts.open === 0} variant={counts.overdue ? 'primary' : 'secondary'}>
                {sessionRunning ? 'Working through queue…' : sessionQueued ? 'Queued' : `Work through queue (${Math.min(perSession, counts.open)})`}
              </Button>
            </Tooltip>
          </div>
        </header>

        <div className={cx('sf-inbox-body', narrow && 'sf-inbox-narrow')}>
          {showList && (
            <aside className="sf-inbox-list">
              <div className="sf-inbox-tabs">
                {([['open', 'Open', counts.open], ['overdue', 'Overdue', counts.overdue], ['solved', 'Solved', null], ['all', 'All', null]] as [View, string, number | null][]).map(([id, label, n]) => (
                  <button key={id} type="button" className={cx('sf-inbox-tab', view === id && 'is-active')} onClick={() => setView(id)}>
                    {label}{n ? <span className={cx('sf-inbox-tab-n', id === 'overdue' && 'is-bad')}>{n}</span> : null}
                  </button>
                ))}
              </div>
              <div className="sf-inbox-search">
                <Search size={14} />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" />
              </div>
              <div className="sf-inbox-items">
                {list.length === 0 ? (
                  <div className="sf-inbox-empty">
                    <MessageCircle size={22} strokeWidth={1.6} />
                    <Text as="p" fontWeight="medium">{view === 'open' ? 'No open conversations' : view === 'overdue' ? 'Nothing overdue' : 'No conversations'}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{view === 'open' ? 'Customer emails about orders land here.' : 'Try another view.'}</Text>
                  </div>
                ) : list.map(t => {
                  const due = ticketDue(t, now)
                  return (
                    <button key={t.id} type="button" className={cx('sf-inbox-item', t.id === selectedId && 'is-selected', t.status !== 'solved' && 'is-open')} onClick={() => navigate(`inbox/${t.id}`)}>
                      <Avatar name={t.customer ?? 'Customer'} size="sm" />
                      <span className="sf-inbox-item-main">
                        <span className="sf-inbox-item-top">
                          <span className="sf-inbox-item-name">{t.customer ?? 'Customer'}</span>
                          <span className="sf-inbox-item-time">{inboxTime(t.createdHour, now, t.id)}</span>
                        </span>
                        <span className="sf-inbox-item-subject">{t.subject}</span>
                        <span className="sf-inbox-item-meta">
                          <Badge tone={KIND_TONE[t.kind]}>{KIND_LABEL[t.kind]}</Badge>
                          {t.status !== 'solved' && <span className={cx('sf-inbox-due', due.urgent && 'is-urgent')}>{due.text}</span>}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </aside>
          )}

          {showThread && (
            selected ? (
              <Thread key={selected.id} t={selected} order={order} orders={orders} products={products} now={now} today={today} narrow={narrow}
                navigate={navigate} onSolved={() => {
                  const next = list.find(x => x.id !== selected.id && x.status !== 'solved')
                  navigate(next ? `inbox/${next.id}` : 'inbox')
                }} />
            ) : (
              <section className="sf-inbox-thread sf-inbox-thread-empty">
                <EmptyState heading={tickets.length ? 'Select a conversation' : 'No customer messages yet'} image="inbox" compact>
                  {tickets.length ? 'Pick a conversation from the list to read and reply.' : 'When customers email about their orders, the conversations show up here. Reply within 48 hours to keep them from escalating.'}
                </EmptyState>
              </section>
            )
          )}
        </div>
      </div>
    </PolarisProvider>
  )
}

function Thread({ t, order, orders, products, now, today, narrow, navigate, onSolved }: {
  t: SupportTicket
  order: Order | undefined
  orders: Order[]
  products: GameState['store']['products']
  now: number
  today: number
  narrow: boolean
  navigate: (p: string) => void
  onSolved: () => void
}) {
  const refundable = !!order && (order.financial === 'paid' || order.financial === 'partially_refunded') && order.total - order.refunded > 0.009
  const [res, setRes] = useState<Resolution>(t.kind === 'refund_request' && refundable ? 'refunded' : t.kind === 'defect' ? 'replacement' : 'answered')
  const [text, setText] = useState(() => draftFor(t, order, res))
  const [sending, setSending] = useState(false)
  // typing a reply holds the clock (tickets escalate after 48h, which is ~1 real minute at 4x)
  const [typing, setTyping] = useState(false)
  usePauseWhileMounted('sf-inbox-reply', typing && t.status !== 'solved')
  const pick = (r: Resolution) => {
    setRes(r)
    setText(draftFor(t, order, r))
  }
  const due = ticketDue(t, now)
  const open = t.status !== 'solved'
  const remaining = order ? order.total - order.refunded : 0
  const partial = order ? Math.min(remaining, order.total * 0.35) : 0
  const replacementCost = order ? (order.supplierCost ?? order.cogs + order.shippingCost) / Math.max(1, order.qty) : 0
  const customerOrders = order ? orders.filter(o => o.customer.email.toLowerCase() === order.customer.email.toLowerCase()) : []
  const spent = customerOrders.reduce((a, o) => a + o.total - o.refunded, 0)
  const who = t.solvedBy === 'staff' ? 'Your VA' : t.solvedBy === 'auto' ? 'Gorgeous auto-reply' : 'You'
  const sentText = t.reply ?? (t.resolution ? draftFor(t, order, t.resolution) : '')

  const send = () => {
    if (!open || sending || !text.trim()) return
    setSending(true)
    let ok = false
    act(s => {
      ok = answerTicket(s, t.id, res, 'you')
      if (ok) {
        const x = s.store.tickets.find(y => y.id === t.id)
        if (x) x.reply = text.trim()
      }
    })
    setSending(false)
    if (ok) onSolved()
  }

  const options: { r: Resolution; label: string; sub: string; disabled?: boolean; why?: string }[] = [
    { r: 'answered', label: 'Reply', sub: 'No refund' },
    { r: 'partial_refund', label: 'Partial refund', sub: order ? usd(partial) : '', disabled: !refundable, why: 'This order can\'t be refunded' },
    { r: 'refunded', label: 'Full refund', sub: order ? usd(remaining) : '', disabled: !refundable, why: 'This order can\'t be refunded' },
    { r: 'replacement', label: 'Send replacement', sub: order ? `~${usd(replacementCost)} cost` : '', disabled: !order || order.fulfillment === 'unfulfilled', why: 'Nothing has shipped yet' },
  ]

  return (
    <>
      <section className="sf-inbox-thread">
        <div className="sf-thread-head">
          {narrow && <Button variant="tertiary" icon={ArrowLeft} accessibilityLabel="Back to conversations" onClick={() => navigate('inbox')} />}
          <Avatar name={t.customer ?? 'Customer'} size="md" />
          <div className="sf-thread-who">
            <Text as="h2" variant="headingMd">{t.customer ?? 'Customer'}</Text>
            <Text as="span" variant="bodySm" tone="subdued">{t.email ?? order?.customer.email} · Order <Link onClick={() => navigate(`orders/${t.orderId}`)}>#{t.orderId}</Link></Text>
          </div>
          <div className="sf-thread-status">
            {t.status === 'escalated' && <Badge tone="critical">Overdue</Badge>}
            {t.status === 'open' && <span className={cx('sf-inbox-due', due.urgent && 'is-urgent')}><Clock size={12} /> {due.text}</span>}
            {t.status === 'solved' && <Badge tone="success">Solved</Badge>}
          </div>
        </div>

        <div className="sf-thread-body">
          <div className="sf-thread-day">{dayOf(t.createdHour) === today ? 'Today' : formatDate(dayOf(t.createdHour), 'long')}</div>
          <div className="sf-msg sf-msg-in">
            <div className="sf-msg-subject">{t.subject}</div>
            <div className="sf-msg-text">{t.body}</div>
            <div className="sf-msg-time">{clock(t.createdHour, capMinute(minuteOf(t.id), t.createdHour, now))} · via email</div>
          </div>

          {order && (
            <div className="sf-thread-order">
              <ProductCell src={productThumb(products, order.storeProductId, order.catalogId)} title={productTitle(products, order)} sub={`#${order.id} · ${usd(order.total)} · ${formatDate(dayOf(order.hour), 'md')}`} size="extraSmall" />
              <div className="sf-thread-order-badges">
                <StatusBadgeView b={paymentBadge(order)} />
                <StatusBadgeView b={fulfillmentBadge(order)} />
              </div>
              <div className="sf-thread-order-facts">
                <span><Package size={13} /> {order.fulfillment === 'delivered' && order.deliveredDay != null
                  ? `Delivered ${formatDate(order.deliveredDay, 'md')} (${order.deliveredDay - dayOf(order.hour)} days)`
                  : order.fulfillment === 'fulfilled' ? `In transit · est. ${formatDate(order.deliverDay, 'md')}`
                    : needsFulfillment(order) ? 'Not sent to the supplier yet' : 'Processing at supplier'}</span>
                <span>Ordered {today - dayOf(order.hour)} day{today - dayOf(order.hour) === 1 ? '' : 's'} ago{order.promisedMaxDays ? ` · promised within ${order.promisedMaxDays} days` : ''}</span>
                {needsFulfillment(order) && <span className="sf-thread-warn"><TriangleAlert size={13} /> <Link onClick={() => navigate(`orders/${order.id}`)}>Fulfill this order</Link> before replying</span>}
              </div>
            </div>
          )}

          {t.status === 'escalated' && (
            <div className="sf-thread-note"><TriangleAlert size={14} /> No reply for 48 hours. The customer may contact their bank.</div>
          )}

          {t.status === 'solved' && (
            <>
              {t.solvedHour != null && dayOf(t.solvedHour) !== dayOf(t.createdHour) && <div className="sf-thread-day">{dayOf(t.solvedHour) === today ? 'Today' : formatDate(dayOf(t.solvedHour), 'long')}</div>}
              <div className="sf-msg sf-msg-out">
                <div className="sf-msg-text">{sentText}</div>
                <div className="sf-msg-time">{who}{t.solvedHour != null ? ` · ${clock(t.solvedHour, capMinute(Math.min(59, minuteOf(t.id) + 7), t.solvedHour, now))}` : ''}{t.resolution && t.resolution !== 'answered' ? ` · ${t.resolution === 'refunded' ? 'Full refund issued' : t.resolution === 'partial_refund' ? 'Partial refund issued' : 'Replacement sent'}` : ''}</div>
              </div>
            </>
          )}
        </div>

        {open && (
          <div className="sf-composer">
            <div className="sf-composer-options" role="radiogroup" aria-label="Resolution">
              {options.map(o => {
                const btn = (
                  <button key={o.r} type="button" role="radio" aria-checked={res === o.r} disabled={o.disabled}
                    className={cx('sf-composer-opt', res === o.r && 'is-on')} onClick={() => pick(o.r)}>
                    <span>{o.label}</span>
                    {o.sub && <span className="sf-composer-opt-sub">{o.sub}</span>}
                  </button>
                )
                return o.disabled ? <Tooltip key={o.r} content={o.why}>{btn}</Tooltip> : btn
              })}
            </div>
            <textarea className="sf-composer-text" value={text} onChange={e => setText(e.target.value)} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} rows={4} aria-label="Reply" />
            <div className="sf-composer-foot">
              <Text as="span" variant="bodySm" tone="subdued">
                {res === 'refunded' ? `Refunds ${usd(remaining)} to the customer's card and closes the conversation.`
                  : res === 'partial_refund' ? `Refunds ${usd(partial)}; the customer keeps the item.`
                    : res === 'replacement' ? 'Orders a new unit from your supplier, charged to your card.'
                      : 'Sends your reply and marks the conversation solved.'}
              </Text>
              <Button variant="primary" icon={Send} onClick={send} disabled={!text.trim()} loading={sending}>Send</Button>
            </div>
          </div>
        )}
      </section>

      {!narrow && (
        <aside className="sf-inbox-side">
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">Customer</Text>
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <Avatar name={t.customer ?? 'Customer'} size="sm" />
              <BlockStack gap="0">
                <Text as="span" fontWeight="medium">{t.customer ?? order?.customer.name ?? 'Customer'}</Text>
                {order && <Text as="span" variant="bodySm" tone="subdued">{order.customer.city}, {order.customer.region}</Text>}
              </BlockStack>
            </InlineStack>
            {order && (
              <BlockStack gap="100">
                <div className="sf-side-row"><span>Orders</span><span>{customerOrders.length}</span></div>
                <div className="sf-side-row"><span>Total spent</span><span>{usd(spent)}</span></div>
                <div className="sf-side-row"><span>Customer type</span><span>{order.customer.returning ? 'Returning' : 'New'}</span></div>
              </BlockStack>
            )}
            <Text as="h3" variant="headingSm">Conversation</Text>
            <BlockStack gap="100">
              <div className="sf-side-row"><span>Topic</span><span>{KIND_LABEL[t.kind]}</span></div>
              <div className="sf-side-row"><span>Received</span><span>{inboxTime(t.createdHour, now, t.id)}</span></div>
              <div className="sf-side-row"><span>Reply due</span><span>{formatDate(dayOf(t.dueHour), 'md')}, {clock(t.dueHour, minuteOf(t.id))}</span></div>
            </BlockStack>
            {order && <Button fullWidth onClick={() => navigate(`orders/${order.id}`)}>View order #{order.id}</Button>}
          </BlockStack>
        </aside>
      )}
    </>
  )
}
