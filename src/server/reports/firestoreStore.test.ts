import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  adminReportTimestamps,
  FirestoreReportStore,
  REPORT_LIMITS_COLLECTION,
  REPORTS_COLLECTION,
  type ReportCollection,
  type ReportDocRef,
  type ReportDocSnap,
  type ReportQuery,
  type ReportsDatabase,
  type ReportTimestamps,
  type ReportTransaction,
} from "./firestoreStore.ts";
import type { StoredReport } from "./logic.ts";

const NOW = new Date("2026-11-10T12:00:00.000Z");
const ROOT = path.resolve(import.meta.dirname, "../../..");

const testTimestamps: ReportTimestamps = {
  serverCreatedAt() {
    return { kind: "serverTimestamp" };
  },
  at(date: Date) {
    return { __ms: date.getTime() };
  },
  read(value: unknown) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (value && typeof value === "object" && "__ms" in value && typeof (value as { __ms: unknown }).__ms === "number") {
      return new Date((value as { __ms: number }).__ms);
    }
    return null;
  },
};

interface Filter {
  field: string;
  op: "==" | ">=";
  value: unknown;
}

function millis(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "__ms" in value && typeof (value as { __ms: unknown }).__ms === "number") {
    return (value as { __ms: number }).__ms;
  }
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis: unknown }).toMillis === "function") {
    const parsed = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function matches(data: Record<string, unknown>, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const stored = data[filter.field];
    const left = millis(stored);
    const right = millis(filter.value);
    if (filter.op === ">=") {
      if (left == null || right == null) return false;
      return left >= right;
    }
    if (left != null && right != null) return left === right;
    return stored === filter.value;
  });
}

class MemoryQuery implements ReportQuery {
  constructor(
    private readonly db: MemoryReportsDb,
    readonly collection: string,
    readonly filters: Filter[],
    private readonly rows: Map<string, Record<string, unknown>>
  ) {}

  where(field: string, op: "==" | ">=", value: unknown): ReportQuery {
    return new MemoryQuery(this.db, this.collection, [...this.filters, { field, op, value }], this.rows);
  }

  async get(): Promise<{ docs: ReportDocSnap[] }> {
    this.db.queryLog.push(this.filters);
    return { docs: this.db.snaps(this.rows, this.collection, this.filters) };
  }
}

class MemoryDocRef implements ReportDocRef {
  constructor(readonly collection: string, readonly id: string) {}

  get path(): string {
    return `${this.collection}/${this.id}`;
  }
}

/** In-memory Firestore with optimistic transactions, so rate-limit races can be tested without credentials. */
class MemoryReportsDb implements ReportsDatabase {
  docs = new Map<string, Record<string, unknown>>();
  queryLog: Filter[][] = [];
  private lock: Promise<void> = Promise.resolve();

  constructor(private readonly clock: () => Date) {}

  put(collection: string, id: string, data: Record<string, unknown>) {
    this.docs.set(`${collection}/${id}`, structuredClone(data));
  }

  collection(name: string): ReportCollection {
    return {
      doc: (id: string) => new MemoryDocRef(name, id),
      where: (field: string, op: "==" | ">=", value: unknown) => new MemoryQuery(this, name, [{ field, op, value }], this.docs),
    };
  }

  snaps(rows: Map<string, Record<string, unknown>>, collection: string, filters: Filter[]): ReportDocSnap[] {
    const prefix = `${collection}/`;
    const found: ReportDocSnap[] = [];
    for (const [path, data] of rows) {
      if (!path.startsWith(prefix) || !matches(data, filters)) continue;
      const id = path.slice(prefix.length);
      found.push({ id, exists: true, data: () => structuredClone(data) });
    }
    return found;
  }

  private exclusive<T>(task: () => T): Promise<T> {
    const run = this.lock.then(() => task());
    this.lock = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private resolve(data: Record<string, unknown>): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && (value as { kind?: string }).kind === "serverTimestamp") {
        resolved[key] = this.clock();
      } else {
        resolved[key] = value;
      }
    }
    return structuredClone(resolved);
  }

  private conflicts(snapshot: Map<string, Record<string, unknown>>, reads: Set<string>): boolean {
    for (const path of reads) {
      const before = JSON.stringify(snapshot.get(path) ?? null);
      const after = JSON.stringify(this.docs.get(path) ?? null);
      if (before !== after) return true;
    }
    return false;
  }

  runTransaction<T>(fn: (tx: ReportTransaction) => Promise<T>, attempt = 0): Promise<T> {
    if (attempt > 8) return Promise.reject(new Error("Firestore transaction did not settle"));
    const snapshot = new Map([...this.docs.entries()].map(([path, data]) => [path, structuredClone(data)]));
    const reads = new Set<string>();
    const writes = new Map<string, Record<string, unknown> | null>();
    const tx: ReportTransaction = {
      async getDoc(ref) {
        reads.add(ref.path);
        const data = snapshot.get(ref.path);
        return { id: ref.id, exists: data != null, data: () => (data ? structuredClone(data) : undefined) };
      },
      getQuery: async (query) => {
        const memoryQuery = query as MemoryQuery;
        this.queryLog.push(memoryQuery.filters);
        const docs = this.snaps(snapshot, memoryQuery.collection, memoryQuery.filters);
        for (const doc of docs) reads.add(`${memoryQuery.collection}/${doc.id}`);
        return { docs };
      },
      set(ref, data) {
        writes.set(ref.path, data);
      },
      delete(ref) {
        writes.set(ref.path, null);
      },
    };
    return Promise.resolve()
      .then(() => fn(tx))
      .then((result) =>
        this.exclusive(() => {
          if (this.conflicts(snapshot, reads)) return { retry: true as const };
          for (const [path, data] of writes) {
            if (data == null) this.docs.delete(path);
            else this.docs.set(path, this.resolve(data));
          }
          return { retry: false as const, result };
        })
      )
      .then((outcome) => (outcome.retry ? this.runTransaction(fn, attempt + 1) : outcome.result));
  }
}

function sample(id: string, facilityId = "qpark-chinatown"): StoredReport {
  return {
    id,
    facilityId,
    status: "filling_up",
    createdAt: NOW.toISOString(),
    deviceHash: "hash-a",
  };
}

function storeWith(db: MemoryReportsDb): FirestoreReportStore {
  return new FirestoreReportStore(db, testTimestamps);
}

test("production timestamps ask Firestore for a server timestamp", () => {
  const created = adminReportTimestamps.serverCreatedAt();
  assert.ok(created instanceof FieldValue);
  assert.equal((created as { methodName?: string }).methodName, "FieldValue.serverTimestamp");
  const stamp = Timestamp.fromDate(NOW);
  assert.equal(adminReportTimestamps.read(stamp)?.toISOString(), NOW.toISOString());
});

test("Firestore writes the report fields, a two hour expireAt, and a device limit document", async () => {
  const db = new MemoryReportsDb(() => NOW);
  const saved = await storeWith(db).commitReport(sample("r1"), NOW);
  assert.equal(saved.ok, true);
  const report = db.docs.get(`${REPORTS_COLLECTION}/r1`);
  assert.ok(report);
  assert.deepEqual(Object.keys(report).sort(), ["createdAt", "deviceHash", "expireAt", "facilityId", "status"]);
  assert.equal(report.facilityId, "qpark-chinatown");
  assert.equal(report.status, "filling_up");
  assert.equal(report.deviceHash, "hash-a");
  assert.equal(report.createdAt instanceof Date, true);
  assert.equal((report.expireAt as { __ms: number }).__ms, NOW.getTime() + 2 * 60 * 60 * 1000);
  assert.equal("deviceId" in report || "lat" in report || "lng" in report || "ip" in report, false);

  const limit = db.docs.get(`${REPORT_LIMITS_COLLECTION}/hash-a`);
  assert.ok(limit);
  const entries = limit.entries as { facilityId: string }[];
  assert.equal(entries.length, 1);
  assert.equal(entries[0].facilityId, "qpark-chinatown");
  assert.equal(JSON.stringify(limit).includes("device-id"), false);

  const filters = db.queryLog[0].map((filter) => `${filter.field}${filter.op}`);
  assert.deepEqual(filters, ["deviceHash==", "createdAt>="]);
});

test("Firestore rate limits use the shared device document across overlapping commits", async () => {
  const db = new MemoryReportsDb(() => NOW);
  const store = storeWith(db);
  const [first, second] = await Promise.all([
    store.commitReport(sample("r1", "park-a"), NOW),
    store.commitReport(sample("r2", "park-a"), NOW),
  ]);
  assert.equal([first, second].filter((item) => item.ok).length, 1);
  const blocked = [first, second].find((item) => !item.ok);
  assert.equal(blocked && !blocked.ok ? blocked.error : "", "facility_cooldown");
  assert.equal([...db.docs.keys()].filter((key) => key.startsWith(`${REPORTS_COLLECTION}/`)).length, 1);

  const other = await store.commitReport(sample("r3", "park-b"), NOW);
  assert.equal(other.ok, true);

  db.docs.delete(`${REPORT_LIMITS_COLLECTION}/hash-a`);
  for (let index = 0; index < 20; index += 1) {
    db.put(REPORTS_COLLECTION, `old-${index}`, {
      facilityId: `old-${index}`,
      status: "full",
      deviceHash: "hash-a",
      createdAt: new Date(NOW.getTime() - (index + 1) * 60000),
      expireAt: { __ms: NOW.getTime() },
    });
  }
  const capped = await store.commitReport(sample("r4", "park-new"), NOW);
  assert.equal(capped.ok, false);
  if (!capped.ok) assert.equal(capped.error, "hourly_cap");
  assert.equal(db.docs.has(`${REPORTS_COLLECTION}/r4`), false);
});

test("Firestore lists recent reports by time and by facility, and undo stays inside 10 seconds", async () => {
  const db = new MemoryReportsDb(() => NOW);
  const store = storeWith(db);
  await store.commitReport(sample("r1", "park-a"), NOW);
  await store.commitReport(sample("r2", "park-b"), NOW);
  db.put(REPORTS_COLLECTION, "old", {
    facilityId: "park-a",
    status: "full",
    deviceHash: "hash-b",
    createdAt: new Date(NOW.getTime() - 3 * 60 * 60 * 1000),
    expireAt: { __ms: NOW.getTime() },
  });

  const since = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const recent = await store.listSince(since);
  assert.deepEqual(recent.map((item) => item.id).sort(), ["r1", "r2"]);
  const onePlace = await store.listByFacility("park-a", since);
  assert.deepEqual(onePlace.map((item) => item.id), ["r1"]);
  assert.deepEqual(
    db.queryLog.at(-1)?.map((filter) => filter.field),
    ["facilityId", "createdAt"]
  );

  assert.equal(await store.removeIfOwned("r1", "other-hash", NOW.getTime() + 1000, 10_000), false);
  assert.equal(await store.removeIfOwned("r1", "hash-a", NOW.getTime() + 1000, 10_000), true);
  assert.equal(await store.removeIfOwned("r2", "hash-a", NOW.getTime() + 11_000, 10_000), false);
  assert.equal(db.docs.has(`${REPORTS_COLLECTION}/r1`), false);
  assert.equal(db.docs.has(`${REPORTS_COLLECTION}/r2`), true);
  const limit = db.docs.get(`${REPORT_LIMITS_COLLECTION}/hash-a`);
  const entries = (limit?.entries as { facilityId: string }[] | undefined) ?? [];
  assert.equal(entries.some((entry) => entry.facilityId === "park-a"), true);
  const again = await store.commitReport(sample("r3", "park-a"), NOW);
  assert.equal(again.ok, false);
  if (!again.ok) {
    assert.equal(again.error, "facility_cooldown");
    assert.equal(again.message, "You reported this place a moment ago. You can report it again in 10 minutes.");
  }
});

test("checked-in Firestore indexes and rules match the server queries", () => {
  const indexes = JSON.parse(readFileSync(path.join(ROOT, "firestore.indexes.json"), "utf8")) as {
    indexes: { collectionGroup: string; fields: { fieldPath: string; order: string }[] }[];
  };
  const signatures = indexes.indexes.map((index) =>
    `${index.collectionGroup}:${index.fields.map((field) => `${field.fieldPath}:${field.order}`).join(",")}`
  );
  assert.ok(signatures.includes("reports:deviceHash:ASCENDING,createdAt:ASCENDING"));
  assert.ok(signatures.includes("reports:facilityId:ASCENDING,createdAt:ASCENDING"));
  const rules = readFileSync(path.join(ROOT, "firestore.rules"), "utf8");
  assert.match(rules, /allow read, write: if false/);
});
