import type { ShopiflyPageProps } from '../route'

// PLACEHOLDER — replaced by the agent that owns this page.
export default function Products({ params }: ShopiflyPageProps) {
  return <div style={{ padding: 24 }}>Products {params.join('/')}</div>
}
