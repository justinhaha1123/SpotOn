/** Idle shell reserve, used when the timer banner is hidden. */
export const INFO_WINDOW_SHELL_REM = 14;
/** Idle scroll-body reserve. */
export const INFO_WINDOW_BODY_REM = 15.5;
/**
 * Tighter shell reserve while the timer banner is open.
 * Live recheck: banner 155px, card top 413, height 413, bottom 826, footer at 818.
 * 18.5rem makes that card 393px. Even if the top stays at 413, the bottom is 806.
 */
export const INFO_WINDOW_SHELL_REM_WITH_BANNER = 18.5;
/** Body reserve while the banner is open. 0.75rem under the shell matches the 12px Google chrome. */
export const INFO_WINDOW_BODY_REM_WITH_BANNER = 19.25;
/** Bottom inset so auto-pan can clear the Google logo and terms. */
export const GOOGLE_MAP_FOOTER_PX = 48;
/** Top inset for controls on the map. The timer banner is above the map, so it is not added here. */
export const GOOGLE_MAP_TOP_INSET_PX = 16;
/** The live recheck asked for the card bottom to be at or above this line. */
export const GOOGLE_FOOTER_TOP_PX = 818;

export interface GoogleMapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function infoWindowMaxHeightPx(viewportPx: number, bannerPx: number, reservedRem: number, rootFontPx = 16): number {
  return viewportPx - bannerPx - reservedRem * rootFontPx;
}

export function googleMapPadding(): GoogleMapPadding {
  return {
    top: GOOGLE_MAP_TOP_INSET_PX,
    right: 8,
    bottom: GOOGLE_MAP_FOOTER_PX,
    left: 8,
  };
}

/** True when a window placed at `topPx` ends on or above `limitPx`. */
export function infoWindowClearsLine(topPx: number, heightPx: number, limitPx: number): boolean {
  return topPx >= 0 && topPx + heightPx <= limitPx;
}
