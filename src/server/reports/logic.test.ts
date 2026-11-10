import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateFacilityReports,
  checkReportRateLimit,
  reportWeight,
  validateReportRequest,
  type StoredReport,
} from "./logic.ts";

const NOW = new Date("2026-11-10T12:00:00Z");

function report(partial: Partial<StoredReport> & Pick<StoredReport, "createdAt" | "status">): StoredReport {
  return {
    id: partial.id ?? "r1",
    facilityId: partial.facilityId ?? "qpark-chinatown",
    status: partial.status,
    createdAt: partial.createdAt,
    deviceHash: partial.deviceHash ?? "hash-a",
  };
}

test("reports older than 2 hours are ignored and reports after 60 minutes fade", () => {
  assert.equal(reportWeight(121), 0);
  assert.ok(reportWeight(30) > reportWeight(70));
  const summary = aggregateFacilityReports(
    [
      report({ id: "old", status: "full", createdAt: "2026-11-10T09:00:00Z" }),
      report({ id: "faded", status: "filling_up", createdAt: "2026-11-10T10:50:00Z" }),
    ],
    NOW
  );
  assert.equal(summary?.status, "filling_up");
  assert.equal(summary?.faded, true);
  assert.equal(summary?.reportCount, 1);
});

test("conflicting reports use a recency-weighted majority from the last 30 minutes", () => {
  const summary = aggregateFacilityReports(
    [
      report({ id: "a", status: "full", createdAt: "2026-11-10T11:50:00Z", deviceHash: "h1" }),
      report({ id: "b", status: "spaces_available", createdAt: "2026-11-10T11:58:00Z", deviceHash: "h2" }),
      report({ id: "c", status: "spaces_available", createdAt: "2026-11-10T11:59:00Z", deviceHash: "h3" }),
    ],
    NOW
  );
  assert.equal(summary?.status, "spaces_available");
  assert.equal(summary?.conflicting, true);
  assert.equal(summary?.reportCount, 3);
  assert.match(summary?.text || "", /^Drivers reported: Spaces available/);
  assert.doesNotMatch(summary?.text || "", /live sensor/i);
});

test("one device can report a place once every 10 minutes and 20 times an hour", () => {
  const history = [
    { facilityId: "park-a", deviceHash: "dev", createdAt: "2026-11-10T11:55:00Z" },
  ];
  const blocked = checkReportRateLimit(history, { facilityId: "park-a", deviceHash: "dev" }, NOW);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, "facility_cooldown");

  const otherPlace = checkReportRateLimit(history, { facilityId: "park-b", deviceHash: "dev" }, NOW);
  assert.equal(otherPlace.ok, true);

  const hourly = Array.from({ length: 20 }, (_, index) => ({
    facilityId: `park-${index}`,
    deviceHash: "dev",
    createdAt: new Date(NOW.getTime() - (index + 1) * 60000).toISOString(),
  }));
  const capped = checkReportRateLimit(hourly, { facilityId: "park-new", deviceHash: "dev" }, NOW);
  assert.equal(capped.ok, false);
  assert.equal(capped.error, "hourly_cap");
});

test("validation rejects unknown places, bad statuses and bad device ids", () => {
  const known = new Set(["qpark-chinatown"]);
  const deviceId = "11111111-1111-4111-8111-111111111111";
  assert.equal(validateReportRequest({ facilityId: "missing", status: "full", deviceId }, known).ok, false);
  assert.equal(validateReportRequest({ facilityId: "qpark-chinatown", status: "invented", deviceId }, known).ok, false);
  assert.equal(validateReportRequest({ facilityId: "qpark-chinatown", status: "full", deviceId: "not-a-uuid" }, known).ok, false);
  const ok = validateReportRequest({ facilityId: "qpark-chinatown", status: "full", deviceId }, known);
  assert.equal(ok.ok, true);
});
