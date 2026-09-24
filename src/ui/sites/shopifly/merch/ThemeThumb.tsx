// Theme Store artwork: a miniature product-page mockup drawn in the theme's preset
// colors and shapes (rounded vs square, centered logo, promo bar), so every theme
// card and theme library row has a distinctive, recognizable preview.
import type { ThemeDef, ThemePreset } from '../../../../data/themes'

const LOOK: Record<string, { radius: number; btn: number; center: boolean; promo: boolean; serif: boolean; dark?: boolean }> = {
  dawnish: { radius: 0, btn: 0, center: false, promo: false, serif: false },
  sensed: { radius: 10, btn: 20, center: true, promo: false, serif: false },
  studioish: { radius: 0, btn: 0, center: true, promo: false, serif: true },
  shrined: { radius: 6, btn: 4, center: false, promo: true, serif: false },
  impulsive: { radius: 2, btn: 2, center: true, promo: true, serif: false },
  prestigio: { radius: 0, btn: 0, center: true, promo: false, serif: true },
  motionly: { radius: 10, btn: 20, center: false, promo: false, serif: false },
}

export function ThemeThumb({ theme, preset, device = 'desktop', label, image }: { theme: ThemeDef; preset?: ThemePreset; device?: 'desktop' | 'mobile'; label?: string; image?: string | null }) {
  const p = preset ?? theme.presets[0]
  const l = LOOK[theme.id] ?? LOOK.dawnish
  const bg = p.background
  const fg = p.primaryColor
  const soft = `${fg}1a`
  const mobile = device === 'mobile'
  return (
    <div className={`sf-mx-thumb${mobile ? ' sf-mx-thumb--mobile' : ''}`} style={{ background: bg }} aria-label={label ?? `${theme.name} preview`} role="img">
      {l.promo && <div className="sf-mx-thumb-promo" style={{ background: p.accent }} />}
      <div className="sf-mx-thumb-head" style={{ justifyContent: l.center ? 'center' : 'space-between', borderColor: soft }}>
        <span className="sf-mx-thumb-logo" style={{ background: fg, borderRadius: l.serif ? 0 : 2 }} />
        {!l.center && !mobile && (
          <span className="sf-mx-thumb-nav">
            <i style={{ background: soft }} /><i style={{ background: soft }} /><i style={{ background: soft }} />
          </span>
        )}
      </div>
      <div className="sf-mx-thumb-body">
        <div className="sf-mx-thumb-img" style={{ background: `linear-gradient(135deg, ${soft}, ${p.accent}33)`, borderRadius: l.radius }}>
          {image && <img src={image} alt="" loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
        </div>
        <div className="sf-mx-thumb-info">
          <span className="sf-mx-thumb-line" style={{ background: fg, width: '82%', height: l.serif ? 7 : 6 }} />
          <span className="sf-mx-thumb-line" style={{ background: soft, width: '55%' }} />
          <span className="sf-mx-thumb-price" style={{ background: p.accent }} />
          <span className="sf-mx-thumb-btn" style={{ border: `1px solid ${fg}`, borderRadius: l.btn }} />
          <span className="sf-mx-thumb-btn" style={{ background: fg, borderRadius: l.btn }} />
          <span className="sf-mx-thumb-line" style={{ background: soft, width: '90%' }} />
          <span className="sf-mx-thumb-line" style={{ background: soft, width: '70%' }} />
        </div>
      </div>
    </div>
  )
}
