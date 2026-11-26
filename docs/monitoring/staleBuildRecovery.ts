/**
 * Recovery from a build that is no longer on the server.
 *
 * Asset files are content-hashed, so after a deploy a tab that is still
 * running the previous build fails to load its lazy chunks. Vite reports
 * this as `vite:preloadError`; the page reloads once to pick up the new
 * build. A cooldown prevents a reload loop when the failure has another
 * cause.
 */

const RELOAD_MARKER_KEY = 'staleBuildReloadAt'
const RELOAD_COOLDOWN_MS = 30_000
const SERVICE_WORKER_UPDATE_TIMEOUT_MS = 1_500
const PRELOAD_ERROR_EVENT = 'vite:preloadError'

function readLastReload(): number | null {
  const raw = sessionStorage.getItem(RELOAD_MARKER_KEY)
  if (raw === null) {
    return null
  }

  const timestamp = Number(raw)
  return Number.isFinite(timestamp) ? timestamp : null
}

function recentlyReloaded(now: number): boolean {
  try {
    const lastReload = readLastReload()
    return lastReload !== null && now - lastReload < RELOAD_COOLDOWN_MS
  } catch {
    return true
  }
}

function markReloaded(now: number): void {
  try {
    sessionStorage.setItem(RELOAD_MARKER_KEY, String(now))
  } catch {
    // Storage is unavailable; the cooldown check already refuses to reload.
  }
}

/** Whether this failure should trigger a reload. Records the attempt when it does. */
export function shouldReloadForStaleBuild(now: number = Date.now()): boolean {
  if (recentlyReloaded(now)) {
    return false
  }

  markReloaded(now)
  return true
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Lets the service worker pick up the new build first; never blocks the reload for long. */
async function refreshServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    return
  }

  const update = navigator.serviceWorker
    .getRegistration()
    .then((registration) => registration?.update())
    .then(() => undefined)
    .catch(() => undefined)

  await Promise.race([update, wait(SERVICE_WORKER_UPDATE_TIMEOUT_MS)])
}

/** Reloads the page once when a lazy chunk of an outdated build fails to load. */
export function installStaleBuildRecovery(): void {
  window.addEventListener(PRELOAD_ERROR_EVENT, (event) => {
    event.preventDefault()

    if (!shouldReloadForStaleBuild()) {
      return
    }

    void refreshServiceWorker().then(() => window.location.reload())
  })
}
