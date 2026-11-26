// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  color,
  desk,
  docGroupColor,
  docGroupColorDark,
  experimentColor,
  heatScale,
  type DocGroup,
} from './designTokens'
import { createAppTheme } from './theme'

/**
 * WCAG 2.x contrast for every text token on every surface it can sit on:
 * the raw light tokens, and the `--ds-*` variables the theme emits in both
 * modes. Normal text, icons included, must reach AA.
 */

const WCAG_AA_TEXT = 4.5
const WCAG_NON_TEXT = 3
const MIN_DESK_TILE_STEP = 1.08
const MAX_DESK_STEP_DIFFERENCE = 0.03

const MODES = ['light', 'dark'] as const
const HEAT_LEVELS = [1, 2, 3, 4, 5] as const
const DEFAULT_ACCENT = 'sage'

const SRGB_LINEAR_THRESHOLD = 0.04045
const SRGB_LINEAR_DIVISOR = 12.92
const SRGB_GAMMA_OFFSET = 0.055
const SRGB_GAMMA_DIVISOR = 1.055
const SRGB_GAMMA = 2.4
const LUMINANCE_WEIGHTS = { r: 0.2126, g: 0.7152, b: 0.0722 } as const
const CONTRAST_FLARE = 0.05
const CHANNEL_MAX = 255

type Mode = (typeof MODES)[number]
type Rgba = { r: number; g: number; b: number; a: number }

const HEX_COLOR = /^#([0-9a-f]{6})$/i
const RGB_FUNCTION = /^rgba?\(([^)]+)\)$/i

function parseColor(value: string): Rgba {
  const hex = HEX_COLOR.exec(value)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & CHANNEL_MAX, g: (n >> 8) & CHANNEL_MAX, b: n & CHANNEL_MAX, a: 1 }
  }

  const fn = RGB_FUNCTION.exec(value)
  if (fn) {
    const [r, g, b, a = '1'] = fn[1].split(',').map((part) => part.trim())
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) }
  }

  throw new Error(`Unparseable colour: ${value}`)
}

/** Composites a translucent colour over an opaque ground. */
function composite(top: Rgba, ground: Rgba): Rgba {
  const mix = (t: number, g: number) => t * top.a + g * (1 - top.a)
  return { r: mix(top.r, ground.r), g: mix(top.g, ground.g), b: mix(top.b, ground.b), a: 1 }
}

function relativeLuminance({ r, g, b }: Rgba): number {
  const linear = (channel: number) => {
    const s = channel / CHANNEL_MAX
    return s <= SRGB_LINEAR_THRESHOLD
      ? s / SRGB_LINEAR_DIVISOR
      : ((s + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_DIVISOR) ** SRGB_GAMMA
  }
  return (
    LUMINANCE_WEIGHTS.r * linear(r) +
    LUMINANCE_WEIGHTS.g * linear(g) +
    LUMINANCE_WEIGHTS.b * linear(b)
  )
}

function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(parseColor(foreground))
  const b = relativeLuminance(parseColor(background))
  const [lighter, darker] = a > b ? [a, b] : [b, a]
  return (lighter + CONTRAST_FLARE) / (darker + CONTRAST_FLARE)
}

function rootVars(mode: Mode): Record<string, string> {
  const theme = createAppTheme(mode, DEFAULT_ACCENT)
  const overrides = theme.components?.MuiCssBaseline?.styleOverrides as
    | Record<string, Record<string, unknown>>
    | undefined
  const root = overrides?.[':root']
  if (!root) throw new Error('The theme emits no :root variables')

  return Object.fromEntries(
    Object.entries(root).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

/** Colour tokens that are never text. Every key of `color` must be classified. */
const NOT_TEXT: Record<string, string> = {
  accent: 'Fills, borders and focus rings only; text uses accentText.',
  accentPressed: 'Hover and pressed fill of the solid accent button.',
  divider: 'A hairline, not a text ground.',
  border: 'A hairline, not a text ground.',
  inputBorder: 'A hairline, not a text ground.',
  placeholder: 'An empty-field hint that never carries a value.',
  ghost: 'Decorative glyphs next to real labels.',
  focusRed: 'A data colour drawn as a ring or fill.',
  switchOff: 'The off track of a switch.',
  onAccent: 'Text on the accent fill only.',
}

const LIGHT_TEXT = ['ink', 'ink2', 'ink3', 'muted', 'meta', 'accentText', 'danger'] as const
const LIGHT_SURFACES = ['surface', 'canvas', 'sunken', 'sunken2', 'accentTonal'] as const
const DOC_GROUPS = Object.keys(docGroupColor) as DocGroup[]

const TEXT_VARS = [
  '--ds-text-primary',
  '--ds-text-secondary',
  '--ds-text-control',
  '--ds-text-icon',
  '--ds-text-meta',
  '--ds-accent-text',
  '--ds-danger',
  '--text',
] as const

const OPAQUE_GROUNDS = [
  '--ds-canvas',
  '--ds-paper',
  '--ds-surface',
  '--ds-surface-high',
  '--ds-neutral-fill',
] as const

const FOCUS_GROUNDS = ['--ds-canvas', '--ds-paper', '--ds-surface', '--ds-surface-high'] as const

describe('design tokens: every colour has a contrast role', () => {
  it('classifies each colour as text, surface or explicitly not text', () => {
    const known = new Set<string>([...LIGHT_TEXT, ...LIGHT_SURFACES, ...Object.keys(NOT_TEXT)])
    expect(Object.keys(color).filter((key) => !known.has(key))).toEqual([])
    expect(Object.keys(NOT_TEXT).filter((key) => !(key in color))).toEqual([])
  })
})

describe('design tokens: document type colours', () => {
  for (const group of DOC_GROUPS) {
    it(`${group} on surface reaches ${WCAG_AA_TEXT}:1 as text`, () => {
      expect(contrastRatio(docGroupColor[group], color.surface)).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
    })

    for (const ground of LIGHT_SURFACES) {
      it(`${group} on ${ground} reaches ${WCAG_NON_TEXT}:1 as a glyph`, () => {
        expect(contrastRatio(docGroupColor[group], color[ground])).toBeGreaterThanOrEqual(WCAG_NON_TEXT)
      })
    }
  }

  it('every group has a distinct dark twin', () => {
    for (const group of DOC_GROUPS) {
      expect(docGroupColorDark[group], group).toMatch(HEX_COLOR)
      expect(docGroupColorDark[group], group).not.toBe(docGroupColor[group])
    }
  })

  it('the dark twins read on the dark paper', () => {
    const vars = rootVars('dark')
    for (const group of DOC_GROUPS) {
      expect(contrastRatio(docGroupColorDark[group], vars['--ds-paper']), group).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
    }
  })
})

describe('design tokens: the accent', () => {
  it(`onAccent on accent and accentPressed reaches ${WCAG_AA_TEXT}:1`, () => {
    expect(contrastRatio(color.onAccent, color.accent)).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
    expect(contrastRatio(color.onAccent, color.accentPressed)).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
  })

  it(`accent on surface reaches ${WCAG_AA_TEXT}:1`, () => {
    expect(contrastRatio(color.accent, color.surface)).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
  })

  it('the data type colour differs from the accent', () => {
    expect(docGroupColor.data).not.toBe(color.accent)
    expect(docGroupColorDark.data).not.toBe(rootVars('dark')['--ds-accent-text'])
  })
})

describe('design tokens: light text on light surfaces', () => {
  for (const foreground of LIGHT_TEXT) {
    for (const ground of LIGHT_SURFACES) {
      it(`${foreground} on ${ground} reaches ${WCAG_AA_TEXT}:1`, () => {
        expect(contrastRatio(color[foreground], color[ground])).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
      })
    }
  }
})

describe.each(MODES)('theme variables (%s)', (mode) => {
  const vars = rootVars(mode)
  const tonalOverPaper = composite(parseColor(vars['--ds-accent-tonal']), parseColor(vars['--ds-paper']))
  const grounds: [string, string][] = [
    ...OPAQUE_GROUNDS.map((name) => [name, vars[name]] as [string, string]),
    ['--ds-accent-tonal over --ds-paper', `rgb(${tonalOverPaper.r}, ${tonalOverPaper.g}, ${tonalOverPaper.b})`],
  ]

  for (const foreground of TEXT_VARS) {
    for (const [groundName, ground] of grounds) {
      it(`${foreground} on ${groundName} reaches ${WCAG_AA_TEXT}:1`, () => {
        expect(vars[foreground], `${foreground} is emitted`).toBeTruthy()
        expect(contrastRatio(vars[foreground], ground)).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
      })
    }
  }
})

describe('design tokens: the desk ground', () => {
  it('a tile lifts off the desk by the same step in both modes', () => {
    const lightStep = contrastRatio(color.surface, desk.light.ground)
    const darkVars = rootVars('dark')
    const darkStep = contrastRatio(darkVars['--ds-paper'], desk.dark.ground)

    expect(lightStep).toBeGreaterThanOrEqual(MIN_DESK_TILE_STEP)
    expect(Math.abs(lightStep - darkStep)).toBeLessThan(MAX_DESK_STEP_DIFFERENCE)
    expect(darkVars['--ds-desk-ground']).toBe(desk.dark.ground)
    expect(rootVars('light')['--ds-desk-ground']).toBe(color.sunken2)
  })
})

describe.each(MODES)('the experiment badge (%s)', (mode) => {
  const vars = rootVars(mode)

  it('is emitted from the design tokens', () => {
    expect(vars['--ds-experiment']).toBe(experimentColor[mode].text)
    expect(vars['--ds-experiment-tonal']).toBe(experimentColor[mode].tonal)
  })

  for (const ground of ['--ds-experiment-tonal', '--ds-paper', '--ds-surface'] as const) {
    it(`--ds-experiment on ${ground} reaches ${WCAG_AA_TEXT}:1`, () => {
      expect(contrastRatio(vars['--ds-experiment'], vars[ground])).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
    })
  }

  it('is neither the accent nor the warning colour', () => {
    const experiment = vars['--ds-experiment'].toLowerCase()
    expect(experiment).not.toBe(vars['--ds-accent-text'].toLowerCase())
    expect(experiment).not.toBe(String(vars['--ds-diff-changed']).toLowerCase())
  })
})

describe.each(MODES)('the onboarding tour (%s)', (mode) => {
  const vars = rootVars(mode)

  it('has two dim levels, the deep one darker than the soft one', () => {
    const deep = parseColor(vars['--ds-tour-scrim-1'])
    const soft = parseColor(vars['--ds-tour-scrim-2'])
    expect(deep.a).toBeGreaterThan(soft.a)
    expect(soft.a).toBeGreaterThan(0)
  })

  it(`keeps the tour card text at ${WCAG_AA_TEXT}:1 on the paper`, () => {
    for (const foreground of ['--ds-text-primary', '--ds-text-secondary', '--ds-text-meta', '--ds-accent-text']) {
      expect(contrastRatio(vars[foreground], vars['--ds-paper']), foreground).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
    }
  })
})

describe.each(MODES)('quiet text, MUI text.disabled (%s, WCAG 1.4.3)', (mode) => {
  it(`reaches ${WCAG_AA_TEXT}:1 on every opaque ground`, () => {
    const theme = createAppTheme(mode, DEFAULT_ACCENT)
    const vars = rootVars(mode)
    for (const ground of OPAQUE_GROUNDS) {
      expect(contrastRatio(theme.palette.text.disabled, vars[ground]), ground).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
    }
  })
})

describe.each(MODES)('keyboard focus (%s, WCAG 2.4.7 / 1.4.11)', (mode) => {
  it(`the focus outline reaches ${WCAG_NON_TEXT}:1 on every surface`, () => {
    const vars = rootVars(mode)
    for (const ground of FOCUS_GROUNDS) {
      expect(contrastRatio(vars['--ds-focus-outline'], vars[ground]), ground).toBeGreaterThanOrEqual(WCAG_NON_TEXT)
    }
  })

  it('one global :focus-visible rule draws a 2px solid outline', () => {
    const theme = createAppTheme(mode, DEFAULT_ACCENT)
    const overrides = theme.components?.MuiCssBaseline?.styleOverrides as Record<string, Record<string, unknown>>
    const rule = Object.entries(overrides).find(([selector]) => selector.includes(':focus-visible'))
    expect(rule?.[1].outline).toMatch(/^2px solid var\(--ds-focus-outline\)/)
  })
})

describe('heat map scale', () => {
  it(`every badge and the rank disc read at ${WCAG_AA_TEXT}:1 in both modes`, () => {
    for (const mode of MODES) {
      for (const level of HEAT_LEVELS) {
        const { badgeFg, badgeBg } = heatScale[mode][level]
        expect([mode, level, contrastRatio(badgeFg, badgeBg) >= WCAG_AA_TEXT]).toEqual([mode, level, true])
      }
    }
    expect(contrastRatio(heatScale.rank.fg, heatScale.rank.bg)).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
  })
})
