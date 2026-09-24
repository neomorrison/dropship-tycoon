// Who makes the creative: you (film / supplier edit), a marketplace creator, the agency, or staff.
import type { ReactNode } from 'react'
import {
  AlertTriangle, Building2, Camera, Check, Clock, ExternalLink, Lightbulb, Mic, Monitor, Scissors, Smile, Sparkles, UserCheck,
  Users, Home, Flame, CircleMinus, CirclePlus, CircleX,
} from 'lucide-react'
import type { CreativeProducer, FormatId, GameState, ProductDef } from '../../../../core/types'
import { openSite } from '../../../../core/ui'
import { money } from '../../../../core/format'
import { formatDate, dayOf } from '../../../../core/time'
import { FORMATS, PRODUCER_INFO, SUPPLIER_EDIT_FORMATS, formatName } from '../../../../data/creativeTaxonomy'
import { CREATOR_TIERS } from '../../../../data/creators'
import { GEAR } from '../../../../data/gear'
import { apartmentDef } from '../../../../data/apartments'
import { Stars, cx } from '../../../kit/common'
import { useBriefDraft } from '../draft'
import { AGENCY_NAME, NICHE_LABEL, fmtDayRange, fmtHourAbs, fmtMinutes, type SampleStatus } from '../helpers'
import type { BriefModel, ProducerOption } from './model'
import { Badge, Chip, Portrait, QualityMeter } from '../ui'

const PRODUCER_ICON: Record<CreativeProducer, typeof Camera> = {
  self: Camera, supplier_edit: Scissors, ugc: Users, agency: Building2, staff: UserCheck,
}

export function ProducerStep({ s, model, format, navigate, compact }: {
  s: GameState
  model: BriefModel
  format: FormatId | null
  navigate: (path: string) => void
  compact: boolean
}) {
  const producer = useBriefDraft(d => d.producer)
  const patch = useBriefDraft.getState().patch
  const sel = model.selected
  return (
    <div className="ch-producers">
      <div className={cx('ch-producer-grid', compact && 'is-compact')} role="radiogroup" aria-label="Producer">
        {model.producers.map(p => {
          const Icon = PRODUCER_ICON[p.id]
          const on = p.id === producer
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={cx('ch-producer', on && 'is-on', p.blocked && 'is-blocked')}
              onClick={() => patch({ producer: p.id, creatorId: p.id === 'ugc' ? (model.creator?.id ?? null) : p.id === 'staff' ? (model.staffMember?.id ?? null) : null })}
            >
              <span className="ch-producer-top">
                <span className="ch-producer-icon"><Icon size={18} strokeWidth={2} /></span>
                {on && <span className="ch-option-check"><Check size={12} strokeWidth={3} /></span>}
              </span>
              <span className="ch-producer-name">{p.name}</span>
              <span className="ch-producer-facts">
                <span><b>{p.costLabel}</b></span>
                <span className="ch-muted"><Clock size={11} />{p.id === 'ugc' && !model.creator ? 'Shipping + 3–8 days' : p.timeLabel}</span>
              </span>
              {p.blocked && p.id !== 'ugc' && <span className="ch-producer-block"><AlertTriangle size={11} />{shortBlock(p.blocked)}</span>}
              {p.blocked && p.id === 'ugc' && model.creator && <span className="ch-producer-block"><AlertTriangle size={11} />{shortBlock(p.blocked)}</span>}
            </button>
          )
        })}
      </div>

      {sel && (
        <div className="ch-detail ch-producer-detail">
          <p className="ch-detail-lead">
            {sel.id === 'ugc'
              // the shared blurb says "your sample"; the job actually ships a fresh unit (or one from 3PL stock), which is what's charged below
              ? 'A creator films the video in their own home and style. A fresh unit ships to them from the supplier (or from your 3PL stock), so delivery time includes shipping.'
              : PRODUCER_INFO[sel.id].description}
          </p>
          {sel.id === 'self' && <SelfDetail s={s} opt={sel} format={format} sample={model.sample} />}
          {sel.id === 'supplier_edit' && <SupplierDetail opt={sel} />}
          {sel.id === 'ugc' && <UgcDetail s={s} model={model} navigate={navigate} />}
          {sel.id === 'agency' && <AgencyDetail opt={sel} />}
          {sel.id === 'staff' && <StaffDetail model={model} />}
          {sel.blocked && (sel.id !== 'ugc' || model.creator) && (
            <div className="ch-block-msg"><AlertTriangle size={15} /><span>{sel.blocked}</span></div>
          )}
        </div>
      )}
    </div>
  )
}

function shortBlock(t: string): string {
  const first = t.split(/(?<=\.)\s/)[0]
  return first.length > 64 ? first.slice(0, 62).trimEnd() + '…' : first
}

// ---------------------------------------------------------------------------
// Film yourself
// ---------------------------------------------------------------------------
type FactorTone = 'plus' | 'none' | 'minus'
function Factor({ icon, label, value, tone, hint }: { icon: ReactNode; label: string; value: ReactNode; tone: FactorTone; hint?: string }) {
  const T = tone === 'plus' ? CirclePlus : tone === 'minus' ? CircleX : CircleMinus
  return (
    <li className={cx('ch-factor', `is-${tone}`)}>
      <span className="ch-factor-icon">{icon}</span>
      <span className="ch-factor-text">
        <span className="ch-factor-label">{label}</span>
        <span className="ch-factor-value">{value}</span>
        {hint && <span className="ch-factor-hint">{hint}</span>}
      </span>
      <T size={15} className="ch-factor-tone" aria-label={tone === 'plus' ? 'helps' : tone === 'minus' ? 'hurts' : 'no effect'} />
    </li>
  )
}

const gearDef = (id?: string) => (id ? GEAR.find(g => g.id === id) : undefined)

function SelfDetail({ s, opt, format, sample }: { s: GameState; opt: ProducerOption; format: FormatId | null; sample: SampleStatus | null }) {
  const eq = s.gear.equipped
  const phone = gearDef(eq.phone)
  const camera = gearDef(eq.camera)
  const light = gearDef(eq.lighting)
  const audio = gearDef(eq.audio)
  const computer = gearDef(eq.computer)
  const capture = (camera?.filmQuality ?? 0) > (phone?.filmQuality ?? 0) ? camera : phone
  const talking = format ? FORMATS[format].talking : false
  const lvl = s.skills.creative?.level ?? 1
  const apt = apartmentDef(s.home.tier)
  const mood = Math.round(s.player.mood)
  return (
    <div className="ch-self">
      <div className="ch-self-left">
        {opt.quality && <QualityMeter lo={opt.quality[0]} hi={opt.quality[1]} />}
        <div className="ch-kv">
          <span><Clock size={13} />Filming & editing</span><b>~{fmtMinutes(opt.minutes)}</b>
          <span><Clock size={13} />Starts</span><b>{opt.waitMinutes > 0 ? `after your queue (~${fmtMinutes(opt.waitMinutes)})` : 'right away'}</b>
          <span><Check size={13} />Ready around</span><b>{opt.readyHour != null ? fmtHourAbs(opt.readyHour) : '—'}</b>
          <span><Camera size={13} />Product</span><b>{sample ? sample.label : '—'}</b>
        </div>
        <p className="ch-help">The game clock keeps running while you film. Your energy drains like any work session.</p>
      </div>
      <ul className="ch-factors" aria-label="What shapes your footage">
        <Factor icon={<Camera size={15} />} label="Camera" value={capture?.name ?? 'Phone'} tone={(capture?.filmQuality ?? 0) > 0 ? 'plus' : 'none'} hint={(capture?.filmQuality ?? 0) > 0 ? undefined : 'A newer phone or a mirrorless camera sharpens every shot.'} />
        <Factor icon={<Lightbulb size={15} />} label="Lighting" value={light?.name ?? 'Room light only'} tone={light ? 'plus' : 'none'} hint={light ? undefined : 'Even a cheap ring light makes footage look clean.'} />
        <Factor
          icon={<Mic size={15} />} label="Audio"
          value={talking ? (audio?.name ?? 'Phone mic') : 'Not needed for this format'}
          tone={talking && audio?.talkingBonus ? 'plus' : 'none'}
          hint={talking && !audio ? 'Talking-to-camera formats sound better with a lav mic.' : undefined}
        />
        <Factor icon={<Monitor size={15} />} label="Editing rig" value={computer?.name ?? 'Laptop'} tone={computer?.editBonus ? 'plus' : 'none'} />
        <Factor icon={<Sparkles size={15} />} label="Creative skill" value={`Level ${lvl}`} tone={lvl > 1 ? 'plus' : 'none'} hint={lvl <= 1 ? 'Study creative in Ecom Academy or keep shooting to level up.' : undefined} />
        <Factor icon={<Home size={15} />} label="Filming space" value={apt.name} tone={apt.filmingBonus > 0 ? 'plus' : 'none'} hint={apt.filmingBonus > 0 ? undefined : 'Nicer apartments have better light and backdrops.'} />
        <Factor icon={<Smile size={15} />} label="Mood" value={`${mood}/100`} tone={mood < 30 ? 'minus' : 'none'} hint={mood < 30 ? 'Low mood shows on camera.' : undefined} />
        {s.player.burnoutDays > 0 && <Factor icon={<Flame size={15} />} label="Burnout" value={`${s.player.burnoutDays} day${s.player.burnoutDays === 1 ? '' : 's'} left`} tone="minus" hint="Burned-out shoots look flat." />}
      </ul>
      <div className="ch-self-actions">
        <button type="button" className="ch-link-btn" onClick={() => openSite('amazin')}>Shop creator gear on Amazin <ExternalLink size={12} /></button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Supplier edit
// ---------------------------------------------------------------------------
function SupplierDetail({ opt }: { opt: ProducerOption }) {
  return (
    <div className="ch-self">
      <div className="ch-self-left">
        {opt.quality && <QualityMeter lo={opt.quality[0]} hi={opt.quality[1]} />}
        <div className="ch-kv">
          <span><Clock size={13} />Editing</span><b>~{fmtMinutes(opt.minutes)}</b>
          <span><Clock size={13} />Starts</span><b>{opt.waitMinutes > 0 ? `after your queue (~${fmtMinutes(opt.waitMinutes)})` : 'right away'}</b>
          <span><Check size={13} />Ready around</span><b>{opt.readyHour != null ? fmtHourAbs(opt.readyHour) : '—'}</b>
        </div>
      </div>
      <div className="ch-self-right">
        <div className="ch-note ch-note-warn">
          <AlertTriangle size={15} />
          <span><b>Shared footage.</b> Every store selling this item can download the same supplier clip and photos, so viewers may have already seen it.</span>
        </div>
        <div className="ch-note">
          <Scissors size={15} />
          <span>Works as: {SUPPLIER_EDIT_FORMATS.map(f => formatName(f)).join(', ')}.</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// UGC creator
// ---------------------------------------------------------------------------
function UgcDetail({ s, model, navigate }: { s: GameState; model: BriefModel; navigate: (p: string) => void }) {
  const creatorId = useBriefDraft(d => d.creatorId)
  const patch = useBriefDraft.getState().patch
  const p: ProductDef | null = model.pdef
  const today = dayOf(s.time.hour)
  const inStock = (model.sample?.units ?? 0) > 0
  const delay = Math.max(0, Math.round(s.events.modifiers.dropshipDelayDays || 0))
  const ship: [number, number] = inStock ? [3, 3] : p ? [p.shipDays[0] + delay, p.shipDays[1] + delay] : [7, 20]
  const unit = p && !inStock ? +(p.cogs + p.shipCost).toFixed(2) : 0
  const cr = model.creator
  if (!model.ugcCreators.length) {
    return <p className="ch-help">No creators are listed this week. The marketplace refreshes every Monday.</p>
  }
  return (
    <div className="ch-ugc">
      <div className="ch-ugc-head">
        <span className="ch-kicker">This week's creators</span>
        <button type="button" className="ch-link-btn" onClick={() => navigate('creators')}>Full profiles <ExternalLink size={12} /></button>
      </div>
      <div className="ch-creator-rows" role="radiogroup" aria-label="Creator">
        {model.ugcCreators.map(c => {
          const on = c.id === creatorId
          const match = p ? c.niches.includes(p.niche) : false
          return (
            <button key={c.id} type="button" role="radio" aria-checked={on} className={cx('ch-creator-row', on && 'is-on')} onClick={() => patch({ creatorId: c.id })}>
              <span className={cx('ch-radio', on && 'is-on')} aria-hidden />
              <Portrait id={c.portrait} name={c.name} size={38} />
              <span className="ch-creator-row-main">
                <span className="ch-creator-row-name">{c.name} <Badge tone={c.tier === 'star' ? 'accent' : c.tier === 'pro' ? 'info' : 'subdued'}>{CREATOR_TIERS[c.tier].label}</Badge></span>
                <span className="ch-creator-row-meta">
                  <Stars rating={c.rating} size={11} /> {c.rating.toFixed(1)} · {c.jobs} jobs · {c.style === 'native' ? 'Native style' : 'Polished style'}
                  {match && p && <Chip className="ch-chip-match">{NICHE_LABEL[p.niche]} niche</Chip>}
                </span>
              </span>
              <span className="ch-creator-row-price">
                <b>{money(c.pricePerVideo, { cents: false })}</b>
                <small>{c.deliveryDays[0]}–{c.deliveryDays[1]} days to film</small>
              </span>
            </button>
          )
        })}
      </div>
      {cr && (
        <div className="ch-costbox">
          <div className="ch-costbox-rows">
            <span>Creator fee ({cr.name.split(' ')[0]})</span><b>{money(cr.pricePerVideo)}</b>
            <span>{inStock ? 'Unit from your 3PL stock' : 'Unit shipped to the creator (product + shipping)'}</span><b>{inStock ? 'from stock' : money(unit)}</b>
            <span className="ch-costbox-total">Charged now</span><b className="ch-costbox-total">{money(cr.pricePerVideo + unit)}</b>
          </div>
          <div className="ch-costbox-timeline">
            <span><i className="is-done" />Brief sent today</span>
            <span><i />Product reaches {cr.name.split(' ')[0]} {fmtDayRange(today + ship[0], today + ship[1])}</span>
            <span><i />Video delivered {fmtDayRange(today + ship[0] + cr.deliveryDays[0], today + ship[1] + cr.deliveryDays[1])}</span>
          </div>
          {cr.expiresDay != null && <p className="ch-help">Listing open until {formatDate(cr.expiresDay, 'md')}. Once briefed, the job stays booked.</p>}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agency
// ---------------------------------------------------------------------------
function AgencyDetail({ opt }: { opt: ProducerOption }) {
  return (
    <div className="ch-self">
      <div className="ch-self-left">
        {opt.quality && <QualityMeter lo={opt.quality[0]} hi={opt.quality[1]} label="Production quality" />}
        <div className="ch-kv">
          <span><Building2 size={13} />Studio</span><b>{AGENCY_NAME}</b>
          <span><Sparkles size={13} />You get</span><b>3 variations of this brief</b>
          <span><Clock size={13} />Turnaround</span><b>{opt.timeLabel}</b>
          {opt.readyDays && <><span><Check size={13} />Expected</span><b>{fmtDayRange(opt.readyDays[0], opt.readyDays[1])}</b></>}
          <span><Check size={13} />Price</span><b>{money(opt.cost, { cents: false })} ({money(opt.cost / 3)} each)</b>
        </div>
      </div>
      <div className="ch-self-right">
        <div className="ch-note">
          <Sparkles size={15} />
          <span>Variation 1 uses your hook text. The studio writes its own hook copy for variations 2 and 3.</span>
        </div>
        <div className="ch-note">
          <Camera size={15} />
          <span>Studio lighting, pro edit and color grade: a polished, ad-style finish. No product needed; the studio sources its own unit.</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------
function StaffDetail({ model }: { model: BriefModel }) {
  const creatorId = useBriefDraft(d => d.creatorId)
  const patch = useBriefDraft.getState().patch
  return (
    <div className="ch-creator-rows" role="radiogroup" aria-label="Team member">
      {model.ugcStaff.map(m => {
        const on = (creatorId ?? model.staffMember?.id) === m.id
        return (
          <button key={m.id} type="button" role="radio" aria-checked={on} className={cx('ch-creator-row', on && 'is-on')} onClick={() => patch({ creatorId: m.id })}>
            <span className={cx('ch-radio', on && 'is-on')} aria-hidden />
            <Portrait id={m.portrait} name={m.name} size={38} />
            <span className="ch-creator-row-main">
              <span className="ch-creator-row-name">{m.name} <Badge tone="success">On your team</Badge></span>
              <span className="ch-creator-row-meta">Skill {m.skill}/10 · morale {Math.round(m.morale)}{m.weeklyQuota ? ` · ${m.producedThisWeek ?? 0}/${m.weeklyQuota} videos this week` : ''}</span>
            </span>
            <span className="ch-creator-row-price"><b>Salary</b><small>1–2 days</small></span>
          </button>
        )
      })}
    </div>
  )
}
