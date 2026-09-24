import type { ShopiflyPageProps } from '../route'

// PLACEHOLDER — replaced by the agent that owns this page.
export default function Customers({ params }: ShopiflyPageProps) {
  return <div style={{ padding: 24 }}>Customers {params.join('/')}</div>
}
