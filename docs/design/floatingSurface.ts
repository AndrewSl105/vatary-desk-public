const FLOATING_EDGE_WIDTH_PX = 1
const DEFAULT_FLOATING_EDGE_COLOR = 'var(--ds-border)'

export type ColorMode = 'light' | 'dark'

/**
 * The edge of a floating surface: a menu, a popover, the dock.
 *
 * In light mode the surface is separated from the canvas by its shadow
 * alone. In dark mode a shadow cannot do that on a near-black canvas, so
 * the surface gets a hairline border in the card-edge colour.
 */
export function floatingSurfaceEdge(
  mode: ColorMode,
  borderColor: string = DEFAULT_FLOATING_EDGE_COLOR,
): { border?: string } {
  if (mode !== 'dark') {
    return {}
  }

  return { border: `${FLOATING_EDGE_WIDTH_PX}px solid ${borderColor}` }
}
