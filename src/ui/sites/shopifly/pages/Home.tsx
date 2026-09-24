import type { ShopiflyPageProps } from '../route'

// PLACEHOLDER — replaced by the agent that owns this page.
export default function Home({ params }: ShopiflyPageProps) {
  return <div style={{ padding: 24 }}>Home {params.join('/')}</div>
}
