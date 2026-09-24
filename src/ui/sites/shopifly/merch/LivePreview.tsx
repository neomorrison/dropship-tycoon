// A non-interactive, scaled-down render of the live storefront (Online Store theme card,
// Preferences preview). Renders the real storefront components at full layout width and
// shrinks them with a CSS transform, like Shopify's theme screenshots.
import { useMemo } from 'react'
import type { GameState } from '../../../../core/types'
import { buildProductModel, buildStoreView, cardInfo, HomePage, StoreChrome, StoreProductPage } from '../../storefront'

export function LivePreview({ s, layoutWidth, width, height, productId }: { s: GameState; layoutWidth: number; width: number; height: number; productId?: string | null }) {
  const scale = width / layoutWidth
  const view = useMemo(() => buildStoreView(s), [s])
  const product = productId ? s.store.products.find(p => p.id === productId) ?? null : null
  const model = useMemo(() => (product ? buildProductModel(s, product) : null), [s, product])
  const cards = useMemo(() => view.products.map(p => cardInfo(s, p)), [s, view.products])
  return (
    <div className="sf-mx-live" style={{ width, height }} aria-hidden>
      <div className="sf-mx-live-inner" style={{ width: layoutWidth, height: height / scale, transform: `scale(${scale})` }}>
        <StoreChrome view={view}>
          {model ? <StoreProductPage view={view} model={model} /> : <HomePage view={view} cards={cards} />}
        </StoreChrome>
      </div>
    </div>
  )
}
