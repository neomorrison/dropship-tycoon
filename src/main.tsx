import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { installAudioUnlock } from './ui/audio'
import { registerEventModalHandlers } from './sim/events'
// Load every sim module up front: ads, store, life and events register their decision-modal
// handlers at import time, so a modal restored from a save always has a handler.
import './sim'

// Browsers only allow audio after a user gesture: unlock on the first click/key.
installAudioUnlock()
// Decision-modal handlers for event kinds (idempotent: handlers are keyed by kind).
try {
  registerEventModalHandlers()
} catch (e) {
  console.warn('event modal handlers failed to register', e)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
