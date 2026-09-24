// Create flow: Web conversions → Smart+ or Manual campaign → ad group (placement, targeting,
// budget, optimization, bidding) → ad (identity, Spark Ads, videos, ad text, CTA, destination).
// Also used to add an ad group to an existing campaign or ads to an existing ad group.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft, BadgeDollarSign, Check, CircleAlert, Clapperboard, Download, Eye, Megaphone, MousePointerClick,
  ShoppingBag, Smartphone, Sparkles, SquareMousePointer, UsersRound, Wrench, type LucideIcon,
} from 'lucide-react'
import type { Ad, Campaign, Creative, Targeting } from '../../../../../core/types'
import { act } from '../../../../../core/store'
import { openSite, usePauseWhileMounted } from '../../../../../core/ui'
import { formatDate, hourOfDay } from '../../../../../core/time'
import {
  DEFAULT_TARGETING, MB_GATES, createAd, createAdSet, createCampaign, featureUnlocked, hasPixel, sparkPost, updateAd,
  validateCampaignInput, validateTargeting,
} from '../../../../../sim/ads'
import {
  AmButton, AmCard, AmField, AmInput, AmModal, AmNotice, AmRadio, AmRadioCard, AmSegmented, AmSelect, AmTag, AmTooltip, Stepper, Toggle,
  amFmt, checkBudgetEdit, minDailyBudget, type StepDef,
} from '../../../../kit/adsmanager'
import { AdPreview } from '../../../../kit/phone'
import { cx, tileColor, initials } from '../../../../kit/common'
import { useAccount, useGame, useTt } from '../../common'
import { ttUi } from '../../uiState'
import { CTA_LABEL, TT_CTAS, breakEvenFor, identityName, productUrl, bidLabel } from '../../data'
import { AudienceEstimate, TargetingEditor, targetingSummary } from './Targeting'
import { CreativePicker, PostPicker, creativeThumb } from './Pickers'

type Step = 'campaign' | 'adgroup' | 'ad'

interface CampForm { type: 'manual' | 'smart'; name: string; cbo: boolean; budget: string; bid: 'lowest_cost' | 'cost_cap'; costCap: string }
interface GroupForm { name: string; optimization: 'purchase' | 'add_to_cart'; targeting: Targeting; budget: string; placement: 'auto' | 'select' }
interface AdForm { name: string; spark: boolean; productId: string | null; creativeIds: string[]; postIds: string[]; text: string; cta: Ad['cta'] }

const stamp = (hour: number) => `${formatDate(Math.floor(hour / 24), 'iso').replace(/-/g, '')}${String(hourOfDay(hour)).padStart(2, '0')}00`
const num = (v: string) => (v.trim() === '' ? NaN : Number(v))
/** Budgets are whole cents, like the real input. */
const cents = (v: string) => Math.round(num(v) * 100) / 100
/** Default names carry a timestamp; the clock is paused while creating, so number repeats like TikTok does. */
function uniqueName(base: string, taken: Iterable<string>): string {
  const set = new Set(taken)
  if (!set.has(base)) return base
  let i = 2
  while (set.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

const OBJECTIVES: { group: string; items: { id: string; label: string; icon: LucideIcon }[] }[] = [
  { group: 'Awareness', items: [{ id: 'reach', label: 'Reach', icon: Megaphone }] },
  {
    group: 'Consideration',
    items: [
      { id: 'traffic', label: 'Traffic', icon: MousePointerClick }, { id: 'video_views', label: 'Video views', icon: Eye },
      { id: 'community', label: 'Community interaction', icon: UsersRound },
    ],
  },
  {
    group: 'Conversion',
    items: [
      { id: 'app', label: 'App promotion', icon: Download }, { id: 'lead', label: 'Lead generation', icon: SquareMousePointer },
      { id: 'web', label: 'Web conversions', icon: ShoppingBag },
    ],
  },
]

export default function CreateFlow({ params }: { params: string[] }) {
  usePauseWhileMounted('tiktak-create')
  const s = useGame()
  const { navigate, compact } = useTt()
  const { account } = useAccount()
  const acc = account!
  const [kind, ref] = params

  // ---- context from the route ----
  const existingSet = kind === 'ad' ? s.ads.adSets.find(x => x.id === ref && x.status !== 'deleted' && x.platform === 'tiktak') : undefined
  const existingCampaign: Campaign | undefined = existingSet
    ? s.ads.campaigns.find(c => c.id === existingSet.campaignId)
    : kind === 'adgroup' ? s.ads.campaigns.find(c => c.id === ref && c.status !== 'deleted' && c.platform === 'tiktak') : undefined
  const mode: 'new' | 'adgroup' | 'ad' = existingSet ? 'ad' : existingCampaign ? 'adgroup' : 'new'
  const steps: Step[] = mode === 'new' ? ['campaign', 'adgroup', 'ad'] : mode === 'adgroup' ? ['adgroup', 'ad'] : ['ad']

  const hour = s.time.hour
  const [camp, setCamp] = useState<CampForm>(() => ({
    type: 'manual', name: uniqueName(`Web conversions${stamp(hour)}`, s.ads.campaigns.filter(c => c.platform === 'tiktak').map(c => c.name)),
    cbo: false, budget: '', bid: 'lowest_cost', costCap: '',
  }))
  const [group, setGroup] = useState<GroupForm>(() => ({
    name: uniqueName(`Ad group${stamp(hour)}`, s.ads.adSets.filter(x => x.platform === 'tiktak').map(x => x.name)),
    optimization: 'purchase', targeting: { ...DEFAULT_TARGETING }, budget: '', placement: 'auto',
  }))
  const [ad, setAd] = useState<AdForm>(() => {
    const preCreative = kind === 'creative' ? s.creatives.creatives.find(c => c.id === ref && c.status === 'ready') : undefined
    const prePost = kind === 'spark' ? s.ads.organicPosts.find(p => p.id === ref) : undefined
    const productFor = (catalogId: string | undefined) =>
      catalogId ? (s.store.products.find(p => p.catalogId === catalogId && p.status === 'active') ?? s.store.products.find(p => p.catalogId === catalogId && p.status !== 'archived'))?.id ?? null : null
    const firstActive = s.store.products.find(p => p.status === 'active')?.id ?? s.store.products.find(p => p.status !== 'archived')?.id ?? null
    return {
      name: uniqueName(`Ad${stamp(hour)}`, s.ads.ads.filter(a => a.platform === 'tiktak').map(a => a.name)),
      spark: !!prePost,
      productId: prePost ? prePost.storeProductId : preCreative ? productFor(preCreative.catalogId) : firstActive,
      creativeIds: preCreative ? [preCreative.id] : [],
      postIds: prePost ? [prePost.id] : [],
      text: '',
      cta: 'shop_now',
    }
  })
  const [step, setStep] = useState<Step>(steps[0])
  const [tried, setTried] = useState<Record<Step, boolean>>({ campaign: false, adgroup: false, ad: false })
  const [exitOpen, setExitOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }) }, [step])

  // ---- derived ----
  const isSmart = mode === 'new' ? camp.type === 'smart' : existingCampaign?.kind === 'advantage'
  const cbo = mode === 'new' ? isSmart || camp.cbo : existingCampaign?.budgetMode === 'cbo'
  const pixel = hasPixel(s, 'tiktak')
  const smartUnlocked = featureUnlocked(s, 'advantage')
  const costCapUnlocked = featureUnlocked(s, 'costCap')
  const products = s.store.products.filter(p => p.status !== 'archived')
  const product = s.store.products.find(p => p.id === ad.productId) ?? null
  const creativesById = useMemo(() => new Map(s.creatives.creatives.map(c => [c.id, c])), [s.creatives.creatives])
  const campaignBudget = mode === 'new' ? num(camp.budget) : existingCampaign?.dailyBudget ?? NaN
  const groupBudgetForEstimate = cbo ? campaignBudget : num(group.budget)
  const be = breakEvenFor(s, ad.spark ? s.ads.organicPosts.find(p => p.id === ad.postIds[0])?.storeProductId ?? null : ad.productId)

  // ---- validation ----
  const campErr = (): Partial<Record<'name' | 'budget' | 'type' | 'general', string>> => {
    if (mode !== 'new') return {}
    const e: Partial<Record<'name' | 'budget' | 'type' | 'general', string>> = {}
    if (!camp.name.trim()) e.name = 'Enter a campaign name.'
    if (isSmart && !smartUnlocked) e.type = `Smart+ campaigns unlock at Media Buying level ${MB_GATES.advantage}.`
    if (cbo) {
      const chk = checkBudgetEdit('tiktak', null, cents(camp.budget), { level: 'campaign' })
      if (chk.error) e.budget = camp.budget.trim() ? chk.error : 'Enter a campaign budget.'
    }
    if (!Object.keys(e).length) {
      const g = validateCampaignInput(s, { platform: 'tiktak', accountId: acc.id, name: camp.name, kind: isSmart ? 'advantage' : 'manual', budgetMode: cbo ? 'cbo' : 'abo', dailyBudget: cbo ? cents(camp.budget) : null, bidStrategy: 'lowest_cost' })
      if (g) e.general = g
    }
    return e
  }
  const groupErr = (): Partial<Record<'name' | 'budget' | 'targeting' | 'costCap', string>> => {
    if (mode === 'ad') return {}
    const e: Partial<Record<'name' | 'budget' | 'targeting' | 'costCap', string>> = {}
    if (!group.name.trim()) e.name = 'Enter an ad group name.'
    if (!cbo) {
      const chk = checkBudgetEdit('tiktak', null, cents(group.budget), { level: 'adset' })
      if (chk.error) e.budget = group.budget.trim() ? chk.error : 'Enter an ad group budget.'
    }
    const t = validateTargeting(s, 'tiktak', group.targeting)
    if (t) e.targeting = t
    if (mode === 'new' && camp.bid === 'cost_cap') {
      if (!costCapUnlocked) e.costCap = `Cost cap unlocks at Media Buying level ${MB_GATES.costCap}.`
      else if (!(cents(camp.costCap) > 0)) e.costCap = 'Enter a cost per conversion goal.'
    }
    return e
  }
  const adErr = (): Partial<Record<'name' | 'product' | 'creative' | 'text', string>> => {
    const e: Partial<Record<'name' | 'product' | 'creative' | 'text', string>> = {}
    if (!ad.name.trim()) e.name = 'Enter an ad name.'
    if (ad.spark) {
      if (!ad.postIds.length) e.creative = 'Select at least one TikTak post.'
    } else {
      if (!product) e.product = 'Select the product this ad sends people to.'
      if (!ad.creativeIds.length) e.creative = 'Select at least one video.'
      const text = ad.text.trim()
      if (!text) e.text = 'Enter ad text.'
      else if (text.length > 100) e.text = 'Ad text can be up to 100 characters.'
    }
    return e
  }
  const errs: Record<Step, Record<string, string | undefined>> = { campaign: campErr(), adgroup: groupErr(), ad: adErr() }
  const stepOk = (st: Step) => Object.values(errs[st]).every(v => !v)
  const show = (st: Step, key: string) => (tried[st] ? errs[st][key] : undefined)

  const idx = steps.indexOf(step)
  const goto = (target: Step) => {
    const ti = steps.indexOf(target)
    if (ti <= idx) { setStep(target); return }
    for (let i = idx; i < ti; i++) {
      if (!stepOk(steps[i])) { setTried(t => ({ ...t, [steps[i]]: true })); setStep(steps[i]); return }
    }
    setStep(target)
  }
  const next = () => {
    if (!stepOk(step)) { setTried(t => ({ ...t, [step]: true })); return }
    if (idx < steps.length - 1) setStep(steps[idx + 1])
  }

  // ---- submit ----
  const submit = () => {
    for (const st of steps) {
      if (!stepOk(st)) { setTried(t => ({ ...t, [st]: true })); setStep(st); return }
    }
    const out = { ok: false, campaignId: '', adSetId: '', count: 0, error: '' }
    act(st => {
      const madeCampaigns: string[] = []
      const madeSets: string[] = []
      const madeAds: string[] = []
      const sparked: string[] = []
      const rollback = (msg: string) => {
        st.ads.ads = st.ads.ads.filter(a => !madeAds.includes(a.id))
        st.ads.adSets = st.ads.adSets.filter(a => !madeSets.includes(a.id))
        st.ads.campaigns = st.ads.campaigns.filter(c => !madeCampaigns.includes(c.id))
        for (const p of st.ads.organicPosts) if (sparked.includes(p.id)) p.sparked = false
        out.error = msg
      }
      let campaignId = existingCampaign?.id ?? ''
      if (mode === 'new') {
        const id = createCampaign(st, {
          platform: 'tiktak', accountId: acc.id, name: camp.name.trim(), kind: isSmart ? 'advantage' : 'manual', budgetMode: cbo ? 'cbo' : 'abo',
          dailyBudget: cbo ? cents(camp.budget) : null, bidStrategy: camp.bid, costCap: camp.bid === 'cost_cap' ? cents(camp.costCap) : null,
        })
        if (!id) { rollback('The campaign couldn\'t be created. Check the notification for details.'); return }
        madeCampaigns.push(id)
        campaignId = id
      }
      let adSetId = existingSet?.id ?? ''
      if (mode !== 'ad') {
        const id = createAdSet(st, {
          campaignId, name: group.name.trim(), dailyBudget: cbo ? null : cents(group.budget), targeting: group.targeting, optimization: group.optimization,
        })
        if (!id) { rollback('The ad group couldn\'t be created. Check the notification for details.'); return }
        madeSets.push(id)
        adSetId = id
      }
      const many = (ad.spark ? ad.postIds.length : ad.creativeIds.length) > 1
      if (ad.spark) {
        for (const postId of ad.postIds) {
          const post = st.ads.organicPosts.find(p => p.id === postId)
          const cr = post && st.creatives.creatives.find(c => c.id === post.creativeId)
          const id = sparkPost(st, postId, adSetId)
          if (!id) continue
          madeAds.push(id)
          sparked.push(postId)
          updateAd(st, id, { name: (many && cr ? `${ad.name.trim()} - ${cr.name}` : ad.name.trim()).slice(0, 120), cta: ad.cta })
        }
      } else {
        for (const cid of ad.creativeIds) {
          const cr = st.creatives.creatives.find(c => c.id === cid)
          const id = createAd(st, {
            adSetId, name: (many && cr ? `${ad.name.trim()} - ${cr.name}` : ad.name.trim()).slice(0, 120), creativeId: cid,
            storeProductId: ad.productId!, primaryText: ad.text.trim(), headline: '', cta: ad.cta,
          })
          if (id) madeAds.push(id)
        }
      }
      if (!madeAds.length) { rollback('No ads could be created. Check that the videos show the same product as the landing page.'); return }
      out.ok = true
      out.campaignId = campaignId
      out.adSetId = adSetId
      out.count = madeAds.length
    })
    if (!out.ok) { setSubmitError(out.error); return }
    const n = out.count
    const flash = mode === 'new'
      ? `Campaign submitted. ${n} ad${n === 1 ? ' is' : 's are'} in review, which usually takes less than 24 hours.`
      : mode === 'adgroup'
        ? `Ad group submitted. ${n} ad${n === 1 ? ' is' : 's are'} in review.`
        : `${n} ad${n === 1 ? '' : 's'} submitted for review.`
    ttUi().set({
      flash,
      statusFilter: 'all_but_deleted',
      level: mode === 'new' ? 'campaign' : mode === 'adgroup' ? 'adset' : 'ad',
      selected: mode === 'new' ? { campaign: [], adset: [], ad: [] } : mode === 'adgroup' ? { campaign: [out.campaignId], adset: [], ad: [] } : { campaign: [out.campaignId], adset: [out.adSetId], ad: [] },
    })
    navigate(mode === 'new' ? 'campaign' : mode === 'adgroup' ? 'campaign/adgroup' : 'campaign/ad')
  }

  // ---- step contents ----
  const stepDefs: StepDef[] = steps.map(st => ({
    id: st,
    label: st === 'campaign' ? 'Campaign' : st === 'adgroup' ? 'Ad group' : 'Ad',
    status: st === step ? 'current' : tried[st] && !stepOk(st) ? 'error' : steps.indexOf(st) < idx ? 'complete' : 'upcoming',
  }))
  const title = mode === 'new' ? 'Create campaign' : mode === 'adgroup' ? 'Create ad group' : 'Create ad'

  const campaignStep = (
    <>
      <AmCard title="Advertising objective" titleTip="What you want people to do when they see your ads.">
        <div className="tt-objectives">
          {OBJECTIVES.map(g => (
            <div key={g.group} className="tt-obj-group">
              <span className="tt-obj-group-title">{g.group}</span>
              {g.items.map(o => {
                const on = o.id === 'web'
                const btn = (
                  <button key={o.id} type="button" className={cx('tt-obj', on && 'tt-obj-on')} disabled={!on} aria-pressed={on}>
                    <span className="tt-obj-icon"><o.icon size={16} strokeWidth={2} /></span>{o.label}
                  </button>
                )
                return on ? btn : <AmTooltip key={o.id} block content="Your ad account is set up for an online store. Use Web conversions to get Complete payment events from your Shopifly checkout.">{btn}</AmTooltip>
              })}
            </div>
          ))}
        </div>
      </AmCard>
      <AmCard title="Campaign type">
        <div className="tt-choice-grid" role="radiogroup" aria-label="Campaign type">
          <AmRadioCard
            checked={camp.type === 'smart'}
            onSelect={() => setCamp(c => ({ ...c, type: 'smart', cbo: true }))}
            icon={Sparkles}
            title="Smart+ campaign"
            badge={<AmTag tone="teal">Automated</AmTag>}
            description="Automates targeting, placement and creative delivery. Add several videos and let the system find buyers."
            disabled={!smartUnlocked}
            disabledReason={`Unlocks at Media Buying level ${MB_GATES.advantage}. Learn the manual setup first.`}
          />
          <AmRadioCard
            checked={camp.type === 'manual'}
            onSelect={() => setCamp(c => ({ ...c, type: 'manual' }))}
            icon={Wrench}
            title="Manual campaign"
            description="Full control over targeting, budget and bidding for each ad group."
          />
        </div>
        {show('campaign', 'type') && <div style={{ marginTop: 10 }}><AmNotice tone="error">{show('campaign', 'type')}</AmNotice></div>}
      </AmCard>
      <AmCard title="Campaign details">
        <div className="tt-fields">
          <AmField label="Campaign name" error={show('campaign', 'name')} footerRight={<span className="tt-faint tt-small">{camp.name.length}/400</span>}>
            <AmInput value={camp.name} onChange={v => setCamp(c => ({ ...c, name: v.slice(0, 400) }))} error={!!show('campaign', 'name')} />
          </AmField>
          <AmField
            label="Campaign budget optimization"
            labelTip="Set one budget at the campaign level and let delivery split it across ad groups based on performance."
          >
            <Toggle
              checked={cbo}
              disabled={isSmart}
              onChange={v => setCamp(c => ({ ...c, cbo: v }))}
              label={isSmart ? 'Always on for Smart+ campaigns' : cbo ? 'On' : 'Off: set a budget for each ad group'}
            />
          </AmField>
          {cbo && (
            <AmField
              label="Budget"
              labelTip="Your campaign's daily budget. TikTak requires at least $50.00 per day at the campaign level."
              error={show('campaign', 'budget')}
              help={`Daily · Minimum ${amFmt.money(minDailyBudget('tiktak', 'campaign'))}`}
            >
              <AmInput value={camp.budget} onChange={v => setCamp(c => ({ ...c, budget: v }))} type="currency" prefix="$" suffix="USD" placeholder={`At least ${minDailyBudget('tiktak', 'campaign').toFixed(2)}`} error={!!show('campaign', 'budget')} width={260} />
            </AmField>
          )}
          {show('campaign', 'general') && <AmNotice tone="error">{show('campaign', 'general')}</AmNotice>}
        </div>
      </AmCard>
    </>
  )

  const groupStep = (
    <>
      {mode !== 'new' && existingCampaign && (
        <AmNotice tone="info" title={`Adding to campaign “${existingCampaign.name}”`}>
          {existingCampaign.budgetMode === 'cbo' ? `Campaign budget optimization is on (${amFmt.money(existingCampaign.dailyBudget)} daily).` : 'Budgets are set per ad group.'} Bid strategy: {bidLabel(existingCampaign)}.
        </AmNotice>
      )}
      <AmCard title="Ad group name">
        <AmField error={show('adgroup', 'name')} footerRight={<span className="tt-faint tt-small">{group.name.length}/512</span>}>
          <AmInput value={group.name} onChange={v => setGroup(g => ({ ...g, name: v.slice(0, 512) }))} error={!!show('adgroup', 'name')} />
        </AmField>
      </AmCard>
      <AmCard title="Optimization">
        <div className="tt-fields">
          <AmField label="Optimization location" labelTip="Where you want people to go and what you want them to do.">
            <AmRadio checked label="Website" description="Send people to your Shopifly product page." />
          </AmField>
          <AmField label="Pixel">
            {pixel ? (
              <div className="tt-row"><span className="tt-dot tt-dot-success" /> <b style={{ fontSize: 13 }}>Shopifly · TikTak Pixel</b><span className="tt-faint tt-small">Receiving events</span></div>
            ) : (
              <AmNotice tone="warning" title="No pixel events" actions={<AmButton size="sm" onClick={() => openSite('shopifly', 'apps/tiktak-channel')}>Set up in Shopifly</AmButton>}>
                Without the TikTak Pixel, delivery can&apos;t see who completes a payment. It will optimize for cheap clicks instead and never exit learning.
              </AmNotice>
            )}
          </AmField>
          <AmField label="Optimization event" labelTip="The event delivery optimizes for. Each ad group needs about 50 of these in 7 days to exit learning.">
            <AmSelect
              value={group.optimization}
              onChange={v => setGroup(g => ({ ...g, optimization: v }))}
              options={[
                { value: 'purchase', label: 'Complete payment', description: 'Recommended for online stores. Delivery looks for buyers.' },
                { value: 'add_to_cart', label: 'Add to cart', description: 'More events, so learning finishes sooner, but not every cart becomes a sale.' },
              ]}
              width={320}
            />
          </AmField>
        </div>
      </AmCard>
      <AmCard title="Placements">
        <div className="tt-fields">
          <AmRadio checked={isSmart || group.placement === 'auto'} onChange={() => setGroup(g => ({ ...g, placement: 'auto' }))} label="Automatic placement" description={isSmart ? 'Smart+ campaigns always use automatic placement.' : 'Show ads wherever they\'re likely to perform best.'} />
          <AmRadio checked={!isSmart && group.placement === 'select'} disabled={isSmart} onChange={() => setGroup(g => ({ ...g, placement: 'select' }))} label="Select placement" />
          {!isSmart && group.placement === 'select' && (
            <div style={{ paddingLeft: 26 }}>
              <label className="tt-row" style={{ gap: 8, fontSize: 13 }}>
                <Smartphone size={16} /> <b>TikTak</b> <span className="tt-faint tt-small">For You feed · the only placement for Web conversions in the US</span>
              </label>
            </div>
          )}
        </div>
      </AmCard>
      <AmCard title="Targeting" subtitle={targetingSummary(s, group.targeting)}>
        <TargetingEditor s={s} value={group.targeting} onChange={t => setGroup(g => ({ ...g, targeting: t }))} locked={isSmart} />
        {show('adgroup', 'targeting') && <div style={{ marginTop: 10 }}><AmNotice tone="error">{show('adgroup', 'targeting')}</AmNotice></div>}
      </AmCard>
      <AmCard title="Budget and schedule">
        <div className="tt-fields">
          {cbo ? (
            <span className="tt-muted" style={{ fontSize: 13 }}>This campaign uses campaign budget optimization{Number.isFinite(campaignBudget) ? ` (${amFmt.money(campaignBudget)} daily)` : ''}. Delivery splits it across ad groups.</span>
          ) : (
            <AmField label="Budget" labelTip="Daily budget for this ad group. TikTak requires at least $20.00 per day." error={show('adgroup', 'budget')} help={`Daily · Minimum ${amFmt.money(minDailyBudget('tiktak', 'adset'))}`}>
              <AmInput value={group.budget} onChange={v => setGroup(g => ({ ...g, budget: v }))} type="currency" prefix="$" suffix="USD" placeholder={`At least ${minDailyBudget('tiktak', 'adset').toFixed(2)}`} error={!!show('adgroup', 'budget')} width={260} />
            </AmField>
          )}
          <AmField label="Schedule">
            <span style={{ fontSize: 13 }}>Starts {formatDate(Math.floor(hour / 24), 'medium')} after review · Runs continuously</span>
          </AmField>
        </div>
      </AmCard>
      <AmCard title="Bidding and optimization">
        <div className="tt-fields">
          <AmField label="Optimization goal"><span style={{ fontSize: 13 }}>Conversion · {group.optimization === 'purchase' ? 'Complete payment' : 'Add to cart'}</span></AmField>
          {mode === 'new' ? (
            <>
              <AmField label="Bid strategy" labelTip="Maximum delivery spends your whole budget to get as many conversions as possible. Cost cap keeps the average cost per conversion near your goal but may spend less.">
                <AmSegmented
                  value={camp.bid}
                  onChange={v => setCamp(c => ({ ...c, bid: v }))}
                  options={[{ value: 'lowest_cost', label: 'Maximum delivery' }, { value: 'cost_cap', label: 'Cost cap', disabled: !costCapUnlocked }]}
                  ariaLabel="Bid strategy"
                />
              </AmField>
              {!costCapUnlocked && <span className="tt-faint tt-small">Cost cap unlocks at Media Buying level {MB_GATES.costCap}.</span>}
              {camp.bid === 'cost_cap' && (
                <AmField label="Cost per conversion goal" error={show('adgroup', 'costCap')} help={be ? `Your break-even cost per purchase for “${be.product.title}” is ${amFmt.money(be.cpa)}.` : 'Set the average cost per conversion you can afford.'}>
                  <AmInput value={camp.costCap} onChange={v => setCamp(c => ({ ...c, costCap: v }))} type="currency" prefix="$" suffix="USD" width={220} error={!!show('adgroup', 'costCap')} />
                </AmField>
              )}
            </>
          ) : (
            <AmField label="Bid strategy"><span style={{ fontSize: 13 }}>{existingCampaign ? bidLabel(existingCampaign) : 'Maximum delivery'} (campaign setting)</span></AmField>
          )}
          <AmField label="Billing event"><span style={{ fontSize: 13 }}>oCPM</span></AmField>
          <AmField label="Delivery type"><span style={{ fontSize: 13 }}>Standard</span></AmField>
        </div>
      </AmCard>
    </>
  )

  const firstCreative: Creative | undefined = ad.spark
    ? creativesById.get(s.ads.organicPosts.find(p => p.id === ad.postIds[0])?.creativeId ?? '')
    : creativesById.get(ad.creativeIds[0] ?? '')
  const firstPost = ad.spark ? s.ads.organicPosts.find(p => p.id === ad.postIds[0]) : undefined
  const sparkText = firstCreative ? (firstCreative.hookText || firstCreative.name).slice(0, 100) : ''
  const ident = identityName(s)
  const identColor = tileColor(ident)
  const learningWarn = mode === 'ad' && existingSet && existingSet.impressions > 0

  const adStep = (
    <>
      {mode === 'ad' && existingSet && (
        <AmNotice tone={learningWarn ? 'warning' : 'info'} title={`Adding to ad group “${existingSet.name}”`}>
          {learningWarn ? 'Adding a new ad is a significant edit: this ad group goes back into the learning phase.' : 'New ads go through review before they start delivering.'}
        </AmNotice>
      )}
      <AmCard title="Ad name">
        <AmField error={show('ad', 'name')} footerRight={<span className="tt-faint tt-small">{ad.name.length}/512</span>}>
          <AmInput value={ad.name} onChange={v => setAd(a => ({ ...a, name: v.slice(0, 512) }))} error={!!show('ad', 'name')} />
        </AmField>
      </AmCard>
      <AmCard title="Identity">
        <div className="tt-fields">
          <div className="tt-row" style={{ gap: 10 }}>
            <span className="tt-acct-avatar" style={{ width: 36, height: 36, borderRadius: '50%', background: identColor.bg, color: identColor.fg, fontSize: 13 }}>{initials(ident)}</span>
            <div className="tt-col" style={{ gap: 0 }}>
              <b style={{ fontSize: 13 }}>{ident}</b>
              <span className="tt-faint tt-small">{ad.spark ? 'TikTak account · posts appear with your profile' : 'Custom identity'}</span>
            </div>
          </div>
          <Toggle
            checked={ad.spark}
            onChange={v => setAd(a => ({ ...a, spark: v }))}
            label={<span className="tt-col" style={{ gap: 1 }}><b style={{ fontSize: 13 }}>Spark Ads</b><span className="tt-faint tt-small">Boost your organic TikTak posts. Views, likes and follows go to your account.</span></span>}
          />
        </div>
      </AmCard>
      <AmCard title="Ad details" subtitle={ad.spark ? 'Single video · TikTak posts' : 'Single video'}>
        <div className="tt-fields">
          {!ad.spark && (
            <AmField label="Product" labelTip="The Shopifly product page this ad links to. Videos must show the same product." error={show('ad', 'product')}>
              <AmSelect
                value={ad.productId}
                onChange={v => setAd(a => ({ ...a, productId: v, creativeIds: a.creativeIds.filter(id => creativesById.get(id)?.catalogId === s.store.products.find(p => p.id === v)?.catalogId) }))}
                placeholder={products.length ? 'Select a product' : 'Add a product in Shopifly first'}
                options={products.map(p => ({ value: p.id, label: p.title, description: p.status === 'active' ? amFmt.money(p.price) : `Draft · ${amFmt.money(p.price)}` }))}
                error={!!show('ad', 'product')}
              />
            </AmField>
          )}
          {!ad.spark && products.length === 0 && (
            <AmNotice tone="info" actions={<AmButton size="sm" onClick={() => openSite('shopifly', 'products')}>Open Shopifly</AmButton>}>
              TikTak ads send people to a product page. Add a product to your Shopifly store first.
            </AmNotice>
          )}
          {!ad.spark && product && product.status !== 'active' && (
            <AmNotice tone="warning" actions={<AmButton size="sm" onClick={() => openSite('shopifly', `products/${product.id}`)}>Open in Shopifly</AmButton>}>
              “{product.title}” is a draft in Shopifly. Ads to it won&apos;t deliver until you set the product to Active.
            </AmNotice>
          )}
          <AmField
            label={ad.spark ? 'TikTak posts' : `Videos${ad.creativeIds.length ? ` (${ad.creativeIds.length} selected)` : ''}`}
            labelTip={ad.spark ? 'Each selected post becomes its own Spark Ad.' : 'Each selected video becomes its own ad in this ad group. Testing 3–5 different videos is a good start.'}
            error={show('ad', 'creative')}
          >
            {ad.spark ? (
              <PostPicker s={s} selected={ad.postIds} onChange={ids => setAd(a => ({ ...a, postIds: ids }))} />
            ) : product ? (
              <div className="tt-col" style={{ gap: 8 }}>
                <CreativePicker s={s} catalogId={product.catalogId} selected={ad.creativeIds} onChange={ids => setAd(a => ({ ...a, creativeIds: ids }))} />
                <div><AmButton size="sm" icon={Clapperboard} onClick={() => openSite('studio')}>Create a video</AmButton></div>
              </div>
            ) : (
              <span className="tt-muted tt-small">Select a product to see its videos.</span>
            )}
          </AmField>
          {ad.spark ? (
            <AmField label="Ad text" help="Spark Ads use the original post's caption.">
              <AmInput value={sparkText} disabled />
            </AmField>
          ) : (
            <AmField label="Ad text" labelTip="Shown above your profile name in the ad. Keep it short and specific." error={show('ad', 'text')} footerRight={<span className={cx('tt-small', ad.text.length > 100 ? '' : 'tt-faint')} style={ad.text.length > 100 ? { color: '#c4163a' } : undefined}>{ad.text.length}/100</span>}>
              <AmInput value={ad.text} onChange={v => setAd(a => ({ ...a, text: v }))} placeholder="Enter ad text" rows={2} error={!!show('ad', 'text')} />
            </AmField>
          )}
          <AmField label="Call to action">
            <AmSelect value={ad.cta} onChange={v => setAd(a => ({ ...a, cta: v }))} options={TT_CTAS.map(c => ({ value: c, label: CTA_LABEL[c] }))} width={220} />
          </AmField>
        </div>
      </AmCard>
      <AmCard title="Destination">
        <div className="tt-fields">
          <AmField label="Website URL">
            <AmInput value={ad.spark ? (() => { const p = s.store.products.find(x => x.id === firstPost?.storeProductId); return p ? productUrl(s, p) : '' })() : product ? productUrl(s, product) : ''} disabled placeholder="Select a product" />
          </AmField>
        </div>
      </AmCard>
      <AmCard title="Tracking">
        <div className="tt-row" style={{ fontSize: 13 }}>
          <span className={`tt-dot tt-dot-${pixel ? 'success' : 'warning'}`} />
          Website events: {pixel ? 'TikTak Pixel (Shopifly)' : 'No pixel connected'}
        </div>
      </AmCard>
    </>
  )

  // ---- side panel ----
  let side: ReactNode
  if (step === 'campaign') {
    side = (
      <AmCard title="Campaign summary">
        <div className="tt-est">
          <div className="tt-est-row"><span>Objective</span><b>Web conversions</b></div>
          <div className="tt-est-row"><span>Campaign type</span><b>{isSmart ? 'Smart+' : 'Manual'}</b></div>
          <div className="tt-est-row"><span>Budget</span><b>{cbo ? (Number.isFinite(num(camp.budget)) ? `${amFmt.money(num(camp.budget))} daily` : 'Campaign level') : 'Ad group level'}</b></div>
          <div className="tt-est-row"><span>Ad account</span><b>{acc.name}</b></div>
          <span className="tt-faint tt-small">TikTak minimums: {amFmt.money(minDailyBudget('tiktak', 'campaign'))}/day per campaign budget, {amFmt.money(minDailyBudget('tiktak', 'adset'))}/day per ad group.</span>
        </div>
      </AmCard>
    )
  } else if (step === 'adgroup') {
    side = <AudienceEstimate s={s} targeting={isSmart ? { ...DEFAULT_TARGETING, geo: group.targeting.geo } : group.targeting} budget={Number.isFinite(groupBudgetForEstimate) ? groupBudgetForEstimate : 0} />
  } else {
    side = (
      <AmCard title="Preview">
        <div className="tt-preview">
          {firstCreative ? (
            <AdPreview
              platform="tiktak"
              productImage={creativeThumb(firstCreative)}
              hookText={firstCreative.hookText}
              caption={ad.spark ? sparkText : ad.text || 'Your ad text appears here'}
              script={firstCreative.script}
              brandName={ident}
              cta={CTA_LABEL[ad.cta]}
              likes={firstPost?.likes ?? 0}
              comments={firstPost?.comments ?? 0}
              shares={firstPost?.shares ?? 0}
              isVideo={firstCreative.isVideo}
              durationSec={firstCreative.durationSec}
              width={compact ? 220 : 250}
            />
          ) : (
            <span className="tt-muted tt-small" style={{ padding: '40px 0' }}>Select a video to preview your ad.</span>
          )}
          <span className="tt-preview-note">Preview on the For You feed. Actual display may vary.</span>
          {be && (
            <div className="tt-est" style={{ width: '100%', paddingTop: 8, borderTop: '1px solid var(--am-divider-soft)' }}>
              <span className="tt-strong tt-small">Your numbers (Shopifly)</span>
              <div className="tt-est-row"><span>Break-even cost per purchase</span><b>{amFmt.money(be.cpa)}</b></div>
              <div className="tt-est-row"><span>Break-even ROAS</span><b>{be.roas.toFixed(2)}</b></div>
            </div>
          )}
        </div>
      </AmCard>
    )
  }

  const errorsHere = tried[step] && !stepOk(step)
  return (
    <div className="tt-create">
      <header className="tt-create-head">
        <AmButton variant="tertiary" icon={ArrowLeft} ariaLabel="Exit" onClick={() => setExitOpen(true)} />
        <span className="tt-create-head-title">{title}</span>
        <div className="tt-create-steps">
          {compact ? (
            <span className="tt-muted tt-small">Step {idx + 1} of {steps.length}</span>
          ) : (
            <Stepper steps={stepDefs} current={step} onStepClick={id => goto(id as Step)} orientation="horizontal" />
          )}
        </div>
        {!compact && <span className="tt-faint tt-small" style={{ whiteSpace: 'nowrap' }}>{acc.name}</span>}
      </header>
      <div className="tt-create-body" ref={bodyRef}>
        <div className={cx('tt-create-grid', !compact && 'tt-create-grid-outline')}>
          {!compact && (
            <nav className="tt-outline" aria-label="Campaign structure">
              {mode !== 'new' && existingCampaign && (
                <div className="tt-outline-item tt-outline-fixed">
                  <span className="tt-outline-icon"><Megaphone size={14} /></span>
                  <span className="tt-outline-text"><span className="tt-outline-kind">Campaign</span><span className="tt-outline-name">{existingCampaign.name}</span></span>
                </div>
              )}
              {mode === 'ad' && existingSet && (
                <div className="tt-outline-item tt-outline-fixed tt-outline-l1">
                  <span className="tt-outline-icon"><UsersRound size={14} /></span>
                  <span className="tt-outline-text"><span className="tt-outline-kind">Ad group</span><span className="tt-outline-name">{existingSet.name}</span></span>
                </div>
              )}
              {steps.map(st => {
                const def = stepDefs.find(d => d.id === st)!
                const depth = st === 'campaign' ? 0 : st === 'adgroup' ? 1 : 2
                const name = st === 'campaign' ? camp.name : st === 'adgroup' ? group.name : ad.name
                const Icon = st === 'campaign' ? Megaphone : st === 'adgroup' ? UsersRound : Clapperboard
                return (
                  <button
                    key={st}
                    type="button"
                    className={cx('tt-outline-item', `tt-outline-l${depth}`, st === step && 'tt-outline-on', def.status === 'error' && 'tt-outline-err')}
                    aria-current={st === step ? 'step' : undefined}
                    onClick={() => goto(st)}
                  >
                    <span className="tt-outline-icon"><Icon size={14} /></span>
                    <span className="tt-outline-text">
                      <span className="tt-outline-kind">{def.label}</span>
                      <span className="tt-outline-name">{name.trim() || 'Untitled'}</span>
                    </span>
                    {def.status === 'complete' && <Check size={14} className="tt-outline-ok" />}
                    {def.status === 'error' && <CircleAlert size={14} className="tt-outline-bad" />}
                  </button>
                )
              })}
            </nav>
          )}
          <div className="tt-create-form">
            {step === 'campaign' && campaignStep}
            {step === 'adgroup' && groupStep}
            {step === 'ad' && adStep}
          </div>
          <aside className="tt-create-side">{side}</aside>
        </div>
      </div>
      <footer className="tt-create-foot">
        <span className={cx('tt-create-foot-msg', (errorsHere || submitError) && 'tt-create-foot-msg-error')}>
          {submitError ? <><CircleAlert size={14} /> {submitError}</> : errorsHere ? <><CircleAlert size={14} /> Fix the highlighted fields to continue.</> : step === 'ad' ? <><BadgeDollarSign size={14} /> You&apos;ll only be charged when your ads deliver.</> : null}
        </span>
        {idx > 0 && <AmButton onClick={() => setStep(steps[idx - 1])}>Back</AmButton>}
        {idx < steps.length - 1 ? (
          <AmButton variant="primary" onClick={next}>Continue</AmButton>
        ) : (
          <AmButton variant="primary" onClick={submit}>Submit</AmButton>
        )}
      </footer>
      <AmModal
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        title="Exit without submitting?"
        size="sm"
        inline
        footer={<><AmButton onClick={() => setExitOpen(false)}>Keep editing</AmButton><AmButton variant="danger" onClick={() => navigate('campaign')}>Exit</AmButton></>}
      >
        <span style={{ fontSize: 13 }}>Your {mode === 'new' ? 'campaign' : mode === 'adgroup' ? 'ad group' : 'ad'} won&apos;t be saved.</span>
      </AmModal>
    </div>
  )
}

