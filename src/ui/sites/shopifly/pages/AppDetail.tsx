import type { ShopiflyPageProps } from '../route'

// PLACEHOLDER — replaced by the agent that owns this page.
export default function AppDetail({ params }: ShopiflyPageProps) {
  return <div style={{ padding: 24 }}>AppDetail {params.join('/')}</div>
}
