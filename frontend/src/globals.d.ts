// Injected at build time by vite.config.ts → define
declare const __APP_VERSION__: string

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Extends the global Window interface — no declare global needed in ambient (non-module) .d.ts files
interface Window {
  __pwaInstallEvent: BeforeInstallPromptEvent | null
}
