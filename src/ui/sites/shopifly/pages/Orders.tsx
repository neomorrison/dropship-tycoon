import type { ShopiflyPageProps } from '../route'

// PLACEHOLDER — replaced by the agent that owns this page.
export default function Orders({ params }: ShopiflyPageProps) {
  return <div style={{ padding: 24 }}>Orders {params.join('/')}</div>
}
