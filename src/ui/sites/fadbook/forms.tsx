// Form sections shared by the create flow and the edit drawer: audience (Advantage+ audience,
// detailed targeting, lookalike, website visitors), placements, the estimated-results pane, and
// the ad creative editor with a live phone preview.
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Clapperboard, Globe, Image as ImageIcon, Lock, Plus, Search, Users, UsersRound, Target } from 'lucide-react'
import type { Ad, CustomAudience, GameState, StoreProduct, Targeting } from '../../../core/types'
import { openSite } from '../../../core/ui'
import {
  estimateAudienceSize, estimateDailyResults, hasPixel, searchInterestsDetailed, validateTargeting, type InterestHit,
} from '../../../sim/ads'
import { formatName } from '../../../data/creativeTaxonomy'
import {
  AmButton, AmCard, AmField, AmInput, AmNotice, AmRadio, AmRadioCard, AmSegmented, AmSelect, AmTag, AudienceGauge, InfoTip, amFmt,
} from '../../kit/adsmanager'
import { AdPreview } from '../../kit/phone'
import { Floating, ImageWithFallback, formatSocialCount } from '../../kit/common'
import { productUrl, storeDomain } from './data'

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------
const AGE_OPTIONS = Array.from({ length: 48 }, (_, i) => 18 + i).map(a => ({ value: String(a), label: a === 65 ? '65+' : String(a) }))
export const GEO_LABEL: Record<Targeting['geo'], string> = {
  US: 'United States',
  T1: 'United States, Canada, United Kingdom, Australia',
}
const people = (n: number) => Math.round(n).toLocaleString('en-US')

function InterestSearch({ selected, onAdd }: { selected: string[]; onAdd: (name: string) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const hits: InterestHit[] = useMemo(() => searchInterestsDetailed(q, 'fadbook', 30), [q])
  const kindLabel = { interest: 'Interests', behavior: 'Behaviors', demographic: 'Demographics' } as const
  return (
    <div ref={anchor} className="fb-isearch">
      <AmInput
        value={q}
        onChange={v => {
          setQ(v)
          setOpen(true)
        }}
        placeholder="Add demographics, interests or behaviors"
        prefix={<Search size={15} strokeWidth={2} />}
        clearable
        ariaLabel="Search detailed targeting"
        onKeyDown={e => {
          if (e.key === 'ArrowDown') setOpen(true)
        }}
      />
      <div className="fb-isearch-open">
        <AmButton size="sm" variant="link" onClick={() => setOpen(o => !o)}>{open ? 'Hide suggestions' : 'Browse'}</AmButton>
      </div>
      <Floating anchor={anchor} open={open} onClose={() => setOpen(false)} matchWidth placement="bottom-start" className="am-root am-theme-fadbook">
        <div className="am-menu fb-isearch-menu" role="listbox">
          <div className="am-menu-scroll">
            {!hits.length && <div className="fb-isearch-empty">No results for “{q}”. Try a broader word.</div>}
            {hits.map(h => {
              const on = selected.includes(h.name)
              return (
                <button
                  key={h.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  disabled={on}
                  className="am-menu-item fb-isearch-item"
                  onClick={() => {
                    onAdd(h.name)
                    setQ('')
                    setOpen(false)
                  }}
                >
                  <span className="am-menu-item-text">
                    <span>{h.name} <span className="fb-muted">· {kindLabel[h.kind]}</span></span>
                    <span className="am-menu-item-desc">{h.path}</span>
                  </span>
                  <span className="fb-isearch-size">Size: {people(h.size * 0.85)} – {people(h.size)}</span>
                </button>
              )
            })}
          </div>
        </div>
      </Floating>
    </div>
  )
}

export interface AudienceEditorProps {
  s: GameState
  value: Targeting
  onChange: (t: Targeting) => void
  /** Advantage+ shopping: audience controls are automatic (location only) */
  advantage: boolean
  /** jump to the Audiences page */
  onManageAudiences?: () => void
}

export function AudienceEditor({ s, value, onChange, advantage, onManageAudiences }: AudienceEditorProps) {
  const audiences = s.ads.audiences
  const pixel = hasPixel(s, 'fadbook')
  const mine = useMemo(() => audiences.filter(a => a.platform === 'fadbook'), [audiences])
  const set = (p: Partial<Targeting>) => onChange({ ...value, ...p })
  const pickType = (type: Targeting['type']) => {
    if (type === value.type) return
    const pool = mine.filter(a => a.kind === type)
    set({ type, interests: type === 'interest' ? value.interests : [], audienceId: type === 'lookalike' || type === 'retargeting' ? (pool[0]?.id ?? null) : null })
  }
  const geo = (
    <AmField label="Locations" labelTip="People living in or recently in these locations.">
      <AmSelect
        value={value.geo}
        onChange={g => set({ geo: g })}
        options={[
          { value: 'US', label: GEO_LABEL.US, icon: Globe },
          { value: 'T1', label: GEO_LABEL.T1, icon: Globe, description: 'English-speaking Tier 1 countries. CPMs run a little cheaper outside the US; shipping promises must hold for every country.' },
        ]}
        ariaLabel="Locations"
      />
    </AmField>
  )
  const demo = (
    <div className="fb-form-row">
      <AmField label="Age">
        <div className="fb-inline">
          <AmSelect size="sm" width={84} value={String(value.ageMin)} onChange={v => set({ ageMin: Math.min(Number(v), value.ageMax) })} options={AGE_OPTIONS} ariaLabel="Minimum age" />
          <span className="fb-muted">–</span>
          <AmSelect size="sm" width={84} value={String(value.ageMax)} onChange={v => set({ ageMax: Math.max(Number(v), value.ageMin) })} options={AGE_OPTIONS} ariaLabel="Maximum age" />
        </div>
      </AmField>
      <AmField label="Gender">
        <AmSegmented
          value={value.gender}
          onChange={g => set({ gender: g })}
          options={[{ value: 'all', label: 'All genders' }, { value: 'male', label: 'Men' }, { value: 'female', label: 'Women' }]}
          ariaLabel="Gender"
        />
      </AmField>
    </div>
  )
  if (advantage) {
    return (
      <AmCard title="Audience" titleTip="Advantage+ shopping campaigns build the audience for you from your pixel data and creative.">
        <AmNotice tone="info" title="Advantage+ audience">
          Delivery finds the people most likely to buy using your pixel and ad engagement. Audience controls other than location aren't available in
          Advantage+ shopping campaigns.
        </AmNotice>
        {geo}
      </AmCard>
    )
  }
  const pool = mine.filter(a => a.kind === value.type)
  const err = validateTargeting(s, 'fadbook', value)
  return (
    <>
      <AmCard title="Audience" titleTip="Define who you want to see your ads. Broad audiences give the delivery system the most room to find buyers once your pixel has data.">
        <div className="fb-aud-types" role="radiogroup" aria-label="Audience type">
          <AmRadioCard
            checked={value.type === 'broad'} onSelect={() => pickType('broad')} icon={Users} title="Advantage+ audience"
            description="Broad targeting. Delivery uses your pixel and creative to find buyers."
          />
          <AmRadioCard
            checked={value.type === 'interest'} onSelect={() => pickType('interest')} icon={Target} title="Detailed targeting"
            description="Reach people by interests, behaviors and demographics."
          />
          <AmRadioCard
            checked={value.type === 'lookalike'} onSelect={() => pickType('lookalike')} icon={UsersRound} title="Lookalike audience"
            description="People similar to your purchasers."
          />
          <AmRadioCard
            checked={value.type === 'retargeting'} onSelect={() => pickType('retargeting')} icon={Clapperboard} title="Website visitors"
            description="Retarget people who visited your store."
          />
        </div>
        {(value.type === 'lookalike' || value.type === 'retargeting') && (
          <AmField
            label="Custom audiences"
            error={!pool.length ? undefined : err ?? undefined}
            help={pixel ? undefined : 'Custom audiences are built from pixel data. Connect your pixel first.'}
          >
            {pool.length ? (
              <AmSelect
                value={value.audienceId}
                onChange={id => set({ audienceId: id })}
                placeholder="Choose an audience"
                options={pool.map((a: CustomAudience) => ({
                  value: a.id, label: a.name,
                  description: `${a.kind === 'lookalike' ? 'Lookalike audience' : 'Custom audience · Website'} · Size ${people(a.size)}${a.size < 1000 ? ' · Too small to deliver well' : ''}`,
                }))}
                ariaLabel="Custom audience"
              />
            ) : (
              <AmNotice
                tone="warning"
                title={value.type === 'lookalike' ? 'No lookalike audiences yet' : 'No website audiences yet'}
                actions={onManageAudiences && <AmButton size="sm" icon={Plus} onClick={onManageAudiences}>Create new audience</AmButton>}
              >
                {value.type === 'lookalike'
                  ? 'Lookalikes need at least 100 purchasers in your pixel source audience.'
                  : 'Create a website custom audience from your pixel (visitors in the last 1–180 days).'}
              </AmNotice>
            )}
          </AmField>
        )}
        {geo}
        {demo}
        {value.type === 'interest' && (
          <AmField
            label="Detailed targeting"
            labelTip="Include people who match at least ONE of the interests, behaviors or demographics below."
            help={value.interests.length ? `${value.interests.length} of 25 selections` : 'Add at least one interest, or switch to Advantage+ audience.'}
          >
            <span className="fb-muted fb-small">Include people who match</span>
            <div className="fb-tags">
              {value.interests.map(n => (
                <AmTag key={n} tone="blue" onRemove={() => set({ interests: value.interests.filter(x => x !== n) })}>{n}</AmTag>
              ))}
            </div>
            {value.interests.length < 25 && <InterestSearch selected={value.interests} onAdd={n => set({ interests: [...value.interests, n] })} />}
          </AmField>
        )}
      </AmCard>
      <PlacementsCard value={value} onChange={onChange} />
    </>
  )
}

export function PlacementsCard({ value, onChange, locked }: { value: Targeting; onChange: (t: Targeting) => void; locked?: boolean }) {
  const manual = value.placements !== 'advantage'
  return (
    <AmCard title="Placements" titleTip="Where your ads appear across Fadbook and Instaglam.">
      {locked ? (
        <AmNotice tone="info" title="Advantage+ placements">Advantage+ shopping campaigns always use every available placement.</AmNotice>
      ) : (
        <div className="fb-stack">
          <AmRadio
            checked={!manual}
            onChange={() => onChange({ ...value, placements: 'advantage' })}
            label={<span>Advantage+ placements <AmTag tone="green">Recommended</AmTag></span>}
            description="Use Advantage+ placements to maximize your budget and help show your ads to more people. Delivery puts your budget where it's likely to perform best."
          />
          <AmRadio
            checked={manual}
            onChange={() => onChange({ ...value, placements: 'feeds' })}
            label="Manual placements"
            description="Choose the places to show your ad. The more placements you select, the more opportunities you'll have to reach your audience."
          />
          {manual && (
            <div className="fb-indent fb-stack">
              <AmRadio checked={value.placements === 'feeds'} onChange={() => onChange({ ...value, placements: 'feeds' })} label="Feeds" description="Fadbook Feed, Instaglam feed, Marketplace, Video feeds, Explore." />
              <AmRadio checked={value.placements === 'reels_stories'} onChange={() => onChange({ ...value, placements: 'reels_stories' })} label="Stories and Reels" description="Full-screen vertical placements: Fadbook and Instaglam Stories and Reels." />
            </div>
          )}
        </div>
      )}
    </AmCard>
  )
}

/** Right-pane audience definition gauge + estimated daily results. */
export function AudiencePane({ s, targeting, dailyBudget, note }: { s: GameState; targeting: Targeting; dailyBudget: number; note?: ReactNode }) {
  const size = estimateAudienceSize(s, 'fadbook', targeting)
  const est = estimateDailyResults(s, 'fadbook', targeting, Math.max(0, dailyBudget))
  const range = (r: [number, number]) => `${people(r[0])} – ${people(Math.max(r[1], r[0] === 0 ? 1 : r[1]))}`
  return (
    <div className="fb-pane-stack">
      <AmCard>
        <AudienceGauge
          estimate={[Math.round(size * 0.85), Math.max(1, Math.round(size))]}
          note={targeting.type === 'broad' ? 'Advantage+ audience may reach beyond these settings when it\'s likely to improve performance.' : note}
        />
        {targeting.type === 'retargeting' && size < 1000 && (
          <p className="fb-small fb-warn-text">Small retargeting audiences can only absorb a little budget before frequency climbs.</p>
        )}
      </AmCard>
      <AmCard title="Estimated daily results" titleTip="Estimates use market data for similar advertisers and your budget. They aren't a guarantee of results.">
        <dl className="fb-est">
          <dt>Accounts Center accounts reached</dt>
          <dd>{dailyBudget > 0 ? range(est.reach) : amFmt.dash}</dd>
          <dt>Link clicks</dt>
          <dd>{dailyBudget > 0 ? range(est.linkClicks) : amFmt.dash}</dd>
          <dt>Conversions</dt>
          <dd>
            {est.conversions && dailyBudget > 0 ? range(est.conversions) : (
              <span className="fb-muted">{hasPixel(s, 'fadbook') ? amFmt.dash : 'Unavailable: no pixel events'}</span>
            )}
          </dd>
        </dl>
        <p className="fb-small fb-muted">The accuracy of estimates is based on factors like past campaign data, the budget you entered, market data and targeting.</p>
      </AmCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ad creative
// ---------------------------------------------------------------------------
export interface AdDraft {
  name: string
  storeProductId: string
  creativeId: string
  primaryText: string
  headline: string
  cta: Ad['cta']
}
export const CTA_LABEL: Record<Ad['cta'], string> = { shop_now: 'Shop now', learn_more: 'Learn more', order_now: 'Order now', get_offer: 'Get offer' }

export function localAdError(s: GameState, a: AdDraft): string | null {
  if (!a.name.trim()) return 'Give the ad a name.'
  const sp = s.store.products.find(p => p.id === a.storeProductId)
  if (!sp || sp.status === 'archived') return 'Choose the product page people land on (Website URL).'
  const cr = s.creatives.creatives.find(c => c.id === a.creativeId)
  if (!cr) return 'Choose a creative (image or video) for the ad.'
  if (cr.status !== 'ready') return 'That creative isn\'t ready yet.'
  if (cr.catalogId !== sp.catalogId) return 'This creative shows a different product than the landing page.'
  if (!a.primaryText.trim()) return 'Enter primary text for the ad.'
  if (a.primaryText.length > 2200) return 'Primary text can be up to 2,200 characters.'
  if (a.headline.length > 255) return 'Headlines can be up to 255 characters.'
  return null
}

function CreativePicker({ s, product, value, onChange }: { s: GameState; product: StoreProduct | undefined; value: string; onChange: (id: string) => void }) {
  const list = useMemo(
    () => (product ? s.creatives.creatives.filter(c => c.catalogId === product.catalogId && c.status !== 'failed') : []),
    [s.creatives.creatives, product],
  )
  const ready = list.filter(c => c.status === 'ready')
  const pending = list.filter(c => c.status !== 'ready')
  if (!product) return <p className="fb-muted fb-small">Choose a website product first. Creatives are filtered to the product the ad links to.</p>
  return (
    <div className="fb-stack">
      {!ready.length && (
        <AmNotice
          tone="warning"
          title="No ready creatives for this product"
          actions={<AmButton size="sm" icon={Clapperboard} onClick={() => openSite('studio', '')}>Make a creative in CreatorHub</AmButton>}
        >
          Film one yourself, edit supplier footage or order from a creator. Ads need an image or video that shows this exact product.
        </AmNotice>
      )}
      <div className="fb-crgrid" role="radiogroup" aria-label="Creative">
        {ready.map(c => (
          <button key={c.id} type="button" role="radio" aria-checked={c.id === value} className={`fb-cr${c.id === value ? ' fb-cr-on' : ''}`} onClick={() => onChange(c.id)}>
            <ImageWithFallback src={c.thumb} alt={c.name} aspectRatio="4 / 5" radius={6} fallbackLabel={c.name} />
            <span className="fb-cr-badge">{c.isVideo ? <><Clapperboard size={11} strokeWidth={2.4} /> {amFmt.secs(c.durationSec)}</> : <><ImageIcon size={11} strokeWidth={2.4} /> Image</>}</span>
            <span className="fb-cr-name">{c.name}</span>
            <span className="fb-cr-meta">{formatName(c.format)}</span>
          </button>
        ))}
        {pending.map(c => (
          <div key={c.id} className="fb-cr fb-cr-pending" aria-disabled>
            <ImageWithFallback src={c.thumb} alt={c.name} aspectRatio="4 / 5" radius={6} fallbackLabel={c.name} />
            <span className="fb-cr-badge"><Lock size={11} strokeWidth={2.4} /> {c.status === 'waiting_sample' ? 'Waiting for sample' : 'In production'}</span>
            <span className="fb-cr-name">{c.name}</span>
            <span className="fb-cr-meta">{formatName(c.format)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AdCreativeEditor({ s, draft, onChange, showName = true }: { s: GameState; draft: AdDraft; onChange: (d: AdDraft) => void; showName?: boolean }) {
  const products = s.store.products.filter(p => p.status !== 'archived')
  const product = products.find(p => p.id === draft.storeProductId)
  const set = (p: Partial<AdDraft>) => onChange({ ...draft, ...p })
  const pageName = s.store.name || s.meta.playerName || 'Your store'
  return (
    <>
      {showName && (
        <AmCard title="Ad name">
          <AmInput value={draft.name} onChange={v => set({ name: v })} maxLength={400} ariaLabel="Ad name" />
        </AmCard>
      )}
      <AmCard title="Identity" titleTip="Your Fadbook Page and Instaglam account appear as the advertiser.">
        <div className="fb-identity">
          <span className="fb-avatar-tile">{pageName.slice(0, 1).toUpperCase()}</span>
          <div className="fb-stack-tight">
            <strong>{pageName}</strong>
            <span className="fb-muted fb-small">Fadbook Page · Instaglam account @{pageName.toLowerCase().replace(/[^a-z0-9]+/g, '')}</span>
          </div>
        </div>
      </AmCard>
      <AmCard title="Destination" titleTip="Where people go when they click your ad.">
        <AmField label="Website URL" error={!s.store.created ? 'Create your Shopifly store first.' : undefined}>
          {products.length ? (
            <AmSelect
              value={draft.storeProductId || null}
              onChange={id => {
                const nextProduct = products.find(p => p.id === id)
                const cr = s.creatives.creatives.find(c => c.id === draft.creativeId)
                set({ storeProductId: id, creativeId: cr && nextProduct && cr.catalogId === nextProduct.catalogId ? draft.creativeId : '' })
              }}
              placeholder="Choose a product page"
              options={products.map(p => ({
                value: p.id, label: p.title,
                description: `${productUrl(s, p)}${p.status === 'draft' ? ' · Draft: ads won\'t deliver until it\'s active' : ''}`,
              }))}
              ariaLabel="Website URL"
            />
          ) : (
            <AmNotice tone="warning" title="No products in your store" actions={<AmButton size="sm" onClick={() => openSite('shopifly', s.store.created ? 'products' : '')}>Open Shopifly</AmButton>}>
              Import a product and build its page before you advertise it.
            </AmNotice>
          )}
        </AmField>
        {product?.status === 'draft' && (
          <AmNotice tone="warning" title="Product page is a draft">
            This ad won't deliver until "{product.title}" is active in Shopifly.
          </AmNotice>
        )}
      </AmCard>
      <AmCard title="Ad creative" titleTip="Choose the image or video for your ad. Creatives come from your CreatorHub library.">
        <CreativePicker s={s} product={product} value={draft.creativeId} onChange={id => set({ creativeId: id })} />
        <AmField
          label="Primary text"
          labelTip="Primary text appears above your image or video. Around 125 characters show before “See more”."
          footerRight={<span className={`fb-small ${draft.primaryText.length > 125 ? 'fb-warn-text' : 'fb-muted'}`}>{draft.primaryText.length}/125 recommended</span>}
        >
          <AmInput value={draft.primaryText} onChange={v => set({ primaryText: v })} rows={4} maxLength={2200} placeholder="Tell people what your ad is about" ariaLabel="Primary text" />
        </AmField>
        <AmField
          label="Headline"
          labelTip="Shown in the link strip under the media in feeds. Around 40 characters display on mobile."
          footerRight={<span className={`fb-small ${draft.headline.length > 40 ? 'fb-warn-text' : 'fb-muted'}`}>{draft.headline.length}/40 recommended</span>}
        >
          <AmInput value={draft.headline} onChange={v => set({ headline: v })} maxLength={255} placeholder="Write a short headline" ariaLabel="Headline" />
        </AmField>
        <AmField label="Call to action">
          <AmSelect
            value={draft.cta}
            onChange={v => set({ cta: v })}
            options={(Object.keys(CTA_LABEL) as Ad['cta'][]).map(k => ({ value: k, label: CTA_LABEL[k] }))}
            width={220}
            ariaLabel="Call to action"
          />
        </AmField>
      </AmCard>
    </>
  )
}

/** Ad preview pane with Feed / Reels switch. */
export function AdPreviewPane({ s, draft, placements, stats }: {
  s: GameState
  draft: AdDraft
  placements: Targeting['placements']
  stats?: { likes: number; comments: number; shares: number }
}) {
  const [mode, setMode] = useState<'feed' | 'reels'>(placements === 'reels_stories' ? 'reels' : 'feed')
  const cr = s.creatives.creatives.find(c => c.id === draft.creativeId)
  const sp = s.store.products.find(p => p.id === draft.storeProductId)
  const brand = s.store.name || s.meta.playerName || 'Your store'
  const canFeed = placements !== 'reels_stories'
  const canReels = placements !== 'feeds'
  const shown = (mode === 'feed' && canFeed) || !canReels ? 'feed' : 'reels'
  return (
    <AmCard
      title="Ad preview"
      actions={
        <AmSegmented
          value={shown}
          onChange={setMode}
          options={[{ value: 'feed', label: 'Feed', disabled: !canFeed }, { value: 'reels', label: 'Reels', disabled: !canReels }]}
          ariaLabel="Preview placement"
        />
      }
    >
      <div className="fb-preview">
        <AdPreview
          platform={shown === 'feed' ? 'fadbook-feed' : 'fadbook-reels'}
          productImage={cr?.thumb ?? null}
          productName={sp?.title}
          hookText={cr?.hookText}
          caption={draft.primaryText || 'Your primary text will appear here.'}
          script={cr?.script}
          brandName={brand}
          cta={CTA_LABEL[draft.cta]}
          headline={draft.headline || sp?.title || brand}
          domain={storeDomain(s)}
          isVideo={!!cr?.isVideo}
          durationSec={cr?.durationSec ?? 15}
          likes={stats?.likes ?? 0}
          comments={stats?.comments ?? 0}
          shares={stats?.shares ?? 0}
          width={260}
        />
      </div>
      {stats && (stats.likes > 0 || stats.comments > 0) && (
        <p className="fb-small fb-muted">
          Social proof on this ad: {formatSocialCount(stats.likes)} reactions · {formatSocialCount(stats.comments)} comments · {formatSocialCount(stats.shares)} shares
        </p>
      )}
    </AmCard>
  )
}
