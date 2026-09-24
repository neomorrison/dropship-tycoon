// PLACEHOLDER — ui-shopifly-core agent implements the Shopifly admin chrome
// (black top bar with search + store menu, grey sidebar nav, page canvas).
import type { ReactNode } from 'react'
import type { ShopiflyNav } from './route'

export default function AdminFrame({ children }: { nav: ShopiflyNav; navigate: (path: string) => void; compact: boolean; children: ReactNode }) {
  return <div style={{ background: '#f1f1f1', minHeight: '100%' }}>{children}</div>
}
