export const REPORT_STATUSES = ["spaces_available", "filling_up", "full", "closed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_LABELS: Record<ReportStatus, string> = {
  spaces_available: "Spaces available",
  filling_up: "Filling up",
  full: "Full",
  closed: "Closed / can't access",
};

export interface StoredReport {
  id: string;
  facilityId: string;
  status: ReportStatus;
  createdAt: string;
  deviceHash: string;
}

export interface DriverReportSummary {
  facilityId: string;
  status: ReportStatus;
  label: string;
  reportCount: number;
  latestAt: string;
  ageMinutes: number;
  faded: boolean;
  conflicting: boolean;
  text: string;
}

export type ReportCommitResult =
  | { ok: true; report: StoredReport }
  | { ok: false; error: "facility_cooldown" | "hourly_cap"; message: string };

export interface ReportStore {
  listSince(sinceIso: string): Promise<StoredReport[]>;
  listByFacility(facilityId: string, sinceIso: string): Promise<StoredReport[]>;
  /** Enforce the device rate limit and store the report. The check and the write happen together. */
  commitReport(report: StoredReport, now?: Date): Promise<ReportCommitResult>;
  removeIfOwned(id: string, deviceHash: string, nowMs: number, undoWindowMs: number): Promise<boolean>;
}

const FADE_MINUTES = 60;
const IGNORE_MINUTES = 120;
const MAJORITY_MINUTES = 30;

export function reportAgeMinutes(createdAt: string, now: Date): number {
  const time = new Date(createdAt).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - time) / 60000;
}

/** Recency weight. Reports older than 2 hours are ignored. After 60 minutes they fade. */
export function reportWeight(ageMinutes: number): number {
  if (!Number.isFinite(ageMinutes) || ageMinutes < 0 || ageMinutes >= IGNORE_MINUTES) return 0;
  const recency = Math.exp(-ageMinutes / 20);
  if (ageMinutes > FADE_MINUTES) return recency * 0.3;
  return recency;
}

export function aggregateFacilityReports(reports: StoredReport[], now = new Date()): DriverReportSummary | null {
  if (reports.length === 0) return null;
  const facilityId = reports[0].facilityId;
  const scored = reports
    .filter((report) => report.facilityId === facilityId)
    .map((report) => {
      const age = reportAgeMinutes(report.createdAt, now);
      return { report, age, weight: reportWeight(age) };
    })
    .filter((item) => item.weight > 0);
  if (scored.length === 0) return null;

  const recent = scored.filter((item) => item.age <= MAJORITY_MINUTES);
  const pool = recent.length > 0 ? recent : scored;
  const totals = new Map<ReportStatus, number>();
  for (const item of pool) {
    totals.set(item.report.status, (totals.get(item.report.status) ?? 0) + item.weight);
  }
  let status: ReportStatus = pool[0].report.status;
  let best = -1;
  for (const [candidate, weight] of totals) {
    if (weight > best) {
      status = candidate;
      best = weight;
    }
  }
  const latest = scored.reduce((a, b) => (a.report.createdAt > b.report.createdAt ? a : b));
  const faded = latest.age > FADE_MINUTES;
  const ageMinutes = Math.max(0, Math.round(latest.age));
  const reportCount = scored.length;
  const label = REPORT_LABELS[status];
  return {
    facilityId,
    status,
    label,
    reportCount,
    latestAt: latest.report.createdAt,
    ageMinutes,
    faded,
    conflicting: new Set(pool.map((item) => item.report.status)).size > 1,
    text: `Drivers reported: ${label} · ${ageMinutes} min ago · ${reportCount} ${reportCount === 1 ? "report" : "reports"}`,
  };
}

export function aggregateByFacility(reports: StoredReport[], now = new Date()): DriverReportSummary[] {
  const groups = new Map<string, StoredReport[]>();
  for (const report of reports) {
    const list = groups.get(report.facilityId) ?? [];
    list.push(report);
    groups.set(report.facilityId, list);
  }
  const summaries: DriverReportSummary[] = [];
  for (const group of groups.values()) {
    const summary = aggregateFacilityReports(group, now);
    if (summary) summaries.push(summary);
  }
  return summaries;
}

export interface RateLimitDecision {
  ok: boolean;
  error?: "facility_cooldown" | "hourly_cap";
  message?: string;
}

export function checkReportRateLimit(
  history: Pick<StoredReport, "facilityId" | "deviceHash" | "createdAt">[],
  next: { facilityId: string; deviceHash: string },
  now = new Date()
): RateLimitDecision {
  const recent = history.filter((report) => report.deviceHash === next.deviceHash && reportAgeMinutes(report.createdAt, now) <= 60);
  if (recent.length >= 20) {
    return {
      ok: false,
      error: "hourly_cap",
      message: "You have sent 20 driver reports in the last hour. Try again later.",
    };
  }
  const samePlace = recent.some(
    (report) => report.facilityId === next.facilityId && reportAgeMinutes(report.createdAt, now) < 10
  );
  if (samePlace) {
    return {
      ok: false,
      error: "facility_cooldown",
      message: "You already reported this place in the last 10 minutes.",
    };
  }
  return { ok: true };
}

const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FACILITY_ID = /^[A-Za-z0-9_.:-]{1,80}$/;

export function validateReportRequest(
  body: { facilityId?: unknown; status?: unknown; deviceId?: unknown },
  knownFacilityIds: ReadonlySet<string>
): { ok: true; facilityId: string; status: ReportStatus; deviceId: string } | { ok: false; error: string } {
  if (typeof body.facilityId !== "string" || !FACILITY_ID.test(body.facilityId)) {
    return { ok: false, error: "A valid facility id is required." };
  }
  if (!knownFacilityIds.has(body.facilityId)) {
    return { ok: false, error: "That place is not in the current parking list." };
  }
  if (typeof body.status !== "string" || !REPORT_STATUSES.includes(body.status as ReportStatus)) {
    return { ok: false, error: "Choose Spaces available, Filling up, Full, or Closed / can't access." };
  }
  if (typeof body.deviceId !== "string" || !DEVICE_ID.test(body.deviceId)) {
    return { ok: false, error: "A device id is required." };
  }
  return { ok: true, facilityId: body.facilityId, status: body.status as ReportStatus, deviceId: body.deviceId };
}
