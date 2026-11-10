import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { StoredReport } from "./logic.ts";
import { JsonFileReportStore } from "./store.ts";

const NOW = new Date("2026-11-10T12:00:00.000Z");

function report(id: string, minutesAgo: number, facilityId = "qpark-chinatown"): StoredReport {
  return {
    id,
    facilityId,
    status: "full",
    createdAt: new Date(NOW.getTime() - minutesAgo * 60000).toISOString(),
    deviceHash: "hash-a",
  };
}

async function withStore(run: (store: JsonFileReportStore, filePath: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "spoton-reports-"));
  const filePath = path.join(dir, "reports.json");
  try {
    await run(new JsonFileReportStore(filePath), filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("file store enforces the 10 minute and hourly limits and keeps only the hash", async () => {
  await withStore(async (store, filePath) => {
    const first = await store.commitReport(report("r1", 0), NOW);
    assert.equal(first.ok, true);
    const blocked = await store.commitReport(report("r2", 0), NOW);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.error, "facility_cooldown");

    const otherPlace = await store.commitReport(report("r3", 0, "ncp-covent-garden"), NOW);
    assert.equal(otherPlace.ok, true);

    for (let index = 0; index < 18; index += 1) {
      const saved = await store.commitReport(report(`extra-${index}`, index + 1, `park-${index}`), NOW);
      assert.equal(saved.ok, true);
    }
    const capped = await store.commitReport(report("overflow", 0, "park-new"), NOW);
    assert.equal(capped.ok, false);
    if (!capped.ok) assert.equal(capped.error, "hourly_cap");

    const raw = await readFile(filePath, "utf8");
    assert.match(raw, /hash-a/);
    assert.doesNotMatch(raw, /deviceId|private_key|"lat"|"lng"|ipAddress/i);
    const listed = await store.listByFacility("qpark-chinatown", new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString());
    assert.deepEqual(listed.map((item) => item.id), ["r1"]);
  });
});

test("file store undo removes the report and keeps the cooldown", async () => {
  await withStore(async (store, filePath) => {
    await store.commitReport(report("r1", 0), NOW);
    assert.equal(await store.removeIfOwned("r1", "someone-else", NOW.getTime() + 1000, 10_000), false);
    assert.equal(await store.removeIfOwned("r1", "hash-a", NOW.getTime() + 11_000, 10_000), false);
    assert.equal(await store.removeIfOwned("r1", "hash-a", NOW.getTime() + 1000, 10_000), true);
    const listed = await store.listSince(new Date(NOW.getTime() - 60_000).toISOString());
    assert.deepEqual(listed, []);

    const again = await store.commitReport(report("r2", 0), NOW);
    assert.equal(again.ok, false);
    if (!again.ok) {
      assert.equal(again.error, "facility_cooldown");
      assert.equal(again.message, "You reported this place a moment ago. You can report it again in 10 minutes.");
    }
    const otherPlace = await store.commitReport(report("r3", 0, "park-b"), NOW);
    assert.equal(otherPlace.ok, true);

    const reloaded = new JsonFileReportStore(filePath);
    const afterReload = await reloaded.commitReport(report("r4", 0), NOW);
    assert.equal(afterReload.ok, false);
    if (!afterReload.ok) assert.equal(afterReload.error, "facility_cooldown");
  });
});

test("file store serializes two reports for the same place", async () => {
  await withStore(async (store) => {
    const [first, second] = await Promise.all([
      store.commitReport(report("r1", 0), NOW),
      store.commitReport(report("r2", 0), NOW),
    ]);
    const saved = [first, second].filter((item) => item.ok);
    assert.equal(saved.length, 1);
  });
});
