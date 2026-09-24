// Side drawer to edit a campaign / ad group / ad, and to view its daily data.
import { useMemo, useState, type ReactNode } from 'react'
import { Copy, RotateCcw, Trash2 } from 'lucide-react'
import type { Ad, AdLevel, AdSet, Campaign, GameState, Targeting } from '../../../../core/types'
import { act } from '../../../../core/store'
import type { DateRange } from '../../../../core/time'
import { formatDate } from '../../../../core/time'
import {
  MB_GATES, creativeInsights, deliveryLabel, duplicateEntity, featureUnlocked, learningProgress, requestAdReview, setEntityStatus,
  updateAd, updateAdSet, updateCampaign, validateTargeting, wouldResetLearning, TIPS_MIN_IMPRESSIONS, creativeImpressions,
} from '../../../../sim/ads'
import {
  AmButton, AmCard, AmField, AmInput, AmModal, AmNotice, AmSegmented, AmSelect, SideDrawer, StatusCell, amFmt, checkBudgetEdit,
  learningResetThreshold, minDailyBudget,
} from '../../../kit/adsmanager'
import { LineChartCard, CHART_COLORS } from '../../../kit/charts'
import { AdPreview } from '../../../kit/phone'
import { cx } from '../../../kit/common'
import { TriangleAlert } from 'lucide-react'
import { BENCHMARKS } from '../../../../data/benchmarks'
import { useGame, useTt } from '../common'
import {
  CTA_LABEL, METRICS, TT_CTAS, accountData, adsUnder, bidLabel, breakEvenFor, dailySeries, identityName, landingProductOf,
  optimizationLabel, productUrl, entityDisplayId, retentionSteps, type MetricId,
} from '../data'
import { TargetingEditor, targetingSummary } from './create/Targeting'
import { CreativePicker, creativeThumb } from './create/Pickers'

export interface DrawerTarget { level: AdLevel; id: string; tab: 'settings' | 'data' }

const CHART_METRICS: MetricId[] = ['cost', 'conversions', 'cpa', 'roas', 'ctr', 'cpm', 'frequency']
const LEVEL_WORD: Record<AdLevel, string> = { campaign: 'campaign', adset: 'ad group', ad: 'ad' }

export function EditDrawer({ target, onClose, range, accountId }: { target: DrawerTarget | null; onClose: () => void; range: DateRange; accountId: string }) {
  const s = useGame()
  const [tab, setTab] = useState<'settings' | 'data'>(target?.tab ?? 'settings')
  const [key, setKey] = useState(target ? `${target.level}:${target.id}:${target.tab}` : '')
  const curKey = target ? `${target.level}:${target.id}:${target.tab}` : ''
  if (curKey !== key) {
    setKey(curKey)
    if (target) setTab(target.tab)
  }
  if (!target) return null
  const entity = target.level === 'campaign' ? s.ads.campaigns.find(c => c.id === target.id) : target.level === 'adset' ? s.ads.adSets.find(a => a.id === target.id) : s.ads.ads.find(a => a.id === target.id)
  if (!entity) return null
  return (
    <SideDrawer
      open
      onClose={onClose}
      inline
      pauseGame={tab === 'settings'}
      width={620}
      title={entity.name}
      subtitle={`${target.level === 'campaign' ? 'Campaign' : target.level === 'adset' ? 'Ad group' : 'Ad'} ID: ${entityDisplayId(entity.id)}`}
      tabs={[{ id: 'settings', label: 'Settings' }, { id: 'data', label: 'Data' }]}
      activeTab={tab}
      onTabChange={id => setTab(id as 'settings' | 'data')}
    >
      {tab === 'settings'
        ? <Settings key={curKey} s={s} level={target.level} id={target.id} onClose={onClose} />
        : <DataTab s={s} level={target.level} id={target.id} range={range} accountId={accountId} />}
    </SideDrawer>
  )
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function Settings({ s, level, id, onClose }: { s: GameState; level: AdLevel; id: string; onClose: () => void }) {
  if (level === 'campaign') return <CampaignSettings s={s} c={s.ads.campaigns.find(x => x.id === id)!} onClose={onClose} />
  if (level === 'adset') return <AdGroupSettings s={s} set={s.ads.adSets.find(x => x.id === id)!} onClose={onClose} />
  return <AdSettings s={s} ad={s.ads.ads.find(x => x.id === id)!} onClose={onClose} />
}

function StatusBlock({ s, level, id }: { s: GameState; level: AdLevel; id: string }) {
  const d = deliveryLabel(s, level, id)
  const lp = level === 'adset' ? learningProgress(s, id) : null
  return (
    <AmCard title="Status">
      <div className="tt-col" style={{ gap: 8 }}>
        <StatusCell label={d.label} detail={d.detail} />
        {lp && lp.state !== 'active' && (
          <div className="tt-col" style={{ gap: 4 }}>
            <div className={cx('tt-progress', lp.state === 'learning_limited' && 'tt-progress-warn')}><span style={{ width: `${Math.min(100, (lp.conversions / lp.needed) * 100)}%` }} /></div>
            <span className="tt-faint tt-small">
              {lp.hasPixel ? `${lp.conversions} of ${lp.needed} conversions in the last 7 days${lp.state === 'learning' ? ` · ${lp.daysLeft} day${lp.daysLeft === 1 ? '' : 's'} left in the learning window` : ''}` : 'No pixel events: this ad group can\'t exit learning.'}
            </span>
          </div>
        )}
      </div>
    </AmCard>
  )
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="tt-row" style={{ justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>{children}</div>
}

function EntityActions({ level, id, onClose }: { level: AdLevel; id: string; onClose: () => void }) {
  const { navigate } = useTt()
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <AmCard title="More actions">
        <div className="tt-row">
          <AmButton size="sm" icon={Copy} onClick={() => { act(st => { duplicateEntity(st, level, id) }); onClose() }}>Duplicate</AmButton>
          {level === 'campaign' && <AmButton size="sm" onClick={() => navigate(`campaign/create/adgroup/${id}`)}>Add ad group</AmButton>}
          {level === 'adset' && <AmButton size="sm" onClick={() => navigate(`campaign/create/ad/${id}`)}>Add ad</AmButton>}
          <AmButton size="sm" variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>Delete</AmButton>
        </div>
      </AmCard>
      <AmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        inline
        size="sm"
        title={`Delete this ${LEVEL_WORD[level]}?`}
        footer={<><AmButton onClick={() => setConfirm(false)}>Cancel</AmButton><AmButton variant="danger" onClick={() => { act(st => setEntityStatus(st, level, id, 'deleted')); setConfirm(false); onClose() }}>Delete</AmButton></>}
      >
        <span style={{ fontSize: 13 }}>Deleted {LEVEL_WORD[level]}s stop delivering and can&apos;t be turned back on. {level !== 'ad' ? 'Everything inside it is deleted too. ' : ''}Past data stays in your reports.</span>
      </AmModal>
    </>
  )
}

function budgetWarning(s: GameState, level: 'campaign' | 'adset', id: string, current: number | null, next: number, learning: boolean, lastChangeHour?: number): { error?: string; warning?: string; note?: string } {
  const inLearning = BENCHMARKS.tiktak.maxBudgetIncreaseInLearning
  const thr = learning ? Math.max(learningResetThreshold('tiktak'), inLearning) : learningResetThreshold('tiktak')
  const chk = checkBudgetEdit('tiktak', current, next, { level, threshold: thr })
  if (chk.error) return { error: chk.error }
  // the sim knows the real baseline (budget at the last reset, re-anchored after 48 quiet hours)
  const resets = Number.isFinite(next) && next !== current && wouldResetLearning(s, level, id, next)
  const pct = current ? Math.round(Math.abs((next - current) / current) * 100) : 0
  const warning = resets
    ? `This ${pct}% change is a significant edit and will send ${level === 'campaign' ? 'the ad groups' : 'this ad group'} back into the learning phase. TikTak recommends changes of ${Math.round(learningResetThreshold('tiktak') * 100)}% or less (${Math.round(inLearning * 100)}% while learning), at least 48 hours apart.`
    : undefined
  const hoursSince = lastChangeHour != null ? s.time.hour - lastChangeHour : Infinity
  const note = hoursSince < 48 && next !== current ? `The budget was last changed ${Math.max(1, Math.round(hoursSince))}h ago. TikTak recommends waiting at least 48 hours between budget edits.` : undefined
  return { warning, note }
}

function CampaignSettings({ s, c, onClose }: { s: GameState; c: Campaign; onClose: () => void }) {
  const [name, setName] = useState(c.name)
  const [budget, setBudget] = useState(c.dailyBudget != null ? c.dailyBudget.toFixed(2) : '')
  const [bid, setBid] = useState(c.bidStrategy)
  const [costCap, setCostCap] = useState(c.costCap != null ? String(c.costCap) : '')
  const costCapOk = featureUnlocked(s, 'costCap')
  const deleted = c.status === 'deleted'
  const nextBudget = Number(budget)
  const learning = s.ads.adSets.some(x => x.campaignId === c.id && x.status === 'active' && x.learning.state === 'learning')
  const bw = c.budgetMode === 'cbo' ? budgetWarning(s, 'campaign', c.id, c.dailyBudget, nextBudget, learning, c.lastBudgetChangeHour) : {}
  const be = breakEvenFor(s, landingProductOf(s.ads.ads.filter(a => a.campaignId === c.id)))
  const dirty = name.trim() !== c.name || (c.budgetMode === 'cbo' && nextBudget !== c.dailyBudget) || bid !== c.bidStrategy || (bid === 'cost_cap' && Number(costCap) !== c.costCap)
  const costCapErr = bid === 'cost_cap' && !(Number(costCap) > 0) ? 'Enter a cost per conversion goal.' : undefined
  const save = () => {
    if (bw.error || costCapErr) return
    act(st => {
      updateCampaign(st, c.id, {
        name: name.trim(),
        dailyBudget: c.budgetMode === 'cbo' ? nextBudget : undefined,
        bidStrategy: bid,
        costCap: bid === 'cost_cap' ? Number(costCap) : undefined,
      })
    })
    onClose()
  }
  return (
    <>
      <StatusBlock s={s} level="campaign" id={c.id} />
      <AmCard title="Campaign details">
        <div className="tt-fields">
          <AmField label="Campaign name"><AmInput value={name} onChange={setName} disabled={deleted} /></AmField>
          <div className="tt-kv" style={{ gridTemplateColumns: 'minmax(120px, max-content) 1fr' }}>
            <dt>Objective</dt><dd>Web conversions</dd>
            <dt>Campaign type</dt><dd>{c.kind === 'advantage' ? 'Smart+ campaign' : 'Manual campaign'}</dd>
            <dt>Budget type</dt><dd>{c.budgetMode === 'cbo' ? 'Campaign budget optimization' : 'Ad group budgets'}</dd>
            <dt>Created</dt><dd>{formatDate(Math.floor(c.createdHour / 24), 'medium')}</dd>
          </div>
          {c.budgetMode === 'cbo' && (
            <AmField label="Daily budget" error={bw.error} warning={bw.warning} help={bw.note ?? `Minimum ${amFmt.money(minDailyBudget('tiktak', 'campaign'))} per day`}>
              <AmInput value={budget} onChange={setBudget} type="currency" prefix="$" suffix="USD" width={240} disabled={deleted} />
            </AmField>
          )}
        </div>
      </AmCard>
      <AmCard title="Bidding">
        <div className="tt-fields">
          <AmField label="Bid strategy">
            <AmSegmented value={bid} onChange={v => setBid(v)} options={[{ value: 'lowest_cost', label: 'Maximum delivery' }, { value: 'cost_cap', label: 'Cost cap', disabled: !costCapOk && c.bidStrategy !== 'cost_cap' }]} />
          </AmField>
          {!costCapOk && <span className="tt-faint tt-small">Cost cap unlocks at Media Buying level {MB_GATES.costCap}.</span>}
          {bid === 'cost_cap' && (
            <AmField label="Cost per conversion goal" error={costCapErr} help={be ? `Break-even cost per purchase for “${be.product.title}”: ${amFmt.money(be.cpa)}.` : undefined}>
              <AmInput value={costCap} onChange={setCostCap} type="currency" prefix="$" suffix="USD" width={200} disabled={deleted} />
            </AmField>
          )}
          {bid !== c.bidStrategy && <AmNotice tone="warning">Changing the bid strategy resets the learning phase for every ad group in this campaign.</AmNotice>}
        </div>
      </AmCard>
      {!deleted && <EntityActions level="campaign" id={c.id} onClose={onClose} />}
      {!deleted && (
        <Footer>
          <AmButton onClick={onClose}>Cancel</AmButton>
          <AmButton variant="primary" disabled={!dirty || !!bw.error || !!costCapErr} onClick={save}>Save</AmButton>
        </Footer>
      )}
    </>
  )
}

function AdGroupSettings({ s, set, onClose }: { s: GameState; set: AdSet; onClose: () => void }) {
  const c = s.ads.campaigns.find(x => x.id === set.campaignId)!
  const [name, setName] = useState(set.name)
  const [budget, setBudget] = useState(set.dailyBudget != null ? set.dailyBudget.toFixed(2) : '')
  const [opt, setOpt] = useState(set.optimization)
  const [targeting, setTargeting] = useState<Targeting>(set.targeting)
  const deleted = set.status === 'deleted'
  const nextBudget = Number(budget)
  const bw = c.budgetMode === 'abo' ? budgetWarning(s, 'adset', set.id, set.dailyBudget, nextBudget, set.learning.state === 'learning', set.lastBudgetChangeHour) : {}
  const targetingChanged = JSON.stringify(targeting) !== JSON.stringify(set.targeting)
  const tErr = targetingChanged ? validateTargeting(s, 'tiktak', targeting) : null
  const dirty = name.trim() !== set.name || (c.budgetMode === 'abo' && nextBudget !== set.dailyBudget) || opt !== set.optimization || targetingChanged
  const save = () => {
    if (bw.error || tErr) return
    act(st => {
      updateAdSet(st, set.id, {
        name: name.trim(),
        dailyBudget: c.budgetMode === 'abo' ? nextBudget : undefined,
        optimization: opt,
        targeting: targetingChanged ? targeting : undefined,
      })
    })
    onClose()
  }
  return (
    <>
      <StatusBlock s={s} level="adset" id={set.id} />
      <AmCard title="Ad group details">
        <div className="tt-fields">
          <AmField label="Ad group name"><AmInput value={name} onChange={setName} disabled={deleted} /></AmField>
          <div className="tt-kv" style={{ gridTemplateColumns: 'minmax(120px, max-content) 1fr' }}>
            <dt>Campaign</dt><dd>{c.name}</dd>
            <dt>Placement</dt><dd>TikTak</dd>
            <dt>Bid strategy</dt><dd>{bidLabel(c)}</dd>
          </div>
          {c.budgetMode === 'abo' ? (
            <AmField label="Daily budget" error={bw.error} warning={bw.warning} help={bw.note ?? `Minimum ${amFmt.money(minDailyBudget('tiktak', 'adset'))} per day`}>
              <AmInput value={budget} onChange={setBudget} type="currency" prefix="$" suffix="USD" width={240} disabled={deleted} />
            </AmField>
          ) : (
            <span className="tt-muted" style={{ fontSize: 13 }}>Budget is set at the campaign level ({amFmt.money(c.dailyBudget)} daily).</span>
          )}
          <AmField label="Optimization event">
            <AmSelect value={opt} onChange={v => setOpt(v)} options={[{ value: 'purchase', label: 'Complete payment' }, { value: 'add_to_cart', label: 'Add to cart' }]} width={260} disabled={deleted} />
          </AmField>
        </div>
      </AmCard>
      <AmCard title="Targeting" subtitle={targetingSummary(s, targeting)}>
        {deleted ? <span className="tt-muted tt-small">{targetingSummary(s, set.targeting)}</span> : <TargetingEditor s={s} value={targeting} onChange={setTargeting} locked={c.kind === 'advantage'} />}
        {tErr && <div style={{ marginTop: 10 }}><AmNotice tone="error">{tErr}</AmNotice></div>}
      </AmCard>
      {(targetingChanged || opt !== set.optimization) && set.impressions > 0 && (
        <AmNotice tone="warning" title="Significant edit">Editing targeting or the optimization event restarts the learning phase for this ad group.</AmNotice>
      )}
      {!deleted && <EntityActions level="adset" id={set.id} onClose={onClose} />}
      {!deleted && (
        <Footer>
          <AmButton onClick={onClose}>Cancel</AmButton>
          <AmButton variant="primary" disabled={!dirty || !!bw.error || !!tErr} onClick={save}>Save</AmButton>
        </Footer>
      )}
    </>
  )
}

function AdSettings({ s, ad, onClose }: { s: GameState; ad: Ad; onClose: () => void }) {
  const [name, setName] = useState(ad.name)
  const [text, setText] = useState(ad.primaryText)
  const [cta, setCta] = useState(ad.cta)
  const [creativeId, setCreativeId] = useState(ad.creativeId)
  const deleted = ad.status === 'deleted'
  const product = s.store.products.find(p => p.id === ad.storeProductId)
  const cr = s.creatives.creatives.find(c => c.id === creativeId)
  const spark = !!ad.sparkPostId
  const post = spark ? s.ads.organicPosts.find(p => p.id === ad.sparkPostId) : undefined
  const textErr = !spark && (!text.trim() ? 'Enter ad text.' : text.trim().length > 100 ? 'Ad text can be up to 100 characters.' : undefined)
  const contentChanged = text.trim() !== ad.primaryText || cta !== ad.cta || creativeId !== ad.creativeId
  const dirty = name.trim() !== ad.name || contentChanged
  const save = () => {
    if (textErr) return
    act(st => {
      updateAd(st, ad.id, { name: name.trim(), primaryText: spark ? undefined : text.trim(), cta, creativeId })
    })
    onClose()
  }
  return (
    <>
      <StatusBlock s={s} level="ad" id={ad.id} />
      {ad.review === 'rejected' && (
        <AmNotice tone="error" title="Ad not approved" actions={!deleted ? <AmButton size="sm" icon={RotateCcw} onClick={() => act(st => requestAdReview(st, ad.id))}>Request review</AmButton> : undefined}>
          {ad.rejectReason ?? 'This ad doesn\'t follow our Advertising Policies.'} Edit the video or text and save to resubmit, or request another review if you think this is a mistake.
        </AmNotice>
      )}
      <AmCard title="Ad details">
        <div className="tt-fields">
          <AmField label="Ad name"><AmInput value={name} onChange={setName} disabled={deleted} /></AmField>
          {spark ? (
            <AmField label="Ad text" help="Spark Ads use the original post's caption."><AmInput value={ad.primaryText} disabled /></AmField>
          ) : (
            <AmField label="Ad text" error={textErr || undefined} footerRight={<span className="tt-faint tt-small">{text.length}/100</span>}>
              <AmInput value={text} onChange={setText} rows={2} disabled={deleted} />
            </AmField>
          )}
          <AmField label="Call to action">
            <AmSelect value={cta} onChange={v => setCta(v)} options={TT_CTAS.map(x => ({ value: x, label: CTA_LABEL[x] }))} width={220} disabled={deleted} />
          </AmField>
          <AmField label="Website URL"><AmInput value={product ? productUrl(s, product) : ''} disabled /></AmField>
          {!spark && product && !deleted && (
            <AmField label="Video" labelTip="Swapping the video counts as a new ad: it goes back to review and the ad group restarts learning.">
              <CreativePicker s={s} catalogId={product.catalogId} selected={[creativeId]} onChange={ids => setCreativeId(ids[ids.length - 1] ?? ad.creativeId)} max={2} />
            </AmField>
          )}
          {contentChanged && !deleted && (
            <AmNotice tone="warning">
              {creativeId !== ad.creativeId ? 'Changing the video sends the ad back to review and restarts learning for its ad group.' : 'Edited ads go back to review before they deliver again.'}
            </AmNotice>
          )}
        </div>
      </AmCard>
      {cr && (
        <AmCard title="Preview">
          <div className="tt-preview">
            <AdPreview
              platform="tiktak" productImage={creativeThumb(cr)} hookText={cr.hookText} caption={spark ? ad.primaryText : text} script={cr.script}
              brandName={identityName(s)} cta={CTA_LABEL[cta]} isVideo={cr.isVideo} durationSec={cr.durationSec} width={230}
              likes={post?.likes ?? 0} comments={post?.comments ?? 0} shares={post?.shares ?? 0}
            />
          </div>
        </AmCard>
      )}
      {!deleted && <EntityActions level="ad" id={ad.id} onClose={onClose} />}
      {!deleted && (
        <Footer>
          <AmButton onClick={onClose}>Cancel</AmButton>
          <AmButton variant="primary" disabled={!dirty || !!textErr} onClick={save}>Save</AmButton>
        </Footer>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Data tab
// ---------------------------------------------------------------------------
const SPANS = [{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' }, { value: '0', label: 'Lifetime' }]

function DataTab({ s, level, id, range: pageRange, accountId }: { s: GameState; level: AdLevel; id: string; range: DateRange; accountId: string }) {
  const [metric, setMetric] = useState<MetricId>('cost')
  // the drawer charts a trend, so it uses its own span (including today) instead of the page's range
  const today = Math.floor(s.time.hour / 24)
  const [span, setSpan] = useState(() => (pageRange.to - pageRange.from >= 13 ? '30' : '14'))
  const range: DateRange = { from: span === '0' ? 0 : Math.max(0, today - Number(span) + 1), to: today }
  const data = useMemo(() => accountData(s, accountId, range), [s.ads, accountId, range.from, range.to])
  const ads = adsUnder(data, level, id)
  const series = dailySeries(s, ads, range)
  const total = level === 'campaign' ? data.byCampaign.get(id) : level === 'adset' ? data.byAdSet.get(id) : data.byAd.get(id)
  const m = METRICS[metric]
  const be = breakEvenFor(s, landingProductOf(ads))
  const ref = be && metric === 'roas' ? [{ value: be.roas, label: `Break-even ${be.roas.toFixed(2)}`, color: CHART_COLORS.critical }]
    : be && metric === 'cpa' ? [{ value: be.cpa, label: `Break-even ${amFmt.money(be.cpa)}`, color: CHART_COLORS.critical }] : undefined
  const ad = level === 'ad' ? s.ads.ads.find(a => a.id === id) : undefined
  const tips = ad ? creativeInsights(s, ad.creativeId) : []
  const crImps = ad ? creativeImpressions(s, ad.creativeId) : 0
  const st = total?.stats
  // checkpoints in watch-time order, using the (most common) video length under this entity
  const durations = ads.map(a => s.creatives.creatives.find(c => c.id === a.creativeId)?.durationSec ?? 15)
  const dur = durations.sort((a, b) => durations.filter(x => x === b).length - durations.filter(x => x === a).length)[0] ?? 15
  const funnel = st && st.impressions > 0 ? retentionSteps(st, dur) : null
  return (
    <>
      <AmCard title="Performance" subtitle={`${formatDate(range.from, 'md')} – ${formatDate(range.to, 'short')}`}>
        <div className="tt-col" style={{ gap: 12 }}>
          <div className="tt-row" style={{ justifyContent: 'space-between' }}>
            <AmSelect value={metric} onChange={v => setMetric(v)} options={CHART_METRICS.map(x => ({ value: x, label: METRICS[x].label }))} width={240} />
            <AmSegmented value={span} onChange={setSpan} options={SPANS} ariaLabel="Date range" />
          </div>
          <LineChartCard
            bare
            title={m.label}
            titleTip={m.description}
            value={total ? m.value(total) ?? amFmt.dash : amFmt.dash}
            format={m.chart}
            data={series.map(x => ({ label: formatDate(x.day, 'md'), value: m.value(x.b) }))}
            color={CHART_COLORS.tiktak}
            referenceLines={ref}
            height={200}
            emptyText="No delivery in this date range."
          />
          {total && (
            <div className="tt-grid-3">
              {(['cost', 'impressions', 'clicks', 'ctr', 'conversions', 'cpa'] as MetricId[]).map(x => (
                <div key={x} className="tt-kpi tt-kpi-static"><span className="tt-kpi-label">{METRICS[x].label}</span><span className="tt-kpi-value" style={{ fontSize: 16 }}>{METRICS[x].format(METRICS[x].value(total))}</span></div>
              ))}
            </div>
          )}
        </div>
      </AmCard>
      {funnel && (
        <AmCard title="Video play" titleTip="How far people watched. Each bar is a share of impressions.">
          <div className="tt-retention">
            {funnel.map(f => (
              <div key={f.label} className="tt-ret-row">
                <span>{f.label}</span>
                <span className="tt-ret-bar"><span style={{ width: `${Math.min(100, (f.v / funnel[0].v) * 100)}%` }} /></span>
                <b>{f.label === 'Impressions' ? amFmt.compact(f.v) : amFmt.pct(f.v / funnel[0].v, 1)}</b>
              </div>
            ))}
          </div>
        </AmCard>
      )}
      {ad && (
        <AmCard title="Creative diagnosis" titleTip="Suggestions based on how people respond to this video across all your ads.">
          {crImps < TIPS_MIN_IMPRESSIONS ? (
            <span className="tt-muted tt-small">Diagnosis unlocks after {amFmt.int(TIPS_MIN_IMPRESSIONS)} impressions on this video ({amFmt.int(crImps)} so far).</span>
          ) : tips.length ? (
            <ul className="tt-insights">{tips.map((t, i) => <li key={i}><TriangleAlert size={14} />{t}</li>)}</ul>
          ) : (
            <span className="tt-muted tt-small">No issues found with this video.</span>
          )}
        </AmCard>
      )}
      {level === 'adset' && (() => {
        const set = s.ads.adSets.find(x => x.id === id)
        return set ? <span className="tt-faint tt-small">Optimization event: {optimizationLabel(set)} · {targetingSummary(s, set.targeting)}</span> : null
      })()}
    </>
  )
}
