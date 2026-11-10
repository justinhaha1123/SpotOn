import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { checkReportRateLimit, reportAgeMinutes, type ReportCommitResult, type ReportStore, type StoredReport } from "./logic.js";

interface DeviceLimit {
  facilityId: string;
  deviceHash: string;
  createdAt: string;
}

function isDeviceLimit(value: unknown): value is DeviceLimit {
  if (!value || typeof value !== "object") return false;
  const entry = value as DeviceLimit;
  return typeof entry.facilityId === "string" && typeof entry.deviceHash === "string" && typeof entry.createdAt === "string";
}

export function hashDeviceId(deviceId: string, salt = process.env.REPORT_HASH_SALT || "spoton-driver-reports-v1"): string {
  return createHash("sha256").update(`${salt}:${deviceId}`).digest("hex");
}

export function newReportId(): string {
  return randomUUID();
}

/**
 * JSON file store used when Firestore is not configured, and when REPORT_STORE=file.
 * The file holds facility, status, time and a hashed device id only.
 */
export class JsonFileReportStore implements ReportStore {
  private queue: Promise<void> = Promise.resolve();
  private loaded = false;
  private reports: StoredReport[] = [];
  /** Cooldown history. Undo deletes a report and leaves these entries in place. */
  private limits: DeviceLimit[] = [];

  constructor(private readonly filePath: string) {}

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as { reports?: StoredReport[]; limits?: DeviceLimit[] };
      this.reports = Array.isArray(parsed.reports) ? parsed.reports : [];
      this.limits = Array.isArray(parsed.limits)
        ? parsed.limits.filter(isDeviceLimit)
        : this.reports.map((report) => ({
            facilityId: report.facilityId,
            deviceHash: report.deviceHash,
            createdAt: report.createdAt,
          }));
    } catch {
      this.reports = [];
      this.limits = [];
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const snapshot = JSON.stringify({ reports: this.reports, limits: this.limits }, null, 2);
    await writeFile(this.filePath, snapshot, "utf8");
  }

  private pruneLimits(now: Date): void {
    this.limits = this.limits.filter((entry) => reportAgeMinutes(entry.createdAt, now) <= 60);
  }

  private since(sinceIso: string, facilityId?: string): StoredReport[] {
    const since = new Date(sinceIso).getTime();
    return this.reports.filter((report) => {
      if (facilityId && report.facilityId !== facilityId) return false;
      return new Date(report.createdAt).getTime() >= since;
    });
  }

  async listSince(sinceIso: string): Promise<StoredReport[]> {
    return this.enqueue(async () => {
      await this.ensureLoaded();
      return this.since(sinceIso);
    });
  }

  async listByFacility(facilityId: string, sinceIso: string): Promise<StoredReport[]> {
    return this.enqueue(async () => {
      await this.ensureLoaded();
      return this.since(sinceIso, facilityId);
    });
  }

  async commitReport(report: StoredReport, now = new Date()): Promise<ReportCommitResult> {
    return this.enqueue(async () => {
      await this.ensureLoaded();
      this.pruneLimits(now);
      const decision = checkReportRateLimit(this.limits, report, now);
      if (!decision.ok) {
        return {
          ok: false,
          error: decision.error ?? "hourly_cap",
          message: decision.message ?? "Too many driver reports.",
        };
      }
      this.reports.push(report);
      this.limits.push({
        facilityId: report.facilityId,
        deviceHash: report.deviceHash,
        createdAt: report.createdAt,
      });
      await this.persist();
      return { ok: true, report };
    });
  }

  async removeIfOwned(id: string, deviceHash: string, nowMs: number, undoWindowMs: number): Promise<boolean> {
    return this.enqueue(async () => {
      await this.ensureLoaded();
      const index = this.reports.findIndex((report) => report.id === id && report.deviceHash === deviceHash);
      if (index < 0) return false;
      const created = new Date(this.reports[index].createdAt).getTime();
      if (!Number.isFinite(created) || nowMs - created > undoWindowMs) return false;
      this.reports.splice(index, 1);
      await this.persist();
      return true;
    });
  }
}
