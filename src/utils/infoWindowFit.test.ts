import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GOOGLE_FOOTER_TOP_PX,
  GOOGLE_MAP_FOOTER_PX,
  INFO_WINDOW_BODY_REM,
  INFO_WINDOW_BODY_REM_WITH_BANNER,
  INFO_WINDOW_SHELL_REM,
  INFO_WINDOW_SHELL_REM_WITH_BANNER,
  googleMapPadding,
  infoWindowClearsLine,
  infoWindowMaxHeightPx,
} from "./infoWindowFit.ts";

test("with the timer banner, the Barbican card stays above the Google footer", () => {
  const viewport = 844;
  const banner = 155;
  const top = 393;
  const measuredHeight = 453;
  assert.equal(top + measuredHeight, 846);
  assert.equal(infoWindowClearsLine(top, measuredHeight, GOOGLE_FOOTER_TOP_PX), false);

  const height = infoWindowMaxHeightPx(viewport, banner, INFO_WINDOW_SHELL_REM_WITH_BANNER);
  assert.equal(height, 413);
  assert.equal(top + height, 806);
  assert.equal(infoWindowClearsLine(top, height, 810), true);
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

test("map padding uses the banner height on top and keeps a footer inset", () => {
  assert.deepEqual(googleMapPadding(0), { top: 16, right: 8, bottom: GOOGLE_MAP_FOOTER_PX, left: 8 });
  assert.equal(googleMapPadding(155).top, 155);
  assert.equal(googleMapPadding(155).bottom, GOOGLE_MAP_FOOTER_PX);
});
