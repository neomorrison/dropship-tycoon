// PLACEHOLDER title screen — the ui-shell agent replaces this.
import { useState } from 'react'
import { useGame } from '../../core/store'
import { useUI } from '../../core/ui'
import { createNewGame } from '../../core/newGame'
import type { Difficulty } from '../../core/types'

export default function TitleScreen() {
  const [name, setName] = useState('Neo')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const start = () => {
    useGame.getState().load(createNewGame({ playerName: name, difficulty }))
    useUI.getState().set({ screen: 'game', slot: 0 })
  }
  return (
    <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', color: '#fff' }}>
      <div style={{ display: 'grid', gap: 12, width: 320 }}>
        <h1 style={{ margin: 0 }}>Dropship Tycoon</h1>
        <input value={name} onChange={e => setName(e.target.value)} />
        <select value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}>
          <option value="chill">Chill</option><option value="normal">Normal</option><option value="realistic">Realistic</option>
        </select>
        <button onClick={start}>New game</button>
      </div>
    </div>
  )
}
