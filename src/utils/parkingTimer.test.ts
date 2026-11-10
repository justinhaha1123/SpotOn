import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearParkedSession,
  countdownLabel,
  loadParkedSession,
  saveParkedSession,
  sessionEndingIn,
  timerPhase,
  type KeyValueStore,
  type ParkedSession,
} from "./parkingTimer.ts";

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

test("a parking timer survives a reload and clears on end", () => {
  const store = memoryStore();
  const times = sessionEndingIn(90, new Date("2026-11-10T12:00:00Z"));
  const session: ParkedSession = {
    name: "Q-Park Chinatown",
    lat: 51.51,
    lng: -0.13,
    startedAt: times.startedAt,
    endsAt: times.endsAt,
    warnedTen: false,
    warnedEnd: false,
  };
  saveParkedSession(session, store);
  const loaded = loadParkedSession(store);
  assert.equal(loaded?.name, "Q-Park Chinatown");
  assert.equal(loaded?.endsAt, "2026-11-10T13:30:00.000Z");
  clearParkedSession(store);
  assert.equal(loadParkedSession(store), null);
});

test("the timer warns ten minutes before the end and again when time is up", () => {
  const ends = new Date("2026-11-10T13:00:00Z").getTime();
  const session = { endsAt: new Date(ends).toISOString(), warnedTen: false, warnedEnd: false };
  assert.equal(timerPhase(ends - 11 * 60000, session), "quiet");
  assert.equal(timerPhase(ends - 10 * 60000, session), "ten");
  assert.equal(timerPhase(ends - 9 * 60000, { ...session, warnedTen: true }), "quiet");
  assert.equal(timerPhase(ends, { ...session, warnedTen: true }), "ended");
  assert.equal(timerPhase(ends + 60000, { ...session, warnedTen: true, warnedEnd: true }), "quiet");
  assert.equal(countdownLabel(ends - 90 * 60000, session.endsAt), "1h 30m left");
  assert.equal(countdownLabel(ends, session.endsAt), "Time is up");
});
