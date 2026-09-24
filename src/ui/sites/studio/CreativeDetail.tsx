// One creative: the ad preview, production timeline, the brief, real delivery data per ad and,
// once it has 1,000+ impressions, skill-gated insights from the ads module.
import { useMemo, useState } from 'react'
import {
  ArrowLeft, CalendarClock, Copy, ExternalLink, Eye, Heart, Lightbulb, Lock, Package, Repeat2, Send, Share2, Sparkles, XCircle,
} from 'lucide-react'
import type { Creative, GameState, Platform } from '../../../core/types'
import { act, useGS } from '../../../core/store'
import { openSite } from '../../../core/ui'
import { dayOf, formatDate, rangeLastN, rangeLifetime } from '../../../core/time'
import { compact as compactNum, money, num, pct } from '../../../core/format'
import { productImage } from '../../../core/assets'
import { ANGLES, BEATS, FORMATS, HOOKS } from '../../../data/creativeTaxonomy'
import {
  PLATFORM_NAME, TIPS_MIN_IMPRESSIONS, cancelCreative, creativeImpressions, creativeInsights, deliveryLabel, deriveMetrics,
  organicPostBlocker, startOrganicPost, statsFor, type DeliveryTone,
} from '../../../sim/ads'
import { cancelActivity } from '../../../sim/life'
import { playSfx } from '../../audio'
import { AdPreview, type AdPlatform } from '../../kit/phone'
import { cx, formatSocialCount } from '../../kit/common'
import { useBriefDraft } from './draft'
import { TaxIcon } from './icons'
import {
  AGENCY_NAME, activityEta, creativeEta, creativePerf, fmtHourAbs, fmtMinutes, productName, producerDisplay, qualityWord,
} from './helpers'
import { studioPaths } from './route'
import { Badge, ConfirmButton, EmptyBlock, Portrait, SectionCard, Segmented, Stat } from './ui'

const PREVIEW_OPTS: { value: AdPlatform; label: string }[] = [
  { value: 'tiktak', label: 'TikTak' },
  { value: 'fadbook-reels', label: 'Reels' },
  { value: 'fadbook-feed', label: 'Feed' },
]
const TONE_CLASS: Record<DeliveryTone, string> = {
  success: 'is-green', info: 'is-blue', attention: 'is-amber', warning: 'is-amber', critical: 'is-red', subdued: 'is-gray',
}

export function CreativeDetail({ id, navigate, compact }: { id: string; navigate: (p: string) => void; compact: boolean }) {
  const s = useGS(st => st)
  const c = s.creatives.creatives.find(x => x.id === id) ?? null
  if (!c) {
    return (
      <div className="ch-detail-page">
        <BackLink navigate={navigate} />
        <EmptyBlock art="search" title="Creative not found" body="It may belong to another save." compact={compact}
          actions={<button type="button" className="ch-btn ch-btn-secondary" onClick={() => navigate('library')}>Back to library</button>} />
      </div>
    )
  }
  return <DetailBody s={s} c={c} navigate={navigate} compact={compact} />
}

function BackLink({ navigate }: { navigate: (p: string) => void }) {
  return (
    <button type="button" className="ch-back" onClick={() => navigate('library')}>
      <ArrowLeft size={15} />Library
    </button>
  )
}

function DetailBody({ s, c, navigate, compact }: { s: GameState; c: Creative; navigate: (p: string) => void; compact: boolean }) {
  const perf = useMemo(() => creativePerf(s, c.id), [s, c.id])
  const [range, setRange] = useState<'life' | 'week'>('life')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const firstPlatform: AdPlatform = perf.platforms[0] === 'fadbook' ? 'fadbook-reels' : 'tiktak'
  const [platform, setPlatform] = useState<AdPlatform>(firstPlatform)
  const eta = creativeEta(s, c)
  const who = producerDisplay(s, c)
  const pname = productName(s, c.catalogId)
  const sp = s.store.products.find(p => p.catalogId === c.catalogId && p.status !== 'archived') ?? null
  const exposure = creativeImpressions(s, c.id)
  const insights = useMemo(() => creativeInsights(s, c.id), [s, c.id])
  const stats = range === 'life' ? perf.totals : perf.last7
  const m = deriveMetrics(stats)
  const hasData = perf.totals.impressions > 0 || perf.organicViews > 0
  const brand = s.store.theme?.logoText || s.store.name || 'Your Store'
  const pack = c.packId ? s.creatives.creatives.filter(x => x.packId === c.packId) : []
  const pending = c.status === 'in_production' || c.status === 'waiting_sample'
  const postBlock = sp ? organicPostBlocker(s, c.id, sp.id) : 'Add this product to your store to link a post to it.'

  const iterate = () => {
    useBriefDraft.getState().loadFromCreative(c, sp?.id ?? null)
    navigate('new')
  }
  const post = () => {
    if (!sp) return
    const out: { id: string | null } = { id: null }
    act(gs => { out.id = startOrganicPost(gs, c.id, sp.id) })
    if (out.id) { playSfx('pop'); setMsg({ tone: 'ok', text: 'Added "Post to TikTak" to your to-do queue. Views show up here once it\'s live.' }) }
    else { playSfx('error'); setMsg({ tone: 'err', text: postBlock ?? 'Couldn\'t queue the post.' }) }
  }
  const cancel = () => {
    act(gs => {
      const acts = [gs.player.activity, ...gs.player.queue].filter(a => a?.payload?.creativeId === c.id)
      for (const a of acts) if (a) cancelActivity(gs, a.id)
      cancelCreative(gs, c.id)
    })
    playSfx('click')
    setMsg({ tone: 'ok', text: 'Order cancelled.' })
  }

  const previewLikes = hasData ? perf.totals.likes : 2384
  const previewComments = hasData ? perf.totals.comments : 96
  const previewShares = hasData ? perf.totals.shares : 171

  return (
    <div className="ch-detail-page">
      <BackLink navigate={navigate} />
      <div className="ch-pagehead ch-pagehead-detail">
        <div className="ch-minw0">
          <div className="ch-detail-badges">
            <Badge tone={eta.tone} dot>{eta.badge}</Badge>
            <Badge tone="subdued">{FORMATS[c.format]?.name}</Badge>
            {c.packId && <Badge tone="info">Agency pack</Badge>}
            {c.shared && <Badge tone="warning">Shared footage</Badge>}
          </div>
          <h1 className="ch-h1 ch-ellipsis">{c.name}</h1>
          <p className="ch-sub ch-ellipsis" title={pname}>Briefed {formatDate(dayOf(c.orderedHour), 'medium')} · {pname}</p>
        </div>
        <div className="ch-pagehead-actions ch-wrap">
          {c.status === 'ready' && (
            <>
              <button type="button" className="ch-btn ch-btn-secondary ch-btn-sm" onClick={() => openSite('fadbook', `create/creative/${c.id}`)}>Use in Fadbook <ExternalLink size={12} /></button>
              <button type="button" className="ch-btn ch-btn-secondary ch-btn-sm" onClick={() => openSite('tiktak', `campaign/create/creative/${c.id}`)}>Use in TikTak <ExternalLink size={12} /></button>
              {c.isVideo && (
                <button type="button" className="ch-btn ch-btn-secondary ch-btn-sm" disabled={!!postBlock} title={postBlock ?? 'Post it organically on TikTak (takes about an hour)'} onClick={post}>
                  <Send size={13} />Post to TikTak
                </button>
              )}
            </>
          )}
          <button type="button" className="ch-btn ch-btn-primary ch-btn-sm" onClick={iterate}><Copy size={13} />Brief a variation</button>
        </div>
      </div>
      {msg && <div className={cx('ch-flash', msg.tone === 'err' && 'is-err')} role="status">{msg.text}<button type="button" className="ch-icon-btn" aria-label="Dismiss" onClick={() => setMsg(null)}>×</button></div>}

      <div className={cx('ch-detail-grid', compact && 'is-compact')}>
        <div className="ch-detail-side">
          <div className="ch-preview">
            <div className="ch-preview-head">
              <span className="ch-kicker">Preview</span>
              <Segmented size="sm" options={PREVIEW_OPTS} value={platform} onChange={setPlatform} ariaLabel="Preview placement" />
            </div>
            <div className="ch-preview-phone">
              <AdPreview
                platform={platform}
                productImage={c.thumb || productImage(c.catalogId)}
                productName={pname}
                hookText={c.hookText}
                caption={sp?.title ?? pname}
                script={c.script}
                brandName={brand}
                likes={previewLikes}
                comments={previewComments}
                shares={previewShares}
                isVideo={c.isVideo}
                durationSec={c.durationSec || 15}
                headline={sp?.title ?? pname}
                linkDescription={sp ? money(sp.price) : undefined}
                domain={s.store.customDomain || s.store.subdomain || undefined}
                playing={c.status === 'ready'}
                width={compact ? 220 : 240}
              />
            </div>
            <p className="ch-preview-foot">{hasData ? 'Engagement shown is real, summed across every ad and post.' : 'Engagement counts are placeholders until it runs.'}</p>
          </div>
        </div>

        <div className="ch-detail-main">
          {/* ---- status ---- */}
          <SectionCard title="Production" subtitle={eta.text}>
            <Timeline s={s} c={c} />
            <div className="ch-prod-grid">
              <div className="ch-prod-who">
                {who.portrait ? <Portrait id={who.portrait} name={who.name} size={36} /> : <span className="ch-mini-avatar ch-mini-avatar-lg">{c.producer === 'agency' ? 'NC' : (s.player.name || 'Y').slice(0, 1).toUpperCase()}</span>}
                <span><b>{who.name}</b><small>{who.sub}</small></span>
              </div>
              <Stat label="Cost" value={c.cost > 0 ? money(c.cost) : 'Free'} sub={c.packId ? 'Share of the 3-video pack' : undefined} />
              <Stat label="Footage" value={c.status === 'ready' ? qualityWord(c.quality) : pending ? 'In progress' : '—'} sub={c.style ? (c.style === 'native' ? 'Native, feels organic' : 'Polished, ad-style') : undefined} />
              <Stat label={c.isVideo ? 'Length' : 'Type'} value={c.isVideo ? `${c.durationSec || '—'}s` : c.format === 'carousel' ? `${c.beats.length} cards` : 'Still'} />
            </div>
            {c.shared && <p className="ch-help"><Repeat2 size={12} /> Built from the supplier's footage, which other stores run too.</p>}
            {pending && (
              <div className="ch-cancel-row">
                <ConfirmButton tone="danger" className="ch-btn-sm" icon={<XCircle size={13} />} dismissLabel="Keep it"
                  confirmLabel={c.cost > 0 ? `Yes, cancel (${money(c.cost)} is not refunded)` : 'Yes, cancel'}
                  onConfirm={cancel}>
                  Cancel {c.producer === 'self' ? 'shoot' : c.producer === 'supplier_edit' ? 'edit' : 'order'}
                </ConfirmButton>
              </div>
            )}
            {pack.length > 1 && (
              <div className="ch-pack">
                <span className="ch-kicker">From the same {AGENCY_NAME} pack</span>
                <div className="ch-pack-list">
                  {pack.map(x => (
                    <button key={x.id} type="button" className={cx('ch-pack-item', x.id === c.id && 'is-on')} onClick={() => navigate(studioPaths.creative(x.id))}>
                      <span className="ch-ellipsis">{x.name}</span>
                      <small className="ch-ellipsis">{x.hookText || 'No hook text'}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          {/* ---- performance ---- */}
          <SectionCard
            title="Performance"
            subtitle={hasData ? `Across ${perf.ads.length} ad${perf.ads.length === 1 ? '' : 's'}${perf.posts.length ? ` and ${perf.posts.length} organic post${perf.posts.length === 1 ? '' : 's'}` : ''}. Purchases and ROAS are as reported by the ad platforms.` : undefined}
            actions={hasData ? <Segmented size="sm" value={range} onChange={setRange} options={[{ value: 'life', label: 'Lifetime' }, { value: 'week', label: 'Last 7 days' }]} ariaLabel="Date range" /> : undefined}
          >
            {!hasData ? (
              <div className="ch-nodata">
                <Package size={18} />
                <div>
                  <b>{c.status === 'ready' ? (perf.ads.length ? 'In ads, waiting for delivery' : 'Not running yet') : c.status === 'failed' ? 'Nothing to report' : 'No data yet'}</b>
                  <span>{c.status === 'ready' ? 'Launch it in an ad on Fadbook or TikTak. Spend, CTR and hook rate show up here as it delivers.' : c.status === 'failed' ? 'No footage was delivered, so this creative never ran. Brief a variation to try again.' : 'Once it\'s delivered and running in ads, its numbers show up here.'}</span>
                </div>
              </div>
            ) : (
              <>
                <div className={cx('ch-kpis', compact && 'is-compact')}>
                  <Stat label="Amount spent" value={money(stats.spend)} />
                  <Stat label="Impressions" value={num(stats.impressions)} />
                  <Stat label="CTR (link)" value={stats.impressions ? pct(m.ctrLink) : '—'} />
                  <Stat label="CPC (link)" value={stats.linkClicks ? money(m.cpcLink) : '—'} />
                  <Stat label="CPM" value={stats.impressions ? money(m.cpm) : '—'} />
                  {c.isVideo && <Stat label="Hook rate" value={stats.impressions ? pct(m.hookRate, 1) : '—'} title="Short video views (3s Fadbook / 2s TikTak) ÷ impressions" />}
                  {c.isVideo && <Stat label="Hold rate" value={stats.videoViewsShort ? pct(m.holdRate, 1) : '—'} title="ThruPlays (Fadbook) or 6s views (TikTak) ÷ short views" />}
                  <Stat label="Purchases" value={num(stats.purchases)} sub="reported" />
                  <Stat label="Cost / purchase" value={stats.purchases ? money(m.cpa) : '—'} sub="reported" />
                  <Stat label="ROAS" value={stats.spend ? m.roas.toFixed(2) : '—'} sub="reported" />
                </div>
                {perf.ads.length > 0 && <AdsTable s={s} adIds={perf.ads.map(a => a.id)} range={range} />}
                {perf.posts.length > 0 && (
                  <div className="ch-posts">
                    <span className="ch-kicker">Organic TikTak posts</span>
                    {perf.posts.map(p => (
                      <div key={p.id} className="ch-post-row">
                        <span className="ch-muted">{fmtHourAbs(p.postedHour)}</span>
                        <span><Eye size={12} />{formatSocialCount(p.views)}</span>
                        <span><Heart size={12} />{formatSocialCount(p.likes)}</span>
                        <span><Share2 size={12} />{formatSocialCount(p.shares)}</span>
                        {p.sparked && <Badge tone="accent">Spark Ad</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </SectionCard>

          {/* ---- insights ---- */}
          <SectionCard title={<><Lightbulb size={16} /> Insights</>}>
            {c.status === 'failed' ? (
              <p className="ch-help">No delivery data: this creative never ran.</p>
            ) : c.status !== 'ready' ? (
              <p className="ch-help">Insights come from real delivery data, so they appear after the creative runs.</p>
            ) : exposure < TIPS_MIN_IMPRESSIONS ? (
              <div className="ch-locked">
                <Lock size={16} />
                <div>
                  <b>Unlocks at {num(TIPS_MIN_IMPRESSIONS)} impressions</b>
                  <span>{num(exposure)} so far. Before that, any read on this creative would be a guess.</span>
                  <div className="ch-progress"><span style={{ width: `${Math.min(100, (exposure / TIPS_MIN_IMPRESSIONS) * 100)}%` }} /></div>
                </div>
              </div>
            ) : insights.length ? (
              <>
                <ul className="ch-insights">
                  {insights.map((t, i) => <li key={i}><Sparkles size={14} /><span>{t}</span></li>)}
                </ul>
                <p className="ch-help">Reads get more specific as your Creative and Media Buying skills grow.</p>
              </>
            ) : (
              <p className="ch-help">Nothing stands out yet. Keep it running and check back.</p>
            )}
          </SectionCard>

          {/* ---- brief ---- */}
          <SectionCard title="Brief" actions={<button type="button" className="ch-link-btn" onClick={iterate}><Copy size={12} />Reuse as new brief</button>}>
            <div className="ch-brief-facts">
              <div><span className="ch-kicker">Format</span><b><TaxIcon name={FORMATS[c.format]?.icon ?? ''} size={14} />{FORMATS[c.format]?.name}</b></div>
              <div><span className="ch-kicker">Hook</span><b><TaxIcon name={HOOKS[c.hook]?.icon ?? ''} size={14} />{HOOKS[c.hook]?.name}</b></div>
              <div><span className="ch-kicker">Angle</span><b><TaxIcon name={ANGLES[c.angle]?.icon ?? ''} size={14} />{ANGLES[c.angle]?.name}</b></div>
            </div>
            <div className="ch-detail-block">
              <span className="ch-kicker">Beats</span>
              {c.beats.length ? (
                <ol className="ch-beats is-static">
                  {c.beats.map((b, i) => (
                    <li key={i} className="ch-beat">
                      <span className="ch-beat-num">{i + 1}</span>
                      <span className="ch-beat-icon"><TaxIcon name={BEATS[b]?.icon ?? ''} size={13} /></span>
                      <span className="ch-beat-name">{BEATS[b]?.name ?? b}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="ch-help">No beats.</p>}
            </div>
            <div className="ch-detail-block">
              <span className="ch-kicker">On-screen hook text</span>
              {c.hookText ? <p className="ch-quote">{c.hookText}</p> : <p className="ch-help">None</p>}
            </div>
            {c.script && (
              <div className="ch-detail-block">
                <span className="ch-kicker">Script</span>
                <p className="ch-script-text">{c.script}</p>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function AdsTable({ s, adIds, range }: { s: GameState; adIds: string[]; range: 'life' | 'week' }) {
  const today = dayOf(s.time.hour)
  const r = range === 'life' ? rangeLifetime(today) : rangeLastN(today, 7)
  const rows = adIds.map(id => {
    const ad = s.ads.ads.find(a => a.id === id)!
    const st = statsFor(s, 'ad', id, r)
    return { ad, d: deliveryLabel(s, 'ad', id), st, m: deriveMetrics(st) }
  })
  return (
    <div className="ch-table-wrap">
      <table className="ch-table">
        <thead>
          <tr>
            <th>Ad</th><th>Delivery</th><th className="is-num">Spent</th><th className="is-num">Impr.</th><th className="is-num">CTR</th><th className="is-num">Hook</th><th className="is-num">CPA</th><th className="is-num">ROAS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ ad, d, st, m }) => (
            <tr key={ad.id}>
              <td>
                <button type="button" className="ch-table-link" onClick={() => openSite(ad.platform)} title={`Open ${PLATFORM_NAME[ad.platform as Platform]} Ads Manager`}>
                  <span className={cx('ch-plat', `ch-plat-${ad.platform}`)}>{ad.platform === 'tiktak' ? 'TT' : 'FB'}</span>
                  <span className="ch-ellipsis">{ad.name}</span>
                </button>
              </td>
              <td><span className={cx('ch-dotlabel', TONE_CLASS[d.tone])} title={d.detail}>{d.label}</span></td>
              <td className="is-num">{money(st.spend)}</td>
              <td className="is-num">{compactNum(st.impressions)}</td>
              <td className="is-num">{st.impressions ? pct(m.ctrLink) : '—'}</td>
              <td className="is-num">{st.impressions && st.videoViewsShort ? pct(m.hookRate, 1) : '—'}</td>
              <td className="is-num">{st.purchases ? money(m.cpa) : '—'}</td>
              <td className="is-num">{st.spend ? m.roas.toFixed(2) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
interface TLStep { label: string; when: string | null; state: 'done' | 'now' | 'next' | 'fail' }
function Timeline({ s, c }: { s: GameState; c: Creative }) {
  const hour = s.time.hour
  const ordered = fmtHourAbs(c.orderedHour)
  const ready = c.readyHour != null ? fmtHourAbs(c.readyHour) : null
  const steps: TLStep[] = []
  const done = c.status === 'ready'
  const failed = c.status === 'failed'
  switch (c.producer) {
    case 'self':
    case 'supplier_edit': {
      const verb = c.producer === 'self' ? 'Filming & editing' : 'Editing supplier footage'
      const eta = activityEta(s, c.id)
      steps.push({ label: 'Briefed', when: ordered, state: 'done' })
      steps.push({
        label: verb,
        when: done ? null : eta ? (eta.running ? `${fmtMinutes(eta.leftMin)} left` : `starts in ~${fmtMinutes(eta.startsInMin)}`) : null,
        state: done ? 'done' : failed ? 'fail' : eta?.running ? 'now' : 'next',
      })
      steps.push({ label: 'In your library', when: ready ?? (eta ? `~${fmtHourAbs(hour + Math.ceil(eta.leftMin / 60))}` : null), state: done ? 'done' : 'next' })
      break
    }
    case 'ugc': {
      const arrived = c.sampleArriveHour != null && hour >= c.sampleArriveHour
      steps.push({ label: 'Brief sent & paid', when: ordered, state: 'done' })
      steps.push({ label: 'Product shipping to creator', when: c.sampleArriveHour != null ? `arrives ${formatDate(dayOf(c.sampleArriveHour), 'md')}` : null, state: arrived || done ? 'done' : failed ? 'fail' : 'now' })
      steps.push({ label: 'Creator filming', when: null, state: done ? 'done' : failed ? 'fail' : arrived ? 'now' : 'next' })
      steps.push({ label: 'Video delivered', when: ready ? (done ? ready : `due ${formatDate(dayOf(c.readyHour!), 'md')}`) : null, state: done ? 'done' : 'next' })
      break
    }
    case 'agency':
      steps.push({ label: 'Pack ordered & paid', when: ordered, state: 'done' })
      steps.push({ label: 'In the studio', when: null, state: done ? 'done' : failed ? 'fail' : 'now' })
      steps.push({ label: 'Delivered', when: ready ? (done ? ready : `due ${formatDate(dayOf(c.readyHour!), 'md')}`) : null, state: done ? 'done' : 'next' })
      break
    case 'staff':
      steps.push({ label: 'Assigned', when: ordered, state: 'done' })
      steps.push({ label: 'Filming', when: null, state: done ? 'done' : failed ? 'fail' : 'now' })
      steps.push({ label: 'Delivered', when: ready ? (done ? ready : `due ${formatDate(dayOf(c.readyHour!), 'md')}`) : null, state: done ? 'done' : 'next' })
      break
  }
  return (
    <>
      <ol className="ch-tl">
        {steps.map((st, i) => (
          <li key={i} className={`is-${st.state}`}>
            <i aria-hidden />
            <span className="ch-tl-label">{st.label}</span>
            {st.when && <span className="ch-tl-when"><CalendarClock size={11} />{st.when}</span>}
          </li>
        ))}
      </ol>
      {failed && <p className="ch-fail"><XCircle size={14} />{c.failReason ?? 'Production stopped.'}</p>}
    </>
  )
}

