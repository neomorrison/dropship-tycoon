// PLACEHOLDER game screen — the ui-shell agent replaces this with the full HUD,
// apartment scene, activity panel, notifications and computer/browser overlay.
import { Suspense } from 'react'
import { useGameLoop } from '../../core/engine'
import { useGS } from '../../core/store'
import { useUI, openSite, setSpeed, navigateTab, closeTab } from '../../core/ui'
import { formatClock, formatDate, dayOf } from '../../core/time'
import { money } from '../../core/format'
import { SITES, SITE_COMPONENTS } from '../sites/registry'

export default function GameScreen() {
  useGameLoop()
  const hour = useGS(s => s.time.hour)
  const cash = useGS(s => s.finance.cash)
  const { speed, computerOpen, tabs, activeTab, hourFrac } = useUI()
  const tab = tabs.find(t => t.id === activeTab)
  const Site = tab ? SITE_COMPONENTS[tab.site] : null
  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr', color: '#fff' }}>
      <div style={{ display: 'flex', gap: 12, padding: 8, alignItems: 'center', background: '#1b1e25' }}>
        <b>{formatDate(dayOf(hour))} {formatClock(hour, hourFrac)}</b>
        {[0, 1, 2, 4].map(sp => <button key={sp} onClick={() => setSpeed(sp as 0 | 1 | 2 | 4)} style={{ fontWeight: speed === sp ? 700 : 400 }}>{sp === 0 ? '⏸' : `${sp}x`}</button>)}
        <span>Cash {money(cash)}</span>
        <button onClick={() => useUI.getState().set({ computerOpen: !computerOpen })}>💻 Computer</button>
      </div>
      {computerOpen ? (
        <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', background: '#fff', color: '#111', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 4, padding: 4, background: '#dee1e6', flexWrap: 'wrap' }}>
            {SITES.filter(s => s.bookmark).map(s => <button key={s.id} onClick={() => openSite(s.id)}>{s.glyph} {s.name}</button>)}
            {tabs.map(t => <span key={t.id}><button onClick={() => useUI.getState().set({ activeTab: t.id })}>{t.site}</button><button onClick={() => closeTab(t.id)}>×</button></span>)}
          </div>
          <div style={{ overflow: 'auto', minHeight: 0 }}>
            {tab && Site && <Suspense fallback={<div>Loading…</div>}><Site tabId={tab.id} path={tab.path} navigate={p => navigateTab(tab.id, p)} compact={false} /></Suspense>}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', placeItems: 'center' }}>Apartment scene goes here</div>
      )}
    </div>
  )
}
