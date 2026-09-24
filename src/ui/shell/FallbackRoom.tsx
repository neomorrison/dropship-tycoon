// CSS-illustrated room used when the generated room art is missing.
// Furniture is drawn exactly inside the FALLBACK_* hotspot rects so the invisible
// buttons line up with what the player sees.
import type { CSSProperties } from 'react'
import clsx from 'clsx'
import { FALLBACK_HOME, FALLBACK_WORK, type Rect } from './hotspots'

const at = (r: Rect | undefined): CSSProperties =>
  r ? { left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` } : { display: 'none' }

/** wall / floor / accent palette per apartment tier */
const PALETTES: { wall: string; wall2: string; floor: string; floor2: string; blanket: string; accent: string }[] = [
  { wall: '#d9b99a', wall2: '#c9a584', floor: '#a47552', floor2: '#946848', blanket: '#8fb4d9', accent: '#e8c07d' }, // basement paneling
  { wall: '#f0dcd0', wall2: '#e6ccbd', floor: '#c49a74', floor2: '#b88d68', blanket: '#e59aa6', accent: '#f6d77a' }, // shared apt
  { wall: '#e3ecef', wall2: '#d3dfe3', floor: '#caa37f', floor2: '#bd9672', blanket: '#9fc6a8', accent: '#f1c26b' }, // studio
  { wall: '#c86f55', wall2: '#b9624a', floor: '#8b6a52', floor2: '#7e5f49', blanket: '#e9e2d4', accent: '#f0b35e' }, // brick loft
  { wall: '#dbe8ef', wall2: '#cadbe4', floor: '#b98c63', floor2: '#ad8159', blanket: '#f2b8c6', accent: '#ffd479' }, // house
  { wall: '#2b3350', wall2: '#232a44', floor: '#8d8f99', floor2: '#7f818b', blanket: '#e8e4dc', accent: '#9fb6ff' }, // penthouse
]

export function FallbackHome({ tier, night }: { tier: number; night: boolean }) {
  const p = PALETTES[Math.max(0, Math.min(PALETTES.length - 1, tier))]
  const L = FALLBACK_HOME
  return (
    <div
      className={clsx('sh-fr', night && 'is-night', tier === 3 && 'is-brick', tier === 5 && 'is-luxe')}
      style={{ '--fr-wall': p.wall, '--fr-wall2': p.wall2, '--fr-floor': p.floor, '--fr-floor2': p.floor2, '--fr-blanket': p.blanket, '--fr-accent': p.accent } as CSSProperties}
      aria-hidden
    >
      <div className="sh-fr-wall" />
      <div className="sh-fr-floor" />
      <div className="sh-fr-baseboard" />
      <div className={clsx('sh-fr-window', tier === 5 && 'is-wide')}>
        <div className="sh-fr-sky" />
        {tier === 5 && <div className="sh-fr-skyline" />}
        <div className="sh-fr-orb" />
        <div className="sh-fr-mullion" />
      </div>
      <div className="sh-fr-frame" />
      {tier >= 1 && <div className="sh-fr-lights">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 0.37}s` }} />)}</div>}
      <div className="sh-fr-rug" />
      <div className="sh-fr-plant"><i /><i /><i /><b /></div>

      <div className="sh-fr-bed" style={at(L.bed)}>
        <div className="sh-fr-headboard" />
        <div className="sh-fr-mattress" />
        <div className="sh-fr-pillow" />
        <div className="sh-fr-blanket" />
      </div>

      <div className="sh-fr-desk" style={at(L.computer)}>
        <div className={clsx('sh-fr-screen', tier >= 3 && 'is-dual')}>
          <i />
          {tier >= 3 && <i />}
        </div>
        <div className="sh-fr-lamp" />
        <div className="sh-fr-desktop" />
        <div className="sh-fr-leg is-l" />
        <div className="sh-fr-leg is-r" />
        <div className="sh-fr-chair" />
      </div>

      <div className="sh-fr-fridge" style={at(L.fridge)}>
        <div className="sh-fr-freezer" />
        <div className="sh-fr-magnets"><i /><i /><i /></div>
      </div>

      <div className="sh-fr-door" style={at(L.door)}>
        <div className="sh-fr-doorpanel" />
        <div className="sh-fr-knob" />
      </div>
    </div>
  )
}

export function FallbackWork() {
  const L = FALLBACK_WORK
  return (
    <div className="sh-fr sh-fr-work" aria-hidden>
      <div className="sh-fr-wall" />
      <div className="sh-fr-floor is-checker" />
      <div className="sh-fr-menuboards"><i>🍔</i><i>🍟</i><i>🥤</i></div>
      <div className="sh-fr-fryer" style={at(L.fryer)}>
        <div className="sh-fr-hood" />
        <div className="sh-fr-vat"><span>🍟</span></div>
      </div>
      <div className="sh-fr-counter" style={at(L.counter)}>
        <div className="sh-fr-register is-a" />
        <div className="sh-fr-register is-b" />
        <div className="sh-fr-counterfront" />
      </div>
      <div className="sh-fr-booth" />
      <div className="sh-fr-door is-glass" style={at(L.exit)}>
        <div className="sh-fr-doorpanel" />
        <div className="sh-fr-knob" />
      </div>
    </div>
  )
}
