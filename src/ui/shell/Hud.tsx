// Top HUD: player & needs, date/clock + speed, money, today's business snapshot, actions.
import { useMemo, type ReactNode } from 'react'
import clsx from 'clsx'
import { CreditCard, Laptop, Mail, Moon, Settings, Smartphone, Sparkles, Sun, Sunrise, Sunset, Volume2, VolumeX, Wallet, Zap, Utensils, Smile } from 'lucide-react'
import { useGS, useGSShallow } from '../../core/store'
import { useUI, setSpeed, openSite, type Speed } from '../../core/ui'
import { dayOf, formatClock, formatDate, hourOfDay } from '../../core/time'
import { playerPortrait } from '../../core/assets'
import { money } from '../../core/format'
import { sfx, toggleMuted } from '../audio'
import { Img, SpeedGlyph, useFlash, portraitMood, MOOD_EMOJI, useViewportWidth } from './common'
import { setComputerOpen } from './actions'
import { NotificationBell } from './Notifications'

export default function Hud() {
  return (
    <header className="sh-hud">
      <PlayerCluster />
      <TimeCluster />
      <MoneyCluster />
      <ActionCluster />
    </header>
  )
}

// ---------------------------------------------------------------------------
// Player portrait + needs
// ---------------------------------------------------------------------------
function PlayerCluster() {
  const { name, energy, hunger, mood, burnout } = useGSShallow(s => ({
    name: s.player.name || s.meta.playerName,
    energy: s.player.energy,
    hunger: s.player.hunger,
    mood: s.player.mood,
    burnout: s.player.burnoutDays,
  }))
  const cash = useGS(s => s.finance.cash)
  const cardUsed = useGS(s => (s.finance.card.limit > 0 ? s.finance.card.balance / s.finance.card.limit : 0))
  const moneyStress = cash < 200 || cardUsed > 0.9
  const face = portraitMood(energy, mood, hunger, moneyStress)
  const status =
    burnout > 0 ? `Burned out · ${burnout}d` : energy < 20 ? 'Exhausted' : hunger < 15 ? 'Starving' : mood < 25 ? 'Miserable' : moneyStress ? 'Money stress' : face === 'happy' ? 'Feeling great' : 'Doing okay'
  return (
    <div className="sh-hud-group sh-hud-player">
      <div className={clsx('sh-portrait', `is-${face}`)} title={status}>
        <Img key={face} src={playerPortrait(face)} alt={`${name} looks ${face}`} className="sh-portrait-img" fallback={<span className="sh-portrait-fallback">{MOOD_EMOJI[face]}</span>} />
      </div>
      <div className="sh-player-info">
        <div className="sh-player-name">
          <span>{name}</span>
          <span className={clsx('sh-player-status', (burnout > 0 || energy < 20 || hunger < 15 || mood < 25) && 'is-bad')}>{status}</span>
        </div>
        <div className="sh-needs">
          <Need icon={<Zap size={11} strokeWidth={2.6} />} label="Energy" value={energy} tone="energy" />
          <Need icon={<Utensils size={11} strokeWidth={2.6} />} label="Hunger" value={hunger} tone="hunger" />
          <Need icon={<Smile size={11} strokeWidth={2.6} />} label="Mood" value={mood} tone="mood" />
        </div>
      </div>
    </div>
  )
}

function Need({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: 'energy' | 'hunger' | 'mood' }) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  const level = v < 20 ? 'crit' : v < 40 ? 'low' : 'ok'
  return (
    <div className={clsx('sh-need', `is-${tone}`, `is-${level}`)} title={`${label} ${Math.round(v)}/100`} aria-label={`${label} ${Math.round(v)} of 100`}>
      <span className="sh-need-icon">{icon}</span>
      <span className="sh-need-track">
        <span className="sh-need-fill" style={{ transform: `scaleX(${v / 100})` }} />
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Date, clock, speed
// ---------------------------------------------------------------------------
const SPEEDS: { speed: Speed; n: number; key: string; label: string }[] = [
  { speed: 0, n: 0, key: 'Space', label: 'Pause' },
  { speed: 1, n: 1, key: '1', label: 'Normal speed' },
  { speed: 2, n: 2, key: '2', label: 'Fast' },
  { speed: 4, n: 3, key: '3', label: 'Fastest' },
]

function TimeCluster() {
  const hour = useGS(s => s.time.hour)
  const sleeping = useGS(s => s.player.activity?.kind === 'sleep')
  const modalCount = useGS(s => s.events.modals.length)
  const activeEvents = useGS(s => s.events.active)
  const speed = useUI(u => u.speed)
  const locked = useUI(u => u.pauseLocks.length > 0)
  const step = useUI(u => Math.floor(u.hourFrac * 6))
  const narrow = useViewportWidth() < 560
  const day = dayOf(hour)
  const h = hourOfDay(hour)
  const Icon = h >= 21 || h < 5 ? Moon : h < 8 ? Sunrise : h >= 17 ? Sunset : Sun
  const eventChip = useMemo(() => {
    const now = activeEvents.filter(e => e.startDay <= day && e.endDay >= day)
    return now.length ? now : null
  }, [activeEvents, day])
  const blocked = speed !== 0 && (locked || modalCount > 0)
  return (
    <div className="sh-hud-group sh-hud-time">
      <div className="sh-clock">
        <div className="sh-clock-date">
          {formatDate(day, narrow ? 'md' : 'medium').replace(/, \d{4}$/, '')}
          <span className="sh-clock-day">Day {day + 1}</span>
        </div>
        <div className="sh-clock-time">
          <Icon size={15} strokeWidth={2.4} className="sh-clock-icon" />
          <span>{formatClock(hour, step / 6)}</span>
        </div>
      </div>
      <div className="sh-speed" role="group" aria-label="Game speed">
        {SPEEDS.map(sp => (
          <button
            key={sp.speed}
            type="button"
            className={clsx('sh-speed-btn', speed === sp.speed && 'is-active', sp.speed === 0 && 'is-pause')}
            onClick={() => {
              setSpeed(sp.speed)
              sfx.click()
            }}
            title={`${sp.label} (${sp.key})`}
            aria-label={sp.label}
            aria-pressed={speed === sp.speed}
          >
            <SpeedGlyph n={sp.n} />
          </button>
        ))}
      </div>
      {speed === 0 ? (
        <span className="sh-time-chip is-paused">Paused</span>
      ) : blocked ? (
        <span className="sh-time-chip is-locked" title={modalCount ? 'Waiting for your decision' : 'Auto-paused while you edit'}>
          {modalCount ? 'Decision' : 'Auto-paused'}
        </span>
      ) : sleeping ? (
        <span className="sh-time-chip is-sleep" title="Time runs 4× faster while you sleep">
          Zz ×{speed * 4}
        </span>
      ) : null}
      {eventChip && (
        <span className="sh-time-chip is-event" title={eventChip.map(e => e.title).join('\n')}>
          <Sparkles size={11} strokeWidth={2.6} />
          {eventChip[0].title}
          {eventChip.length > 1 && ` +${eventChip.length - 1}`}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Money & today's snapshot
// ---------------------------------------------------------------------------
function MoneyCluster() {
  const cash = useGS(s => s.finance.cash)
  const { balance, limit, frozen } = useGSShallow(s => ({ balance: s.finance.card.balance, limit: s.finance.card.limit, frozen: s.finance.card.frozen }))
  const storeCreated = useGS(s => s.store.created)
  const day = useGS(s => dayOf(s.time.hour))
  const pnl = useGS(s => s.finance.pnl[dayOf(s.time.hour)])
  const orders = useGS(s => s.store.analytics.daily[dayOf(s.time.hour)]?.orders ?? 0)
  const cashFlash = useFlash(cash)
  const sales = pnl?.revenue ?? 0
  const adSpend = (pnl?.adSpendFadbook ?? 0) + (pnl?.adSpendTiktak ?? 0)
  const salesFlash = useFlash(sales)
  const used = limit > 0 ? Math.min(1, balance / limit) : 0
  const cardTone = frozen ? 'crit' : used > 0.9 ? 'crit' : used > 0.7 ? 'warn' : 'ok'
  const roas = adSpend > 0 ? sales / adSpend : null
  return (
    <div className="sh-hud-group sh-hud-money">
      <button type="button" className={clsx('sh-stat', cashFlash && `flash-${cashFlash}`, cash < 0 && 'is-neg')} onClick={() => openSite('bank')} title="Chaise checking — open bank">
        <span className="sh-stat-label">
          <Wallet size={12} strokeWidth={2.4} /> Cash
        </span>
        <span className="sh-stat-value">{money(cash, { compact: Math.abs(cash) >= 100_000 })}</span>
      </button>
      <button type="button" className={clsx('sh-stat sh-stat-card', `is-${cardTone}`)} onClick={() => openSite('bank')} title={frozen ? 'Card frozen — pay it down in Chaise Bank' : `Sapphire card: ${money(balance)} used of ${money(limit, { cents: false })}`}>
        <span className="sh-stat-label">
          <CreditCard size={12} strokeWidth={2.4} /> {frozen ? 'Card frozen' : 'Card'}
        </span>
        <span className="sh-stat-value">
          {money(balance, { cents: false, compact: balance >= 100_000 })}
          <small> / {money(limit, { cents: false, compact: limit >= 100_000 })}</small>
        </span>
        <span className="sh-card-bar">
          <span style={{ transform: `scaleX(${used})` }} />
        </span>
      </button>
      {storeCreated ? (
        <button type="button" className={clsx('sh-today', salesFlash === 'up' && 'flash-up')} onClick={() => openSite('shopifly', 'analytics')} title={`Today (Day ${day + 1}) — open Shopifly analytics`}>
          <span className="sh-today-cell">
            <span className="sh-stat-label">Sales</span>
            <span className="sh-today-value is-sales">{money(sales, { cents: sales < 1000, compact: sales >= 100_000 })}</span>
          </span>
          <span className="sh-today-cell">
            <span className="sh-stat-label">Ad spend</span>
            <span className="sh-today-value">{money(adSpend, { cents: adSpend < 1000, compact: adSpend >= 100_000 })}</span>
          </span>
          <span className="sh-today-cell">
            <span className="sh-stat-label">Orders</span>
            <span className="sh-today-value">{orders.toLocaleString('en-US')}</span>
          </span>
          {roas !== null && (
            <span className="sh-today-cell is-roas">
              <span className="sh-stat-label">ROAS</span>
              <span className={clsx('sh-today-value', roas >= 2 ? 'is-good' : roas < 1 ? 'is-bad' : '')}>{roas.toFixed(2)}</span>
            </span>
          )}
        </button>
      ) : (
        <button type="button" className="sh-today sh-today-cta" onClick={() => openSite('shopifly')}>
          <span className="sh-today-bag">🛍</span>
          <span>
            <b>No store yet</b>
            <small>Start a Shopifly trial</small>
          </span>
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Computer, bell, mail, sound, settings
// ---------------------------------------------------------------------------
function ActionCluster() {
  const location = useGS(s => s.player.location)
  const unreadMail = useGS(s => {
    let n = 0
    for (const m of s.inbox) if (!m.read) n++
    return n
  })
  const computerOpen = useUI(u => u.computerOpen)
  const muted = useUI(u => u.muted)
  const away = location !== 'home'
  return (
    <div className="sh-hud-group sh-hud-actions">
      <button
        type="button"
        className={clsx('sh-hud-btn sh-hud-computer', computerOpen && 'is-active')}
        onClick={() => setComputerOpen(!computerOpen)}
        title={computerOpen ? 'Close (Esc)' : away ? 'Check your phone' : 'Use your computer'}
      >
        {away ? <Smartphone size={17} strokeWidth={2.2} /> : <Laptop size={17} strokeWidth={2.2} />}
        <span className="sh-hud-btn-label">{away ? 'Phone' : 'Computer'}</span>
      </button>
      <NotificationBell />
      <button type="button" className="sh-hud-icon" onClick={() => openSite('mail')} title={unreadMail ? `${unreadMail} unread emails` : 'Inboxly'} aria-label="Mail">
        <Mail size={18} strokeWidth={2.2} />
        {unreadMail > 0 && <span className="sh-badge">{unreadMail > 99 ? '99+' : unreadMail}</span>}
      </button>
      <button type="button" className="sh-hud-icon sh-hide-sm" onClick={() => toggleMuted()} title={muted ? 'Unmute' : 'Mute'} aria-label={muted ? 'Unmute' : 'Mute'}>
        {muted ? <VolumeX size={18} strokeWidth={2.2} /> : <Volume2 size={18} strokeWidth={2.2} />}
      </button>
      <button
        type="button"
        className="sh-hud-icon"
        onClick={() => {
          useUI.getState().set({ overlay: 'settings' })
          sfx.click()
        }}
        title="Settings"
        aria-label="Settings"
      >
        <Settings size={18} strokeWidth={2.2} />
      </button>
    </div>
  )
}
