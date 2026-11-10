import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { ReportStore, StoredReport } from "./logic.js";

export function hashDeviceId(deviceId: string, salt = process.env.REPORT_HASH_SALT || "spoton-driver-reports-v1"): string {
  return createHash("sha256").update(`${salt}:${deviceId}`).digest("hex");
}

export function newReportId(): string {
  return randomUUID();
}

/**
 * JSON file store. The file holds facility, status, time and a hashed device id only.
 * Swap this class for a hosted database later; callers use ReportStore.
 */
export class JsonFileReportStore implements ReportStore {
  private chain: Promise<void> = Promise.resolve();
  private loaded = false;
  private reports: StoredReport[] = [];

  constructor(private readonly filePath: string) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as { reports?: StoredReport[] };
      this.reports = Array.isArray(parsed.reports) ? parsed.reports : [];
    } catch {
      this.reports = [];
    }
    this.loaded = true;
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify({ reports: this.reports }, null, 2);
    this.chain = this.chain.then(() => writeFile(this.filePath, snapshot, "utf8"));
    return this.chain;
  }

  async listSince(sinceIso: string): Promise<StoredReport[]> {
    await this.ensureLoaded();
    const since = new Date(sinceIso).getTime();
    return this.reports.filter((report) => new Date(report.createdAt).getTime() >= since);
  }

  async insert(report: StoredReport): Promise<void> {
    await this.ensureLoaded();
    this.reports.push(report);
    await this.persist();
  }

  async removeIfOwned(id: string, deviceHash: string, nowMs: number, undoWindowMs: number): Promise<boolean> {
    await this.ensureLoaded();
    const index = this.reports.findIndex((report) => report.id === id && report.deviceHash === deviceHash);
    if (index < 0) return false;
    const created = new Date(this.reports[index].createdAt).getTime();
    if (!Number.isFinite(created) || nowMs - created > undoWindowMs) return false;
    this.reports.splice(index, 1);
    await this.persist();
    return true;
  }
}
