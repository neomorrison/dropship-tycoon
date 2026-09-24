import type { ShopiflyPageProps } from '../route'

// PLACEHOLDER — replaced by the agent that owns this page.
export default function Apps({ params }: ShopiflyPageProps) {
  return <div style={{ padding: 24 }}>Apps {params.join('/')}</div>
}
