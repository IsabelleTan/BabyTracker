import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Capture beforeinstallprompt before React mounts — the event fires early during
// page load and would be missed if we only listen inside a useEffect.
// Types for BeforeInstallPromptEvent and Window.__pwaInstallEvent live in globals.d.ts.
window.__pwaInstallEvent = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__pwaInstallEvent = e as BeforeInstallPromptEvent
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
