import type { CSSObject } from '@mui/material/styles'

const SCROLLBAR_SIZE_PX = 8
const SCROLLBAR_THUMB_RADIUS_PX = 8

/**
 * Hides the scrollbar while keeping the element scrollable, for toolbars
 * and rails that scroll but should not look like they do.
 *
 * `scrollbar-width` covers Firefox and current Chromium and Safari; the
 * WebKit pseudo-element covers older Safari and Chromium.
 */
export const hideScrollbarSx: CSSObject = {
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
}

/**
 * The app-wide thin scrollbar, applied to every element.
 *
 * The standard properties come first; where they are supported they
 * replace the WebKit pseudo-elements, which remain as a fallback for older
 * engines. The rule targets `*` because `scrollbar-width` is not inherited.
 */
export function appScrollbarStyles(thumbColor: string): Record<string, CSSObject> {
  return {
    '*': {
      scrollbarWidth: 'thin',
      scrollbarColor: `${thumbColor} transparent`,
    },
    '*::-webkit-scrollbar': {
      width: SCROLLBAR_SIZE_PX,
      height: SCROLLBAR_SIZE_PX,
    },
    '*::-webkit-scrollbar-thumb': {
      backgroundColor: thumbColor,
      borderRadius: SCROLLBAR_THUMB_RADIUS_PX,
    },
    '*::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
  }
}
