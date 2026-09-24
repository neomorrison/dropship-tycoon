// Small shared pieces for the merch pages: app icon tile, reviews import modal,
// unsaved-changes confirmation, and a hook that fills the remaining browser height.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { GameState } from '../../../../core/types'
import { act, useGS } from '../../../../core/store'
import type { AppDef } from '../../../../data/apps'
import { importReviews } from '../../../../sim/store'
import { BlockStack, Banner, InlineStack, Modal, Select, Text, TextField } from '../../../kit/polaris'
import { Stars } from '../../../kit/common'
import { catalogDef, starCounts } from '../../storefront'

/** "Tickr Countdown Timer & Scarcity" → "Tickr", "Klavio: Email Marketing & SMS" → "Klavio" */
export function appShortName(name: string): string {
  const base = name.split(/[:–]|\s-\s/)[0].trim()
  const words = base.split(/\s+/)
  return words.length > 2 ? words[0] : base
}

export function AppIcon({ app, size = 40 }: { app: Pick<AppDef, 'icon' | 'name'>; size?: number }) {
  return (
    <span
      className="sf-mx-appicon"
      style={{ width: size, height: size, background: app.icon.bg, color: app.icon.fg, fontSize: size * (app.icon.glyph.length > 1 ? 0.36 : 0.48), borderRadius: size * 0.22 }}
      aria-hidden
    >
      {app.icon.glyph}
    </span>
  )
}

/** Supplier review pool the reviews apps can import (same numbers the store module uses). */
export function supplierReviewPool(s: GameState, catalogId: string): { rating: number; reviews: number } {
  const m = s.catalog?.market?.[catalogId]
  const d = catalogDef(catalogId)
  return { rating: m?.rating ?? d?.publicSignals.rating ?? 4.5, reviews: Math.max(0, Math.round(m?.reviews ?? d?.publicSignals.reviews ?? 0)) }
}

/** In the order the store module uses them (Lookz imports photos first). */
export const REVIEW_APPS = ['lookz', 'judgyme', 'vitalz'] as const
export const installedReviewApp = (s: GameState) => REVIEW_APPS.find(id => s.store.apps.some(a => a.appId === id)) ?? null

export function ImportReviewsModal({ open, onClose, productId }: { open: boolean; onClose: () => void; productId: string }) {
  const s = useGS(st => st)
  const p = s.store.products.find(x => x.id === productId)
  const [count, setCount] = useState('50')
  const [minStars, setMinStars] = useState('4')
  const pool = useMemo(() => (p ? supplierReviewPool(s, p.catalogId) : { rating: 0, reviews: 0 }), [s, p])
  const app = installedReviewApp(s)
  const min = Number(minStars)
  const dist = starCounts(pool.reviews, pool.rating)
  const available = dist.slice(min).reduce((a, b) => a + b, 0)
  const avg = available ? dist.reduce((a, n, k) => (k >= min ? a + n * k : a), 0) / available : 0
  const n = Math.max(0, Math.min(Math.floor(Number(count) || 0), available, 500))
  if (!p) return null
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import reviews from AliExprez"
      primaryAction={{
        content: `Import ${n} review${n === 1 ? '' : 's'}`,
        disabled: !app || n <= 0,
        onAction: () => {
          act(st => { importReviews(st, productId, n, min) })
          onClose()
        },
      }}
      secondaryActions={[{ content: 'Cancel', onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {!app && <Banner tone="warning" inline>Install a reviews app (Judgy.me, Lookz or Vitalz) to import reviews.</Banner>}
          <InlineStack gap="300" blockAlign="center">
            <Stars rating={pool.rating} showValue size={16} />
            <Text as="span" tone="subdued">{pool.reviews.toLocaleString('en-US')} reviews on the supplier listing</Text>
          </InlineStack>
          <InlineStack gap="300" wrap={false}>
            <TextField label="Number of reviews" type="integer" min={1} max={500} value={count} onChange={setCount} />
            <Select
              label="Only reviews with"
              options={[{ label: '5 stars', value: '5' }, { label: '4 stars and up', value: '4' }, { label: '3 stars and up', value: '3' }, { label: 'All ratings', value: '1' }]}
              value={minStars}
              onChange={setMinStars}
            />
          </InlineStack>
          <Text as="p" tone="subdued">
            {available.toLocaleString('en-US')} reviews match, averaging {avg ? avg.toFixed(1) : '—'}★.
            {app === 'lookz' ? ' Lookz imports customer photos too.' : app === 'judgyme' ? ' Photo reviews import on Judgy.me Awesome.' : ''}
          </Text>
          {app && min >= 5 && <Text as="p" tone="caution">Every review 5★ looks filtered. Shoppers trust a 4.5–4.8 average more than a perfect score.</Text>}
        </BlockStack>
      </Modal.Section>
    </Modal>
  )
}

export function LeaveModal({ open, onStay, onLeave }: { open: boolean; onStay: () => void; onLeave: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onStay}
      title="Leave page with unsaved changes?"
      size="small"
      primaryAction={{ content: 'Leave page', destructive: true, onAction: onLeave }}
      secondaryActions={[{ content: 'Stay', onAction: onStay }]}
    >
      <Modal.Section>
        <Text as="p">Leaving this page will delete all unsaved changes.</Text>
      </Modal.Section>
    </Modal>
  )
}

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let p = el?.parentElement ?? null
  while (p) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p
    p = p.parentElement
  }
  return null
}

/** Height from the element's top to the bottom of its scroll container (min `min`). */
export function useFillHeight(ref: RefObject<HTMLElement | null>, min = 560): number {
  const [h, setH] = useState(min)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const sp = scrollParent(el)
    const update = () => {
      const top = el.getBoundingClientRect().top
      const bottom = sp ? sp.getBoundingClientRect().bottom : window.innerHeight
      setH(Math.max(min, Math.floor(bottom - top - 12)))
    }
    update()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (sp && ro) ro.observe(sp)
    window.addEventListener('resize', update)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [ref, min])
  return h
}

/** Pending navigation guarded by an unsaved-changes prompt. */
export function useLeaveGuard(dirty: boolean) {
  const [pending, setPending] = useState<(() => void) | null>(null)
  const guard = (go: () => void) => (dirty ? setPending(() => go) : go())
  const modal = (
    <LeaveModal
      open={pending != null}
      onStay={() => setPending(null)}
      onLeave={() => {
        const go = pending
        setPending(null)
        go?.()
      }}
    />
  )
  return { guard, modal }
}

/** Shopify-style dark toast ("Product saved"). Returns [node to render, show(message)]. */
export function useFlash(): [ReactNode, (msg: string, tone?: 'default' | 'critical') => void] {
  const [msg, setMsg] = useState<{ text: string; tone: 'default' | 'critical' } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((text: string, tone: 'default' | 'critical' = 'default') => {
    setMsg({ text, tone })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2800)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const node = msg ? (
    <div className={`sf-mx-toast${msg.tone === 'critical' ? ' is-critical' : ''}`} role="status" aria-live="polite">{msg.text}</div>
  ) : null
  return [node, show]
}
