import { carParkOpenStatus, londonClock } from "./parkingHours.js";

export type ParkHereState = "yes" | "not_now" | "unsure";

export interface ParkHereFacts {
  restrictionType?: string | null;
  times?: string | null;
  maximumStay?: string | null;
  tariff?: string | null;
  zone?: string | null;
  sourceLabel?: string | null;
}

export interface ParkHereVerdict {
  state: ParkHereState;
  headline: "Yes, you can park here now" | "Not right now" | "Not sure (no verified data)";
  maxStay: string | null;
  noReturn: string | null;
  until: string | null;
  nextRestriction: string | null;
  tariff: string | null;
  zone: string | null;
  source: string;
  disclaimer: "Check signs on street";
  suggestedStayMinutes: number | null;
}

const DISCLAIMER = "Check signs on street" as const;
const DAY = "monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|mo|tu|we|th|fr|sa|su";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** England and Wales bank holidays. Used only when the restriction text mentions them. */
const BANK_HOLIDAYS = new Set([
  "2025-01-01", "2025-04-18", "2025-04-21", "2025-05-05", "2025-05-26", "2025-08-25", "2025-12-25", "2025-12-26",
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
]);

interface Window {
  startDay: number;
  endDay: number;
  startMin: number;
  endMin: number;
}

interface LondonStamp {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minutes: number;
}

type HolidayMode = "exclude" | "include" | "unclear" | null;

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  if (!text || /^n\/?a$/i.test(text)) return null;
  return text;
}

function dayIndex(token: string): number | undefined {
  const t = token.toLowerCase();
  if (t.startsWith("su")) return 0;
  if (t.startsWith("mo")) return 1;
  if (t.startsWith("tu")) return 2;
  if (t.startsWith("we")) return 3;
  if (t.startsWith("th")) return 4;
  if (t.startsWith("fr")) return 5;
  if (t.startsWith("sa")) return 6;
  return undefined;
}

function dayInRange(day: number, start: number, end: number): boolean {
  if (start <= end) return day >= start && day <= end;
  return day >= start || day <= end;
}

function londonOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

function stampFromDate(now: Date): LondonStamp {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(read("hour"));
  const minute = Number(read("minute"));
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    weekday: dayIndex(read("weekday")) ?? 0,
    minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  };
}

function isoDate(stamp: Pick<LondonStamp, "year" | "month" | "day">): string {
  return `${stamp.year}-${String(stamp.month).padStart(2, "0")}-${String(stamp.day).padStart(2, "0")}`;
}

function addDays(stamp: LondonStamp, days: number): LondonStamp {
  const utc = new Date(Date.UTC(stamp.year, stamp.month - 1, stamp.day + days, 12));
  const weekday = londonClock(utc).day;
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
    weekday,
    minutes: 0,
  };
}

function wallToUtc(stamp: Pick<LondonStamp, "year" | "month" | "day">, minutes: number): Date {
  const extra = Math.floor(minutes / 1440);
  const minuteOfDay = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const guess = new Date(Date.UTC(stamp.year, stamp.month - 1, stamp.day + extra, hour, minute));
  const offset = londonOffsetMinutes(guess);
  const adjusted = new Date(guess.getTime() - offset * 60000);
  const again = londonOffsetMinutes(adjusted);
  return again === offset ? adjusted : new Date(guess.getTime() - again * 60000);
}

function formatWhen(target: Date, now: Date): string {
  const then = stampFromDate(target);
  const today = stampFromDate(now);
  const hm = `${String(Math.floor(then.minutes / 60)).padStart(2, "0")}:${String(then.minutes % 60).padStart(2, "0")}`;
  if (then.year === today.year && then.month === today.month && then.day === today.day) return hm;
  return `${WEEKDAYS[then.weekday]} ${hm}`;
}

function holidayMode(text: string): HolidayMode {
  if (!/bank holiday|public holiday/.test(text)) return null;
  if (/except|excl|excluding|not on|other than/.test(text)) return "exclude";
  if (/including|incl\b|and on bank|also bank/.test(text)) return "include";
  return "unclear";
}

function clockToken(hour: string, minute: string | undefined, ampm: string | undefined): number | null {
  let h = Number(hour);
  const m = minute ? Number(minute) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(m) || m > 59 || h > 24) return null;
  if (ampm?.toLowerCase() === "pm" && h < 12) h += 12;
  if (ampm?.toLowerCase() === "am" && h === 12) h = 0;
  if (h === 24 && m === 0) return 24 * 60;
  if (h > 23) return null;
  return h * 60 + m;
}

function parseTimes(raw: string | null | undefined): { kind: "anytime" | "windows" | "unknown"; windows: Window[]; holiday: HolidayMode } {
  const original = clean(raw);
  if (!original) return { kind: "unknown", windows: [], holiday: null };
  const text = original.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
  const holiday = holidayMode(text);
  if (/at any time|at all times|24 hour|24\/7/.test(text)) {
    return { kind: "anytime", windows: [], holiday };
  }
  const clauses = text.split(/,|;/).map((part) => part.trim()).filter(Boolean);
  const windows: Window[] = [];
  for (const clause of clauses) {
    if (/bank holiday|public holiday/.test(clause) && !/\d/.test(clause)) continue;
    const days = clause.match(new RegExp(`^(${DAY})(?:\\s*(?:-|to)\\s*(${DAY}))?`));
    const hours = clause.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|to)+\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/);
    if (!days || !hours) return { kind: "unknown", windows: [], holiday };
    const startDay = dayIndex(days[1]);
    const endDay = days[2] ? dayIndex(days[2]) : startDay;
    const startMin = clockToken(hours[1], hours[2], hours[3]);
    const endMin = clockToken(hours[4], hours[5], hours[6]);
    if (startDay == null || endDay == null || startMin == null || endMin == null) {
      return { kind: "unknown", windows: [], holiday };
    }
    windows.push({ startDay, endDay, startMin, endMin });
  }
  if (windows.length === 0) return { kind: "unknown", windows: [], holiday };
  return { kind: "windows", windows, holiday };
}

function dayMatches(weekday: number, iso: string, window: Window, holiday: HolidayMode): boolean {
  const isHoliday = BANK_HOLIDAYS.has(iso);
  if (isHoliday && holiday === "exclude") return false;
  if (isHoliday && holiday === "include") return true;
  return dayInRange(weekday, window.startDay, window.endDay);
}

function activeWindow(stamp: LondonStamp, windows: Window[], holiday: HolidayMode): Window | null {
  const today = isoDate(stamp);
  const yesterday = addDays(stamp, -1);
  for (const window of windows) {
    const overnight = window.endMin < window.startMin;
    if (!overnight) {
      if (dayMatches(stamp.weekday, today, window, holiday) && stamp.minutes >= window.startMin && stamp.minutes < (window.endMin === 0 ? 1440 : window.endMin)) {
        return window;
      }
      continue;
    }
    if (stamp.minutes >= window.startMin && dayMatches(stamp.weekday, today, window, holiday)) return window;
    if (stamp.minutes < window.endMin && dayMatches(yesterday.weekday, isoDate(yesterday), window, holiday)) return window;
  }
  return null;
}

function endOfWindow(stamp: LondonStamp, window: Window): Date {
  if (window.endMin < window.startMin) {
    if (stamp.minutes >= window.startMin) return wallToUtc(addDays(stamp, 1), window.endMin);
    return wallToUtc(stamp, window.endMin);
  }
  if (window.endMin === 0) return wallToUtc(addDays(stamp, 1), 0);
  return wallToUtc(stamp, window.endMin);
}

function nextWindowStart(now: Date, stamp: LondonStamp, windows: Window[], holiday: HolidayMode): Date | null {
  let best: Date | null = null;
  for (let offset = 0; offset < 8; offset += 1) {
    const day = addDays(stamp, offset);
    for (const window of windows) {
      if (!dayMatches(day.weekday, isoDate(day), window, holiday)) continue;
      const at = wallToUtc(day, window.startMin);
      if (at.getTime() <= now.getTime()) continue;
      if (!best || at.getTime() < best.getTime()) best = at;
    }
  }
  return best;
}

type RuleKind = "paid" | "permit" | "badge" | "banned" | "unknown";

function ruleKind(restriction: string | null, tariff: string | null): RuleKind {
  const text = (restriction || "").toLowerCase();
  if (/disabled|blue badge/.test(text)) return "badge";
  if (/permit|resident/.test(text)) return "permit";
  if (/loading|taxi|motorcycle|doctor|ambulance|diplomatic|suspend|no parking|keep clear|red route/.test(text)) return "banned";
  if (/paid|\bpay\b|meter|cashless/.test(text)) return "paid";
  if (!text && tariff) return "paid";
  if (!text) return "unknown";
  return "unknown";
}

function stayParts(maximumStay: string | null): { maxStay: string | null; noReturn: string | null; maxMinutes: number | null } {
  if (!maximumStay) return { maxStay: null, noReturn: null, maxMinutes: null };
  const noReturnMatch = maximumStay.match(/no return(?:\s+within)?[^,.;]*/i);
  let maxStay: string | null = null;
  let maxMinutes: number | null = null;
  for (const part of maximumStay.split(/,|;/).map((item) => item.trim()).filter(Boolean)) {
    if (/no return/i.test(part)) continue;
    const duration = part.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)/i);
    if (!duration || maxMinutes != null) continue;
    const amount = Number(duration[1]);
    maxMinutes = duration[2].toLowerCase().startsWith("h") ? Math.round(amount * 60) : Math.round(amount);
    maxStay = part;
  }
  return { maxStay, noReturn: noReturnMatch ? noReturnMatch[0] : null, maxMinutes };
}

function blank(facts: ParkHereFacts, stay: ReturnType<typeof stayParts>, extra: Partial<ParkHereVerdict> = {}): ParkHereVerdict {
  return {
    state: "unsure",
    headline: "Not sure (no verified data)",
    maxStay: stay.maxStay,
    noReturn: stay.noReturn,
    until: null,
    nextRestriction: null,
    tariff: clean(facts.tariff),
    zone: clean(facts.zone),
    source: clean(facts.sourceLabel) ?? "Restriction data",
    disclaimer: DISCLAIMER,
    suggestedStayMinutes: null,
    ...extra,
  };
}

function minutesUntil(now: Date, target: Date): number {
  return Math.max(1, Math.round((target.getTime() - now.getTime()) / 60000));
}

/** A rules verdict for one kerb, bay, or street. Missing or unreadable rules stay "Not sure". */
export function parkHereVerdict(facts: ParkHereFacts, now = new Date()): ParkHereVerdict {
  const stay = stayParts(clean(facts.maximumStay));
  const parsed = parseTimes(facts.times);
  const rule = ruleKind(clean(facts.restrictionType) ?? null, clean(facts.tariff));
  const stamp = stampFromDate(now);
  if (parsed.kind === "unknown" || rule === "unknown") return blank(facts, stay);
  if (parsed.holiday === "unclear" && BANK_HOLIDAYS.has(isoDate(stamp))) return blank(facts, stay);

  const current = parsed.kind === "anytime" ? "anytime" as const : activeWindow(stamp, parsed.windows, parsed.holiday);
  const inForce = current != null;
  const permissionEnds = current && current !== "anytime" ? endOfWindow(stamp, current) : null;
  const nextStart = !inForce && parsed.kind === "windows" ? nextWindowStart(now, stamp, parsed.windows, parsed.holiday) : null;

  const cap = (target: Date | null): number | null => {
    const fromClock = target ? minutesUntil(now, target) : null;
    if (stay.maxMinutes != null && fromClock != null) return Math.min(stay.maxMinutes, fromClock);
    return stay.maxMinutes ?? fromClock;
  };

  if (rule === "paid") {
    if (inForce) {
      return blank(facts, stay, {
        state: "yes",
        headline: "Yes, you can park here now",
        until: permissionEnds ? `Until ${formatWhen(permissionEnds, now)}` : null,
        suggestedStayMinutes: cap(permissionEnds),
      });
    }
    return blank(facts, stay, {
      state: "yes",
      headline: "Yes, you can park here now",
      until: nextStart ? `Until ${formatWhen(nextStart, now)}` : null,
      nextRestriction: nextStart ? `Next restriction ${formatWhen(nextStart, now)}` : null,
      suggestedStayMinutes: cap(nextStart),
    });
  }

  if (inForce) {
    return blank(facts, stay, {
      state: "not_now",
      headline: "Not right now",
      until: permissionEnds ? `Restriction until ${formatWhen(permissionEnds, now)}` : null,
      nextRestriction: permissionEnds ? `In force until ${formatWhen(permissionEnds, now)}` : "In force with no published end time",
    });
  }

  return blank(facts, stay, {
    state: "yes",
    headline: "Yes, you can park here now",
    until: nextStart ? `Until ${formatWhen(nextStart, now)}` : null,
    nextRestriction: nextStart ? `Next restriction ${formatWhen(nextStart, now)}` : null,
    suggestedStayMinutes: cap(nextStart),
  });
}

/** Minutes until a car park's published close, when the hours can be read and it is open. */
export function carParkStayMinutes(openHours: string | null | undefined, now = new Date()): number | null {
  const status = carParkOpenStatus(openHours, now);
  if (status.status !== "open") return null;
  const text = (openHours || "").toLowerCase();
  if (text.includes("24/7") || text.includes("24 hr") || text.includes("24hr") || text.includes("24 hour")) return null;
  const match = text.match(/(\d{1,2}):(\d{2})\s*(?:-|–|to)+\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const end = Number(match[3]) * 60 + Number(match[4]);
  const start = Number(match[1]) * 60 + Number(match[2]);
  const stamp = stampFromDate(now);
  const target = end > start || stamp.minutes >= start ? wallToUtc(end >= start ? stamp : addDays(stamp, 1), end) : wallToUtc(stamp, end);
  if (end <= start && stamp.minutes < end) return minutesUntil(now, wallToUtc(stamp, end));
  if (end > start) return minutesUntil(now, wallToUtc(stamp, end));
  return minutesUntil(now, target);
}

export function factsFromBay(bay: {
  restrictionType: string | null;
  timesOfOperation: string | null;
  maximumStay: string | null;
  tariff: string | null;
  cpz: string | null;
  sourceLabel: string;
}): ParkHereFacts {
  return {
    restrictionType: bay.restrictionType,
    times: bay.timesOfOperation,
    maximumStay: bay.maximumStay,
    tariff: bay.tariff,
    zone: bay.cpz,
    sourceLabel: bay.sourceLabel,
  };
}
