// AliExprez — state hooks. Selectors return stable slices/primitives only;
// derived lists are memoized (zustand v5 rule).
import { useMemo } from 'react'
import { produce } from 'immer'
import type { GameState } from '../../../core/types'
import { getGS, useGS } from '../../../core/store'
import { dayOf } from '../../../core/time'
import { findProduct, publicListing } from '../../../sim/market'
import type { Row } from './lib'

export const useToday = () => useGS(s => dayOf(s.time.hour))

/**
 * Run a read-only sim query that may lazily fill defaults on the state it receives
 * (e.g. life.canDoActivity). It runs on a throwaway immer draft of the current state,
 * so nothing is committed and the frozen store is never touched. Return plain values only.
 */
export function onDraft<T>(fn: (s: GameState) => T): T {
  let out: T | undefined
  produce(getGS(), d => { out = fn(d as GameState) })
  return out as T
}

/** Every product currently listed on AliExprez with its public listing. */
export function useListings(): Row[] {
  const market = useGS(s => s.catalog.market)
  const available = useGS(s => s.catalog.available)
  const active = useGS(s => s.events.active)
  const skill = useGS(s => s.skills.research?.level ?? 1)
  const day = useToday()
  return useMemo(() => {
    const s = getGS()
    const rows: Row[] = []
    for (const id of available) {
      const p = findProduct(id)
      const l = p ? publicListing(s, id) : null
      if (p && l) rows.push({ p, l })
    }
    return rows
    // market/active/skill/day are the inputs publicListing reads
  }, [market, available, active, skill, day])
}

/** One product's listing (null when unknown or not released yet). */
export function useListing(id: string): Row | null {
  const market = useGS(s => s.catalog.market[id])
  const isAvail = useGS(s => s.catalog.available.includes(id))
  const active = useGS(s => s.events.active)
  const skill = useGS(s => s.skills.research?.level ?? 1)
  const day = useToday()
  return useMemo(() => {
    const p = findProduct(id)
    if (!p || !isAvail) return null
    const l = publicListing(getGS(), id)
    return l ? { p, l } : null
  }, [id, market, isAvail, active, skill, day])
}

/** catalogId → first Shopifly product id imported from it. */
export function useImported(): Map<string, string> {
  // select a primitive key, not the products array: product edits/stats change the array
  // every tick, and every product card on the page would re-render with it
  const key = useGS(s => {
    let k = ''
    for (const sp of s.store.products) k += `${sp.catalogId}\u0001${sp.id}\u0002`
    return k
  })
  return useMemo(() => {
    const m = new Map<string, string>()
    for (const pair of key.split('\u0002')) {
      if (!pair) continue
      const [catalogId, id] = pair.split('\u0001')
      if (!m.has(catalogId)) m.set(catalogId, id)
    }
    return m
  }, [key])
}

export function useFavoriteSet(): Set<string> {
  const favs = useGS(s => s.catalog.favorites)
  return useMemo(() => new Set(favs), [favs])
}

/** Per-product sample status: 'owned' | 'shipping' | undefined */
export function useSampleStatus(): Map<string, 'owned' | 'shipping'> {
  const samples = useGS(s => s.catalog.samples)
  const owned = useGS(s => s.catalog.samplesOwned)
  return useMemo(() => {
    const m = new Map<string, 'owned' | 'shipping'>()
    for (const smp of samples) if (!smp.received) m.set(smp.catalogId, 'shipping')
    for (const id of owned) m.set(id, 'owned')
    return m
  }, [samples, owned])
}
