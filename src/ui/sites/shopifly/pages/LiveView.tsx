import type { ShopiflyPageProps } from '../route'

// PLACEHOLDER — replaced by the agent that owns this page.
export default function LiveView({ params }: ShopiflyPageProps) {
  return <div style={{ padding: 24 }}>LiveView {params.join('/')}</div>
}
