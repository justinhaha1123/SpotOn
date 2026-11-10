import assert from "node:assert/strict";
import { test } from "node:test";
import { SEED_CAR_PARKS } from "./seedCarParks.ts";
import { catalogueRateLines, checkedOnLabel, isClosedCatalogue } from "../utils/catalogueNotes.ts";
import { comparableHourly } from "../utils.ts";

const CLOSED_IDS = ["apcoa-westhampstead-station", "romford-elizabethline-station"];
const BANDED_IDS = ["offstreet-baynard-house", "barking-town-centre-park"];

test("every verified catalogue row has a source and a 10 Nov 2026 check", () => {
  const verified = SEED_CAR_PARKS.filter((park) => park.verifiedAt === "2026-11-10" && park.stillOperating !== false);
  assert.equal(verified.length, 27);
  for (const park of verified) {
    assert.ok(park.sourceUrl, `${park.id} missing sourceUrl`);
    assert.equal(checkedOnLabel(park.verifiedAt), "Checked 10 Nov 2026");
    assert.equal(isClosedCatalogue(park), false);
  }
});

test("closed catalogue rows are not counted as open", () => {
  const closed = SEED_CAR_PARKS.filter((park) => CLOSED_IDS.includes(park.id));
  assert.equal(closed.length, 2);
  for (const park of closed) {
    assert.equal(park.stillOperating, false);
    assert.equal(isClosedCatalogue(park), true);
    assert.equal(park.tariffNote, "No public parking listed by National Rail");
    assert.equal(park.hourlyRate, null);
    assert.equal(park.dailyRate, null);
  }
  assert.equal(SEED_CAR_PARKS.filter((park) => isClosedCatalogue(park) && park.stillOperating !== false).length, 0);
});

test("banded tariffs stay null and unverified rows keep the reason", () => {
  for (const id of BANDED_IDS) {
    const park = SEED_CAR_PARKS.find((row) => row.id === id);
    assert.ok(park);
    assert.equal(park.hourlyRate, null);
    assert.equal(park.dailyRate, null);
    assert.equal(catalogueRateLines(park).primary, "See tariff bands");
    assert.equal(comparableHourly(park), null);
  }
  const chinatown = SEED_CAR_PARKS.find((park) => park.id === "qpark-chinatown");
  assert.equal(chinatown?.sourceUrl, null);
  assert.match(chinatown?.tariffNote || "", /no tariffs available online/);
  const ruskin = SEED_CAR_PARKS.find((park) => park.id === "east-croydon-station-park");
  assert.equal(ruskin?.name, "Ruskin Square Car Park");
  assert.equal(comparableHourly({ hourlyRate: null, dailyRate: null }), null);
});
