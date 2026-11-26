import './shared/zodConfig'
import './shared/storage/migrateLegacyKeys'
import { StrictMode, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import '@neondatabase/neon-js/ui/css'
import '@fontsource-variable/inter'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import i18n from './shared/i18n'
import './index.css'
import App from './App.tsx'
import { initSentry, Sentry } from './shared/monitoring/sentry'
import { installStaleBuildRecovery } from './shared/staleBuildRecovery'
import { installStandaloneViewport } from './shared/layout/standaloneViewport'
import { installViewportDebugOverlay } from './shared/layout/viewportDebugOverlay'
import { color, control, font, mascotColor, radius, type } from './shared/designTokens'
import { MascotScene } from './shared/mascot/MascotScene'

const ROOT_ELEMENT_ID = 'root'

const CRASH_LAYOUT = {
  padding: 24,
  titleGap: 14,
  messageGap: 6,
  actionGap: 18,
  buttonPaddingX: 16,
  titleSize: 18,
  titleLineHeight: 1.25,
} as const

/** The theme is unavailable after a crash, so the fallback sets its own variables. */
const CRASH_FALLBACK_VARS = {
  '--ds-paper': color.surface,
  '--ds-canvas': color.canvas,
  '--ds-surface-high': color.sunken2,
  '--ds-text-primary': color.ink,
  '--ds-text-control': color.ink2,
  '--ds-text-icon': color.ink3,
  '--ds-text-meta': color.meta,
  '--ds-accent': color.accent,
  '--ds-accent-text': color.accentText,
  '--ds-accent-tonal': color.accentTonal,
  '--ds-mascot-beak': mascotColor.light.beak,
  '--ds-mascot-line': mascotColor.light.line,
  '--ds-mascot-dash': mascotColor.light.dash,
} as CSSProperties

const crashContainerStyle: CSSProperties = {
  ...CRASH_FALLBACK_VARS,
  minHeight: '100dvh',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: CRASH_LAYOUT.padding,
  textAlign: 'center',
  background: color.canvas,
  color: color.ink,
  fontFamily: font.sans,
}

const crashTitleStyle: CSSProperties = {
  margin: `${CRASH_LAYOUT.titleGap}px 0 0`,
  fontSize: CRASH_LAYOUT.titleSize,
  fontWeight: type.appTitle.weight,
  lineHeight: CRASH_LAYOUT.titleLineHeight,
}

const crashMessageStyle: CSSProperties = {
  margin: `${CRASH_LAYOUT.messageGap}px 0 0`,
  fontSize: type.body.size,
  lineHeight: type.body.lineHeight,
  color: color.ink2,
}

const reloadButtonStyle: CSSProperties = {
  marginTop: CRASH_LAYOUT.actionGap,
  height: control.height,
  padding: `0 ${CRASH_LAYOUT.buttonPaddingX}px`,
  border: 0,
  borderRadius: radius.control,
  background: color.accent,
  color: color.surface,
  font: `${type.control.weight} ${type.control.size}px/1 ${font.sans}`,
  cursor: 'pointer',
}

initSentry()
installStaleBuildRecovery()
installViewportDebugOverlay()
installStandaloneViewport()

/**
 * Shown when the app tree crashes. It uses plain elements and reads text
 * straight from i18next, since the theme and React bindings may be part
 * of what failed.
 */
const renderCrashFallback = () => (
  <div role="alert" style={crashContainerStyle}>
    <MascotScene scene="crash" />
    <h1 style={crashTitleStyle}>{i18n.t('errors.generic')}</h1>
    <p style={crashMessageStyle}>{i18n.t('errors.reported')}</p>
    <button type="button" onClick={() => window.location.reload()} style={reloadButtonStyle}>
      {i18n.t('common.reloadPage')}
    </button>
  </div>
)

createRoot(document.getElementById(ROOT_ELEMENT_ID)!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={renderCrashFallback}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
