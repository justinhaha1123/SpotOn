import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesOpenNowFilter } from "./parkingHours.ts";
import { humaniseManeuver } from "./maneuver.ts";
import { classifySecret } from "./secrets.ts";
import { selectNearestBays } from "./nearestBays.ts";

const tuesdayEvening = new Date("2026-11-03T21:30:00Z");
const tuesdayNoon = new Date("2026-11-03T12:40:00Z");
const afterMidnight = new Date("2026-11-04T00:30:00Z");

test("Open now keeps 24/7 car parks and hides closed or unknown hours", () => {
  assert.equal(matchesOpenNowFilter("24/7", true, tuesdayEvening), true);
  assert.equal(matchesOpenNowFilter("Mo-Su 24 Hr;", true, tuesdayEvening), true);
  assert.equal(matchesOpenNowFilter("06:00 - 23:00", true, tuesdayNoon), true);
  assert.equal(matchesOpenNowFilter("07:00 - 20:00", true, tuesdayEvening), false);
  assert.equal(matchesOpenNowFilter("07:00 - 01:00", true, afterMidnight), true);
  assert.equal(matchesOpenNowFilter("07:00 - 01:00", true, new Date("2026-11-04T03:00:00Z")), false);
  assert.equal(matchesOpenNowFilter(null, true, tuesdayNoon), false);
  assert.equal(matchesOpenNowFilter("ask at the barrier", true, tuesdayNoon), false);
  assert.equal(matchesOpenNowFilter("07:00 - 20:00", false, tuesdayEvening), true);
});

test("router new-name steps are sentences", () => {
  assert.equal(humaniseManeuver("new name", "straight", "Garrick Street"), "Continue onto Garrick Street");
  assert.equal(humaniseManeuver("turn", "left", "Garrick Street"), "Turn left onto Garrick Street");
  assert.equal(humaniseManeuver("arrive", "", "Q-Park Chinatown"), "Arrive at Q-Park Chinatown");
});

test("nearest bays are ordered by distance, not by feed order", () => {
  const nearest = selectNearestBays(
    [
      { id: "bloomsbury", distanceMeters: 1300 },
      { id: "tower-street", distanceMeters: 171 },
      { id: "closer-tie-b", distanceMeters: 171 },
    ],
    2
  );
  assert.deepEqual(nearest.map((bay) => bay.id), ["closer-tie-b", "tower-street"]);
});

test("secrets reject placeholders and accept other non-empty values", () => {
  assert.equal(classifySecret(undefined), "missing");
  assert.equal(classifySecret(""), "missing");
  assert.equal(classifySecret("MY_GOOGLE_MAPS_API_KEY"), "rejected");
  assert.equal(classifySecret("MY_GEMINI_API_KEY"), "rejected");
  assert.equal(classifySecret("short"), "rejected");
  assert.equal(classifySecret("configured-key-value-0123456789"), "usable");
});
