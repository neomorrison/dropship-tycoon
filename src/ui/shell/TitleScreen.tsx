// Title screen: Continue / New game (name + difficulty + slot) / Load (3 slots, delete,
// import JSON) / How to play, over the dusk city-block art.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { ArrowLeft, BookOpen, FileUp, FolderOpen, Play, Plus, Trash2, Volume2, VolumeX, X, ShoppingBag } from 'lucide-react'
import type { Difficulty, GameState, PlayerLook } from '../../core/types'
import { useUI } from '../../core/ui'
import { createNewGame } from '../../core/newGame'
import { deleteSave, importSave, listSaves, loadGame, saveGame, SLOT_COUNT, type SaveMeta } from '../../core/save'
import { DIFFICULTY } from '../../core/difficulty'
import { roomImage } from '../../core/assets'
import { money } from '../../core/format'
import { sfx, toggleMuted, unlockAudio } from '../audio'
import { enterGame, importErrorText } from './actions'
import { HowToPlay } from './Overlays'
import { useDismiss } from './common'
import './shell.css'
import './title.css'
import { use3dPossible, use3dRoom } from './scene3d/session'
import { DEFAULT_LOOK } from '../../three/looks'

const TitleDiorama = lazy(() => import('./scene3d/TitleDiorama'))
const LookEditor = lazy(() => import('./scene3d/LookEditor'))

type View = 'menu' | 'new' | 'load' | 'help'
const DIFFS: Difficulty[] = ['chill', 'normal', 'realistic']
const DIFF_EMOJI: Record<Difficulty, string> = { chill: '🌴', normal: '☕', realistic: '🔥' }
const COACH_LABEL = { frequent: 'Coach explains everything', some: 'Coach chimes in', on_request: 'Coach only when asked' } as const

function ago(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const d = Math.floor(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

export default function TitleScreen() {
  const [view, setView] = useState<View>('menu')
  const [saves, setSaves] = useState<(SaveMeta | null)[] | null>(null)
  const [storageError, setStorageError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const muted = useUI(u => u.muted)
  const live = use3dRoom()
  const [liveReady, setLiveReady] = useState(false)
  const onLiveReady = useCallback(() => setLiveReady(true), [])
  const showLive = live && liveReady

  const refresh = useCallback(async () => {
    try {
      const list = await listSaves()
      setSaves(list)
      setStorageError(false)
    } catch {
      setSaves(Array.from({ length: SLOT_COUNT }, () => null))
      setStorageError(true)
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const latest = useMemo(() => {
    if (!saves) return null
    let best: SaveMeta | null = null
    for (const m of saves) if (m && (!best || m.savedAt > best.savedAt)) best = m
    return best
  }, [saves])

  const load = async (slot: number) => {
    setBusy(true)
    setError(null)
    try {
      const st = await loadGame(slot)
      if (!st) throw new Error('That slot is empty.')
      sfx.levelUp()
      enterGame(st, slot)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that save.')
      sfx.error()
      setBusy(false)
    }
  }

  const go = (v: View) => {
    unlockAudio()
    sfx.click()
    setError(null)
    setView(v)
  }

  return (
    <div className="sh-title">
      {live && <div className="sh-title-sky" aria-hidden />}
      <div
        className={clsx('sh-title-bg', showLive && 'is-hidden')}
        style={{ backgroundImage: `url("${roomImage('title')}"), linear-gradient(180deg, #c9b6ff 0%, #f3b8d8 45%, #ffd2a8 62%, #b9b3d6 63%, #a7a1c7 100%)` }}
        aria-hidden
      />
      {live && (
        <Suspense fallback={null}>
          <TitleDiorama onReady={onLiveReady} />
        </Suspense>
      )}
      <div className="sh-title-glow" aria-hidden />
      <div className="sh-title-sparkles" aria-hidden>
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, top: `${(i * 23) % 45}%`, animationDelay: `${(i * 0.61) % 5}s` }} />
        ))}
      </div>

      <button type="button" className="sh-title-audio" onClick={() => toggleMuted()} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Sound off' : 'Sound on'}>
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      <header className={clsx('sh-logo', view !== 'menu' && 'is-small')}>
        <div className="sh-logo-mark" aria-hidden>
          <ShoppingBag size={34} strokeWidth={2.4} />
        </div>
        <h1>
          <span className="sh-logo-a">Dropship</span>
          <span className="sh-logo-b">Tycoon</span>
        </h1>
        <p className="sh-logo-tag">From fry cook to founder.</p>
      </header>

      {view === 'menu' && (
        <nav className="sh-title-menu" aria-label="Main menu">
          {latest && (
            <button type="button" className="sh-title-btn is-primary" disabled={busy} onClick={() => void load(latest.slot)}>
              <Play size={20} fill="currentColor" />
              <span className="sh-title-btn-text">
                <b>Continue</b>
                <small>
                  {latest.playerName} · Day {latest.day + 1} · {money(latest.netWorth, { cents: false, compact: true })} net worth
                </small>
              </span>
            </button>
          )}
          <button type="button" className={clsx('sh-title-btn', !latest && 'is-primary')} onClick={() => go('new')}>
            <Plus size={20} />
            <span className="sh-title-btn-text">
              <b>New game</b>
              <small>Start broke. Leave rich (maybe).</small>
            </span>
          </button>
          <button type="button" className="sh-title-btn" onClick={() => go('load')}>
            <FolderOpen size={20} />
            <span className="sh-title-btn-text">
              <b>Load game</b>
              <small>{saves ? `${saves.filter(Boolean).length} of ${SLOT_COUNT} slots used` : 'Checking saves…'}</small>
            </span>
          </button>
          <button type="button" className="sh-title-btn is-quiet" onClick={() => go('help')}>
            <BookOpen size={20} />
            <span className="sh-title-btn-text">
              <b>How to play</b>
            </span>
          </button>
          {error && <div className="sh-title-error">{error}</div>}
        </nav>
      )}

      {view === 'new' && <NewGamePanel saves={saves} storageError={storageError} onBack={() => go('menu')} />}
      {view === 'load' && <LoadPanel saves={saves} storageError={storageError} busy={busy} error={error} onLoad={slot => void load(slot)} onChanged={refresh} onBack={() => go('menu')} />}
      {view === 'help' && (
        <TitlePanel title="How to play" onBack={() => go('menu')}>
          <HowToPlay />
          <div className="sh-panel-actions">
            <button type="button" className="sh-btn sh-btn-primary" onClick={() => go('new')}>
              Start a new game
            </button>
          </div>
        </TitlePanel>
      )}

      <footer className="sh-title-foot">All brands are parodies. Not affiliated with any real platform, marketplace or burger chain.</footer>
    </div>
  )
}

function TitlePanel({ title, onBack, children, wide }: { title: string; onBack: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(true, onBack, [ref])
  return (
    <div className="sh-title-panel-layer">
      <div ref={ref} className={clsx('sh-title-panel', wide && 'is-wide')} role="dialog" aria-label={title}>
        <div className="sh-title-panel-head">
          <button type="button" className="sh-icon-btn" onClick={onBack} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <h2>{title}</h2>
          <button type="button" className="sh-icon-btn" onClick={onBack} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="sh-title-panel-body">{children}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------
function NewGamePanel({ saves, storageError, onBack }: { saves: (SaveMeta | null)[] | null; storageError: boolean; onBack: () => void }) {
  const [name, setName] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const firstEmpty = saves ? saves.findIndex(s => !s) : 0
  const [slot, setSlot] = useState<number | null>(null)
  const chosenSlot = slot ?? (firstEmpty >= 0 ? firstEmpty : 0)
  const overwriting = saves?.[chosenSlot] ?? null
  const [starting, setStarting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const trimmed = name.trim()
  // the "Look" step (Sims-style create-a-sim) needs the 3D preview; without it the default look is used
  const lookStep = use3dPossible()
  const [step, setStep] = useState<'you' | 'look'>('you')
  const [look, setLook] = useState<PlayerLook>(DEFAULT_LOOK)

  const start = async () => {
    if (!trimmed || starting) return
    if (lookStep && step === 'you') {
      sfx.click()
      setStep('look')
      return
    }
    setStarting(true)
    setErr(null)
    let st: GameState
    try {
      st = createNewGame({ playerName: trimmed.slice(0, 24), difficulty, ...(lookStep ? { look } : {}) })
    } catch (e) {
      console.error('new game failed', e)
      setErr('Something went wrong setting up the world. Try again in a moment.')
      setStarting(false)
      sfx.error()
      return
    }
    try {
      await saveGame(chosenSlot, st)
    } catch {
      /* storage unavailable: the game still runs, it just won't persist */
    }
    unlockAudio()
    sfx.levelUp()
    enterGame(st, chosenSlot)
  }

  if (lookStep && step === 'look') {
    return (
      <TitlePanel title="Your look" onBack={() => setStep('you')} wide>
        <form
          className="sh-newgame"
          onSubmit={e => {
            e.preventDefault()
            void start()
          }}
        >
          <Suspense fallback={<div className="sh-look-loading" />}>
            <LookEditor value={look} onChange={setLook} />
          </Suspense>
          {err && <div className="sh-title-error">{err}</div>}
          <div className="sh-panel-actions">
            <button type="button" className="sh-btn sh-btn-ghost" onClick={() => setStep('you')}>
              Back
            </button>
            <button type="submit" className="sh-btn sh-btn-primary sh-btn-lg" disabled={!trimmed || starting}>
              {starting ? 'Clocking in…' : overwriting ? 'Overwrite & start' : 'Start your first shift'}
            </button>
          </div>
        </form>
      </TitlePanel>
    )
  }

  return (
    <TitlePanel title="New game" onBack={onBack} wide>
      <form
        className="sh-newgame"
        onSubmit={e => {
          e.preventDefault()
          void start()
        }}
      >
        <label className="sh-field">
          <span className="sh-field-label">Your name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jordan" maxLength={24} autoFocus autoComplete="off" spellCheck={false} />
          <span className="sh-field-hint">You'll name your store later, when you sign up for Shopifly.</span>
        </label>

        <div className="sh-field">
          <span className="sh-field-label">Difficulty</span>
          <div className="sh-diffs" role="radiogroup" aria-label="Difficulty">
            {DIFFS.map(d => {
              const def = DIFFICULTY[d]
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === d}
                  className={clsx('sh-diff', `is-${d}`, difficulty === d && 'is-selected')}
                  onClick={() => {
                    setDifficulty(d)
                    sfx.click()
                  }}
                >
                  <span className="sh-diff-top">
                    <span className="sh-diff-emoji">{DIFF_EMOJI[d]}</span>
                    <span className="sh-diff-name">{def.label}</span>
                    <span className="sh-diff-check" aria-hidden />
                  </span>
                  <span className="sh-diff-tag">{def.tagline}</span>
                  <span className="sh-diff-desc">{def.description}</span>
                  <span className="sh-diff-stats">
                    <span>
                      <small>Cash</small>
                      <b>{money(def.startingCash, { cents: false })}</b>
                    </span>
                    <span>
                      <small>Card limit</small>
                      <b>{money(def.cardLimit, { cents: false })}</b>
                    </span>
                  </span>
                  <span className="sh-diff-flags">
                    <span>{COACH_LABEL[def.coach]}</span>
                    <span>{def.taxes ? 'Quarterly taxes' : 'No taxes'}</span>
                    <span>{def.banRiskMult === 0 ? 'No ad bans' : def.banRiskMult < 1 ? 'Rare ad bans' : 'Ad bans happen'}</span>
                    <span>{def.payoutHolds ? `${def.payoutDays}-day payouts, holds` : `${def.payoutDays}-day payouts`}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="sh-field">
          <span className="sh-field-label">Save slot</span>
          <div className="sh-slotpick">
            {Array.from({ length: SLOT_COUNT }, (_, i) => {
              const m = saves?.[i] ?? null
              return (
                <button key={i} type="button" className={clsx('sh-slotpick-btn', chosenSlot === i && 'is-selected')} onClick={() => setSlot(i)}>
                  <b>Slot {i + 1}</b>
                  <small>{m ? `${m.playerName} · Day ${m.day + 1}` : 'Empty'}</small>
                </button>
              )
            })}
          </div>
          {overwriting && (
            <span className="sh-field-warn">
              Starting here overwrites {overwriting.playerName}'s game (day {overwriting.day + 1}).
            </span>
          )}
          {storageError && <span className="sh-field-warn">Browser storage is unavailable, so this run won't be saved. Use Export in Settings to keep a copy.</span>}
        </div>

        {err && <div className="sh-title-error">{err}</div>}
        <div className="sh-panel-actions">
          <button type="button" className="sh-btn sh-btn-ghost" onClick={onBack}>
            Back
          </button>
          <button type="submit" className="sh-btn sh-btn-primary sh-btn-lg" disabled={!trimmed || starting}>
            {lookStep ? 'Next: your look' : starting ? 'Clocking in…' : overwriting ? 'Overwrite & start' : 'Start your first shift'}
          </button>
        </div>
      </form>
    </TitlePanel>
  )
}

// ---------------------------------------------------------------------------
// Load / delete / import
// ---------------------------------------------------------------------------
function LoadPanel({ saves, storageError, busy, error, onLoad, onChanged, onBack }: {
  saves: (SaveMeta | null)[] | null
  storageError: boolean
  busy: boolean
  error: string | null
  onLoad: (slot: number) => void
  onChanged: () => Promise<void>
  onBack: () => void
}) {
  const [confirmDel, setConfirmDel] = useState<number | null>(null)
  const [pending, setPending] = useState<GameState | null>(null)
  const [importErr, setImportErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const del = async (slot: number) => {
    try {
      await deleteSave(slot)
      sfx.click()
    } catch {
      sfx.error()
    }
    setConfirmDel(null)
    await onChanged()
  }

  const onFile = async (f: File | undefined) => {
    setImportErr(null)
    if (!f) return
    try {
      setPending(await importSave(f))
      sfx.ping()
    } catch (e) {
      setImportErr(importErrorText(e))
      sfx.error()
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const importInto = async (slot: number) => {
    if (!pending) return
    const st = pending
    try {
      await saveGame(slot, st)
    } catch {
      /* storage unavailable: still play it */
    }
    setPending(null)
    sfx.levelUp()
    enterGame(st, slot)
  }

  return (
    <TitlePanel title="Load game" onBack={onBack} wide>
      {storageError && <div className="sh-title-error">Saves are unavailable in this browser mode (private window or blocked storage). You can still import a .json save.</div>}
      {pending && (
        <div className="sh-import-pick">
          <div>
            Import <b>{pending.meta.playerName}</b> · {DIFFICULTY[pending.meta.difficulty]?.label ?? pending.meta.difficulty} · Day {Math.floor(pending.time.hour / 24) + 1}. Pick a slot:
          </div>
          <div className="sh-slotpick">
            {Array.from({ length: SLOT_COUNT }, (_, i) => {
              const m = saves?.[i] ?? null
              return (
                <button key={i} type="button" className="sh-slotpick-btn" onClick={() => void importInto(i)}>
                  <b>Slot {i + 1}</b>
                  <small>{m ? `Replaces ${m.playerName}` : 'Empty'}</small>
                </button>
              )
            })}
          </div>
          <button type="button" className="sh-link-btn" onClick={() => setPending(null)}>
            Cancel import
          </button>
        </div>
      )}
      <div className="sh-slots">
        {Array.from({ length: SLOT_COUNT }, (_, i) => {
          const m = saves?.[i] ?? null
          if (!saves) return <div key={i} className="sh-slot is-loading" />
          if (!m) {
            return (
              <div key={i} className="sh-slot is-empty">
                <span className="sh-slot-num">{i + 1}</span>
                <span className="sh-slot-empty">Empty slot</span>
              </div>
            )
          }
          const def = DIFFICULTY[m.difficulty]
          return (
            <div key={i} className="sh-slot">
              <span className="sh-slot-num">{i + 1}</span>
              <div className="sh-slot-info">
                <div className="sh-slot-name">
                  {m.playerName}
                  <span className={clsx('sh-diff-pill', `is-${m.difficulty}`)}>{def?.label ?? m.difficulty}</span>
                </div>
                <div className="sh-slot-meta">
                  {m.storeName} · Day {m.day + 1} · {money(m.netWorth, { cents: false })} net worth
                </div>
                <div className="sh-slot-time">Saved {ago(m.savedAt)}</div>
              </div>
              <div className="sh-slot-actions">
                {confirmDel === i ? (
                  <>
                    <button type="button" className="sh-btn sh-btn-sm sh-btn-ghost" onClick={() => setConfirmDel(null)}>
                      Keep
                    </button>
                    <button type="button" className="sh-btn sh-btn-sm sh-btn-danger" onClick={() => void del(i)}>
                      Delete forever
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="sh-icon-btn" onClick={() => setConfirmDel(i)} aria-label={`Delete slot ${i + 1}`} title="Delete">
                      <Trash2 size={16} />
                    </button>
                    <button type="button" className="sh-btn sh-btn-primary sh-btn-sm" disabled={busy} onClick={() => onLoad(i)}>
                      <Play size={14} fill="currentColor" /> Load
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {(error || importErr) && <div className="sh-title-error">{error || importErr}</div>}
      <div className="sh-panel-actions is-split">
        <button type="button" className="sh-btn sh-btn-ghost" onClick={() => fileRef.current?.click()}>
          <FileUp size={16} /> Import .json save
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => void onFile(e.target.files?.[0])} />
        <button type="button" className="sh-btn sh-btn-ghost" onClick={onBack}>
          Back
        </button>
      </div>
    </TitlePanel>
  )
}
