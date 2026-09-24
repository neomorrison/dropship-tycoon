// Live phone preview of the brief + the order summary / submit card.
import { useMemo } from 'react'
import { AlertCircle, ArrowRight, Check, CircleDashed, PartyPopper, RotateCcw } from 'lucide-react'
import type { StoreProduct } from '../../../../core/types'
import { productImage } from '../../../../core/assets'
import { money } from '../../../../core/format'
import { ANGLES, FORMATS, HOOKS, formatName } from '../../../../data/creativeTaxonomy'
import { AdPreview, type AdPlatform } from '../../../kit/phone'
import { cx } from '../../../kit/common'
import { useBriefDraft } from '../draft'
import { briefDurationSec, fmtClip, fmtDayRange, fmtHourAbs } from '../helpers'
import type { BriefModel, StepId } from './model'
import { ConfirmButton, Segmented } from '../ui'

const PLATFORMS: { value: AdPlatform; label: string }[] = [
  { value: 'tiktak', label: 'TikTak' },
  { value: 'fadbook-reels', label: 'Reels' },
  { value: 'fadbook-feed', label: 'Feed' },
]

function slideImages(sp: StoreProduct | null): string[] | undefined {
  if (!sp) return undefined
  const srcs = [...new Set([productImage(sp.catalogId), ...sp.media.map(m => m.src).filter(Boolean)])].slice(0, 5)
  return srcs.length > 1 ? srcs : undefined
}

export function PreviewCard({ model, width }: { model: BriefModel; width: number }) {
  const platform = useBriefDraft(d => d.platform)
  const format = useBriefDraft(d => d.format)
  const hookText = useBriefDraft(d => d.hookText)
  const script = useBriefDraft(d => d.script)
  const beats = useBriefDraft(d => d.beats)
  const patch = useBriefDraft.getState().patch
  const fmt = format ? FORMATS[format] : null
  const isVideo = fmt ? fmt.video : true
  const dur = briefDurationSec(format, beats.length) || 15
  const multi = format === 'slideshow' || format === 'carousel'
  const images = useMemo(() => (multi ? slideImages(model.sp) : undefined), [multi, model.sp])
  const sp = model.sp
  const caption = sp ? sp.title : 'Your product, in front of the right people'
  const freeShip = model.freeShipping ? ' · Free shipping' : ''
  return (
    <div className="ch-preview">
      <div className="ch-preview-head">
        <span className="ch-kicker">Live preview</span>
        <Segmented size="sm" options={PLATFORMS} value={platform} onChange={v => patch({ platform: v })} ariaLabel="Preview placement" />
      </div>
      <div className="ch-preview-phone">
        <AdPreview
          platform={platform}
          productImage={sp ? productImage(sp.catalogId) : null}
          images={images}
          productName={sp?.title}
          hookText={hookText}
          caption={caption}
          script={script}
          brandName={model.brandName}
          cta="Shop now"
          likes={2384}
          comments={96}
          shares={171}
          isVideo={isVideo}
          durationSec={dur}
          headline={sp?.title}
          linkDescription={sp ? `${money(sp.price)}${freeShip}` : undefined}
          domain={model.domain}
          width={width}
        />
      </div>
      <p className="ch-preview-foot">
        {fmt ? (fmt.video ? `${formatName(fmt.id)} · ${fmtClip(dur)} · ${beats.length} beat${beats.length === 1 ? '' : 's'}` : `${formatName(fmt.id)} · still`) : 'Pick a format to shape the preview'}
        <span> · Engagement counts are placeholders.</span>
      </p>
    </div>
  )
}

const STEP_LABEL: Record<StepId, string> = { product: 'Product', format: 'Format', hook: 'Hook', angle: 'Angle', script: 'Script', producer: 'Producer' }

function useSummaryRows(model: BriefModel): { step: StepId; value: string | null }[] {
  const d = useBriefDraft()
  const sel = model.selected
  return [
    { step: 'product', value: model.sp?.title ?? null },
    { step: 'format', value: d.format ? FORMATS[d.format].name : null },
    { step: 'hook', value: d.hook ? HOOKS[d.hook].name : null },
    { step: 'angle', value: d.angle ? ANGLES[d.angle].name : null },
    { step: 'script', value: d.beats.length ? `${d.beats.length} beat${d.beats.length === 1 ? '' : 's'}${d.hookText.trim() ? ' · hook text' : ''}${d.script.trim() ? ' · script' : ''}` : null },
    { step: 'producer', value: sel ? (sel.id === 'ugc' && model.creator ? model.creator.name : sel.name) : null },
  ]
}

function etaLabel(model: BriefModel): string | null {
  const sel = model.selected
  if (!sel) return null
  if (sel.readyHour != null) return fmtHourAbs(sel.readyHour)
  if (sel.readyDays) return fmtDayRange(sel.readyDays[0], sel.readyDays[1])
  return null
}
function costLabel(model: BriefModel): string {
  const sel = model.selected
  if (!sel) return '—'
  if (sel.cost > 0) return money(sel.cost)
  // no creator picked yet: the price isn't known, it certainly isn't free
  if (sel.id === 'ugc') return model.creator ? money(model.creator.pricePerVideo) : '—'
  if (sel.id === 'agency') return '—' // quoted once a product is picked
  return sel.id === 'staff' ? 'Salary' : 'Free'
}

/** Review section at the end of the form: every choice at a glance, click to jump back. */
export function ReviewCard({ model, onJump }: { model: BriefModel; onJump: (step: StepId) => void }) {
  const rows = useSummaryRows(model)
  const eta = etaLabel(model)
  return (
    <div className="ch-review">
      <ul className="ch-summary">
        {rows.map(r => (
          <li key={r.step} className={cx(r.value ? 'is-done' : 'is-todo')}>
            <button type="button" onClick={() => onJump(r.step)}>
              {r.value ? <Check size={13} strokeWidth={3} /> : <CircleDashed size={13} />}
              <span className="ch-summary-label">{STEP_LABEL[r.step]}</span>
              <span className="ch-summary-value">{r.value ?? 'Not set'}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="ch-submit-totals">
        <div><span>Cost</span><b>{costLabel(model)}</b></div>
        <div><span>Ready</span><b>{eta ?? '—'}</b></div>
        <div><span>Name</span><b className="ch-ellipsis">{model.brief?.name ?? model.autoName}</b></div>
      </div>
      {model.issues.length > 0 && (
        <ul className="ch-issues">
          {model.issues.map((iss, i) => (
            <li key={i}>
              <button type="button" onClick={() => onJump(iss.step)}><AlertCircle size={14} /><span>{iss.text}</span></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Sticky bottom bar: progress, the next blocking issue, cost and the submit button. */
export function ActionBar({ model, onSubmit, onJump, onViewLast, onFresh, lastOrderedName, onDismissLast, submitError, stacked }: {
  model: BriefModel
  onSubmit: () => void
  onJump: (step: StepId) => void
  onViewLast: () => void
  onFresh: () => void
  onDismissLast: () => void
  lastOrderedName: string | null
  submitError: string | null
  /** narrow layout: one compact row, success shown inline */
  stacked: boolean
}) {
  const rows = useSummaryRows(model)
  const done = rows.filter(r => r.value).length
  const sel = model.selected
  const blocking = model.issues[0] ?? null
  const disabled = !!blocking || !model.brief
  const eta = etaLabel(model)
  const verb = sel?.id === 'self' ? 'film' : sel?.id === 'supplier_edit' ? 'edit' : sel?.id === 'staff' ? 'assign' : 'send'
  const button = model.needsConfirm ? (
    <ConfirmButton className={stacked ? '' : 'ch-btn-lg'} disabled={disabled} confirmLabel={model.confirmLabel} onConfirm={onSubmit}>
      {stacked ? model.submitLabel.replace(/^Send brief to .*/, 'Send brief') : model.submitLabel}
    </ConfirmButton>
  ) : (
    <button type="button" className={cx('ch-btn ch-btn-primary', !stacked && 'ch-btn-lg')} disabled={disabled} onClick={onSubmit}>
      {model.submitLabel}
    </button>
  )
  const message = submitError ? (
    <span className="ch-actionbar-issue is-error"><AlertCircle size={14} /><span>{submitError}</span></span>
  ) : blocking ? (
    <button type="button" className="ch-actionbar-issue" onClick={() => onJump(blocking.step)}><AlertCircle size={14} /><span>{blocking.text}</span></button>
  ) : (
    <span className="ch-actionbar-ready"><Check size={14} strokeWidth={3} />Ready to {verb}{eta && !stacked ? ` · done ${eta}` : ''}</span>
  )

  if (stacked) {
    return (
      <div className="ch-actionbar-wrap is-stacked">
        {lastOrderedName && (
          <div className="ch-success-inline" role="status">
            <PartyPopper size={14} />
            <span className="ch-ellipsis">Sent: {lastOrderedName}</span>
            <button type="button" className="ch-link-btn" onClick={onViewLast}>View</button>
            <button type="button" className="ch-icon-btn" aria-label="Dismiss" onClick={onDismissLast}>×</button>
          </div>
        )}
        <div className="ch-actionbar">
          <div className="ch-actionbar-msg">
            {message}
            <span className="ch-actionbar-sub">{done}/{rows.length} steps · {costLabel(model)}{eta ? ` · ${eta}` : ''}</span>
          </div>
          <div className="ch-actionbar-btn">{button}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="ch-actionbar-wrap">
      {lastOrderedName && (
        <div className="ch-success" role="status">
          <PartyPopper size={18} />
          <div className="ch-success-text">
            <b>Brief sent: {lastOrderedName}</b>
            <span>Tweak the brief for another variation, or start fresh.</span>
          </div>
          <span className="ch-success-actions">
            <button type="button" className="ch-btn ch-btn-secondary ch-btn-sm" onClick={onViewLast}>View in library <ArrowRight size={12} /></button>
            <button type="button" className="ch-btn ch-btn-ghost ch-btn-sm" onClick={onFresh}><RotateCcw size={12} />Fresh brief</button>
            <button type="button" className="ch-icon-btn" aria-label="Dismiss" onClick={onDismissLast}>×</button>
          </span>
        </div>
      )}
      <div className="ch-actionbar">
        <div className="ch-actionbar-progress" aria-label={`${done} of ${rows.length} steps done`}>
          <span className="ch-ring" style={{ ['--p' as string]: `${(done / rows.length) * 100}%` }}><b>{done}/{rows.length}</b></span>
        </div>
        <div className="ch-actionbar-msg">{message}</div>
        <div className="ch-actionbar-cost">
          <span>Cost</span>
          <b>{costLabel(model)}</b>
        </div>
        <div className="ch-actionbar-btn">{button}</div>
      </div>
    </div>
  )
}
