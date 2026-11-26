import * as Sentry from '@sentry/react'

import { isTelemetryEnabled, resolveAppEnv } from '../config/appEnv'

const TRACES_SAMPLE_RATE = 0
const URL_BREADCRUMB_KEYS = ['url', 'from', 'to'] as const
const CONSOLE_CATEGORY = 'console'
const UI_CATEGORY_PREFIX = 'ui.'
const ATTRIBUTE_SELECTOR = /\[[^\]]*\]/g
const QUERY_OR_HASH = /[?#]/

/**
 * Front-end error monitoring.
 *
 * Runs only when telemetry is enabled and a DSN is configured; otherwise it
 * is a no-op. Error reporting only: no tracing and no session replay.
 * No personal data is sent: request details and user identity are removed
 * from every event, and breadcrumbs are scrubbed by `scrubBreadcrumb`.
 */
export function initSentry(): void {
  if (!isTelemetryEnabled()) {
    return
  }

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) {
    return
  }

  Sentry.init({
    dsn,
    environment: resolveAppEnv(),
    release: (import.meta.env.VITE_GIT_SHA as string | undefined) || undefined,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  })
}

function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  if (event.request) {
    delete event.request.data
    delete event.request.query_string
    delete event.request.cookies
    delete event.request.headers
  }

  delete event.user

  return event
}

/**
 * Console breadcrumbs are dropped; URLs lose their query and hash; a click
 * keeps the element path but not its attribute values.
 */
export function scrubBreadcrumb(crumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (crumb.category === CONSOLE_CATEGORY) {
    return null
  }

  const data = crumb.data ? { ...crumb.data } : undefined

  if (data) {
    for (const key of URL_BREADCRUMB_KEYS) {
      const value = data[key]
      if (typeof value === 'string') {
        data[key] = stripQuery(value)
      }
    }
  }

  const isUiCrumb = crumb.category?.startsWith(UI_CATEGORY_PREFIX) ?? false
  const message =
    isUiCrumb && crumb.message ? crumb.message.replace(ATTRIBUTE_SELECTOR, '') : crumb.message

  return { ...crumb, data, message }
}

function stripQuery(url: string): string {
  const cut = url.search(QUERY_OR_HASH)
  return cut === -1 ? url : url.slice(0, cut)
}

export { Sentry }
