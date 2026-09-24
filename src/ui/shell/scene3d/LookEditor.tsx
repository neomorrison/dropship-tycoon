// Create-a-sim, compact: a live preview on the studio pedestal (drag to spin) and tabs of swatches and chips.
// Used by the New game "Look" step and by the in-game "Change look" overlay.
import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Dices, RotateCcw, RotateCw } from 'lucide-react'
import { useStage } from '../../../three/react'
import { HAIR_STYLES, LOOK_PRESETS, resolveLook } from '../../../three/looks'
import type { Accessory, HairStyle, Look, TopStyle } from '../../../three/types'
import { sfx } from '../../audio'
import { mark3dFailed, stageUrl, use3dSession, useStageQuality } from './session'
import './scene3d.css'

const PRESET_IDS = ['player', ...Array.from({ length: 18 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`)]
const SKIN = ['#f6d8c4', '#f0cdb4', '#e3b08d', '#d9a07a', '#c98e65', '#b57a55', '#8d5a3c', '#6b4230', '#4a2c20']
const HAIR = ['#1f1a17', '#3f2a20', '#6f4b33', '#b8532e', '#e3c27a', '#eadcb5', '#cfcac4', '#e7a6c9', '#6f8fbf', '#4f9a93']
const TOPS = ['#a7a3a0', '#2b2d33', '#f3f2ef', '#efe4cf', '#e88c73', '#e2b24c', '#8fae8a', '#4f9a93', '#6f8fbf', '#3e4f75', '#a693c9', '#d99a9a']
const BOTTOMS = ['#3e4f75', '#2b2d33', '#4f5a6b', '#6f8fbf', '#6f6a60', '#b9a58a', '#a7a3a0', '#6f4b33']
const SHOES = ['#f3f2ef', '#2b2d33', '#6f4b33', '#b07e55', '#e88c73', '#6f8fbf', '#e2b24c']
const ACC_COLORS = ['#2b2d33', '#f3f2ef', '#d8352a', '#e2b24c', '#3e4f75', '#4f9a93', '#c3b3e0', '#d99a9a', '#8a6a4f']
const HAIR_LABEL: Record<HairStyle, string> = {
  short: 'Short', messy: 'Messy', long: 'Long', bun: 'Bun', braids: 'Braids', afro: 'Afro', buzz: 'Buzz', curly: 'Curly', ponytail: 'Ponytail', bob: 'Bob', bald: 'Bald',
}
const TOP_STYLES: { id: TopStyle; label: string }[] = [
  { id: 'tee', label: 'Tee' }, { id: 'hoodie', label: 'Hoodie' }, { id: 'polo', label: 'Polo' }, { id: 'sweater', label: 'Sweater vest' }, { id: 'blazer', label: 'Blazer' },
]
const EXTRAS: { id: Accessory; label: string }[] = [
  { id: 'glasses', label: '👓 Glasses' }, { id: 'headphones', label: '🎧 Headphones' }, { id: 'beard', label: '🧔 Beard' }, { id: 'scarf', label: '🧣 Scarf' },
  { id: 'cap', label: '🧢 Cap' }, { id: 'cap_back', label: '🧢 Backwards cap' }, { id: 'beanie', label: 'Beanie' }, { id: 'flatcap', label: 'Flat cap' }, { id: 'hijab', label: 'Hijab' },
]
const HATS: Accessory[] = ['cap', 'cap_back', 'beanie', 'flatcap', 'hijab']
const HEIGHTS = [{ v: 0.94, label: 'Short' }, { v: 1, label: 'Average' }, { v: 1.06, label: 'Tall' }]
const BUILDS = [{ v: 0.9, label: 'Slim' }, { v: 1, label: 'Average' }, { v: 1.12, label: 'Broad' }]

type Tab = 'body' | 'hair' | 'outfit' | 'extras'
const TABS: { id: Tab; label: string }[] = [
  { id: 'body', label: 'Body' }, { id: 'hair', label: 'Hair' }, { id: 'outfit', label: 'Outfit' }, { id: 'extras', label: 'Extras' },
]

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length) % a.length]
const near = (a: number, b: number) => Math.abs(a - b) < 0.02

/** A random, good-looking look (UI only). */
export function randomLook(): Look {
  const acc: Accessory[] = []
  if (Math.random() < 0.3) acc.push('glasses')
  if (Math.random() < 0.28) acc.push(pick(['cap', 'cap_back', 'beanie', 'flatcap'] as Accessory[]))
  if (Math.random() < 0.15) acc.push(pick(['headphones', 'scarf', 'beard'] as Accessory[]))
  const hairStyle = pick(HAIR_STYLES)
  return resolveLook({
    skin: pick(SKIN), hair: Math.random() < 0.8 ? pick(HAIR.slice(0, 7)) : pick(HAIR), hairStyle,
    top: pick(TOPS), topStyle: pick(TOP_STYLES).id, bottom: pick(BOTTOMS), shoes: pick(SHOES),
    acc, accColor: pick(ACC_COLORS), height: pick(HEIGHTS).v, build: pick(BUILDS).v,
  })
}

export default function LookEditor({ value, onChange }: { value: Look; onChange: (l: Look) => void }) {
  const [tab, setTab] = useState<Tab>('body')
  const look = useMemo(() => resolveLook(value), [value])
  const set = (p: Partial<Look>) => {
    sfx.click()
    onChange(resolveLook({ ...look, ...p }))
  }
  const toggleAcc = (a: Accessory) => {
    const has = look.acc?.includes(a)
    let acc = (look.acc ?? []).filter(x => x !== a)
    if (!has) {
      if (HATS.includes(a)) acc = acc.filter(x => !HATS.includes(x))
      acc.push(a)
    }
    set({ acc })
  }
  const presetOn = PRESET_IDS.find(id => JSON.stringify(resolveLook(LOOK_PRESETS[id])) === JSON.stringify(look)) ?? null
  const hasHat = (look.acc ?? []).some(a => HATS.includes(a) || a === 'headphones' || a === 'scarf')

  return (
    <div className="sh-look">
      <LookPreview look={look} />
      <div className="sh-look-controls">
        <div className="sh-look-presets" role="radiogroup" aria-label="Starting looks">
          {PRESET_IDS.map((id, i) => {
            const p = resolveLook(LOOK_PRESETS[id])
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={presetOn === id}
                aria-label={`Look ${i + 1}`}
                className={clsx('sh-look-preset', presetOn === id && 'is-on')}
                style={{ background: `linear-gradient(180deg, ${p.hair} 0 30%, ${p.skin} 30% 58%, ${p.top} 58% 100%)` }}
                onClick={() => {
                  sfx.click()
                  onChange(resolveLook(LOOK_PRESETS[id]))
                }}
              />
            )
          })}
        </div>
        <div className="sh-look-tabs" role="tablist">
          {TABS.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={clsx('sh-look-tab', tab === t.id && 'is-on')} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="sh-look-panel" role="tabpanel">
          {tab === 'body' && (
            <>
              <Swatches label="Skin" colors={SKIN} value={look.skin} onPick={skin => set({ skin })} />
              <Chips label="Height" items={HEIGHTS.map(h => ({ id: String(h.v), label: h.label }))} value={String(HEIGHTS.find(h => near(h.v, look.height ?? 1))?.v ?? '')} onPick={v => set({ height: Number(v) })} />
              <Chips label="Build" items={BUILDS.map(h => ({ id: String(h.v), label: h.label }))} value={String(BUILDS.find(h => near(h.v, look.build ?? 1))?.v ?? '')} onPick={v => set({ build: Number(v) })} />
            </>
          )}
          {tab === 'hair' && (
            <>
              <Chips label="Style" items={HAIR_STYLES.map(h => ({ id: h, label: HAIR_LABEL[h] }))} value={look.hairStyle} onPick={v => set({ hairStyle: v as HairStyle })} />
              <Swatches label="Colour" colors={HAIR} value={look.hair} onPick={hair => set({ hair })} />
            </>
          )}
          {tab === 'outfit' && (
            <>
              <Chips label="Top" items={TOP_STYLES} value={look.topStyle ?? 'tee'} onPick={v => set({ topStyle: v as TopStyle })} />
              <Swatches label="Top colour" colors={TOPS} value={look.top} onPick={top => set({ top })} />
              <Swatches label="Bottoms" colors={BOTTOMS} value={look.bottom} onPick={bottom => set({ bottom })} />
              <Swatches label="Shoes" colors={SHOES} value={look.shoes} onPick={shoes => set({ shoes })} />
            </>
          )}
          {tab === 'extras' && (
            <>
              <div className="sh-look-row">
                <span>Wear</span>
                <div className="sh-look-chips">
                  {EXTRAS.map(x => (
                    <button key={x.id} type="button" aria-pressed={!!look.acc?.includes(x.id)} className={clsx('sh-look-chip', look.acc?.includes(x.id) && 'is-on')} onClick={() => toggleAcc(x.id)}>
                      {x.label}
                    </button>
                  ))}
                </div>
              </div>
              {hasHat && <Swatches label="Hat & scarf colour" colors={ACC_COLORS} value={look.accColor ?? look.top} onPick={accColor => set({ accColor })} />}
            </>
          )}
        </div>
        <div className="sh-look-foot">
          <button
            type="button"
            className="sh-btn sh-btn-ghost sh-btn-sm sh-look-dice"
            onClick={() => {
              sfx.pop()
              onChange(randomLook())
            }}
          >
            <Dices size={15} /> Randomise
          </button>
        </div>
      </div>
    </div>
  )
}

function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="sh-look-row">
      <span>{label}</span>
      <div className="sh-look-swatches" role="radiogroup" aria-label={label}>
        {colors.map(c => (
          <button key={c} type="button" role="radio" aria-checked={c === value.toLowerCase()} aria-label={c} className={clsx('sh-look-swatch', c === value.toLowerCase() && 'is-on')} style={{ background: c }} onClick={() => onPick(c)} />
        ))}
      </div>
    </div>
  )
}

function Chips({ label, items, value, onPick }: { label: string; items: { id: string; label: string }[]; value: string; onPick: (id: string) => void }) {
  return (
    <div className="sh-look-row">
      <span>{label}</span>
      <div className="sh-look-chips" role="radiogroup" aria-label={label}>
        {items.map(it => (
          <button key={it.id} type="button" role="radio" aria-checked={it.id === value} className={clsx('sh-look-chip', it.id === value && 'is-on')} onClick={() => onPick(it.id)}>
            {it.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The person on the studio pedestal (a simple drawn figure if 3D can't run). */
function LookPreview({ look }: { look: Look }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const quality = useStageQuality()
  const failed = use3dSession(s => s.failed)
  const stage = useStage(ref, { url: stageUrl, quality, enabled: !failed, onError: e => mark3dFailed(e) })
  const lookRef = useRef(look)
  lookRef.current = look
  useEffect(() => {
    if (!stage) return
    stage.setTimeOfDay(12)
    void stage.setRoom('studio')
    stage.setActor('preview', { look: lookRef.current })
    stage.task('preview', { kind: 'idle', at: 'spawn' })
    stage.mood('preview', 'happy')
  }, [stage])
  useEffect(() => {
    stage?.setActor('preview', { look })
  }, [stage, look])
  return (
    <div className="sh-look-stage">
      {failed ? (
        <FigureStill look={look} />
      ) : (
        <>
          <canvas ref={ref} aria-label="Your look" />
          <button type="button" className="sh-look-turn is-l" onClick={() => stage?.rotate(-45)} aria-label="Turn left">
            <RotateCcw size={15} />
          </button>
          <button type="button" className="sh-look-turn is-r" onClick={() => stage?.rotate(45)} aria-label="Turn right">
            <RotateCw size={15} />
          </button>
          <span className="sh-look-stage-hint">Drag to spin</span>
        </>
      )}
    </div>
  )
}

function FigureStill({ look }: { look: Look }) {
  return (
    <svg className="sh-look-still" viewBox="0 0 100 160" aria-label="Your look">
      <ellipse cx="50" cy="152" rx="26" ry="5" fill="rgba(42,34,51,0.12)" />
      <rect x="38" y="104" width="10" height="40" rx="5" fill={look.bottom} />
      <rect x="52" y="104" width="10" height="40" rx="5" fill={look.bottom} />
      <rect x="35" y="140" width="14" height="8" rx="4" fill={look.shoes} />
      <rect x="51" y="140" width="14" height="8" rx="4" fill={look.shoes} />
      <rect x="30" y="58" width="40" height="52" rx="14" fill={look.top} />
      <circle cx="50" cy="38" r="20" fill={look.skin} />
      {look.hairStyle !== 'bald' && <path d="M30 38 a20 20 0 0 1 40 0 q-6 -8 -20 -8 q-14 0 -20 8z" fill={look.hair} />}
      <circle cx="43" cy="40" r="2" fill="#2b2d33" />
      <circle cx="57" cy="40" r="2" fill="#2b2d33" />
      <path d="M44 47 q6 5 12 0" stroke="#2b2d33" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  )
}
