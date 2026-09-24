// Save slots in IndexedDB (no 5MB localStorage cap) + JSON export/import.
import type { GameState } from './types'
import { SAVE_VERSION } from './newGame'
import { dayOf } from './time'
import { netWorth } from './money'

export const SLOT_COUNT = 3
const DB = 'dropship-tycoon'
const STORE = 'saves'

export interface SaveMeta {
  slot: number
  playerName: string
  storeName: string
  difficulty: GameState['meta']['difficulty']
  day: number
  netWorth: number
  savedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, fn: (os: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const r = fn(t.objectStore(STORE))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export function metaOf(slot: number, s: GameState): SaveMeta {
  return { slot, playerName: s.meta.playerName, storeName: s.store.name || '(no store yet)', difficulty: s.meta.difficulty, day: dayOf(s.time.hour), netWorth: netWorth(s), savedAt: Date.now() }
}

export async function saveGame(slot: number, s: GameState): Promise<void> {
  const data = JSON.stringify({ ...s, meta: { ...s.meta, lastSavedReal: Date.now() } })
  await tx('readwrite', os => os.put(data, `slot${slot}`))
  await tx('readwrite', os => os.put(JSON.stringify(metaOf(slot, s)), `meta${slot}`))
}
export async function loadGame(slot: number): Promise<GameState | null> {
  const raw = await tx<string | undefined>('readonly', os => os.get(`slot${slot}`))
  return raw ? migrate(JSON.parse(raw)) : null
}
export async function listSaves(): Promise<(SaveMeta | null)[]> {
  const out: (SaveMeta | null)[] = []
  for (let i = 0; i < SLOT_COUNT; i++) {
    try {
      const raw = await tx<string | undefined>('readonly', os => os.get(`meta${i}`))
      out.push(raw ? JSON.parse(raw) : null)
    } catch {
      out.push(null)
    }
  }
  return out
}
export async function deleteSave(slot: number): Promise<void> {
  await tx('readwrite', os => os.delete(`slot${slot}`))
  await tx('readwrite', os => os.delete(`meta${slot}`))
}

/** Download the save as a .json file. */
export function exportSave(s: GameState) {
  const blob = new Blob([JSON.stringify(s)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `dropship-tycoon-${s.meta.playerName.replace(/\W+/g, '_')}-day${dayOf(s.time.hour) + 1}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
export async function importSave(file: File): Promise<GameState> {
  const parsed = JSON.parse(await file.text())
  if (!parsed || typeof parsed !== 'object' || !parsed.meta || !parsed.time) throw new Error('Not a Dropship Tycoon save file')
  return migrate(parsed)
}

function migrate(s: GameState): GameState {
  if ((s.version ?? 0) > SAVE_VERSION) throw new Error('Save is from a newer version of the game')
  s.version = SAVE_VERSION
  return s
}
