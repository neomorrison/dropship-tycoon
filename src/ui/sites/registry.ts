import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { SiteId } from '../../core/types'
import type { SiteDef, SiteProps } from './types'

export const SITES: SiteDef[] = [
  { id: 'shopifly', name: 'Shopifly Admin', domain: 'admin.shopifly.com', glyph: '🛍', color: '#95BF47', bookmark: true, description: 'Your store: products, orders, analytics' },
  { id: 'fadbook', name: 'Fadbook Ads Manager', domain: 'adsmanager.fadbook.com', glyph: 'f', color: '#0866FF', bookmark: true, description: 'Run ads on Fadbook & Instaglam' },
  { id: 'tiktak', name: 'TikTak Ads Manager', domain: 'ads.tiktak.com', glyph: '♪', color: '#FE2C55', bookmark: true, description: 'Run ads on TikTak' },
  { id: 'aliexprez', name: 'AliExprez', domain: 'aliexprez.com', glyph: 'A', color: '#FD384F', bookmark: true, description: 'Find products & suppliers' },
  { id: 'mineo', name: 'Mineo', domain: 'app.mineo.io', glyph: 'M', color: '#6C4DFF', bookmark: true, description: 'Spy on winning ads (subscription)' },
  { id: 'studio', name: 'CreatorHub', domain: 'creatorhub.co', glyph: '🎬', color: '#FF7A00', bookmark: true, description: 'Brief, film & order ad creatives' },
  { id: 'storefront', name: 'Your Store', domain: 'store', glyph: '🏪', color: '#121212', bookmark: false, description: 'Your live storefront' },
  { id: 'bank', name: 'Chaise Bank', domain: 'secure.chaisebank.com', glyph: '$', color: '#117ACA', bookmark: true, description: 'Checking, credit card, loans' },
  { id: 'mail', name: 'Inboxly', domain: 'mail.inboxly.com', glyph: '✉', color: '#EA4335', bookmark: true, description: 'Email' },
  { id: 'mcdoodles', name: "McDoodle's Crew", domain: 'crew.mcdoodles.com', glyph: 'M', color: '#DA291C', bookmark: true, description: 'Shifts, pay stubs, quit' },
  { id: 'zillo', name: 'Zillo', domain: 'zillo.com', glyph: '⌂', color: '#006AFF', bookmark: true, description: 'Find a new apartment' },
  { id: 'amazin', name: 'Amazin', domain: 'amazin.com', glyph: 'a', color: '#FF9900', bookmark: true, description: 'Buy gear for your setup' },
  { id: 'upworx', name: 'UpWorx', domain: 'upworx.com', glyph: 'U', color: '#14A800', bookmark: true, description: 'Hire freelancers & staff' },
  { id: 'academy', name: 'Ecom Academy', domain: 'academy.coachkev.com', glyph: '🎓', color: '#111827', bookmark: true, description: 'Metrics glossary & Coach Kev' },
]
export const siteDef = (id: SiteId) => SITES.find(s => s.id === id)!

type SiteComponent = LazyExoticComponent<ComponentType<SiteProps>>
export const SITE_COMPONENTS: Record<SiteId, SiteComponent> = {
  shopifly: lazy(() => import('./shopifly')),
  storefront: lazy(() => import('./storefront')),
  fadbook: lazy(() => import('./fadbook')),
  tiktak: lazy(() => import('./tiktak')),
  aliexprez: lazy(() => import('./aliexprez')),
  mineo: lazy(() => import('./mineo')),
  studio: lazy(() => import('./studio')),
  bank: lazy(() => import('./bank')),
  mail: lazy(() => import('./mail')),
  mcdoodles: lazy(() => import('./mcdoodles')),
  zillo: lazy(() => import('./zillo')),
  amazin: lazy(() => import('./amazin')),
  upworx: lazy(() => import('./upworx')),
  academy: lazy(() => import('./academy')),
}
