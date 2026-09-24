import { useUI } from './core/ui'
import { useGame } from './core/store'
import TitleScreen from './ui/shell/TitleScreen'
import GameScreen from './ui/shell/GameScreen'

export default function App() {
  const screen = useUI(s => s.screen)
  const loaded = useGame(s => s.state !== null)
  return screen === 'game' && loaded ? <GameScreen /> : <TitleScreen />
}
