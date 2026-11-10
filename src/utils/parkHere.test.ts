import assert from "node:assert/strict";
import { test } from "node:test";
import { carParkStayMinutes, parkHereVerdict, type ParkHereFacts } from "./parkHere.ts";

const paid: ParkHereFacts = {
  restrictionType: "Paid for parking",
  times: "Mon-Fri 08:30-18:30, Sat 08:30-13:30",
  maximumStay: "2 hours, no return within 1 hour",
  tariff: "£4.50 per hour",
  zone: "CA-C",
  sourceLabel: "Camden Council open data",
};

const tuesday = (hm: string) => new Date(`2026-11-03T${hm}:00Z`);

test("paid bay boundaries, Sunday, and max stay use the London clock", () => {
  const before = parkHereVerdict(paid, tuesday("08:29"));
  assert.equal(before.headline, "Yes, you can park here now");
  assert.equal(before.nextRestriction, "Next restriction 08:30");
  assert.equal(before.suggestedStayMinutes, 1);
  assert.equal(before.zone, "CA-C");
  assert.equal(before.tariff, "£4.50 per hour");
  assert.equal(before.maxStay, "2 hours");
  assert.match(before.noReturn || "", /no return within 1 hour/i);
  assert.equal(before.disclaimer, "Check signs on street");

  const opens = parkHereVerdict(paid, tuesday("08:30"));
  assert.equal(opens.state, "yes");
  assert.equal(opens.until, "Until 18:30");
  assert.equal(opens.suggestedStayMinutes, 120);

  const lastMinute = parkHereVerdict(paid, tuesday("18:29"));
  assert.equal(lastMinute.state, "yes");
  assert.equal(lastMinute.suggestedStayMinutes, 1);

  const closed = parkHereVerdict(paid, tuesday("18:30"));
  assert.equal(closed.state, "yes");
  assert.equal(closed.nextRestriction, "Next restriction Wed 08:30");

  const sunday = parkHereVerdict(paid, new Date("2026-11-08T12:00:00Z"));
  assert.equal(sunday.headline, "Yes, you can park here now");
  assert.equal(sunday.nextRestriction, "Next restriction Mon 08:30");
});

test("overnight restrictions include the morning after and stop at the end minute", () => {
  const facts: ParkHereFacts = {
    restrictionType: "Resident permit holders",
    times: "Mon-Sun 19:00-07:00",
    sourceLabel: "Camden Council open data",
  };
  assert.equal(parkHereVerdict(facts, tuesday("18:59")).headline, "Yes, you can park here now");
  assert.equal(parkHereVerdict(facts, tuesday("19:00")).headline, "Not right now");
  assert.equal(parkHereVerdict(facts, new Date("2026-11-04T06:59:00Z")).headline, "Not right now");
  const ended = parkHereVerdict(facts, new Date("2026-11-04T07:00:00Z"));
  assert.equal(ended.headline, "Yes, you can park here now");
  assert.equal(ended.nextRestriction, "Next restriction 19:00");
});

test("missing, ambiguous, and permit rules are not invented", () => {
  assert.equal(parkHereVerdict({ restrictionType: "Paid for parking", times: null, sourceLabel: "Camden Council open data" }).headline, "Not sure (no verified data)");
  assert.equal(parkHereVerdict({ restrictionType: null, times: "Mon-Fri 08:30-18:30", sourceLabel: "OpenStreetMap" }).headline, "Not sure (no verified data)");
  assert.equal(parkHereVerdict({ restrictionType: "Paid for parking", times: "see the plate", sourceLabel: "Camden Council open data" }).state, "unsure");

  const permit = parkHereVerdict(
    { restrictionType: "Resident permit holders", times: "Mon-Fri 08:30-18:30", zone: "CA-C", sourceLabel: "Camden Council open data" },
    tuesday("12:00")
  );
  assert.equal(permit.headline, "Not right now");
  assert.equal(permit.suggestedStayMinutes, null);
  assert.equal(permit.zone, "CA-C");

  const mondayToFriday = parkHereVerdict(
    { restrictionType: "Paid for parking", times: "Monday to Friday 08:30-18:30", sourceLabel: "Camden Council open data" },
    new Date("2026-11-04T12:00:00Z")
  );
  assert.equal(mondayToFriday.state, "yes");
  assert.equal(mondayToFriday.until, "Until 18:30");
});

test("bank holidays change the verdict only when the text mentions them", () => {
  const goodFriday = new Date("2026-04-03T11:00:00Z");
  const excepted = parkHereVerdict(
    { restrictionType: "Paid for parking", times: "Mon-Fri 08:30-18:30 except bank holidays", sourceLabel: "Camden Council open data" },
    goodFriday
  );
  assert.equal(excepted.headline, "Yes, you can park here now");
  assert.match(excepted.nextRestriction || "", /Next restriction/);

  const plain = parkHereVerdict(
    { restrictionType: "Paid for parking", times: "Mon-Fri 08:30-18:30", sourceLabel: "Camden Council open data" },
    goodFriday
  );
  assert.equal(plain.state, "yes");
  assert.equal(plain.until, "Until 18:30");

  const unclear = parkHereVerdict(
    { restrictionType: "Paid for parking", times: "Mon-Fri 08:30-18:30 bank holidays", sourceLabel: "Camden Council open data" },
    goodFriday
  );
  assert.equal(unclear.headline, "Not sure (no verified data)");
});

test("a car park timer uses a readable closing time and ignores 24 hour sites", () => {
  assert.equal(carParkStayMinutes("07:00 - 20:00", tuesday("18:00")), 120);
  assert.equal(carParkStayMinutes("24/7", tuesday("18:00")), null);
  assert.equal(carParkStayMinutes("ask at the barrier", tuesday("12:00")), null);
  assert.equal(carParkStayMinutes("07:00 - 20:00", tuesday("21:00")), null);
});
