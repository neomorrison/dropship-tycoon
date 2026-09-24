import type { ShopiflyPageProps } from '../route'

// PLACEHOLDER — replaced by the agent that owns this page.
export default function Discounts({ params }: ShopiflyPageProps) {
  return <div style={{ padding: 24 }}>Discounts {params.join('/')}</div>
}
