import { existsSync } from "fs";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentReference,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";
import {
  checkReportRateLimit,
  reportAgeMinutes,
  REPORT_STATUSES,
  type ReportCommitResult,
  type ReportStatus,
  type ReportStore,
  type StoredReport,
} from "./logic.js";

export const REPORTS_COLLECTION = "reports";
/** One document per device hash. Transactions on this document share the rate limit across server instances. */
export const REPORT_LIMITS_COLLECTION = "reportLimits";
const REPORT_TTL_MS = 2 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const GCP_RUNTIME_KEYS = [
  "K_SERVICE",
  "K_REVISION",
  "CLOUD_RUN_JOB",
  "GAE_SERVICE",
  "GAE_ENV",
  "FUNCTION_TARGET",
  "FUNCTION_NAME",
  "FIREBASE_CONFIG",
];

const UNCONFIGURED =
  "Firestore is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS, or deploy on Cloud Run, Google Cloud, or AI Studio so Application Default Credentials are available.";

export interface ReportTimestamps {
  serverCreatedAt(): unknown;
  at(date: Date): unknown;
  read(value: unknown): Date | null;
}

export const adminReportTimestamps: ReportTimestamps = {
  serverCreatedAt() {
    return FieldValue.serverTimestamp();
  },
  at(date: Date) {
    return Timestamp.fromDate(date);
  },
  read(value: unknown): Date | null {
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
      const date = (value as { toDate: () => Date }).toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
    }
    return null;
  },
};

export interface ReportDocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface ReportQuery {
  where(field: string, op: "==" | ">=", value: unknown): ReportQuery;
  get(): Promise<{ docs: ReportDocSnap[] }>;
}

export interface ReportDocRef {
  id: string;
  path: string;
}

export interface ReportCollection {
  doc(id: string): ReportDocRef;
  where(field: string, op: "==" | ">=", value: unknown): ReportQuery;
}

export interface ReportTransaction {
  getDoc(ref: ReportDocRef): Promise<ReportDocSnap>;
  getQuery(query: ReportQuery): Promise<{ docs: ReportDocSnap[] }>;
  set(ref: ReportDocRef, data: Record<string, unknown>): void;
  delete(ref: ReportDocRef): void;
}

export interface ReportsDatabase {
  collection(name: string): ReportCollection;
  runTransaction<T>(fn: (tx: ReportTransaction) => Promise<T>): Promise<T>;
}

type LimitHistory = Pick<StoredReport, "facilityId" | "deviceHash" | "createdAt"> & { reportId?: string };

export type FirestoreSettings =
  | { mode: "service-account"; projectId: string; clientEmail: string; privateKey: string }
  | { mode: "adc"; projectId?: string; credentialsPath?: string }
  | { mode: "unconfigured"; reason: string };

function envValue(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

function projectFromEnv(env: NodeJS.ProcessEnv): string {
  return envValue(env, "FIRESTORE_PROJECT_ID") || envValue(env, "GOOGLE_CLOUD_PROJECT") || envValue(env, "GCLOUD_PROJECT");
}

export function resolveFirestoreSettings(env: NodeJS.ProcessEnv): FirestoreSettings {
  const projectId = projectFromEnv(env);
  const jsonRaw = envValue(env, "FIREBASE_SERVICE_ACCOUNT_JSON");
  if (jsonRaw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonRaw);
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be a JSON object.");
    }
    const record = parsed as Record<string, unknown>;
    const fromKey =
      (typeof record.project_id === "string" && record.project_id.trim()) ||
      (typeof record.projectId === "string" && record.projectId.trim()) ||
      "";
    const clientEmail =
      typeof record.client_email === "string" ? record.client_email :
      typeof record.clientEmail === "string" ? record.clientEmail : "";
    const privateKey =
      typeof record.private_key === "string" ? record.private_key :
      typeof record.privateKey === "string" ? record.privateKey : "";
    const resolvedProject = projectId || fromKey;
    if (!resolvedProject) {
      throw new Error("Set FIRESTORE_PROJECT_ID or include project_id in FIREBASE_SERVICE_ACCOUNT_JSON.");
    }
    if (!clientEmail || !privateKey) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.");
    }
    return { mode: "service-account", projectId: resolvedProject, clientEmail, privateKey };
  }

  const credentialsPath = envValue(env, "GOOGLE_APPLICATION_CREDENTIALS");
  const onGoogleCloud = GCP_RUNTIME_KEYS.some((key) => envValue(env, key).length > 0);
  if (credentialsPath || onGoogleCloud) {
    return {
      mode: "adc",
      ...(projectId ? { projectId } : {}),
      ...(credentialsPath ? { credentialsPath } : {}),
    };
  }
  return { mode: "unconfigured", reason: UNCONFIGURED };
}

class AdminQuery implements ReportQuery {
  constructor(readonly native: Query) {}

  where(field: string, op: "==" | ">=", value: unknown): ReportQuery {
    return new AdminQuery(this.native.where(field, op, value));
  }

  async get(): Promise<{ docs: ReportDocSnap[] }> {
    const snap = await this.native.get();
    return { docs: snap.docs.map(wrapAdminDoc) };
  }
}

class AdminDocRef implements ReportDocRef {
  constructor(readonly native: DocumentReference) {}

  get id(): string {
    return this.native.id;
  }

  get path(): string {
    return this.native.path;
  }
}

function wrapAdminDoc(doc: { id: string; exists?: boolean; data(): unknown }): ReportDocSnap {
  return {
    id: doc.id,
    exists: doc.exists !== false,
    data: () => {
      const value = doc.data();
      return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
    },
  };
}

export function databaseFromAdmin(db: Firestore): ReportsDatabase {
  return {
    collection(name: string): ReportCollection {
      const col = db.collection(name);
      return {
        doc(id: string) {
          return new AdminDocRef(col.doc(id));
        },
        where(field: string, op: "==" | ">=", value: unknown) {
          return new AdminQuery(col.where(field, op, value));
        },
      };
    },
    runTransaction(fn) {
      return db.runTransaction(async (tx) =>
        fn({
          async getDoc(ref) {
            const snap = await tx.get((ref as AdminDocRef).native);
            return wrapAdminDoc(snap);
          },
          async getQuery(query) {
            const snap = await tx.get((query as AdminQuery).native);
            return { docs: snap.docs.map(wrapAdminDoc) };
          },
          set(ref, data) {
            tx.set((ref as AdminDocRef).native, data);
          },
          delete(ref) {
            tx.delete((ref as AdminDocRef).native);
          },
        })
      );
    },
  };
}

async function pingFirestore(db: Firestore, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const pending = db.collection(REPORTS_COLLECTION).limit(1).get().then(() => undefined);
  pending.catch(() => undefined);
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out connecting to Firestore")), timeoutMs);
  });
  try {
    await Promise.race([pending, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function connectFirestoreDatabase(env: NodeJS.ProcessEnv = process.env, timeoutMs = 4000): Promise<ReportsDatabase> {
  const settings = resolveFirestoreSettings(env);
  if (settings.mode === "unconfigured") {
    throw new Error(settings.reason);
  }
  if (settings.mode === "adc" && settings.credentialsPath && !existsSync(settings.credentialsPath)) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS file was not found.");
  }
  if (getApps().length === 0) {
    if (settings.mode === "service-account") {
      initializeApp({
        credential: cert({
          projectId: settings.projectId,
          clientEmail: settings.clientEmail,
          privateKey: settings.privateKey,
        }),
        projectId: settings.projectId,
      });
    } else {
      initializeApp({
        credential: applicationDefault(),
        ...(settings.projectId ? { projectId: settings.projectId } : {}),
      });
    }
  }
  const db = getFirestore();
  await pingFirestore(db, timeoutMs);
  return databaseFromAdmin(db);
}

function readEntries(data: Record<string, unknown> | undefined, deviceHash: string, timestamps: ReportTimestamps): LimitHistory[] {
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  const history: LimitHistory[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const facilityId = (entry as { facilityId?: unknown }).facilityId;
    const created = timestamps.read((entry as { createdAt?: unknown }).createdAt);
    const reportId = (entry as { reportId?: unknown }).reportId;
    if (typeof facilityId !== "string" || !created) continue;
    history.push({
      facilityId,
      deviceHash,
      createdAt: created.toISOString(),
      ...(typeof reportId === "string" && reportId ? { reportId } : {}),
    });
  }
  return history;
}

/**
 * Firestore store. The browser never uses this class: server routes call it after validation.
 * Rate limits read and write reportLimits/{deviceHash} inside a transaction so other instances see the same count.
 */
export class FirestoreReportStore implements ReportStore {
  constructor(
    private readonly db: ReportsDatabase,
    private readonly timestamps: ReportTimestamps = adminReportTimestamps
  ) {}

  private toReports(docs: ReportDocSnap[]): StoredReport[] {
    const reports: StoredReport[] = [];
    for (const doc of docs) {
      const data = doc.data();
      if (!data) continue;
      const created = this.timestamps.read(data.createdAt);
      const status = data.status;
      if (!created || typeof data.facilityId !== "string" || typeof data.deviceHash !== "string") continue;
      if (typeof status !== "string" || !REPORT_STATUSES.includes(status as ReportStatus)) continue;
      reports.push({
        id: doc.id,
        facilityId: data.facilityId,
        status: status as ReportStatus,
        createdAt: created.toISOString(),
        deviceHash: data.deviceHash,
      });
    }
    return reports;
  }

  async listSince(sinceIso: string): Promise<StoredReport[]> {
    const snap = await this.db
      .collection(REPORTS_COLLECTION)
      .where("createdAt", ">=", this.timestamps.at(new Date(sinceIso)))
      .get();
    return this.toReports(snap.docs);
  }

  async listByFacility(facilityId: string, sinceIso: string): Promise<StoredReport[]> {
    const snap = await this.db
      .collection(REPORTS_COLLECTION)
      .where("facilityId", "==", facilityId)
      .where("createdAt", ">=", this.timestamps.at(new Date(sinceIso)))
      .get();
    return this.toReports(snap.docs);
  }

  async commitReport(report: StoredReport, now = new Date()): Promise<ReportCommitResult> {
    const hourAgo = new Date(now.getTime() - HOUR_MS);
    const expireAt = this.timestamps.at(new Date(now.getTime() + REPORT_TTL_MS));
    return this.db.runTransaction(async (tx) => {
      const limitRef = this.db.collection(REPORT_LIMITS_COLLECTION).doc(report.deviceHash);
      const limitSnap = await tx.getDoc(limitRef);
      let history: LimitHistory[];
      if (limitSnap.exists) {
        history = readEntries(limitSnap.data(), report.deviceHash, this.timestamps);
      } else {
        const existing = await tx.getQuery(
          this.db
            .collection(REPORTS_COLLECTION)
            .where("deviceHash", "==", report.deviceHash)
            .where("createdAt", ">=", this.timestamps.at(hourAgo))
        );
        history = this.toReports(existing.docs).map((item) => ({
          facilityId: item.facilityId,
          deviceHash: item.deviceHash,
          createdAt: item.createdAt,
          reportId: item.id,
        }));
      }
      const decision = checkReportRateLimit(history, report, now);
      if (!decision.ok) {
        return {
          ok: false,
          error: decision.error ?? "hourly_cap",
          message: decision.message ?? "Too many driver reports.",
        };
      }
      const entries = [
        ...history
          .filter((item) => reportAgeMinutes(item.createdAt, now) <= 60)
          .map((item) => ({
            facilityId: item.facilityId,
            createdAt: this.timestamps.at(new Date(item.createdAt)),
            reportId: item.reportId ?? "",
          })),
        { facilityId: report.facilityId, createdAt: this.timestamps.at(now), reportId: report.id },
      ];
      tx.set(limitRef, { deviceHash: report.deviceHash, entries, expireAt });
      tx.set(this.db.collection(REPORTS_COLLECTION).doc(report.id), {
        facilityId: report.facilityId,
        status: report.status,
        createdAt: this.timestamps.serverCreatedAt(),
        deviceHash: report.deviceHash,
        expireAt,
      });
      return { ok: true, report };
    });
  }

  async removeIfOwned(id: string, deviceHash: string, nowMs: number, undoWindowMs: number): Promise<boolean> {
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.collection(REPORTS_COLLECTION).doc(id);
      const snap = await tx.getDoc(ref);
      const data = snap.data();
      if (!snap.exists || !data || data.deviceHash !== deviceHash) return false;
      const created = this.timestamps.read(data.createdAt);
      if (!created || nowMs - created.getTime() > undoWindowMs) return false;
      tx.delete(ref);
      return true;
    });
  }
}
