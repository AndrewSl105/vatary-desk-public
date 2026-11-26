import { diagramCssVars } from '@contracts/diagram/palette'
import { createElement } from 'react'
import {
  alpha,
  createTheme,
  type Components,
  type Theme,
  type ThemeOptions,
} from '@mui/material/styles'
import type { TypographyVariantsOptions } from '@mui/material/styles'

import { ChevronDownIcon } from './icons/dsIcons'
import {
  CheckboxBlankIcon,
  CheckboxCheckedIcon,
  CheckboxIndeterminateIcon,
} from './forms/CheckboxIcons'
import { ACCENT_PRESETS, type AccentId } from './state/settingsStore'
import { phoneDialogChromeSx } from './layout/dialogChrome'
import { floatingSurfaceEdge, type ColorMode } from './floatingSurface'
import { appScrollbarStyles } from './scrollbars'
import {
  PHONE_MEDIA,
  accentTonalState,
  color,
  colorDark,
  control,
  desk,
  diffColor,
  docGroupColor,
  docGroupColorDark,
  experimentColor,
  folderShell,
  folderShellDark,
  font,
  forestBackdrop,
  icon,
  lightbox,
  mascotColor,
  motion,
  neutralState,
  radius,
  shadow,
  shadowDark,
  space,
  tooltipSurface,
  tourScrim,
  type,
} from './designTokens'

declare module '@mui/material/styles' {
  interface ZIndex {
    /** Floating document windows: above the dock and the time lens, below modals. */
    windowLayer: number
    /** The dock: app chrome. */
    dock: number
    /** The full-viewport time axis: above the chrome, below windows. */
    timeLens: number
  }
}

// ─── Scales ──────────────────────────────────────────────────────────────

/** MUI expects exactly 25 elevation levels; they map onto four shadows. */
const MUI_SHADOW_LEVELS = 25
const CARD_ELEVATION_MAX = 6
const POPOVER_ELEVATION_MAX = 15

/** App layers, slotted between MUI's appBar (1100) and modal (1300). */
const Z_INDEX = {
  dock: 1160,
  timeLens: 1165,
  windowLayer: 1170,
  skipLink: 2000,
} as const

const HAIRLINE_PX = 1
const FOCUS_HALO_PX = 3
const FOCUS_OUTLINE_PX = 2
const TAB_INDICATOR_PX = 2

const OPACITY = {
  focusHalo: 0.14,
  actionFocus: 0.16,
  darkTonal: 0.16,
  darkTonalHover: 0.24,
  darkTonalPressed: 0.3,
  textSelection: 0.25,
  disabledOnAccent: 0.7,
  disabledDanger: 0.4,
  disabledSwitchTrack: 0.4,
} as const

const DURATION_MS = {
  quick: 120,
  input: 140,
  menu: 160,
  switch: 160,
  card: 180,
} as const

const CARD_HOVER_EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)'
const CARD_HOVER_LIFT_PX = 1

// ─── Component metrics ───────────────────────────────────────────────────

const HEADING_WEIGHT = 700
const HEADING_TRACKING = '-0.01em'
const WINDOW_TITLE_TRACKING = '-0.005em'
const LABEL_WEIGHT = 500

const DISPLAY_TYPE = {
  h1: { size: 34, lineHeight: 1.15 },
  h2: { size: 28, lineHeight: 1.2 },
  h3: { size: 24, lineHeight: 1.2 },
  h5: { size: 18, lineHeight: 1.25 },
} as const

const SECONDARY_TYPE = {
  subtitleSize: 13,
  subtitleLineHeight: 1.35,
  bodySmallSize: 12.5,
  captionLineHeight: 1.45,
  overlineLineHeight: 1.4,
} as const

const LINK_UNDERLINE_OFFSET = 3

const CARD_CONTENT_PADDING_BOTTOM = 16

const TAB = {
  minHeight: control.hitTarget,
  paddingY: 12,
  paddingX: 2,
  gap: space.sectionToSection,
} as const

const MENU = {
  listPaddingY: 6,
  rowInset: 6,
  dividerMarginY: 5,
  rowHeight: control.heightDense,
  rowHeightCoarse: 40,
  rowPaddingX: 10,
  gap: 11,
  iconSize: icon.sizeMd,
  fontSize: 13,
  lineHeight: 1.45,
} as const

const BUTTON = {
  paddingX: 16,
  paddingXSmall: 14,
  fontSizeSmall: 13,
} as const

const ICON_BUTTON_SMALL = {
  size: 32,
  padding: 6,
} as const

const INPUT = {
  lineHeight: 20,
  paddingY: 8,
  paddingYDense: 6,
  paddingYExtraDense: 5,
  paddingYPhone: 11,
  paddingX: 12,
  fontSizeDense: 13,
} as const

/** Inputs on a phone use 16px text so mobile browsers do not zoom on focus. */
const PHONE_INPUT_FONT_SIZE = 16

const LABEL = {
  fontSize: 12.5,
  lineHeight: 1.4,
  gap: 6,
} as const

const AUTOCOMPLETE_PADDING_Y = 3

const CHIP = {
  height: 26,
  heightSmall: 20,
  fontSize: 12,
  fontSizeSmall: 10.5,
} as const

const SEGMENT = {
  paddingY: 5,
  paddingX: 12,
  fontSize: 13,
  trackPadding: 3,
} as const

const TOOLTIP = {
  fontSize: 12,
  paddingY: 6,
  radius: 8,
} as const

const DIALOG = {
  gutter: 20,
  gutterPhone: 16,
  titleGap: 16,
  contentGapAboveActions: 4,
  actionsPaddingY: 16,
  actionsMarginTop: 10,
  actionsGap: 8,
  safeAreaGap: 16,
} as const

const SKIP_LINK = {
  offset: 8,
  paddingY: 8,
  paddingX: 14,
  radius: 8,
} as const

const GLASS = {
  blurPx: 18,
  saturatePercent: 160,
} as const

// ─── Helpers ─────────────────────────────────────────────────────────────

const px = (value: number): string => `${value}px`

const ms = (value: number): string => `${value}ms`

const kebabCase = (value: string): string =>
  value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)

const hairline = (borderColor: string): string => `${px(HAIRLINE_PX)} solid ${borderColor}`

const focusHalo = (ringColor: string): string =>
  `0 0 0 ${px(FOCUS_HALO_PX)} ${alpha(ringColor, OPACITY.focusHalo)}`

const phoneGutter = {
  [`@media ${PHONE_MEDIA}`]: {
    paddingLeft: DIALOG.gutterPhone,
    paddingRight: DIALOG.gutterPhone,
  },
}

// ─── Mode tokens ─────────────────────────────────────────────────────────

/** Every value the theme needs for one colour mode and accent. */
function resolveModeTokens(mode: ColorMode, accentId: AccentId) {
  const isLight = mode === 'light'
  const accent = (ACCENT_PRESETS[accentId] ?? ACCENT_PRESETS.sage).hex
  const state = isLight ? neutralState.light : neutralState.dark
  const elevation = isLight ? shadow : shadowDark

  const neutrals = isLight
    ? {
        background: color.canvas,
        paper: color.surface,
        surface: color.sunken,
        surfaceHigh: color.sunken2,
        textPrimary: color.ink,
        textSecondary: color.muted,
        textControl: color.ink2,
        textIcon: color.ink3,
        textMeta: color.meta,
        divider: color.divider,
        border: color.border,
        inputBorder: color.inputBorder,
        inputBorderHover: state.inputBorderHover,
        accentTonal: color.accentTonal,
        switchOff: color.switchOff,
      }
    : {
        background: colorDark.canvas,
        paper: colorDark.surface,
        surface: colorDark.sunken,
        surfaceHigh: colorDark.sunken2,
        textPrimary: colorDark.ink,
        textSecondary: colorDark.muted,
        textControl: colorDark.ink2,
        textIcon: colorDark.ink3,
        textMeta: colorDark.meta,
        divider: colorDark.divider,
        border: colorDark.border,
        inputBorder: colorDark.inputBorder,
        inputBorderHover: state.inputBorderHover,
        accentTonal: alpha(color.accent, OPACITY.darkTonal),
        switchOff: colorDark.switchOff,
      }

  const folderSkin = isLight ? folderShell : folderShellDark

  return {
    mode,
    isLight,
    accent,
    neutrals,
    folder: {
      skin: folderSkin.fill,
      ink: folderSkin.tabText,
      icon: folderSkin.icon,
      meta: folderSkin.meta,
    },
    mascot: isLight ? mascotColor.light : mascotColor.dark,
    neutralHover: state.hover,
    neutralPressed: state.pressed,
    neutralFill: state.fill,
    neutralFillHover: state.fillHover,
    chipFill: state.chip,
    chipHover: state.chipHover,
    scrollbarThumb: state.scrollbarThumb,
    glass: state.glass,
    tonalBg: neutrals.accentTonal,
    tonalHover: isLight
      ? accentTonalState.hover
      : alpha(color.accent, OPACITY.darkTonalHover),
    tonalPressed: isLight
      ? accentTonalState.pressed
      : alpha(color.accent, OPACITY.darkTonalPressed),
    tonalText: isLight ? color.accentText : colorDark.accentText,
    danger: isLight ? color.danger : colorDark.danger,
    diffTone: isLight ? diffColor.light : diffColor.dark,
    experimentTone: isLight ? experimentColor.light : experimentColor.dark,
    tooltipBg: isLight ? tooltipSurface.light : tooltipSurface.dark,
    focusRing: focusHalo(accent),
    cardShadow: elevation.card,
    popoverShadow: elevation.popover,
    menuShadow: elevation.menu,
    modalShadow: elevation.modal,
    fabShadow: elevation.fab,
  }
}

type ModeTokens = ReturnType<typeof resolveModeTokens>

// ─── Theme sections ──────────────────────────────────────────────────────

function buildShadows(t: ModeTokens): Theme['shadows'] {
  return Array.from({ length: MUI_SHADOW_LEVELS }, (_, level) => {
    if (level === 0) return 'none'
    if (level <= CARD_ELEVATION_MAX) return t.cardShadow
    if (level <= POPOVER_ELEVATION_MAX) return t.popoverShadow
    return t.modalShadow
  }) as unknown as Theme['shadows']
}

function heading(size: number, lineHeight: number, letterSpacing: string = HEADING_TRACKING) {
  return { fontSize: px(size), fontWeight: HEADING_WEIGHT, letterSpacing, lineHeight }
}

/** Sizes are px strings so they do not scale with a page's root font size. */
function buildTypography(): TypographyVariantsOptions {
  return {
    fontFamily: font.sans,
    h1: heading(DISPLAY_TYPE.h1.size, DISPLAY_TYPE.h1.lineHeight),
    h2: heading(DISPLAY_TYPE.h2.size, DISPLAY_TYPE.h2.lineHeight),
    h3: heading(DISPLAY_TYPE.h3.size, DISPLAY_TYPE.h3.lineHeight),
    h4: heading(type.appTitle.size, type.appTitle.lineHeight),
    h5: heading(DISPLAY_TYPE.h5.size, DISPLAY_TYPE.h5.lineHeight),
    h6: heading(type.windowTitle.size, type.windowTitle.lineHeight, WINDOW_TITLE_TRACKING),
    subtitle1: {
      fontSize: px(type.cardTitle.size),
      fontWeight: type.cardTitle.weight,
      letterSpacing: 0,
      lineHeight: SECONDARY_TYPE.subtitleLineHeight,
    },
    subtitle2: {
      fontSize: px(SECONDARY_TYPE.subtitleSize),
      fontWeight: type.cardTitle.weight,
      letterSpacing: 0,
      lineHeight: SECONDARY_TYPE.subtitleLineHeight,
    },
    body1: { fontSize: px(type.body.size), lineHeight: type.body.lineHeight },
    body2: { fontSize: px(SECONDARY_TYPE.bodySmallSize), lineHeight: type.body.lineHeight },
    caption: {
      fontSize: px(type.meta.size),
      lineHeight: SECONDARY_TYPE.captionLineHeight,
      letterSpacing: 0,
    },
    overline: {
      fontSize: px(type.sectionLabel.size),
      fontWeight: type.sectionLabel.weight,
      textTransform: 'uppercase',
      letterSpacing: type.sectionLabel.tracking,
      lineHeight: SECONDARY_TYPE.overlineLineHeight,
    },
    button: {
      fontSize: px(type.control.size),
      textTransform: 'none',
      fontWeight: type.control.weight,
      letterSpacing: 0,
    },
  }
}

function surfaceComponents(t: ModeTokens): Components<Theme> {
  const { neutrals } = t

  return {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: radius.card,
        },
        outlined: {
          border: hairline(neutrals.border),
          backgroundColor: neutrals.paper,
          boxShadow: t.cardShadow,
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: radius.card,
          border: hairline(neutrals.border),
          backgroundImage: 'none',
          backgroundColor: neutrals.paper,
          boxShadow: t.cardShadow,
          transition: `box-shadow ${ms(DURATION_MS.card)} ease`,
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          '&:last-child': { paddingBottom: CARD_CONTENT_PADDING_BOTTOM },
        },
      },
    },
  }
}

function navigationComponents(t: ModeTokens): Components<Theme> {
  const { neutrals } = t
  const { width, height, thumb, inset } = control.switch
  const thumbTravel = width - thumb - inset * 2

  return {
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: TAB.minHeight,
        },
        indicator: {
          height: TAB_INDICATOR_PX,
          backgroundColor: t.accent,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontSize: px(type.control.size),
          fontWeight: LABEL_WEIGHT,
          letterSpacing: 0,
          minHeight: TAB.minHeight,
          padding: `${px(TAB.paddingY)} ${px(TAB.paddingX)}`,
          marginRight: TAB.gap,
          minWidth: 0,
          color: neutrals.textSecondary,
          '&.Mui-selected': {
            color: neutrals.textPrimary,
            fontWeight: type.control.weight,
          },
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: t.tonalText,
          textDecoration: 'none',
          textUnderlineOffset: px(LINK_UNDERLINE_OFFSET),
          '&:hover': { textDecoration: 'underline' },
          '&.MuiLink-underlineAlways': { textDecoration: 'underline' },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          width,
          height,
          padding: 0,
        },
        switchBase: {
          padding: inset,
          color: color.onAccent,
          '&:hover': { backgroundColor: 'transparent' },
          '&.Mui-checked': {
            transform: `translateX(${px(thumbTravel)})`,
            color: color.onAccent,
            '& + .MuiSwitch-track': {
              backgroundColor: t.accent,
              opacity: 1,
            },
          },
          '&.Mui-disabled': {
            color: color.onAccent,
            '& + .MuiSwitch-track': { opacity: OPACITY.disabledSwitchTrack },
          },
        },
        thumb: {
          width: thumb,
          height: thumb,
          boxShadow: shadow.switchThumb,
        },
        track: {
          borderRadius: height / 2,
          backgroundColor: neutrals.switchOff,
          opacity: 1,
          transition: `background-color ${ms(DURATION_MS.switch)} ease`,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: neutrals.divider },
      },
    },
    MuiCheckbox: {
      defaultProps: {
        icon: createElement(CheckboxBlankIcon),
        checkedIcon: createElement(CheckboxCheckedIcon),
        indeterminateIcon: createElement(CheckboxIndeterminateIcon),
      },
      styleOverrides: {
        root: {
          '&.Mui-disabled path': { stroke: neutrals.paper },
        },
      },
    },
    MuiSelect: {
      defaultProps: { IconComponent: ChevronDownIcon },
    },
    MuiNativeSelect: {
      defaultProps: { IconComponent: ChevronDownIcon },
    },
  }
}

function menuComponents(t: ModeTokens): Components<Theme> {
  const { neutrals } = t

  return {
    MuiMenu: {
      defaultProps: { elevation: 0, transitionDuration: DURATION_MS.menu },
      styleOverrides: {
        paper: {
          borderRadius: radius.card,
          ...floatingSurfaceEdge(t.mode, neutrals.border),
          backgroundColor: neutrals.paper,
          boxShadow: t.menuShadow,
          '& .MuiMenu-list': {
            paddingTop: MENU.listPaddingY,
            paddingBottom: MENU.listPaddingY,
            '& .MuiDivider-root': {
              margin: `${px(MENU.dividerMarginY)} ${px(MENU.rowInset)}`,
              borderColor: neutrals.divider,
            },
          },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: ({ theme }) => ({
          minHeight: MENU.rowHeight,
          [theme.breakpoints.up('sm')]: { minHeight: MENU.rowHeight },
          borderRadius: radius.control,
          marginLeft: MENU.rowInset,
          marginRight: MENU.rowInset,
          paddingTop: 0,
          paddingBottom: 0,
          paddingLeft: MENU.rowPaddingX,
          paddingRight: MENU.rowPaddingX,
          gap: px(MENU.gap),
          fontSize: px(MENU.fontSize),
          fontWeight: LABEL_WEIGHT,
          lineHeight: MENU.lineHeight,
          color: neutrals.textPrimary,
          '&:hover': { backgroundColor: t.neutralHover },
          '&.Mui-focusVisible': {
            backgroundColor: t.neutralHover,
            outlineOffset: px(-FOCUS_OUTLINE_PX),
          },
          '&.Mui-selected': {
            backgroundColor: t.tonalBg,
            '&:hover': { backgroundColor: t.tonalHover },
            '&.Mui-focusVisible': { backgroundColor: t.tonalBg },
          },
          '& .MuiListItemIcon-root': {
            minWidth: MENU.iconSize,
            width: MENU.iconSize,
            color: neutrals.textIcon,
            '& .MuiSvgIcon-root': { fontSize: MENU.iconSize },
          },
          '& .MuiListItemText-primary': {
            fontSize: px(MENU.fontSize),
            fontWeight: LABEL_WEIGHT,
            lineHeight: MENU.lineHeight,
          },
          '@media (pointer: coarse)': {
            minHeight: MENU.rowHeightCoarse,
            [theme.breakpoints.up('sm')]: { minHeight: MENU.rowHeightCoarse },
          },
        }),
      },
    },
  }
}

/**
 * Button tiers:
 * - contained: primary, the only solid fill;
 * - outlined: tonal fill with accent text;
 * - text: quiet, no fill;
 * - color="error": destructive, a neutral fill with danger text.
 */
function buttonComponents(t: ModeTokens): Components<Theme> {
  const { neutrals } = t

  const destructive = {
    backgroundColor: t.neutralFill,
    color: t.danger,
    '&:hover': { backgroundColor: t.neutralFillHover },
  }

  return {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: radius.control,
          minHeight: control.height,
          paddingLeft: BUTTON.paddingX,
          paddingRight: BUTTON.paddingX,
          fontWeight: type.control.weight,
          fontSize: px(type.control.size),
        },
        sizeSmall: {
          minHeight: control.heightDense,
          paddingLeft: BUTTON.paddingXSmall,
          paddingRight: BUTTON.paddingXSmall,
          fontSize: px(BUTTON.fontSizeSmall),
        },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none', backgroundColor: color.accentPressed },
          '&.Mui-disabled': { color: alpha(color.onAccent, OPACITY.disabledOnAccent) },
          '&.MuiButton-colorError': {
            ...destructive,
            '&.Mui-disabled': {
              backgroundColor: t.neutralFill,
              color: alpha(t.danger, OPACITY.disabledDanger),
            },
          },
        },
        outlined: {
          border: 0,
          backgroundColor: t.tonalBg,
          color: t.tonalText,
          '&:hover': {
            border: 0,
            backgroundColor: t.tonalHover,
          },
          '&:active, &.Mui-focusVisible': {
            backgroundColor: t.tonalPressed,
          },
          '&.MuiButton-colorError': destructive,
        },
        text: {
          color: neutrals.textIcon,
          fontWeight: LABEL_WEIGHT,
          '&:hover': {
            backgroundColor: t.neutralHover,
          },
          '&:active': {
            backgroundColor: t.neutralPressed,
          },
          '&.MuiButton-colorError': { color: t.danger },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: radius.control,
          color: neutrals.textIcon,
          transition: `background-color ${ms(DURATION_MS.quick)} ease, color ${ms(DURATION_MS.quick)} ease`,
          '&:hover': {
            backgroundColor: t.neutralHover,
          },
          '&.Mui-selected, &[aria-pressed="true"]': {
            backgroundColor: t.tonalBg,
            color: t.tonalText,
            '&:hover': { backgroundColor: t.tonalHover },
          },
        },
        sizeSmall: {
          width: ICON_BUTTON_SMALL.size,
          height: ICON_BUTTON_SMALL.size,
          padding: ICON_BUTTON_SMALL.padding,
          borderRadius: radius.control,
        },
      },
    },
  }
}

/** A border means "you can type"; a fill means "you can click". Labels are static. */
function inputComponents(t: ModeTokens): Components<Theme> {
  const { neutrals } = t

  return {
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: radius.control,
          backgroundColor: 'transparent',
          fontSize: px(type.body.size),
          transition: `box-shadow ${ms(DURATION_MS.input)} ease`,
          '& fieldset': {
            borderColor: neutrals.inputBorder,
            transition: `border-color ${ms(DURATION_MS.input)} ease`,
          },
          '&:hover fieldset': {
            borderColor: neutrals.inputBorderHover,
          },
          '&.Mui-focused': {
            boxShadow: t.focusRing,
          },
          '&.Mui-focused fieldset': {
            borderColor: t.accent,
            borderWidth: HAIRLINE_PX,
          },
          '&.Mui-error.Mui-focused': {
            boxShadow: focusHalo(t.danger),
          },
          '&.Mui-disabled': {
            backgroundColor: 'transparent',
          },
          '&.Mui-disabled fieldset': {
            borderColor: neutrals.divider,
          },
          '&.MuiInputBase-sizeSmall': {
            fontSize: px(INPUT.fontSizeDense),
            '& .MuiOutlinedInput-input': {
              height: INPUT.lineHeight,
              paddingTop: INPUT.paddingYDense,
              paddingBottom: INPUT.paddingYDense,
              paddingLeft: INPUT.paddingX,
              paddingRight: INPUT.paddingX,
            },
          },
          '&.ds-input-dense .MuiOutlinedInput-input': {
            paddingTop: INPUT.paddingYExtraDense,
            paddingBottom: INPUT.paddingYExtraDense,
          },
          [`@media ${PHONE_MEDIA}`]: {
            '& .MuiOutlinedInput-input': {
              paddingTop: INPUT.paddingYPhone,
              paddingBottom: INPUT.paddingYPhone,
            },
          },
          '&.MuiInputBase-adornedStart .MuiOutlinedInput-input': {
            paddingLeft: 0,
          },
        },
        input: {
          height: INPUT.lineHeight,
          paddingTop: INPUT.paddingY,
          paddingBottom: INPUT.paddingY,
          paddingLeft: INPUT.paddingX,
          paddingRight: INPUT.paddingX,
        },
        multiline: {
          paddingTop: INPUT.paddingY,
          paddingBottom: INPUT.paddingY,
          '& .MuiOutlinedInput-input': {
            height: 'auto',
            paddingTop: 0,
            paddingBottom: 0,
          },
        },
        notchedOutline: {
          top: 0,
          '& legend': { display: 'none' },
        },
      },
    },
    MuiInputLabel: {
      defaultProps: { shrink: true },
      styleOverrides: {
        root: {
          position: 'relative',
          transform: 'none',
          maxWidth: 'none',
          pointerEvents: 'auto',
          fontSize: px(LABEL.fontSize),
          fontWeight: LABEL_WEIGHT,
          lineHeight: LABEL.lineHeight,
          marginBottom: LABEL.gap,
          color: neutrals.textControl,
          '&.Mui-focused': { color: neutrals.textPrimary },
        },
      },
    },
    MuiAutocomplete: {
      defaultProps: { popupIcon: createElement(ChevronDownIcon) },
      styleOverrides: {
        inputRoot: {
          minHeight: control.height,
          paddingTop: AUTOCOMPLETE_PADDING_Y,
          paddingBottom: AUTOCOMPLETE_PADDING_Y,
          '&.MuiInputBase-sizeSmall': {
            minHeight: control.heightDense,
            paddingTop: AUTOCOMPLETE_PADDING_Y,
            paddingBottom: AUTOCOMPLETE_PADDING_Y,
          },
          '& .MuiOutlinedInput-input': { height: 'auto' },
        },
      },
    },
  }
}

function dataDisplayComponents(t: ModeTokens): Components<Theme> {
  const { neutrals } = t

  return {
    MuiAvatar: {
      styleOverrides: {
        colorDefault: { backgroundColor: neutrals.surfaceHigh, color: neutrals.textControl },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: radius.pill,
          fontWeight: LABEL_WEIGHT,
          fontSize: px(CHIP.fontSize),
          height: CHIP.height,
          border: 0,
          backgroundColor: t.chipFill,
          color: neutrals.textIcon,
          transition: `background-color ${ms(DURATION_MS.quick)} ease, color ${ms(DURATION_MS.quick)} ease`,
          '&.MuiChip-clickable:hover': {
            backgroundColor: t.chipHover,
            color: neutrals.textPrimary,
          },
        },
        outlined: {
          border: 0,
          backgroundColor: t.chipFill,
        },
        sizeSmall: {
          height: CHIP.heightSmall,
          fontSize: px(CHIP.fontSizeSmall),
          fontWeight: LABEL_WEIGHT,
        },
        colorPrimary: {
          backgroundColor: t.accent,
          color: color.onAccent,
          '&.MuiChip-clickable:hover': {
            backgroundColor: color.accentPressed,
            color: color.onAccent,
          },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          border: 0,
          borderRadius: radius.control,
          textTransform: 'none',
          fontSize: px(SEGMENT.fontSize),
          fontWeight: LABEL_WEIGHT,
          color: neutrals.textSecondary,
          padding: `${px(SEGMENT.paddingY)} ${px(SEGMENT.paddingX)}`,
          minHeight: control.heightDense,
          '&:hover': { backgroundColor: t.neutralHover },
          '&.Mui-selected': {
            backgroundColor: neutrals.paper,
            color: neutrals.textPrimary,
            fontWeight: type.control.weight,
            boxShadow: shadow.segment,
            '&:hover': { backgroundColor: neutrals.paper },
          },
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          backgroundColor: neutrals.surfaceHigh,
          borderRadius: radius.card,
          padding: SEGMENT.trackPadding,
          gap: SEGMENT.trackPadding,
        },
        grouped: {
          border: 0,
          '&:not(:first-of-type), &:not(:last-of-type)': {
            borderRadius: radius.control,
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: t.tooltipBg,
          color: tooltipSurface.text,
          fontSize: px(TOOLTIP.fontSize),
          fontWeight: LABEL_WEIGHT,
          paddingTop: TOOLTIP.paddingY,
          paddingBottom: TOOLTIP.paddingY,
          borderRadius: TOOLTIP.radius,
        },
        arrow: { color: t.tooltipBg },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRadius: 0,
          backgroundImage: 'none',
        },
      },
    },
  }
}

/** Head, body and footer of a dialog share one gutter and read as one column. */
function dialogComponents(t: ModeTokens): Components<Theme> {
  const { neutrals } = t

  return {
    MuiDialog: {
      defaultProps: {
        maxWidth: 'sm',
        fullWidth: true,
      },
      styleOverrides: {
        paper: {
          borderRadius: radius.window,
          border: hairline(neutrals.border),
          backgroundImage: 'none',
          boxShadow: t.modalShadow,
        },
        paperFullScreen: {
          borderRadius: 0,
          border: 0,
          boxShadow: 'none',
          paddingTop: 'var(--app-safe-top)',
          ...phoneDialogChromeSx,
          '& > .MuiDialogActions-root': {
            ...phoneDialogChromeSx['& > .MuiDialogActions-root'],
            paddingBottom: `calc(var(--app-safe-bottom) + ${px(DIALOG.safeAreaGap)})`,
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          color: neutrals.textPrimary,
          fontSize: px(type.windowTitle.size),
          fontWeight: type.windowTitle.weight,
          paddingTop: DIALOG.gutter,
          paddingBottom: DIALOG.titleGap,
          paddingLeft: DIALOG.gutter,
          paddingRight: DIALOG.gutter,
          ...phoneGutter,
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          paddingTop: DIALOG.gutter,
          paddingBottom: DIALOG.gutter,
          paddingLeft: DIALOG.gutter,
          paddingRight: DIALOG.gutter,
          ...phoneGutter,
          overflowY: 'auto',
          '&.MuiDialogContent-dividers': {
            borderColor: neutrals.divider,
          },
          '.MuiDialogTitle-root + &': {
            paddingTop: 0,
          },
          '&:has(+ .MuiDialogActions-root)': {
            paddingBottom: DIALOG.contentGapAboveActions,
          },
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          paddingTop: DIALOG.actionsPaddingY,
          paddingBottom: DIALOG.actionsPaddingY,
          paddingLeft: DIALOG.gutter,
          paddingRight: DIALOG.gutter,
          ...phoneGutter,
          marginTop: DIALOG.actionsMarginTop,
          borderTop: hairline(neutrals.divider),
          gap: DIALOG.actionsGap,
          '& .MuiButton-root': { whiteSpace: 'nowrap' },
        },
      },
    },
  }
}

// ─── CSS variables ───────────────────────────────────────────────────────

/** Design tokens published as `--ds-*` CSS variables for hand-written styles. */
function buildCssVariables(t: ModeTokens): Record<string, string> {
  const { neutrals, mascot, diffTone, experimentTone, folder, mode, isLight } = t

  return {
    '--ds-canvas': neutrals.background,
    ...diagramCssVars(mode),
    '--ds-desk-ground': isLight ? desk.light.ground : desk.dark.ground,
    ...Object.fromEntries(
      (Object.keys(docGroupColor) as (keyof typeof docGroupColor)[]).map((group) => [
        `--ds-type-${group}`,
        isLight ? docGroupColor[group] : docGroupColorDark[group],
      ]),
    ),
    '--ds-surface': neutrals.surface,
    '--ds-surface-high': neutrals.surfaceHigh,
    '--ds-paper': neutrals.paper,
    '--ds-divider': neutrals.divider,
    '--ds-border': neutrals.border,
    '--ds-outline': neutrals.inputBorderHover,
    '--ds-input-border': neutrals.inputBorder,
    '--ds-input-border-hover': neutrals.inputBorderHover,
    '--ds-focus-ring': t.focusRing,
    '--ds-text-primary': neutrals.textPrimary,
    '--ds-text-secondary': neutrals.textSecondary,
    '--ds-text-control': neutrals.textControl,
    '--ds-text-icon': neutrals.textIcon,
    '--ds-text-meta': neutrals.textMeta,
    '--ds-placeholder': color.placeholder,
    '--ds-ghost': color.ghost,
    '--ds-danger': t.danger,

    '--mo-ease-out': motion.ease.out,
    '--mo-ease-in': motion.ease.in,
    '--mo-ease-std': motion.ease.std,
    '--ds-motion-genie-duration': ms(motion.genie.duration),
    '--ds-motion-genie-ease-in': motion.genie.easeIn,
    '--ds-motion-genie-ease-out': motion.genie.easeOut,
    '--ds-motion-cell-in-duration': ms(motion.cellIn.duration),
    '--ds-motion-cell-in-ease': motion.cellIn.ease,
    '--ds-motion-cell-out-duration': ms(motion.cellOut.duration),
    '--ds-motion-cell-out-ease': motion.cellOut.ease,
    '--ds-motion-reduced-duration': ms(motion.reduced.duration),
    '--ds-motion-reduced-ease': motion.reduced.ease,

    '--ds-mascot-beak': mascot.beak,
    '--ds-mascot-line': mascot.line,
    '--ds-mascot-dash': mascot.dash,
    '--ds-mascot-doc': mascot.doc,
    '--ds-mascot-data': mascot.data,
    '--ds-mascot-chart': mascot.chart,
    '--ds-mascot-file': mascot.file,

    '--ds-diff-added': diffTone.addedText,
    '--ds-diff-added-fill': diffTone.addedFill,
    '--ds-diff-added-border': diffTone.addedBorder,
    '--ds-diff-removed': diffTone.removedText,
    '--ds-diff-removed-fill': diffTone.removedFill,
    '--ds-diff-removed-border': diffTone.removedBorder,
    '--ds-diff-changed': diffTone.changedText,
    '--ds-diff-changed-fill': diffTone.changedFill,
    '--ds-diff-changed-border': diffTone.changedBorder,

    '--ds-experiment': experimentTone.text,
    '--ds-experiment-tonal': experimentTone.tonal,

    '--ds-tour-scrim-1': tourScrim[mode].deep,
    '--ds-tour-scrim-2': tourScrim[mode].soft,
    '--ds-tour-branch': forestBackdrop[mode].branch,
    '--ds-tour-leaf': forestBackdrop[mode].leaf,
    '--ds-tour-leaf-soft': forestBackdrop[mode].leafSoft,

    '--ds-lightbox-scrim': lightbox.scrim,
    '--ds-lightbox-control': lightbox.control,
    '--ds-lightbox-control-hover': lightbox.controlHover,
    '--ds-lightbox-text': lightbox.text,

    '--ds-folder-skin': folder.skin,
    '--ds-folder-ink': folder.ink,
    '--ds-folder-icon': folder.icon,
    '--ds-folder-meta': folder.meta,

    '--text-h': neutrals.textPrimary,
    '--text': neutrals.textSecondary,
    '--ds-accent': t.accent,
    '--ds-on-accent': color.onAccent,
    '--ds-accent-pressed': color.accentPressed,
    '--ds-accent-text': t.tonalText,
    '--ds-focus-outline': t.tonalText,
    '--ds-accent-tonal': t.tonalBg,
    '--ds-accent-tonal-hover': t.tonalHover,
    '--ds-accent-active': t.tonalBg,
    '--ds-neutral-hover': t.neutralHover,
    '--ds-neutral-pressed': t.neutralPressed,
    '--ds-neutral-fill': t.neutralFill,

    '--ds-sans': font.sans,
    '--ds-mono': font.mono,
    '--ds-font-mono': font.mono,

    '--ds-shadow-card': t.cardShadow,
    '--ds-shadow-popover': t.popoverShadow,
    '--ds-shadow-fab': t.fabShadow,
    '--ds-shadow-modal': t.modalShadow,
    '--ds-shadow-recess': shadow.recess,

    ...Object.fromEntries(
      (Object.keys(radius) as (keyof typeof radius)[]).map((step) => [
        `--ds-radius-${step}`,
        px(radius[step]),
      ]),
    ),
    ...Object.fromEntries(
      (Object.keys(space) as (keyof typeof space)[]).map((step) => [
        `--ds-space-${kebabCase(step)}`,
        px(space[step]),
      ]),
    ),
    '--ds-hit-target': px(control.hitTarget),

    '--vatary-outline': neutrals.inputBorderHover,
    '--vatary-surface': neutrals.surface,
    '--vatary-accent': t.accent,
    '--vatary-radius-card': px(radius.card),
    '--vatary-shadow-sm': t.cardShadow,
    '--vatary-shadow-md': t.popoverShadow,
    '--vatary-shadow-lg': t.modalShadow,
  }
}

// ─── Global styles ───────────────────────────────────────────────────────

function buildGlobalStyles(t: ModeTokens) {
  const { neutrals } = t
  const glassFilter = `blur(${px(GLASS.blurPx)}) saturate(${GLASS.saturatePercent}%)`

  return {
    ':root': buildCssVariables(t),
    '::selection': {
      backgroundColor: alpha(t.accent, OPACITY.textSelection),
    },
    '.skip-link': {
      position: 'fixed',
      left: SKIP_LINK.offset,
      top: SKIP_LINK.offset,
      zIndex: Z_INDEX.skipLink,
      padding: `${px(SKIP_LINK.paddingY)} ${px(SKIP_LINK.paddingX)}`,
      borderRadius: SKIP_LINK.radius,
      background: 'var(--ds-paper)',
      color: 'var(--ds-text-primary)',
      boxShadow: 'var(--vatary-shadow-md)',
      fontWeight: type.control.weight,
      textDecoration: 'none',
      transform: 'translateY(-200%)',
    },
    '.skip-link:focus': { transform: 'none' },
    ':where(:not(input, textarea, select, [contenteditable="true"], [role="textbox"])):focus-visible': {
      outline: `${px(FOCUS_OUTLINE_PX)} solid var(--ds-focus-outline) !important`,
      outlineOffset: px(FOCUS_OUTLINE_PX),
    },
    [`@media ${PHONE_MEDIA}`]: {
      'input, textarea, select, [contenteditable="true"]': {
        fontSize: px(PHONE_INPUT_FONT_SIZE),
      },
    },
    '.widget-card': {
      backgroundColor: neutrals.paper,
      border: hairline(neutrals.border),
      borderRadius: radius.card,
      boxShadow: t.cardShadow,
      transition: `box-shadow ${ms(DURATION_MS.card)} ease`,
    },
    '.widget-card--hoverable': {
      transition: `box-shadow ${ms(DURATION_MS.card)} ease, transform ${ms(DURATION_MS.card)} ${CARD_HOVER_EASE}`,
    },
    '.widget-card--hoverable:hover': {
      boxShadow: t.popoverShadow,
      transform: `translateY(${px(-CARD_HOVER_LIFT_PX)})`,
    },
    '.glass-surface': {
      backgroundColor: t.glass,
      backdropFilter: glassFilter,
      WebkitBackdropFilter: glassFilter,
      borderRadius: radius.card,
    },
    html: {
      scrollBehavior: 'smooth',
    },
    ...appScrollbarStyles(t.scrollbarThumb),
  }
}

// ─── Theme ───────────────────────────────────────────────────────────────

/**
 * Builds the Vatary Desk theme from the design tokens.
 *
 * Rules the component layer enforces:
 * - one accent, used only for primary actions, active states, selection and focus;
 * - cards, windows and bars are white with a hairline edge and a soft shadow;
 * - one radius scale, `radius.control` for every control;
 * - destructive actions use a neutral fill with danger text;
 * - numerals, time, keys and IDs use the mono font, everything else Inter;
 * - no gradients.
 */
export function createAppTheme(mode: ColorMode, accentId: AccentId): Theme {
  const t = resolveModeTokens(mode, accentId)

  const options: ThemeOptions = {
    palette: {
      mode,
      primary: { main: t.accent, dark: color.accentPressed },
      secondary: { main: t.accent, dark: color.accentPressed },
      error: { main: t.danger },
      background: { default: t.neutrals.background, paper: t.neutrals.paper },
      text: {
        primary: t.neutrals.textPrimary,
        secondary: t.neutrals.textSecondary,
        disabled: t.neutrals.textMeta,
      },
      divider: t.neutrals.divider,
      action: {
        hover: t.neutralHover,
        selected: t.tonalBg,
        focus: alpha(t.accent, OPACITY.actionFocus),
      },
    },
    shape: { borderRadius: radius.control },
    shadows: buildShadows(t),
    zIndex: {
      dock: Z_INDEX.dock,
      timeLens: Z_INDEX.timeLens,
      windowLayer: Z_INDEX.windowLayer,
    },
    typography: buildTypography(),
    components: {
      ...surfaceComponents(t),
      ...navigationComponents(t),
      ...menuComponents(t),
      ...buttonComponents(t),
      ...inputComponents(t),
      ...dataDisplayComponents(t),
      ...dialogComponents(t),
      MuiCssBaseline: {
        styleOverrides: buildGlobalStyles(t),
      },
    },
  }

  return createTheme(options)
}
