// Product editor side cards: unit economics / break-even (from the store module's
// breakEven) and a Shopify-style "Insights" card with the product's last-30-day funnel.
import type { GameState, StoreProduct } from '../../../../core/types'
import { breakEven, effectivePrice, storeRange } from '../../../../sim/store'
import { fulfillmentFor } from '../../../../sim/market'
import { dayOf } from '../../../../core/time'
import { money, num, pct } from '../../../../core/format'
import { BlockStack, Card, Divider, InlineStack, Text, Tooltip } from '../../../kit/polaris'

const ROUTE_LABEL: Record<string, string> = {
  dropship: 'AliExprez dropshipping',
  agent: 'Sourcing agent (dropship)',
  bulk: 'US warehouse stock (3PL)',
  private_label: 'Private label stock (3PL)',
}

function Row({ label, value, tip, strong, tone }: { label: string; value: string; tip?: string; strong?: boolean; tone?: 'critical' | 'success' | 'subdued' }) {
  const l = <Text as="span" tone={tone === 'subdued' ? 'subdued' : undefined} fontWeight={strong ? 'semibold' : undefined}>{label}</Text>
  return (
    <InlineStack align="space-between" blockAlign="center" wrap={false} gap="200">
      {tip ? <Tooltip content={tip} width="wide" hasUnderline>{l}</Tooltip> : l}
      <Text as="span" numeric fontWeight={strong ? 'semibold' : undefined} tone={tone === 'critical' ? 'critical' : tone === 'success' ? 'success' : undefined}>{value}</Text>
    </InlineStack>
  )
}

/** `s` should already contain the draft product (withOverrides) so numbers follow unsaved edits. */
export function BreakEvenCard({ s, product }: { s: GameState; product: StoreProduct }) {
  const be = breakEven(s, product.id)
  const price = effectivePrice(s, product)
  const f = fulfillmentFor(s, product.catalogId)
  const marginPct = price > 0 ? be.margin / price : 0
  const losing = be.margin <= 0
  return (
    <Card title="Break-even">
      <BlockStack gap="200">
        <Row label="Selling price" value={money(price)} tip={price < product.price ? 'After your automatic discount.' : undefined} />
        <Row label="Product + shipping" value={`−${money(be.landedCost)}`} tip="What one order costs you to fulfill: supplier price including import duty, plus shipping to the customer." tone="subdued" />
        <Row label="Payment fees" value={`−${money(be.fees)}`} tip="Card processing on your plan, blended with the wallet share of checkouts if you offer it." tone="subdued" />
        <Divider />
        <Row label="Profit per order" value={`${money(be.margin)} (${pct(marginPct, 0)})`} strong tone={losing ? 'critical' : undefined} />
        <Row
          label="Break-even CPA"
          value={losing ? 'None' : money(be.breakEvenCpa)}
          tip="The most you can spend on ads to get one sale before you lose money on it."
          strong
        />
        <Row
          label="Break-even ROAS"
          value={Number.isFinite(be.breakEvenRoas) ? be.breakEvenRoas.toFixed(2) : '∞'}
          tip="Ad return you need just to break even: price ÷ profit per order. Ads Manager's ROAS has to beat this, and platforms over-report."
          strong
        />
        {losing && <Text as="p" tone="critical" variant="bodySm">You lose money on every sale at this price, even before ads.</Text>}
        <Text as="p" tone="subdued" variant="bodySm">Fulfilled by {ROUTE_LABEL[f.mode] ?? f.mode}{f.inStock ? '' : ' (out of stock, falling back to AliExprez)'}.</Text>
      </BlockStack>
    </Card>
  )
}

export function InsightsCard({ s, product }: { s: GameState; product: StoreProduct }) {
  const today = dayOf(s.time.hour)
  const r = storeRange(s, { from: today - 29, to: today })
  const bp = r.byProduct[product.id]
  const sessions = bp?.sessions ?? 0
  return (
    <Card title="Insights" actions={<Text as="span" tone="subdued" variant="bodySm">Last 30 days</Text>}>
      {!bp || (sessions === 0 && bp.orders === 0) ? (
        <Text as="p" tone="subdued">Insights appear once this product gets visitors.</Text>
      ) : (
        <BlockStack gap="200">
          <Row label="Sessions" value={num(sessions)} />
          <Row label="Added to cart" value={`${num(bp.atc)} (${sessions ? pct(bp.atc / sessions, 1) : '—'})`} />
          <Row label="Orders" value={num(bp.orders)} />
          <Row label="Conversion rate" value={sessions ? pct(bp.orders / sessions, 2) : '—'} strong />
          <Row label="Units sold" value={num(bp.units)} />
          <Row label="Sales" value={money(bp.sales)} strong />
        </BlockStack>
      )}
    </Card>
  )
}
