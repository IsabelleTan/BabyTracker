import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export default function InstallPrompt() {
  // main.tsx captures beforeinstallprompt before React mounts; read it here.
  const [installEvent, setInstallEvent] = useState<Window['__pwaInstallEvent']>(
    () => window.__pwaInstallEvent,
  )
  const [dismissed, setDismissed] = useState(false)

  // Also listen for the event in case it fires after mount (e.g. re-triggered).
  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault()
      setInstallEvent(e as Window['__pwaInstallEvent'])
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // SW update prompt — shown when a new version is available
  const { needRefresh, updateServiceWorker } = useRegisterSW()
  const [needsUpdate] = needRefresh

  if (dismissed) return null

  if (needsUpdate) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-50 rounded-xl border border-primary/40 bg-card shadow-lg px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-sm">New version available</span>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setDismissed(true)}
            className="text-xs text-muted-foreground px-2 py-1"
          >
            Later
          </button>
          <button
            onClick={() => updateServiceWorker(true)}
            className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1 rounded-lg"
          >
            Update
          </button>
        </div>
      </div>
    )
  }

  if (installEvent) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-50 rounded-xl border border-primary/40 bg-card shadow-lg px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-sm">Add Baby Tracker to your home screen</span>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setDismissed(true)}
            className="text-xs text-muted-foreground px-2 py-1"
          >
            Not now
          </button>
          <button
            onClick={async () => {
              await installEvent.prompt()
              setInstallEvent(null)
            }}
            className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1 rounded-lg"
          >
            Install
          </button>
        </div>
      </div>
    )
  }

  return null
}
