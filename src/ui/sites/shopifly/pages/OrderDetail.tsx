import type { ShopiflyPageProps } from '../route'

// PLACEHOLDER — replaced by the agent that owns this page.
export default function OrderDetail({ params }: ShopiflyPageProps) {
  return <div style={{ padding: 24 }}>OrderDetail {params.join('/')}</div>
}
