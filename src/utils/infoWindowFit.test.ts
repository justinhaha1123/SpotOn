import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GOOGLE_FOOTER_TOP_PX,
  GOOGLE_MAP_FOOTER_PX,
  GOOGLE_MAP_TOP_INSET_PX,
  INFO_WINDOW_BODY_REM,
  INFO_WINDOW_BODY_REM_WITH_BANNER,
  INFO_WINDOW_SHELL_REM,
  INFO_WINDOW_SHELL_REM_WITH_BANNER,
  googleMapPadding,
  infoWindowClearsLine,
  infoWindowMaxHeightPx,
} from "./infoWindowFit.ts";

test("with the timer banner, the Barbican card ends at 806 even if it stays at y=413", () => {
  const viewport = 844;
  const banner = 155;
  const top = 413;
  const measuredHeight = 413;
  assert.equal(top + measuredHeight, 826);
  assert.equal(infoWindowClearsLine(top, measuredHeight, GOOGLE_FOOTER_TOP_PX), false);

  const height = infoWindowMaxHeightPx(viewport, banner, INFO_WINDOW_SHELL_REM_WITH_BANNER);
  assert.equal(INFO_WINDOW_SHELL_REM_WITH_BANNER, 18.5);
  assert.equal(height, 393);
  assert.equal(top + height, 806);
  assert.equal(infoWindowClearsLine(top, height, 806), true);
  assert.equal(infoWindowClearsLine(top, height, GOOGLE_FOOTER_TOP_PX), true);

  const body = infoWindowMaxHeightPx(viewport, banner, INFO_WINDOW_BODY_REM_WITH_BANNER);
  assert.equal(height - body, 12);
});

test("the idle cap is unchanged so a card without the timer still fits", () => {
  const viewport = 844;
  const idle = infoWindowMaxHeightPx(viewport, 0, INFO_WINDOW_SHELL_REM);
  assert.equal(idle, 620);
  assert.equal(INFO_WINDOW_BODY_REM, 15.5);
  const noTimerBottom = 814.5;
  assert.ok(noTimerBottom <= GOOGLE_FOOTER_TOP_PX);
  assert.ok(idle > noTimerBottom - 393);
});

test("map top padding stays a small inset and does not add the banner height", () => {
  assert.deepEqual(googleMapPadding(), { top: GOOGLE_MAP_TOP_INSET_PX, right: 8, bottom: GOOGLE_MAP_FOOTER_PX, left: 8 });
  assert.equal(GOOGLE_MAP_TOP_INSET_PX, 16);
});
