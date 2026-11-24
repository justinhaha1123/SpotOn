import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GOOGLE_MAP_FOOTER_PX,
  INFO_WINDOW_BODY_REM,
  INFO_WINDOW_SHELL_REM,
  googleMapPadding,
  infoWindowClearsFooter,
  infoWindowMaxHeightPx,
} from "./infoWindowFit.ts";

test("the measured Barbican window overflowed because the cap ignored its top", () => {
  const viewport = 844;
  const banner = 167;
  const top = 385;
  const oldHeight = infoWindowMaxHeightPx(viewport, banner, 13);
  assert.equal(oldHeight, 469);
  assert.equal(top + oldHeight, 854);
  assert.equal(infoWindowClearsFooter(top, oldHeight, viewport), false);

  const height = infoWindowMaxHeightPx(viewport, banner, INFO_WINDOW_SHELL_REM);
  assert.equal(height, oldHeight - 16);
  assert.equal(top + height <= viewport, true);
  assert.equal(INFO_WINDOW_BODY_REM, INFO_WINDOW_SHELL_REM + 1.5);
});

test("map padding keeps an info window above the Google footer", () => {
  const padding = googleMapPadding();
  assert.equal(padding.bottom, GOOGLE_MAP_FOOTER_PX);
  assert.ok(padding.bottom >= 10 + 32);
  const viewport = 844;
  const liftedTop = 385 - (854 - (viewport - padding.bottom));
  const height = infoWindowMaxHeightPx(viewport, 167, INFO_WINDOW_SHELL_REM);
  assert.equal(infoWindowClearsFooter(liftedTop, height, viewport), true);
  assert.equal(infoWindowClearsFooter(liftedTop, height, viewport, 0), true);
});
