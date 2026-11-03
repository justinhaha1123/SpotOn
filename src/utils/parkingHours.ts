import type { CanParkNow } from "../types";

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

export interface LondonClock {
  day: number;
  minutes: number;
}

/** Parking rules in this app are evaluated on a London clock, including BST. */
export function londonClock(now = new Date()): LondonClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const day = dayIndex(read("weekday")) ?? 0;
  const hour = Number(read("hour"));
  const minute = Number(read("minute"));
  return {
    day,
    minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  };
}

function dayInRange(day: number, start: number, end: number): boolean {
  if (start <= end) return day >= start && day <= end;
  return day >= start || day <= end;
}

function minutesInside(current: number, start: number, end: number): boolean {
  let close = end;
  if (close === 0) close = 24 * 60;
  if (close > start) return current >= start && current < close;
  return current >= start || current < close;
}

/** "in force" means the published controlled-hours window covers the current London time. */
export function controlledHoursStatus(
  times: string | null | undefined,
  now = new Date()
): "in_force" | "not_in_force" | "unknown" {
  if (!times) return "unknown";
  const text = times.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text || text === "n/a" || text === "na") return "unknown";
  if (text.includes("at any time") || text.includes("at all times") || text.includes("24 hour") || text.includes("24/7")) {
    return "in_force";
  }

  const clock = londonClock(now);
  const clauses = text.split(",").map((part) => part.trim()).filter(Boolean);
  let parsed = false;
  let inForce = false;

  const dayToken = "monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|mo|tu|we|th|fr|sa|su";
  for (const clause of clauses) {
    const days = clause.match(new RegExp(`^(${dayToken})(?:\\s*-\\s*(${dayToken}))?`));
    const hours = clause.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!days || !hours) continue;
    const startDay = dayIndex(days[1]);
    const endDay = days[2] ? dayIndex(days[2]) : startDay;
    if (startDay == null || endDay == null) continue;
    parsed = true;
    if (!dayInRange(clock.day, startDay, endDay)) continue;
    const startMin = Number(hours[1]) * 60 + Number(hours[2]);
    const endMin = Number(hours[3]) * 60 + Number(hours[4]);
    if (minutesInside(clock.minutes, startMin, endMin)) inForce = true;
  }

  if (!parsed) return "unknown";
  return inForce ? "in_force" : "not_in_force";
}

export function carParkOpenStatus(
  openHours: string | null | undefined,
  now = new Date()
): { status: "open" | "closed" | "unknown"; label: string } {
  if (!openHours || !openHours.trim()) {
    return { status: "unknown", label: "Opening hours not published" };
  }
  const raw = openHours.trim();
  const text = raw.toLowerCase();
  if (text.includes("24/7") || text.includes("24 hr") || text.includes("24hr") || text.includes("24 hour")) {
    return { status: "open", label: "Open 24 hours" };
  }

  const match = text.match(/(\d{1,2}):(\d{2})\s*(?:-|–|to)+\s*(\d{1,2}):(\d{2})/);
  if (!match) {
    return { status: "unknown", label: `Hours published as “${raw}” — not checked against the clock` };
  }

  const clock = londonClock(now);
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  const open = minutesInside(clock.minutes, start, end);
  return open
    ? { status: "open", label: `Open now · ${raw}` }
    : { status: "closed", label: `Closed now · ${raw}` };
}

function cleanField(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed)) return null;
  return trimmed;
}

export function describeCamdenBay(
  input: {
    restrictionType: string | null;
    times: string | null;
    maximumStay: string | null;
    tariff: string | null;
  },
  now = new Date()
): { canParkNow: CanParkNow; summary: string } {
  const restriction = cleanField(input.restrictionType) ?? "Restriction not labelled";
  const stay = cleanField(input.maximumStay);
  const tariff = cleanField(input.tariff);
  const force = controlledHoursStatus(input.times, now);
  const extras = [
    stay ? `Max stay ${stay}.` : "",
    tariff ? `Published tariff: ${tariff}.` : "",
  ].filter(Boolean).join(" ");
  const suffix = extras ? ` ${extras}` : "";
  const lower = restriction.toLowerCase();
  const notLive = " This is a parking rule, not a count of free bays.";

  if (force === "unknown") {
    return {
      canParkNow: "unknown",
      summary: `${restriction}. The hours could not be checked against the clock.${suffix}${notLive}`,
    };
  }

  const inForce = force === "in_force";
  if (lower.includes("disabled") || lower.includes("blue badge")) {
    return {
      canParkNow: inForce ? "restricted" : "outside_hours",
      summary: inForce
        ? `Blue Badge bay. Controlled hours are in force — park here only with a valid Blue Badge.${suffix}${notLive}`
        : `Blue Badge bay. The published controlled hours are not in force right now. Check the sign before using it.${suffix}${notLive}`,
    };
  }
  if (lower.includes("permit") || lower.includes("resident")) {
    return {
      canParkNow: inForce ? "restricted" : "outside_hours",
      summary: inForce
        ? `${restriction}. Controlled hours are in force — a valid permit is required.${suffix}${notLive}`
        : `${restriction}. Controlled hours are not in force right now. A suspension or another sign can still apply.${suffix}${notLive}`,
    };
  }
  if (lower.includes("paid") || lower.includes("pay") || lower.includes("meter") || lower.includes("cashless")) {
    return {
      canParkNow: inForce ? "pay" : "outside_hours",
      summary: inForce
        ? `Paid bay. You can park now only if you pay the published charge.${suffix}${notLive}`
        : `Paid bay. Controlled hours are not in force right now, so payment may not be required. Check the sign.${suffix}${notLive}`,
    };
  }

  return {
    canParkNow: inForce ? "restricted" : "outside_hours",
    summary: inForce
      ? `${restriction}. That restriction looks in force now.${suffix}${notLive}`
      : `${restriction}. The published hours look finished. Check the sign.${suffix}${notLive}`,
  };
}

export function describeOsmOnStreet(
  tags: Record<string, string>,
  now = new Date()
): { canParkNow: CanParkNow; summary: string; restrictionType: string | null; times: string | null; tariff: string | null; maximumStay: string | null } {
  const access = (tags.access || "").toLowerCase();
  const fee = (tags.fee || "").toLowerCase();
  const hours = tags.opening_hours || null;
  const maxstay = tags.maxstay || tags["parking:condition:maxstay"] || null;
  const charge = tags.charge || null;
  const restrictionBits = [tags["parking:condition"], tags.restriction].filter(Boolean);
  const restrictionType = restrictionBits.join("; ") || (fee === "yes" ? "fee tagged" : fee === "no" ? "fee tagged no" : null);

  if (access === "private" || access === "customers" || access === "destination" || access === "no") {
    return {
      canParkNow: "restricted",
      summary: `OpenStreetMap access tag is “${tags.access}”. This is not general public parking. Tags are incomplete — check the sign. Not a count of free bays.`,
      restrictionType,
      times: hours,
      tariff: charge,
      maximumStay: maxstay,
    };
  }

  if (hours) {
    const controlled = controlledHoursStatus(hours, now);
    if (controlled === "in_force" && fee === "yes") {
      return {
        canParkNow: "pay",
        summary: `OpenStreetMap marks a fee during hours that include now (${hours}${charge ? `; ${charge}` : ""}). Pay if the sign agrees. Not a count of free bays.`,
        restrictionType,
        times: hours,
        tariff: charge,
        maximumStay: maxstay,
      };
    }
    if (controlled === "not_in_force") {
      return {
        canParkNow: "outside_hours",
        summary: `OpenStreetMap hours (${hours}) are not in force right now. Check the sign before parking. Not a count of free bays.`,
        restrictionType,
        times: hours,
        tariff: charge,
        maximumStay: maxstay,
      };
    }
    const gate = carParkOpenStatus(hours, now);
    if (gate.status === "closed") {
      return {
        canParkNow: "restricted",
        summary: `OpenStreetMap hours say this bay is closed now (${hours}). Check the sign. Not a count of free bays.`,
        restrictionType,
        times: hours,
        tariff: charge,
        maximumStay: maxstay,
      };
    }
    if (gate.status === "open" && fee === "yes") {
      return {
        canParkNow: "pay",
        summary: `OpenStreetMap marks a fee and hours that include now (${hours}${charge ? `; ${charge}` : ""}). Pay if the sign agrees. Not a count of free bays.`,
        restrictionType,
        times: hours,
        tariff: charge,
        maximumStay: maxstay,
      };
    }
    if (gate.status === "open" && fee === "no") {
      return {
        canParkNow: "outside_hours",
        summary: `OpenStreetMap marks this bay free and within its tagged hours (${hours}). Tags are often incomplete — check the sign. Not a count of free bays.`,
        restrictionType,
        times: hours,
        tariff: charge,
        maximumStay: maxstay,
      };
    }
  }

  if (fee === "yes") {
    return {
      canParkNow: "unknown",
      summary: `OpenStreetMap says a fee applies${charge ? ` (${charge})` : ""}, but no hours are tagged, so this app cannot say whether you must pay right now. Check the sign. Not a count of free bays.`,
      restrictionType,
      times: hours,
      tariff: charge,
      maximumStay: maxstay,
    };
  }

  return {
    canParkNow: "unknown",
    summary: "OpenStreetMap marks on-street parking here, without hours or a fee. That is not permission to park and it is not a free-space count. Check the sign.",
    restrictionType,
    times: hours,
    tariff: charge,
    maximumStay: maxstay,
  };
}
