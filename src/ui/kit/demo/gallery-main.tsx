// Dev-only entry for the kit gallery: http://localhost:5317/src/ui/kit/demo/gallery.html
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { KitGallery } from './KitGallery'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KitGallery />
  </StrictMode>,
)
