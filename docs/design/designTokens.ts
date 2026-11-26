/**
 * Vatary Desk design tokens.
 *
 * The single source of every colour, size, radius, shadow and motion value
 * in the interface. `theme.ts` turns them into the MUI theme and publishes
 * them as `--ds-*` CSS variables for hand-written styles. No other module
 * declares a raw colour.
 */

// ─── Colour · core ───────────────────────────────────────────────────────

/** Light-mode palette. Text ratios are WCAG 2.x contrast against `surface`. */
export const color = {
  /** Primary action, active state, focus ring. The only accent. */
  accent: '#36705C',
  /** Hover and pressed state of the accent fill. */
  accentPressed: '#1D5946',
  /** Tonal buttons, selected rows. */
  accentTonal: '#E8F3EE',
  /** The accent as text or an icon glyph (7.13:1). */
  accentText: '#27624E',

  /** Titles and primary text (15.92:1). */
  ink: '#17251D',
  /** Labels and control text (9.19:1). */
  ink2: '#3D4B43',
  /** Icons, body text on a tint (5.62:1). */
  ink3: '#5C6B62',
  /** Secondary body text (5.17:1). */
  muted: '#647069',
  /** Timestamps and counters (5.15:1). */
  meta: '#627168',

  /** Cards, windows, bars. */
  surface: '#FFFFFF',
  /** Application content area. */
  canvas: '#FBFBF9',
  /** Panels, list rows. */
  sunken: '#F6F7F5',
  /** Segment track, tiles. */
  sunken2: '#F2F3F0',
  /** Dividers inside cards. */
  divider: '#F0F3F1',
  /** Card and window edge. */
  border: 'rgba(0,0,0,0.07)',
  /** Input border at rest. */
  inputBorder: 'rgba(0,0,0,0.10)',
  /** Empty-state and placeholder text. */
  placeholder: '#C3CCC6',
  /** Decorative hint glyphs (sort arrows, shortcut hints). */
  ghost: '#B6BDB8',
  /** Destructive text only, never a fill (5.44:1). */
  danger: '#C0392B',
  /** Pomodoro focus state: a data colour, never chrome. */
  focusRed: '#D1483C',
  /** Switch track when off. */
  switchOff: '#D6DAD7',
  /** Text and glyphs on the accent fill. */
  onAccent: '#FFFFFF',
} as const

/** Dark-mode neutrals: the same roles as `color`, in the same green-ink family. */
export const colorDark = {
  canvas: '#101612',
  surface: '#161D18',
  sunken: '#1B231E',
  sunken2: '#202923',
  ink: '#EDF2EE',
  ink2: '#C4CDC6',
  ink3: '#A3B0A8',
  muted: '#93A098',
  meta: '#88948C',
  divider: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.09)',
  inputBorder: 'rgba(255,255,255,0.14)',
  switchOff: '#39423C',
  accentText: '#90C5B0',
  danger: '#E07B6E',
} as const

/** Interaction states of neutral controls, per mode. */
export const neutralState = {
  light: {
    hover: 'rgba(0,0,0,0.04)',
    pressed: 'rgba(0,0,0,0.07)',
    fill: '#F2F3F1',
    fillHover: '#EAEBE8',
    inputBorderHover: 'rgba(0,0,0,0.18)',
    chip: 'rgba(0,0,0,0.06)',
    chipHover: 'rgba(0,0,0,0.09)',
    scrollbarThumb: 'rgba(23,37,29,0.18)',
    glass: 'rgba(255,255,255,0.78)',
  },
  dark: {
    hover: 'rgba(255,255,255,0.06)',
    pressed: 'rgba(255,255,255,0.10)',
    fill: colorDark.sunken2,
    fillHover: '#252E27',
    inputBorderHover: 'rgba(255,255,255,0.24)',
    chip: 'rgba(255,255,255,0.08)',
    chipHover: 'rgba(255,255,255,0.12)',
    scrollbarThumb: 'rgba(255,255,255,0.18)',
    glass: 'rgba(22,29,24,0.78)',
  },
} as const

/** Hover and pressed steps of the light tonal fill. */
export const accentTonalState = {
  hover: '#DCEAE4',
  pressed: '#D0E2DA',
} as const

// ─── Desk ────────────────────────────────────────────────────────────────

/** The ground the desk tiles stand on: one step below the paper in both modes. */
export const desk = {
  light: { ground: color.sunken2 },
  dark: { ground: '#0B100D' },
} as const

// ─── Colour · document types ─────────────────────────────────────────────

/** One saturated hue per document type, for glyphs, chips and legends. AA as text on white. */
export const docGroupColor = {
  documents: '#2F5BA8',
  data: '#2E7A4F',
  charts: '#1F6F7A',
  diagrams: '#B4561A',
  files: '#8A3F6A',
  presentations: '#C43E1C',
  containers: '#706147',
  workspaces: '#1F4D3D',
  tasks: '#6046A8',
  cards: '#6E6E1F',
} as const

/** A document-type group. */
export type DocGroup = keyof typeof docGroupColor

/** Dark-mode twins of the type colours: the same hue, lifted to read on near-black. */
export const docGroupColorDark: Record<DocGroup, string> = {
  documents: '#93B8F8',
  data: '#90C6A3',
  charts: '#8DC2CB',
  diagrams: '#EFA37C',
  files: '#E1A1C2',
  presentations: '#F4A386',
  containers: '#C8B594',
  workspaces: '#9CCFB8',
  tasks: '#B9AAFA',
  cards: '#BABC84',
}

/** Light ground of a surface that is itself of a given type. */
export const docGroupTint: Record<DocGroup, string> = {
  documents: '#E9F1FE',
  data: '#E6F4EA',
  charts: '#E2F4F7',
  diagrams: '#FCEDE5',
  files: '#FBEBF3',
  presentations: '#FCEBE6',
  containers: '#F3F0EA',
  workspaces: '#E5F0EB',
  tasks: '#F0EEFD',
  cards: '#F1F2E2',
}

// ─── Colour · version diff ───────────────────────────────────────────────

/** Added / removed / changed colours of the version comparison view. */
export const diffColor = {
  light: {
    addedFill: 'rgba(47,143,82,0.12)',
    addedBorder: 'rgba(47,143,82,0.45)',
    addedText: '#1E6B3B',
    removedFill: 'rgba(192,69,58,0.12)',
    removedBorder: 'rgba(192,69,58,0.45)',
    removedText: '#A8352B',
    changedFill: 'rgba(217,131,46,0.14)',
    changedBorder: 'rgba(217,131,46,0.50)',
    changedText: '#8A5410',
  },
  dark: {
    addedFill: 'rgba(93,196,133,0.16)',
    addedBorder: 'rgba(93,196,133,0.48)',
    addedText: '#7FD3A2',
    removedFill: 'rgba(224,123,110,0.16)',
    removedBorder: 'rgba(224,123,110,0.48)',
    removedText: '#EE9A8D',
    changedFill: 'rgba(232,167,90,0.18)',
    changedBorder: 'rgba(232,167,90,0.52)',
    changedText: '#EDBE83',
  },
} as const

// ─── Colour · feature accents ────────────────────────────────────────────

/** The experimental-feature badge: neither the accent nor a warning colour. */
export const experimentColor = {
  light: { text: '#5B3FC4', tonal: '#EEEAFB' },
  dark: { text: '#B9A9F7', tonal: '#2A2345' },
} as const

/** Heat map scale, 5 = most recent, 1 = oldest. Every badge pair reads at 4.5:1. */
export const heatScale = {
  light: {
    5: { border: '#E8590C', wash: '#FFE3CC', badgeBg: '#F76B15', badgeFg: '#1F0F03' },
    4: { border: '#F59F5B', wash: '#FFEEDD', badgeBg: '#FFB27A', badgeFg: '#3A1A05' },
    3: { border: '#F8D3B2', wash: '#FFF6EC', badgeBg: '#FFDDC0', badgeFg: '#4A2408' },
    2: { border: '#ECE6DF', wash: '#F8F6F3', badgeBg: '#EFEBE6', badgeFg: '#3D4B43' },
    1: { border: '#EEF0EE', wash: '#F4F5F3', badgeBg: '#F2F3F0', badgeFg: '#5C6B62' },
  },
  dark: {
    5: { border: '#F76B15', wash: '#4A2A14', badgeBg: '#F76B15', badgeFg: '#1F0F03' },
    4: { border: '#C9763A', wash: '#36261A', badgeBg: '#FFB27A', badgeFg: '#3A1A05' },
    3: { border: '#8A5F3C', wash: '#2B231C', badgeBg: '#5A3D26', badgeFg: '#FFE3CC' },
    2: { border: '#4F4A44', wash: '#22201D', badgeBg: '#3A3631', badgeFg: '#E8E2DA' },
    1: { border: '#3A3F3B', wash: '#1C1F1D', badgeBg: '#2C302D', badgeFg: '#B7C0BA' },
  },
  rank: { bg: '#C2410C', fg: '#FFFFFF' },
} as const

/** The folder skin: the only non-white card. */
export const folderShell = {
  fill: '#EDE0C1',
  tabText: '#3E2E0B',
  meta: '#7A5F1E',
  icon: docGroupColor.containers,
  tabRadius: '12px 14px 0 0',
  bodyRadius: '0 14px 14px 14px',
  sheetRadius: 10,
  sheetPadding: 5,
} as const

/** The folder skin in dark mode: the same roles in a dimmed kraft. */
export const folderShellDark = {
  fill: '#39321F',
  tabText: '#EFE2C4',
  meta: '#B7A176',
  icon: docGroupColorDark.containers,
} as const

/** The image viewer: the one surface that is dark in both modes. */
export const lightbox = {
  scrim: 'rgba(0,0,0,0.94)',
  control: 'rgba(0,0,0,0.40)',
  controlHover: 'rgba(0,0,0,0.60)',
  text: '#FFFFFF',
} as const

/** The mascot of empty, error and waiting states. */
export const mascotColor = {
  light: {
    beak: folderShell.fill,
    line: color.ghost,
    dash: color.placeholder,
    doc: docGroupColor.documents,
    data: docGroupColor.data,
    chart: docGroupColor.charts,
    file: docGroupColor.files,
  },
  dark: {
    beak: '#7A6840',
    line: '#56625A',
    dash: '#465149',
    doc: docGroupColorDark.documents,
    data: docGroupColorDark.data,
    chart: docGroupColorDark.charts,
    file: docGroupColorDark.files,
  },
} as const

/** The animated forest desk background. */
export const forestBackdrop = {
  light: {
    top: '#F1F4EF',
    foot: '#E9EEE7',
    ink: '#2F4A3A',
    leaf: '#4E7A5C',
    light: '#FFF6D8',
    glow: '#F4E9A8',
    branch: '#6B5236',
    leafSoft: '#7FA58A',
  },
  dark: {
    top: '#0D130F',
    foot: '#090E0B',
    ink: '#9FC0A8',
    leaf: '#6E9C7C',
    light: '#E8F0C8',
    glow: '#E6F59A',
    branch: '#8C7253',
    leafSoft: '#4D7458',
  },
} as const

/** The onboarding tour's two dim levels. */
export const tourScrim = {
  light: { deep: 'rgba(15, 23, 42, 0.5)', soft: 'rgba(15, 23, 42, 0.18)' },
  dark: { deep: 'rgba(0, 0, 0, 0.55)', soft: 'rgba(0, 0, 0, 0.3)' },
} as const

/** Tooltip surface and text. */
export const tooltipSurface = {
  light: color.ink,
  dark: '#050A07',
  text: '#F4F7F5',
} as const

// ─── Typography ──────────────────────────────────────────────────────────

export const font = {
  /** All interface text. */
  sans: '"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  /** Numerals, time, keys, URLs and IDs. */
  mono: '"DM Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as const

/** Type scale: role → size (px), weight, line height, tracking. */
export const type = {
  appTitle: { size: 22, weight: 700, lineHeight: 1.2 },
  windowTitle: { size: 15, weight: 700, lineHeight: 1.2 },
  tileTitle: { size: 14, weight: 700, lineHeight: 1.2 },
  cardTitle: { size: 14, weight: 600 },
  control: { size: 13.5, weight: 600 },
  body: { size: 13.5, weight: 400, lineHeight: 1.5 },
  meta: { size: 12, weight: 400 },
  sectionLabel: { size: 10.5, weight: 600, tracking: '0.09em' },
  heroNumeral: { size: 46, weight: 700, tracking: '-0.02em' },
  mono: { size: 12.5, weight: 500 },
} as const

const HEADER_TITLE_LINE = 22
const HEADER_TITLE_LINE_COMPACT = 20
const HEADER_SUBTITLE_LINE = 20
const HEADER_SUBTITLE_LINE_COMPACT = 16
const HEADER_SUBTITLE_GAP = 2

/**
 * The shared header of every modal and panel: an icon slot, a title over an
 * optional subtitle, and a close button on one axis. The slot is exactly as
 * tall as the text block next to it.
 */
export const header = {
  slot: 32,
  slotLarge: HEADER_TITLE_LINE + HEADER_SUBTITLE_GAP + HEADER_SUBTITLE_LINE,
  slotCompact: 30,
  slotCompactLarge: HEADER_TITLE_LINE_COMPACT + HEADER_SUBTITLE_GAP + HEADER_SUBTITLE_LINE_COMPACT,
  slotRadius: 9,
  slotRadiusLarge: 11,
  glyph: 18,
  glyphLarge: 20,
  glyphCompact: 16,
  title: {
    size: 17,
    sizeCompact: 16,
    weight: 700,
    lineHeight: HEADER_TITLE_LINE,
    lineHeightCompact: HEADER_TITLE_LINE_COMPACT,
    tracking: '-0.01em',
  },
  subtitle: {
    size: 13,
    sizeCompact: 12,
    weight: 400,
    lineHeight: HEADER_SUBTITLE_LINE,
    lineHeightCompact: HEADER_SUBTITLE_LINE_COMPACT,
    gap: HEADER_SUBTITLE_GAP,
  },
  close: 32,
  closeCompact: 30,
  closeGlyph: 17,
  closeGlyphCompact: 16,
} as const

// ─── Shape ───────────────────────────────────────────────────────────────

/** One radius scale. Never mix steps inside one element. */
export const radius = {
  /** Dock, floating panel. */
  dock: 22,
  /** Window, modal, panel. */
  window: 18,
  /** Card, widget. */
  card: 14,
  /** Every control: buttons, fields, icon buttons, segments. */
  control: 10,
  /** Icon slot, small recess. */
  slot: 10,
  /** Fully round: tags and toggles. */
  pill: 9999,
} as const

/** Spacing scale (px). */
export const space = {
  iconToIcon: 6,
  controlToControl: 10,
  cardToCard: 14,
  insideCard: 18,
  sectionToSection: 22,
  framePadding: 34,
  compactGap: 12,
  compactGutter: 16,
  compactSection: 24,
} as const

/** The phone desk tile: a scaled live preview over a one-line caption. */
export const compactTile = {
  previewHeight: 128,
  captionHeight: 40,
  previewScale: 0.75,
  previewInset: 16,
  previewFade: 24,
  previewGap: 8,
  cornerInset: 8,
  toolHeight: 72,
} as const

// ─── Breakpoints ─────────────────────────────────────────────────────────

/** The phone edge, matching MUI's `down('sm')`. */
export const breakpoint = {
  phoneMax: 599.95,
  tabletMin: 600,
} as const

/** The phone media query, for `useMediaQuery` and `sx` keys. */
export const PHONE_MEDIA = `(max-width: ${breakpoint.phoneMax}px)`

// ─── Elevation ───────────────────────────────────────────────────────────

/** Light-mode shadows. */
export const shadow = {
  /** Widgets and panels on the canvas. */
  card: '0 2px 10px rgba(31,60,45,0.06)',
  /** Popovers and style panels. */
  popover: '0 8px 26px -12px rgba(17,20,24,0.20)',
  /** Context and action menus. */
  menu: '0 16px 40px -14px rgba(17,20,24,0.26), 0 1px 3px rgba(17,20,24,0.10)',
  /** Dialogs and an opened folder. */
  modal: '0 18px 48px -18px rgba(17,20,24,0.28), 0 2px 6px rgba(17,20,24,0.06)',
  /** Floating action buttons. */
  fab: '0 8px 24px -8px rgba(15,23,42,0.3)',
  /** A nested desktop's recess. */
  recess: 'inset 0 1px 3px rgba(17,20,24,0.06)',
  /** The selected segment of a segmented control. */
  segment: '0 1px 3px rgba(17,20,24,0.10)',
  /** The thumb of a switch. */
  switchThumb: '0 1px 3px rgba(17,20,24,0.2)',
} as const

/** Dark-mode shadows: the same shapes, deeper. */
export const shadowDark = {
  card: '0 2px 10px rgba(0,0,0,0.35)',
  popover: '0 8px 26px -12px rgba(0,0,0,0.6)',
  menu: '0 16px 40px -14px rgba(0,0,0,0.65), 0 1px 3px rgba(0,0,0,0.4)',
  modal: '0 18px 48px -18px rgba(0,0,0,0.7), 0 2px 6px rgba(0,0,0,0.3)',
  fab: '0 8px 24px -8px rgba(0,0,0,0.6)',
} as const

// ─── Motion ──────────────────────────────────────────────────────────────

const ease = {
  out: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  in: 'cubic-bezier(0.5, 0, 0.75, 0.2)',
  std: 'cubic-bezier(0.3, 0.7, 0.2, 1)',
} as const

/** Durations (ms) and easing curves. */
export const motion = {
  ease,
  /** A window pouring into its dock cell. */
  genie: {
    duration: 680,
    midOffset: 0.45,
    easeIn: 'cubic-bezier(.55,0,.65,.4)',
    easeOut: 'cubic-bezier(.2,.6,.3,1)',
  },
  cellIn: { duration: 320, ease: ease.out },
  cellOut: { duration: 240, ease: 'cubic-bezier(.4,0,.2,1)' },
  peek: { duration: 240, ease: ease.out },
  /** Used under `prefers-reduced-motion`: a fade, no travel. */
  reduced: { duration: 160, ease: 'ease-out' },
  /** The AI field border on send. */
  aiSendPulse: { duration: 800, fadeOut: 260, comets: 2, length: 56 },
  aiStar: { duration: 1600, ease: 'ease-in-out' },
} as const

// ─── Controls ────────────────────────────────────────────────────────────

const SWITCH_WIDTH = 38
const SWITCH_HEIGHT = 22
const SWITCH_THUMB = 18

export const control = {
  /** Buttons, fields, icon buttons. */
  height: 38,
  /** Dense rows: search fields, segments. */
  heightDense: 34,
  /** Minimum touch target on a coarse pointer. */
  hitTarget: 44,
  switch: {
    width: SWITCH_WIDTH,
    height: SWITCH_HEIGHT,
    thumb: SWITCH_THUMB,
    inset: (SWITCH_HEIGHT - SWITCH_THUMB) / 2,
  },
} as const

/** Geometry of the full-size document app window. */
export const chrome = {
  headerHeight: 58,
  toolbarHeight: 52,
  docBarHeight: 42,
  aiPanelWidth: 360,
  chartPanelWidth: 342,
  iconSlot: 32,
  iconGlyph: 20,
  controlHeight: 34,
  toolbarSearchWidth: 200,
  dividerHeight: 20,
  dividerHeightHeader: 22,
  windowControl: 32,
  windowControlRadius: radius.control,
} as const

// ─── Iconography ─────────────────────────────────────────────────────────

/** One stroked icon set on a 24px grid; icons inherit `currentColor`. */
export const icon = {
  strokeWidth: 1.8,
  /** Type glyphs of 24px and up keep the same optical weight. */
  strokeWidthLarge: 1.6,
  sizeSm: 15,
  sizeMd: 16,
  sizeLg: 17,
  sizeEmpty: 20,
} as const
