// Full-screen overlays: Settings, How to play, Daily report.
import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import clsx from 'clsx'
import { BookOpen, Download, FileUp, Keyboard, LogOut, Save, SlidersHorizontal, Volume2, X, BarChart3, Gamepad2, ChevronLeft, ChevronRight } from 'lucide-react'
import type { GameState } from '../../core/types'
import { act, getGS, useGS } from '../../core/store'
import { openSite, useUI, usePauseWhileMounted } from '../../core/ui'
import { exportSave, importSave, saveGame } from '../../core/save'
import { DIFFICULTY } from '../../core/difficulty'
import { money, pct } from '../../core/format'
import { formatDate } from '../../core/time'
import { sfx, setMasterVolume, setMusicOn, setMusicVolume, setSfxOn, setSfxVolume, setMuted, useAudioPrefs } from '../audio'
import { Switch, useDismiss } from './common'
import { isAutopilot, setAutopilot } from '../../sim/life'
import { enterGame, quitToTitle } from './actions'
import { useShell, useShellPrefs, pushToast } from './shellStore'
import { recapInsight } from './recap'

export default function Overlays() {
  const overlay = useUI(u => u.overlay)
  const close = useCallback(() => useUI.getState().set({ overlay: null }), [])
  if (overlay === 'settings') return <SettingsOverlay onClose={close} />
  if (overlay === 'help') return <HelpOverlay onClose={close} />
  if (overlay === 'daily_report') return <DailyReportOverlay onClose={close} />
  return null
}

function OverlayShell({ title, icon, onClose, children, wide, className, headExtra }: { title: string; icon: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; className?: string; headExtra?: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null)
  useDismiss(true, onClose, [panelRef])
  // menus and reports are a pause screen: the clock waits while you read
  usePauseWhileMounted('shell-overlay')
  return (
    <div className="sh-ov-layer">
      <div className="sh-ov-backdrop" />
      <div ref={panelRef} className={clsx('sh-ov', wide && 'is-wide', className)} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sh-ov-head">
          <span className="sh-ov-icon">{icon}</span>
          <h2>{title}</h2>
          {headExtra}
          <button type="button" className="sh-ov-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="sh-ov-body">{children}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function Slider({ value, onChange, disabled, label }: { value: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  return (
    <div className={clsx('sh-slider', disabled && 'is-disabled')}>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        disabled={disabled}
        aria-label={label}
        onChange={e => onChange(Number(e.target.value) / 100)}
        onPointerUp={() => sfx.click()}
        style={{ '--sh-fill': `${Math.round(value * 100)}%` } as CSSProperties}
      />
      <span className="sh-slider-val">{Math.round(value * 100)}</span>
    </div>
  )
}

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="sh-set-row">
      <div className="sh-set-text">
        <div className="sh-set-title">{title}</div>
        {desc && <div className="sh-set-desc">{desc}</div>}
      </div>
      <div className="sh-set-ctl">{children}</div>
    </div>
  )
}

function SettingsOverlay({ onClose }: { onClose: () => void }) {
  const muted = useUI(u => u.muted)
  const volume = useUI(u => u.volume)
  const musicOn = useUI(u => u.musicOn)
  const slot = useUI(u => u.slot)
  const musicVolume = useAudioPrefs(a => a.musicVolume)
  const sfxVolume = useAudioPrefs(a => a.sfxVolume)
  const sfxOn = useAudioPrefs(a => a.sfxOn)
  const difficulty = useGS(s => s.meta.difficulty)
  const autopilot = useGS(s => isAutopilot(s))
  const coachEnabled = useGS(s => s.coach.enabled)
  const recapToasts = useShellPrefs(p => p.recapToasts)
  const setPrefs = useShellPrefs(p => p.set)

  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [pendingImport, setPendingImport] = useState<GameState | null>(null)
  const [importErr, setImportErr] = useState<string | null>(null)
  const [confirmQuit, setConfirmQuit] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const saveNow = async () => {
    setSaving('saving')
    try {
      await saveGame(slot, getGS())
      setSaving('saved')
      sfx.ping()
      window.setTimeout(() => setSaving(s => (s === 'saved' ? 'idle' : s)), 2200)
    } catch {
      setSaving('error')
      sfx.error()
    }
  }

  const onFile = async (f: File | undefined) => {
    setImportErr(null)
    if (!f) return
    try {
      const st = await importSave(f)
      setPendingImport(st)
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : 'That file is not a Dropship Tycoon save.')
      sfx.error()
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmImport = async () => {
    if (!pendingImport) return
    try {
      await saveGame(slot, pendingImport)
    } catch {
      /* still load it; the next autosave will persist it */
    }
    enterGame(pendingImport, slot)
    pushToast({ kind: 'system', title: 'Save imported', body: `${pendingImport.meta.playerName} is now in slot ${slot + 1}.` })
    sfx.levelUp()
  }

  return (
    <OverlayShell title="Settings" icon={<SlidersHorizontal size={18} />} onClose={onClose}>
      <section className="sh-set-sec">
        <h3>
          <Volume2 size={15} /> Sound
        </h3>
        <Row title="Master volume" desc={muted ? 'Muted' : undefined}>
          <Switch checked={!muted} onChange={v => setMuted(!v)} label="Sound on" />
          <Slider value={volume} onChange={setMasterVolume} disabled={muted} label="Master volume" />
        </Row>
        <Row title="Music" desc="Lo-fi beats while you grind.">
          <Switch checked={musicOn} onChange={setMusicOn} label="Music" />
          <Slider value={musicVolume} onChange={setMusicVolume} disabled={muted || !musicOn} label="Music volume" />
        </Row>
        <Row title="Sound effects" desc="Cha-chings, pings and fryer sizzles.">
          <Switch checked={sfxOn} onChange={setSfxOn} label="Sound effects" />
          <Slider value={sfxVolume} onChange={setSfxVolume} disabled={muted || !sfxOn} label="Effects volume" />
        </Row>
      </section>

      <section className="sh-set-sec">
        <h3>
          <Gamepad2 size={15} /> Gameplay
        </h3>
        <Row title="Autopilot" desc="When you're idle: eat when hungry, sleep at night or when exhausted, and head to scheduled shifts.">
          <Switch
            checked={autopilot}
            onChange={v => act(s => setAutopilot(s, v))}
            label="Autopilot"
          />
        </Row>
        <Row title="Coach Kev tips" desc={DIFFICULTY[difficulty].coach === 'on_request' ? 'On Realistic Kev only speaks when asked (Ecom Academy → Ask Kev).' : 'Proactive tips when Kev spots a mistake or an opportunity.'}>
          <Switch
            checked={coachEnabled}
            onChange={v =>
              act(s => {
                s.coach.enabled = v
                if (!v) s.coach.queue = []
              })
            }
            label="Coach tips"
          />
        </Row>
        <Row title="Midnight recap" desc="A P&L toast when each in-game day ends.">
          <Switch checked={recapToasts} onChange={v => setPrefs({ recapToasts: v })} label="Midnight recap" />
        </Row>
        <Row title="Difficulty" desc={DIFFICULTY[difficulty].description}>
          <span className={clsx('sh-diff-pill', `is-${difficulty}`)}>{DIFFICULTY[difficulty].label}</span>
        </Row>
      </section>

      <section className="sh-set-sec">
        <h3>
          <Save size={15} /> Save
        </h3>
        <p className="sh-set-note">
          Playing in <b>slot {slot + 1}</b>. The game autosaves every in-game midnight and when you leave the tab.
        </p>
        <div className="sh-set-btns">
          <button type="button" className="sh-btn sh-btn-primary" onClick={saveNow} disabled={saving === 'saving'}>
            <Save size={15} /> {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved ✓' : saving === 'error' ? 'Retry save' : 'Save now'}
          </button>
          <button
            type="button"
            className="sh-btn sh-btn-ghost"
            onClick={() => {
              exportSave(getGS())
              sfx.click()
            }}
          >
            <Download size={15} /> Export .json
          </button>
          <button type="button" className="sh-btn sh-btn-ghost" onClick={() => fileRef.current?.click()}>
            <FileUp size={15} /> Import .json
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => void onFile(e.target.files?.[0])} />
        </div>
        {saving === 'error' && <p className="sh-set-err">Couldn't write to browser storage. Export a .json backup to be safe.</p>}
        {importErr && <p className="sh-set-err">{importErr}</p>}
        {pendingImport && (
          <div className="sh-confirm">
            <div>
              Load <b>{pendingImport.meta.playerName}</b> ({DIFFICULTY[pendingImport.meta.difficulty]?.label ?? pendingImport.meta.difficulty}, day {Math.floor(pendingImport.time.hour / 24) + 1})? This replaces the game in slot {slot + 1}.
            </div>
            <div className="sh-confirm-btns">
              <button type="button" className="sh-btn sh-btn-sm sh-btn-ghost" onClick={() => setPendingImport(null)}>
                Cancel
              </button>
              <button type="button" className="sh-btn sh-btn-sm sh-btn-danger" onClick={() => void confirmImport()}>
                Replace &amp; load
              </button>
            </div>
          </div>
        )}
        <div className="sh-set-quit">
          {confirmQuit ? (
            <div className="sh-confirm">
              <div>Save and return to the title screen?</div>
              <div className="sh-confirm-btns">
                <button type="button" className="sh-btn sh-btn-sm sh-btn-ghost" onClick={() => setConfirmQuit(false)}>
                  Keep playing
                </button>
                <button type="button" className="sh-btn sh-btn-sm sh-btn-danger" onClick={() => void quitToTitle()}>
                  <LogOut size={14} /> Save &amp; quit
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="sh-btn sh-btn-ghost is-danger-text" onClick={() => setConfirmQuit(true)}>
              <LogOut size={15} /> Quit to title
            </button>
          )}
        </div>
      </section>

      <section className="sh-set-sec">
        <h3>
          <Keyboard size={15} /> Shortcuts
        </h3>
        <div className="sh-keys">
          <span>
            <kbd>Space</kbd> Pause / resume
          </span>
          <span>
            <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> Speed 1× / 2× / 4×
          </span>
          <span>
            <kbd>Esc</kbd> Close computer or menu
          </span>
        </div>
        <button
          type="button"
          className="sh-link-btn"
          onClick={() => {
            useUI.getState().set({ overlay: 'help' })
          }}
        >
          <BookOpen size={14} /> How to play
        </button>
      </section>
    </OverlayShell>
  )
}

// ---------------------------------------------------------------------------
// How to play (also used on the title screen)
// ---------------------------------------------------------------------------
export function HowToPlay() {
  return (
    <div className="sh-howto">
      <p className="sh-howto-lead">
        You're 22, broke, and working the fryer at McDoodle's. Your parents' basement is free, your credit card is not. Build a dropshipping business that can pay for a better life, then quit.
      </p>
      <ol className="sh-howto-steps">
        <li>
          <b>Find a product.</b> Browse <em>AliExprez</em> and research it. Order counts, reviews, competitor prices and trend arrows are clues; the hidden truth is inferable.
        </li>
        <li>
          <b>Build the page.</b> Import it into <em>Shopifly</em>. Price for margin (a 2× markup rarely survives ad costs), write your own copy, and add proof. Copying the supplier's title is punished.
        </li>
        <li>
          <b>Make creatives.</b> In <em>CreatorHub</em>, pick a format, hook and angle that fit the product. Film it yourself, edit supplier footage, or hire a creator.
        </li>
        <li>
          <b>Buy ads.</b> Launch on <em>Fadbook</em> and <em>TikTak</em>. Test several creatives, kill losers, and scale winners in small steps. Big budget jumps reset learning.
        </li>
        <li>
          <b>Read the numbers.</b> Platforms over-report purchases, so trust Shopifly's orders. Watch CTR, hook rate, CVR and frequency, and watch your cash, because ads get billed before payouts land.
        </li>
        <li>
          <b>Live your life.</b> Eat, sleep, see friends, show up to your shifts. Move out when you can afford it, hire help, and quit when the store can carry you.
        </li>
      </ol>
      <div className="sh-howto-controls">
        <span>
          <kbd>Space</kbd> pause
        </span>
        <span>
          <kbd>1</kbd>
          <kbd>2</kbd>
          <kbd>3</kbd> speed
        </span>
        <span>Click the bed, fridge, computer and door in your room</span>
      </div>
    </div>
  )
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <OverlayShell title="How to play" icon={<BookOpen size={18} />} onClose={onClose}>
      <HowToPlay />
    </OverlayShell>
  )
}

// ---------------------------------------------------------------------------
// Daily report (opened from the midnight recap toast)
// ---------------------------------------------------------------------------
function PnlLine({ label, value, sub, strong, neutral }: { label: string; value: number; sub?: string; strong?: boolean; neutral?: boolean }) {
  if (!strong && Math.abs(value) < 0.005) return null
  return (
    <div className={clsx('sh-pnl-line', strong && 'is-total')}>
      <span>
        {label}
        {sub && <small>{sub}</small>}
      </span>
      <span className={clsx(!neutral && (value < 0 ? 'is-neg' : value > 0 && strong ? 'is-pos' : ''))}>{money(value, { sign: strong })}</span>
    </div>
  )
}

function DailyReportOverlay({ onClose }: { onClose: () => void }) {
  const recaps = useShell(s => s.recaps)
  const reportDay = useShell(s => s.reportDay)
  const storeCreated = useGS(s => s.store.created)
  const idx = reportDay === null ? recaps.length - 1 : Math.max(0, recaps.findIndex(x => x.day === reportDay))
  const r = recaps[idx] ?? null
  const step = (d: number) => {
    const next = recaps[idx + d]
    if (next) useShell.getState().set({ reportDay: next.day })
    sfx.click()
  }
  const go = (site: 'shopifly' | 'bank', path = '') => {
    openSite(site, path)
    onClose()
  }
  const nav =
    recaps.length > 1 ? (
      <span className="sh-ov-nav">
        <button type="button" className="sh-icon-btn" onClick={() => step(-1)} disabled={idx <= 0} aria-label="Previous day">
          <ChevronLeft size={18} />
        </button>
        <button type="button" className="sh-icon-btn" onClick={() => step(1)} disabled={idx >= recaps.length - 1} aria-label="Next day">
          <ChevronRight size={18} />
        </button>
      </span>
    ) : null
  return (
    <OverlayShell title={r ? `Day ${r.day + 1} recap` : 'Daily recap'} icon={<BarChart3 size={18} />} onClose={onClose} wide headExtra={nav}>
      {!r ? (
        <div className="sh-empty-note">Your first recap lands at midnight.</div>
      ) : (
        <div className="sh-report">
          <div className="sh-report-date">{formatDate(r.day, 'long')}</div>
          <div className="sh-report-kpis">
            <div className={clsx('sh-kpi', r.profit > 0 ? 'is-pos' : r.profit < 0 ? 'is-neg' : '')}>
              <span>Business profit</span>
              <b>{money(r.profit, { sign: true })}</b>
            </div>
            <div className="sh-kpi">
              <span>Revenue</span>
              <b>{money(r.revenue)}</b>
            </div>
            <div className="sh-kpi">
              <span>Orders</span>
              <b>{r.orders.toLocaleString('en-US')}</b>
            </div>
            <div className="sh-kpi">
              <span>Blended ROAS</span>
              <b>{r.adSpend > 0 ? r.roas.toFixed(2) : '—'}</b>
            </div>
          </div>
          {recapInsight(r) && <div className="sh-report-insight">💡 {recapInsight(r)}</div>}
          <div className="sh-report-cols">
            <div className="sh-report-card">
              <h4>Profit &amp; loss</h4>
              {!r.hasBusiness && <div className="sh-report-empty">No store activity this day. Your P&amp;L fills in once you spend on ads or make a sale.</div>}
              <PnlLine label="Revenue" value={r.revenue} strong={false} neutral />
              <PnlLine label="Refunds & chargebacks" value={-r.refunds} />
              <PnlLine label="Product & shipping" value={-r.cogs} />
              <PnlLine label="Ad spend" value={-r.adSpend} sub={r.adSpendFadbook && r.adSpendTiktak ? ` Fadbook ${money(r.adSpendFadbook, { cents: false })} · TikTak ${money(r.adSpendTiktak, { cents: false })}` : undefined} />
              <PnlLine label="Payment fees" value={-r.fees} />
              <PnlLine label="Apps & plan" value={-r.apps} />
              <PnlLine label="Creatives" value={-r.creatives} />
              <PnlLine label="Staff" value={-r.staff} />
              <PnlLine label="Other business" value={-r.other} />
              <PnlLine label="Business profit" value={r.profit} strong />
              {r.inventory > 0 && <div className="sh-pnl-foot">Inventory bought: {money(r.inventory)} (an asset, not an expense)</div>}
            </div>
            <div className="sh-report-card">
              <h4>Store funnel</h4>
              <div className="sh-pnl-line">
                <span>Sessions</span>
                <span>{r.sessions.toLocaleString('en-US')}</span>
              </div>
              <div className="sh-pnl-line">
                <span>Conversion rate</span>
                <span>{r.sessions ? pct(r.cvr) : '—'}</span>
              </div>
              <div className="sh-pnl-line">
                <span>Average order value</span>
                <span>{r.orders ? money(r.aov) : '—'}</span>
              </div>
              <h4 className="sh-report-h4b">Personal</h4>
              <PnlLine label="Wages" value={r.wage} neutral />
              <PnlLine label="Personal spending" value={-r.personalSpend} />
              <div className="sh-pnl-line is-total">
                <span>Checking at midnight</span>
                <span>
                  {money(r.cashEnd)}
                  {r.cashDelta !== null && Math.abs(r.cashDelta) >= 0.01 && <small className={r.cashDelta < 0 ? 'is-neg' : 'is-pos'}> {money(r.cashDelta, { sign: true })}</small>}
                </span>
              </div>
              {r.netWorth !== null && (
                <div className="sh-pnl-line">
                  <span>Net worth</span>
                  <span>
                    {money(r.netWorth)}
                    {r.netWorthDelta !== null && Math.abs(r.netWorthDelta) >= 0.01 && <small className={r.netWorthDelta < 0 ? 'is-neg' : 'is-pos'}> {money(r.netWorthDelta, { sign: true })}</small>}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="sh-set-btns">
            {storeCreated && (
              <button type="button" className="sh-btn sh-btn-primary" onClick={() => go('shopifly', 'analytics')}>
                Open Shopifly analytics
              </button>
            )}
            <button type="button" className="sh-btn sh-btn-ghost" onClick={() => go('bank')}>
              Open Chaise Bank
            </button>
          </div>
        </div>
      )}
    </OverlayShell>
  )
}
