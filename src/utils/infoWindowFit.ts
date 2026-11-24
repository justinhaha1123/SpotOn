/** Shell reserve. One rem more than the previous cap, which still ended under the Google footer. */
export const INFO_WINDOW_SHELL_REM = 14;
/** Scrollable body reserve, also one rem tighter than before. */
export const INFO_WINDOW_BODY_REM = 15.5;
/** Bottom inset so auto-pan keeps the card above the Google logo and terms. */
export const GOOGLE_MAP_FOOTER_PX = 48;
/** Small top inset for controls drawn on the map. The timer banner sits above the map. */
export const GOOGLE_MAP_TOP_INSET_PX = 16;

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

/** True when a window placed at `topPx` ends above the viewport and the Google footer. */
export function infoWindowClearsFooter(topPx: number, heightPx: number, viewportPx: number, footerPx = GOOGLE_MAP_FOOTER_PX): boolean {
  return topPx >= 0 && topPx + heightPx <= viewportPx - footerPx;
}
