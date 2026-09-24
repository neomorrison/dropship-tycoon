// Chaise Bank building blocks (bk- classes).
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { Flash } from './lifeCommon'

export function Panel({ title, action, children, className, pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`bk-panel${className ? ` ${className}` : ''}`}>
      {(title || action) && (
        <header className="bk-panel-head">
          {title && <h2>{title}</h2>}
          {action && <div className="bk-panel-action">{action}</div>}
        </header>
      )}
      <div className={pad ? 'bk-panel-body' : ''}>{children}</div>
    </section>
  )
}

export function Notice({ tone, title, children, action }: { tone: 'critical' | 'warning' | 'info' | 'success'; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'critical' ? XCircle : tone === 'warning' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info
  return (
    <div className={`bk-notice is-${tone}`} role={tone === 'critical' ? 'alert' : undefined}>
      <Icon size={18} className="bk-notice-icon" />
      <div className="bk-notice-text">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {action && <div className="bk-notice-action">{action}</div>}
    </div>
  )
}

export function FlashBar({ flash }: { flash: Flash | null }) {
  if (!flash) return null
  return (
    <Notice tone={flash.tone === 'critical' ? 'critical' : flash.tone === 'warning' ? 'warning' : flash.tone === 'success' ? 'success' : 'info'}>
      {flash.text}
    </Notice>
  )
}

export function KV({ label, value, sub, strong }: { label: ReactNode; value: ReactNode; sub?: ReactNode; strong?: boolean }) {
  return (
    <div className={`bk-kv${strong ? ' is-strong' : ''}`}>
      <span className="bk-kv-label">{label}</span>
      <span className="bk-kv-value">{value}</span>
      {sub && <span className="bk-kv-sub">{sub}</span>}
    </div>
  )
}

export function Btn({ children, onClick, kind = 'primary', disabled, small, type = 'button' }: {
  children: ReactNode; onClick?: () => void; kind?: 'primary' | 'secondary' | 'link' | 'danger'; disabled?: boolean; small?: boolean; type?: 'button' | 'submit'
}) {
  return (
    <button type={type} className={`bk-btn is-${kind}${small ? ' is-small' : ''}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

export function Meter({ value, tone }: { value: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const v = Math.max(0, Math.min(1, value))
  const t = tone ?? (v >= 0.9 ? 'bad' : v >= 0.5 ? 'warn' : 'ok')
  return (
    <div className="bk-meter" role="meter" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`bk-meter-fill is-${t}`} style={{ width: `${v * 100}%` }} />
    </div>
  )
}

export function Amount({ n, cents = true, colored }: { n: number; cents?: boolean; colored?: boolean }) {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
  const cls = colored ? (n > 0.004 ? ' is-pos' : n < -0.004 ? ' is-neg' : '') : ''
  return <span className={`bk-amt${cls}`}>{n < -0.004 ? '-' : colored && n > 0.004 ? '+' : ''}${abs}</span>
}
