import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useUI } from './core/ui'
import { useGame } from './core/store'
import { exportSave } from './core/save'
import { useSessionPersistence } from './core/session'
import TitleScreen from './ui/shell/TitleScreen'
import GameScreen from './ui/shell/GameScreen'

export default function App() {
  const resuming = useSessionPersistence()
  const screen = useUI(s => s.screen)
  const loaded = useGame(s => s.state !== null)
  const inGame = screen === 'game' && loaded
  if (resuming) return <div className="sh-resume">Resuming your run…</div>
  return <CrashGuard key={inGame ? 'game' : 'title'}>{inGame ? <GameScreen /> : <TitleScreen />}</CrashGuard>
}

/** Last line of defence: if the shell itself crashes, let the player rescue their save. */
class CrashGuard extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[shell] crashed', error, info.componentStack)
  }
  render() {
    if (!this.state.error) return this.props.children
    const s = useGame.getState().state
    return (
      <div className="sh-fatal">
        <div className="sh-fatal-card">
          <div className="sh-fatal-emoji">🍟💥</div>
          <h1>Well, that burned the fries.</h1>
          <p>The game hit an unexpected error. Your last autosave is safe{s ? ', and you can export the current run below' : ''}.</p>
          <code>{this.state.error.message}</code>
          <div className="sh-fatal-btns">
            {s && (
              <button type="button" onClick={() => exportSave(s)}>
                Export save (.json)
              </button>
            )}
            <button
              type="button"
              className="is-primary"
              onClick={() => {
                useUI.getState().set({ screen: 'title', computerOpen: false, overlay: null, tabs: [], activeTab: null })
                useGame.getState().load(null)
                this.setState({ error: null })
              }}
            >
              Back to title
            </button>
          </div>
        </div>
      </div>
    )
  }
}
