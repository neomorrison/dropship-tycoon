import type { ShopiflyPageProps } from '../route'

// PLACEHOLDER — replaced by the agent that owns this page.
export default function Settings({ params }: ShopiflyPageProps) {
  return <div style={{ padding: 24 }}>Settings {params.join('/')}</div>
}
