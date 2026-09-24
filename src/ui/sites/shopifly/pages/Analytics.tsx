import type { ShopiflyPageProps } from '../route'

// PLACEHOLDER — replaced by the agent that owns this page.
export default function Analytics({ params }: ShopiflyPageProps) {
  return <div style={{ padding: 24 }}>Analytics {params.join('/')}</div>
}
