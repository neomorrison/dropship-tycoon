// Finance: overview (balance, holds, next payout, billing, capital), payouts + payout detail,
// transactions, billing (plan & app charges) and Shopifly Capital.
import { useMemo, useState } from 'react'
import { Banknote, CircleDollarSign, Landmark, Lock } from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import type { Day, Order, Payout } from '../../../../core/types'
import { act, getGS, useGS, useGSShallow } from '../../../../core/store'
import { dayOf, formatDate } from '../../../../core/time'
import { acceptCapital, activeCapital, capitalOffer, CAPITAL_RULES } from '../../../../sim/finance'
import { PAYMENT_LABELS, PLAN_LABEL } from '../../../../sim/store'
import { BENCHMARKS } from '../../../../data/benchmarks'
import {
  Badge, Banner, BlockStack, Button, Card, DataTable, EmptyState, IndexFilters, IndexTable, InlineGrid, InlineStack, Link,
  Modal, Page, PolarisProvider, ProgressBar, Text, type BadgeTone,
} from '../../../kit/polaris'
import { SummaryLine, TableCard, useNow, useToday } from '../core/ui'
import { listDate, longDate, usd } from '../core/format'

export default function Finances(props: ShopiflyPageProps) {
  const [a, b] = props.params
  if (a === 'payouts') return b ? <PayoutDetail {...props} id={b} /> : <PayoutsPage {...props} />
  if (a === 'transactions') return <Transactions {...props} />
  if (a === 'billing') return <Billing {...props} />
  if (a === 'capital') return <Capital {...props} />
  return <Overview {...props} />
}

/** Capital offer / active loan (derived with getGS so the selector stays stable). */
function useCapital() {
  const today = useToday()
  const { daily, loans, created } = useGSShallow(s => ({ daily: s.store.analytics.daily, loans: s.finance.loans, created: s.store.created }))
  return useMemo(() => {
    const s = getGS()
    return { offer: created ? capitalOffer(s) : null, loan: activeCapital(s), loans }
  }, [daily, loans, created, today]) // eslint-disable-line react-hooks/exhaustive-deps
}

// ---------------------------------------------------------------------------
function payoutStatus(p: Payout, today: Day): { label: string; tone?: BadgeTone } {
  if (p.status === 'paid') return { label: 'Paid', tone: 'success' }
  if (p.status === 'held') return { label: 'On hold', tone: 'warning' }
  return p.arriveDay - today <= 1 ? { label: 'In transit', tone: 'info' } : { label: 'Scheduled' }
}

function HoldBanner({ navigate }: { navigate: (p: string) => void }) {
  const today = useToday()
  const hold = useGS(s => s.store.hold)
  if (!hold?.active && !hold?.paused) return null
  const paused = !!(hold.paused && (hold.pauseUntilDay ?? 0) >= today)
  const reserve = hold.reservePct > 0 && hold.untilDay >= today
  if (!paused && !reserve) return null
  return (
    <Banner
      tone={paused ? 'critical' : 'warning'}
      title={paused ? `Payouts are paused until ${formatDate(hold.pauseUntilDay ?? today, 'md')}` : `${Math.round(hold.reservePct * 100)}% of each payout is held in reserve`}
      action={reserve ? { content: 'View chargebacks', onAction: () => navigate('disputes') } : undefined}
    >
      {hold.reason}{reserve && !paused ? ` Reserved funds are released 30 days after they're held (until ${formatDate(hold.untilDay, 'md')}).` : ''}
    </Banner>
  )
}

function Overview({ navigate }: ShopiflyPageProps) {
  const today = useToday()
  const { pending, payouts, reserves, bills, plan, trialEnds } = useGSShallow(s => ({
    pending: s.store.pendingBalance, payouts: s.store.payouts, reserves: s.store.reserves, bills: s.finance.bills,
    plan: s.store.plan, trialEnds: s.store.trialEndsDay,
  }))
  const { offer, loan } = useCapital()
  const upcoming = useMemo(() => payouts.filter(p => p.status !== 'paid').sort((a, b) => a.arriveDay - b.arriveDay), [payouts])
  const next = upcoming.find(p => p.status === 'pending')
  const inTransit = upcoming.filter(p => p.status === 'pending').reduce((a, p) => a + p.amount, 0)
  const onHold = upcoming.filter(p => p.status === 'held').reduce((a, p) => a + p.amount, 0)
  const reserved = (reserves ?? []).reduce((a, r) => a + r.amount, 0)
  const storeBills = useMemo(() => bills.filter(b => b.business && b.payWith === 'card' && (b.ref === 'shopifly_plan' || b.ref?.startsWith('app:') || b.ref === 'domain')).sort((a, b) => a.nextDueDay - b.nextDueDay), [bills])
  const monthly = storeBills.filter(b => b.cadence === 'monthly').reduce((a, b) => a + b.amount, 0)
  const recent = useMemo(() => [...payouts].sort((a, b) => b.arriveDay - a.arriveDay || b.createdDay - a.createdDay).slice(0, 5), [payouts])

  return (
    <PolarisProvider>
      <Page title="Finance" subtitle="Shopifly Payments, payouts, bills and financing">
        <HoldBanner navigate={navigate} />
        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          <Card>
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center"><CircleDollarSign size={16} /><Text as="h2" variant="headingSm">Balance</Text></InlineStack>
              <Text as="p" variant="headingXl">{usd(pending)}</Text>
              <Text as="p" tone="subdued" variant="bodySm">Sales captured since the last payout. Paid out after the nightly settlement.</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center"><Banknote size={16} /><Text as="h2" variant="headingSm">Next payout</Text></InlineStack>
              <Text as="p" variant="headingXl">{next ? usd(next.amount) : usd(0)}</Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {next ? `Expected ${next.arriveDay <= today ? 'today' : formatDate(next.arriveDay, 'long')} · Chaise checking` : 'No payouts scheduled'}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center"><Lock size={16} /><Text as="h2" variant="headingSm">Scheduled and held</Text></InlineStack>
              <SummaryLine label="Scheduled" value={usd(inTransit)} />
              <SummaryLine label="On hold" value={usd(onHold)} tone={onHold > 0 ? 'critical' : undefined} />
              <SummaryLine label="Reserve" value={usd(reserved)} tone={reserved > 0 ? 'critical' : undefined} />
            </BlockStack>
          </Card>
        </InlineGrid>

        <TableCard title="Payouts" actions={<Link onClick={() => navigate('finances/payouts')}>View all payouts</Link>}>
          {recent.length === 0 ? (
            <div className="sf-pad sf-pad-top0"><Text as="p" tone="subdued">Your first payout is created the night after your first sale. New stores wait an extra {BENCHMARKS.fees.firstPayoutDelayDays} days for it.</Text></div>
          ) : (
            <PayoutTable rows={recent} today={today} navigate={navigate} compact />
          )}
        </TableCard>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card title="Billing" actions={<Link onClick={() => navigate('finances/billing')}>View bills</Link>}>
            <BlockStack gap="200">
              <SummaryLine label="Plan" value={PLAN_LABEL[plan]} />
              {plan === 'trial' && trialEnds != null && <SummaryLine label="Intro offer ends" value={formatDate(trialEnds, 'short')} />}
              <SummaryLine label="Monthly store costs" sub={`${storeBills.length} subscription${storeBills.length === 1 ? '' : 's'}`} value={usd(monthly)} strong />
              {storeBills[0] && <Text as="p" variant="bodySm" tone="subdued">Next bill: {storeBills[0].name} · {usd(storeBills[0].amount)} on {formatDate(storeBills[0].nextDueDay, 'md')}</Text>}
            </BlockStack>
          </Card>
          <Card title="Shopifly Capital" actions={<Link onClick={() => navigate('finances/capital')}>{loan ? 'View financing' : 'Learn more'}</Link>}>
            {loan ? (
              <BlockStack gap="200">
                <Text as="p">{usd(loan.remaining)} left to repay</Text>
                <ProgressBar progress={(1 - loan.remaining / (loan.principal * (1 + (loan.feePct ?? 0)))) * 100} size="small" tone="success" />
                <Text as="p" variant="bodySm" tone="subdued">{Math.round(loan.withholdPct * 100)}% of each payout goes to repayment.</Text>
              </BlockStack>
            ) : offer ? (
              <BlockStack gap="200">
                <Badge tone="success">Pre-qualified</Badge>
                <Text as="p" variant="headingLg">{usd(offer.amount, false)}</Text>
                <Text as="p" variant="bodySm" tone="subdued">Fixed fee {usd(offer.fee)} · repaid from {Math.round(offer.withholdPct * 100)}% of payouts</Text>
              </BlockStack>
            ) : (
              <Text as="p" tone="subdued">Funding offers are based on your sales history on Shopifly. Keep selling to become eligible.</Text>
            )}
          </Card>
        </InlineGrid>
      </Page>
    </PolarisProvider>
  )
}

// ---------------------------------------------------------------------------
function PayoutTable({ rows, today, navigate, compact }: { rows: Payout[]; today: Day; navigate: (p: string) => void; compact?: boolean }) {
  return (
    <IndexTable
      rows={rows}
      rowKey={p => p.id}
      selectable={false}
      resourceName={{ singular: 'payout', plural: 'payouts' }}
      onRowClick={p => navigate(`finances/payouts/${p.id}`)}
      defaultSort={{ columnId: 'date', direction: 'descending' }}
      pageSize={compact ? undefined : 50}
      columns={[
        { id: 'date', title: 'Payout date', nowrap: true, sortValue: p => p.arriveDay * 1000 + p.createdDay, render: p => formatDate(p.arriveDay, 'short') },
        { id: 'status', title: 'Status', nowrap: true, render: p => { const st = payoutStatus(p, today); return <Badge tone={st.tone}>{st.label}</Badge> } },
        {
          id: 'type', title: 'Type', nowrap: true,
          render: p => (p.kind === 'reserve_release' ? 'Reserve release' : `Sales · ${formatDate(p.createdDay, 'md')}`),
        },
        ...(compact ? [] : [
          { id: 'gross', title: 'Charges', numeric: true, render: (p: Payout) => usd(p.gross) },
          { id: 'fees', title: 'Fees', numeric: true, render: (p: Payout) => usd(-p.fees) },
          { id: 'refunds', title: 'Refunds', numeric: true, render: (p: Payout) => usd(-p.refunds) },
          { id: 'adj', title: 'Adjustments', numeric: true, render: (p: Payout) => usd(p.adjustments) },
        ]),
        { id: 'amount', title: 'Amount', numeric: true, sortValue: p => p.amount, render: p => <Text as="span" fontWeight="semibold">{usd(p.amount)}</Text> },
      ]}
    />
  )
}

function PayoutsPage({ navigate }: ShopiflyPageProps) {
  const today = useToday()
  const payouts = useGS(s => s.store.payouts)
  const [tab, setTab] = useState(0)
  const views = ['All', 'Scheduled', 'On hold', 'Paid'] as const
  const rows = useMemo(() => payouts.filter(p => {
    const v = views[tab]
    return v === 'All' || (v === 'Scheduled' && p.status === 'pending') || (v === 'On hold' && p.status === 'held') || (v === 'Paid' && p.status === 'paid')
  }), [payouts, tab]) // eslint-disable-line react-hooks/exhaustive-deps
  const paid30 = payouts.filter(p => p.status === 'paid' && p.arriveDay > today - 30).reduce((a, p) => a + p.amount, 0)
  return (
    <PolarisProvider>
      <Page title="Payouts" backAction={{ content: 'Finance', onAction: () => navigate('finances') }} subtitle={`${usd(paid30)} paid out in the last 30 days`} fullWidth>
        <HoldBanner navigate={navigate} />
        <Card padding="0">
          {payouts.length === 0 ? (
            <EmptyState heading="No payouts yet" image="generic" compact>
              After your first sale, Shopifly Payments creates a payout every night. It arrives in your bank account after {BENCHMARKS.fees.payoutBusinessDays} business days (plus a one-time {BENCHMARKS.fees.firstPayoutDelayDays}-day delay for new stores).
            </EmptyState>
          ) : (
            <>
              <IndexFilters tabs={views.map(v => ({ id: v, content: v }))} selected={tab} onSelect={setTab} />
              <PayoutTable rows={rows} today={today} navigate={navigate} />
            </>
          )}
        </Card>
      </Page>
    </PolarisProvider>
  )
}

function PayoutDetail({ navigate, id }: ShopiflyPageProps & { id: string }) {
  const today = useToday()
  const now = useNow()
  const { payouts, orders } = useGSShallow(s => ({ payouts: s.store.payouts, orders: s.store.orders }))
  const p = payouts.find(x => x.id === id)
  const dayOrders = useMemo(() => (p && p.kind !== 'reserve_release' ? orders.filter(o => dayOf(o.hour) === p.createdDay) : []), [orders, p])
  if (!p) {
    return (
      <PolarisProvider>
        <Page title="Payout not found" backAction={{ content: 'Payouts', onAction: () => navigate('finances/payouts') }}>
          <Card><EmptyState heading="This payout can't be found" image="generic" action={{ content: 'View payouts', onAction: () => navigate('finances/payouts') }} /></Card>
        </Page>
      </PolarisProvider>
    )
  }
  const st = payoutStatus(p, today)
  return (
    <PolarisProvider>
      <Page
        title={`Payout ${formatDate(p.arriveDay, 'short')}`}
        titleMetadata={<Badge tone={st.tone}>{st.label}</Badge>}
        subtitle={p.kind === 'reserve_release' ? 'Reserve release' : `Sales from ${longDate(p.createdDay)}`}
        backAction={{ content: 'Payouts', onAction: () => navigate('finances/payouts') }}
      >
        {p.note && <Banner tone={p.status === 'held' ? 'warning' : 'info'}>{p.note}</Banner>}
        <Card title="Summary">
          <BlockStack gap="150">
            <SummaryLine label="Charges" value={usd(p.gross)} />
            <SummaryLine label="Fees" value={usd(-p.fees)} />
            <SummaryLine label="Refunds" value={usd(-p.refunds)} />
            {!!p.capitalWithheld && <SummaryLine label="Shopifly Capital repayment" value={usd(-p.capitalWithheld)} />}
            {!!p.reserveWithheld && <SummaryLine label="Reserve held" value={usd(-p.reserveWithheld)} />}
            <SummaryLine label="Other adjustments" sub="Chargebacks, dispute fees, reversals" value={usd(p.adjustments + (p.capitalWithheld ?? 0) + (p.reserveWithheld ?? 0))} />
            <SummaryLine label="Payout amount" value={usd(p.amount)} strong />
            <Text as="p" variant="bodySm" tone="subdued">
              {p.status === 'paid' ? `Deposited to Chaise checking on ${formatDate(p.arriveDay, 'long')}.` : `Expected in Chaise checking on ${formatDate(p.arriveDay, 'long')}.`}
            </Text>
          </BlockStack>
        </Card>
        {dayOrders.length > 0 && (
          <TableCard title="Transactions">
            <IndexTable
              rows={dayOrders}
              rowKey={o => String(o.id)}
              selectable={false}
              resourceName={{ singular: 'transaction', plural: 'transactions' }}
              onRowClick={o => navigate(`orders/${o.id}`)}
              pageSize={25}
              columns={[
                { id: 'order', title: 'Order', render: o => <Text as="span" fontWeight="semibold">#{o.id}</Text>, sortValue: o => o.id },
                { id: 'time', title: 'Date', nowrap: true, render: o => listDate(o.hour, now, o.id) },
                { id: 'method', title: 'Payment method', nowrap: true, render: o => methodLabel(o) },
                { id: 'amt', title: 'Amount', numeric: true, render: o => usd(o.total) },
                { id: 'fee', title: 'Fee', numeric: true, render: o => usd(-o.fees) },
                { id: 'net', title: 'Net', numeric: true, render: o => usd(o.total - o.fees) },
              ]}
            />
          </TableCard>
        )}
      </Page>
    </PolarisProvider>
  )
}

const methodLabel = (o: Order) =>
  o.paymentMethod === 'paypal' ? PAYMENT_LABELS.paypal : o.paymentMethod === 'bnpl' ? PAYMENT_LABELS.bnpl : o.paymentMethod === 'shop_pay' ? PAYMENT_LABELS.shopPay : 'Card'

// ---------------------------------------------------------------------------
interface Txn { key: string; hour: number; type: 'Charge' | 'Refund' | 'Chargeback' | 'Chargeback reversal'; orderId: number; method: string; amount: number; fee: number }

function Transactions({ navigate }: ShopiflyPageProps) {
  const now = useNow()
  const { orders, tickets, chargebacks } = useGSShallow(s => ({ orders: s.store.orders, tickets: s.store.tickets, chargebacks: s.store.chargebacks }))
  const [tab, setTab] = useState(0)
  const [q, setQ] = useState('')
  const all = useMemo<Txn[]>(() => {
    const out: Txn[] = []
    const refundHour = new Map<number, number>()
    for (const t of tickets) if ((t.resolution === 'refunded' || t.resolution === 'partial_refund') && t.solvedHour != null) refundHour.set(t.orderId, t.solvedHour)
    for (const o of orders) {
      out.push({ key: `c${o.id}`, hour: o.hour, type: 'Charge', orderId: o.id, method: methodLabel(o), amount: o.total, fee: o.fees })
      if (o.refunded > 0) out.push({ key: `r${o.id}`, hour: refundHour.get(o.id) ?? o.hour + 24, type: 'Refund', orderId: o.id, method: methodLabel(o), amount: -o.refunded, fee: 0 })
    }
    for (const c of chargebacks) {
      out.push({ key: `d${c.id}`, hour: c.openedDay * 24 + 9, type: 'Chargeback', orderId: c.orderId, method: 'Card', amount: -c.amount, fee: c.fee ?? 15 })
      if (c.status === 'won' && c.decideDay != null) out.push({ key: `w${c.id}`, hour: c.decideDay * 24 + 8, type: 'Chargeback reversal', orderId: c.orderId, method: 'Card', amount: c.amount, fee: -(c.fee ?? 15) })
    }
    return out.filter(t => t.hour <= now).sort((a, b) => b.hour - a.hour)
  }, [orders, tickets, chargebacks, now])
  const views = ['All', 'Charges', 'Refunds', 'Chargebacks'] as const
  const rows = useMemo(() => {
    const v = views[tab]
    const ql = q.trim().replace(/^#/, '')
    return all.filter(t => (v === 'All' || (v === 'Charges' && t.type === 'Charge') || (v === 'Refunds' && t.type === 'Refund') || (v === 'Chargebacks' && t.type.startsWith('Chargeback'))) && (!ql || String(t.orderId).includes(ql)))
  }, [all, tab, q]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <PolarisProvider>
      <Page title="Transactions" backAction={{ content: 'Finance', onAction: () => navigate('finances') }} fullWidth>
        <Card padding="0">
          {all.length === 0 ? (
            <EmptyState heading="No transactions yet" image="generic" compact>Payments, refunds and chargebacks processed by Shopifly Payments will show here.</EmptyState>
          ) : (
            <>
              <IndexFilters tabs={views.map(v => ({ id: v, content: v }))} selected={tab} onSelect={setTab} queryValue={q} onQueryChange={setQ} queryPlaceholder="Search by order number" />
              <IndexTable
                rows={rows}
                rowKey={t => t.key}
                selectable={false}
                resourceName={{ singular: 'transaction', plural: 'transactions' }}
                onRowClick={t => navigate(`orders/${t.orderId}`)}
                pageSize={50}
                columns={[
                  { id: 'date', title: 'Date', nowrap: true, sortValue: t => t.hour, render: t => listDate(t.hour, now, t.key) },
                  { id: 'type', title: 'Type', nowrap: true, render: t => <Badge tone={t.type === 'Chargeback' ? 'critical' : t.type === 'Refund' ? 'warning' : t.type === 'Chargeback reversal' ? 'success' : undefined}>{t.type}</Badge> },
                  { id: 'order', title: 'Order', render: t => <Link onClick={() => navigate(`orders/${t.orderId}`)}>#{t.orderId}</Link> },
                  { id: 'method', title: 'Payment method', nowrap: true, render: t => t.method },
                  { id: 'amount', title: 'Amount', numeric: true, sortValue: t => t.amount, render: t => usd(t.amount) },
                  { id: 'fee', title: 'Fee', numeric: true, render: t => (t.fee ? usd(-t.fee) : usd(0)) },
                  { id: 'net', title: 'Net', numeric: true, render: t => <Text as="span" fontWeight="semibold">{usd(t.amount - t.fee)}</Text> },
                ]}
              />
            </>
          )}
        </Card>
      </Page>
    </PolarisProvider>
  )
}

// ---------------------------------------------------------------------------
function Billing({ navigate }: ShopiflyPageProps) {
  const now = useNow()
  const { bills, ledger, plan, trialEnds, apps } = useGSShallow(s => ({
    bills: s.finance.bills, ledger: s.finance.ledger, plan: s.store.plan, trialEnds: s.store.trialEndsDay, apps: s.store.apps,
  }))
  const storeBills = useMemo(
    () => bills.filter(b => b.business && (b.ref === 'shopifly_plan' || b.ref?.startsWith('app:') || b.ref === 'domain' || /shopifly|domain/i.test(b.name))).sort((a, b) => a.nextDueDay - b.nextDueDay),
    [bills],
  )
  const charges = useMemo(
    () => ledger.filter(e => e.business && (e.category === 'apps' || e.category === 'subscription') && e.amount < 0 && !/mineo|upworx/i.test(e.memo)).slice(-40).reverse(),
    [ledger],
  )
  const monthly = storeBills.reduce((a, b) => a + (b.cadence === 'monthly' ? b.amount : b.cadence === 'weekly' ? b.amount * 4.33 : b.amount / 12), 0)
  return (
    <PolarisProvider>
      <Page title="Billing" backAction={{ content: 'Finance', onAction: () => navigate('finances') }}>
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card title="Plan" actions={<Link onClick={() => navigate('settings/plan')}>Change plan</Link>}>
            <BlockStack gap="150">
              <Text as="p" variant="headingLg">{PLAN_LABEL[plan]}</Text>
              <Text as="p" tone="subdued">
                {plan === 'trial' && trialEnds != null
                  ? `$${BENCHMARKS.fees.trialMonthly}/month intro offer until ${formatDate(trialEnds, 'long')}, then $${BENCHMARKS.fees.plans.basic.monthly}/month.`
                  : `$${BENCHMARKS.fees.plans[plan === 'trial' ? 'basic' : plan].monthly}/month, billed to your Chaise Sapphire card.`}
              </Text>
            </BlockStack>
          </Card>
          <Card title="Estimated monthly total">
            <BlockStack gap="150">
              <Text as="p" variant="headingLg">{usd(monthly)}</Text>
              <Text as="p" tone="subdued">{storeBills.length} active subscription{storeBills.length === 1 ? '' : 's'} · {apps.length} app{apps.length === 1 ? '' : 's'} installed</Text>
            </BlockStack>
          </Card>
        </InlineGrid>
        <TableCard title="Upcoming bills">
          {storeBills.length === 0 ? (
            <div className="sf-pad"><Text as="p" tone="subdued">No upcoming bills.</Text></div>
          ) : (
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'numeric']}
              headings={['Subscription', 'Billing cycle', 'Next charge', 'Amount']}
              rows={storeBills.map(b => [
                <span key="n">{b.name}{b.failedSince != null && <> <Badge tone="critical">Payment failed</Badge></>}</span>,
                b.cadence === 'monthly' ? 'Monthly' : b.cadence === 'yearly' ? 'Yearly' : 'Weekly',
                formatDate(b.nextDueDay, 'short'),
                usd(b.amount + (b.arrears ?? 0)),
              ])}
            />
          )}
        </TableCard>
        <TableCard title="Charges">
          {charges.length === 0 ? (
            <div className="sf-pad"><Text as="p" tone="subdued">No charges yet.</Text></div>
          ) : (
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'numeric']}
              headings={['Date', 'Description', 'Paid with', 'Amount']}
              rows={charges.map(e => [listDate(e.hour, now, e.id), e.memo, e.account === 'card' ? 'Chaise Sapphire' : 'Chaise checking', usd(-e.amount)])}
            />
          )}
        </TableCard>
        <Text as="p" variant="bodySm" tone="subdued" alignment="center">Transaction fees are deducted from each payout and aren't billed here.</Text>
      </Page>
    </PolarisProvider>
  )
}

// ---------------------------------------------------------------------------
function Capital({ navigate }: ShopiflyPageProps) {
  const { offer, loan, loans } = useCapital()
  const payouts = useGS(s => s.store.payouts)
  const [confirm, setConfirm] = useState(false)
  const withheld = useMemo(() => payouts.filter(p => (p.capitalWithheld ?? 0) > 0).sort((a, b) => b.createdDay - a.createdDay).slice(0, 20), [payouts])
  const past = loans.filter(l => l.lender === 'shopifly_capital' && l.remaining <= 0)
  const totalDue = loan ? loan.principal * (1 + (loan.feePct ?? 0)) : 0

  return (
    <PolarisProvider>
      <Page title="Shopifly Capital" backAction={{ content: 'Finance', onAction: () => navigate('finances') }}>
        {loan ? (
          <Card title="Active financing">
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="end">
                <BlockStack gap="050">
                  <Text as="span" tone="subdued">Remaining balance</Text>
                  <Text as="p" variant="headingXl">{usd(loan.remaining)}</Text>
                </BlockStack>
                <Text as="span" tone="subdued">of {usd(totalDue)}</Text>
              </InlineStack>
              <ProgressBar progress={totalDue ? (1 - loan.remaining / totalDue) * 100 : 0} tone="success" />
              <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                <SummaryLine label="Funded" value={usd(loan.principal)} />
                <SummaryLine label="Fixed fee" value={usd(loan.principal * (loan.feePct ?? 0))} />
                <SummaryLine label="Repayment rate" value={`${Math.round(loan.withholdPct * 100)}% of payouts`} />
              </InlineGrid>
              <Text as="p" variant="bodySm" tone="subdued">Funded {formatDate(loan.takenDay, 'long')}. There's no interest or due date: you repay faster when sales are higher.</Text>
            </BlockStack>
          </Card>
        ) : offer ? (
          <Card>
            <div className="sf-capital-offer">
              <div className="sf-capital-icon"><Landmark size={22} /></div>
              <BlockStack gap="300">
                <Badge tone="success">You're pre-qualified</Badge>
                <Text as="h2" variant="headingXl">Get {usd(offer.amount, false)} to grow your business</Text>
                <Text as="p" tone="subdued">Based on your average of {usd(offer.avgDaily ?? 0)} in daily sales over the last {CAPITAL_RULES.minSalesDays} days.</Text>
                <div className="sf-capital-terms">
                  <SummaryLine label="Funding amount" value={usd(offer.amount)} />
                  <SummaryLine label="Fixed fee" sub={`${((offer.feePct ?? offer.fee / offer.amount) * 100).toFixed(1)}%`} value={usd(offer.fee)} />
                  <SummaryLine label="Total repayment" value={usd(offer.total ?? offer.amount + offer.fee)} strong />
                  <SummaryLine label="Repayment rate" value={`${(offer.withholdPct * 100).toFixed(1)}% of each payout`} />
                </div>
                <InlineStack gap="200">
                  <Button variant="primary" onClick={() => setConfirm(true)}>Review offer</Button>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">Offers are refreshed monthly. The fee is fixed, so repaying faster doesn't lower it.</Text>
              </BlockStack>
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState heading="Financing built for Shopifly stores" image="generic">
              Shopifly Capital offers are based on your store's sales history. Stores with at least {CAPITAL_RULES.minSalesDays} days of sales, averaging around {usd(CAPITAL_RULES.minAvgDaily, false)} a day, are usually eligible. There are no credit checks, and repayments come out of your payouts automatically.
            </EmptyState>
          </Card>
        )}
        {withheld.length > 0 && (
          <TableCard title="Repayments">
            <DataTable
              columnContentTypes={['text', 'numeric', 'numeric']}
              headings={['Payout', 'Payout amount', 'Repayment']}
              rows={withheld.map(p => [formatDate(p.arriveDay, 'short'), usd(p.amount), usd(p.capitalWithheld ?? 0)])}
            />
          </TableCard>
        )}
        {past.length > 0 && (
          <Card title="Completed financing">
            <BlockStack gap="100">
              {past.map(l => <SummaryLine key={l.id} label={`Funded ${formatDate(l.takenDay, 'short')}`} value={`${usd(l.principal)} · repaid`} />)}
            </BlockStack>
          </Card>
        )}
      </Page>
      {offer && (
        <Modal
          open={confirm}
          onClose={() => setConfirm(false)}
          title="Accept Shopifly Capital offer"
          pauseGame
          primaryAction={{ content: `Accept ${usd(offer.amount, false)}`, onAction: () => { act(s => { acceptCapital(s) }); setConfirm(false) } }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setConfirm(false) }]}
        >
          <BlockStack gap="300">
            <Text as="p">{usd(offer.amount)} will be deposited to your Chaise checking account today.</Text>
            <Text as="p">You'll repay {usd(offer.total ?? offer.amount + offer.fee)} in total. {(offer.withholdPct * 100).toFixed(1)}% of every Shopifly payout goes to repayment until the balance is paid, so your payouts shrink while it's active.</Text>
            <Text as="p" tone="subdued">Borrowing only helps if the extra spend earns more than the {usd(offer.fee)} fee and the smaller payouts.</Text>
          </BlockStack>
        </Modal>
      )}
    </PolarisProvider>
  )
}
