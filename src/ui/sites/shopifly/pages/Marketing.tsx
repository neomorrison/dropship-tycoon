import type { ShopiflyPageProps } from '../route'

// PLACEHOLDER — replaced by the agent that owns this page.
export default function Marketing({ params }: ShopiflyPageProps) {
  return <div style={{ padding: 24 }}>Marketing {params.join('/')}</div>
}
