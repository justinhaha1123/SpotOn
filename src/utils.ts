// Geometric and distance helper utilities
import { VehicleProfile, ParkingFacility, VisitedParkingHistory } from "./types";

// Determine numeric charging speed in kW and capability label
export function getEvChargingSpeed(facility: {
  evChargingSpeedKw?: number | null;
  evChargingSpeedLabel?: string | null;
  name?: string;
  accessInstructions?: string | null;
  categoryLabel?: string;
  evChargingBays?: number | null;
}): { kw: number; label: string; isFast: boolean; published: boolean } {
  if (facility.evChargingSpeedKw && facility.evChargingSpeedKw > 0) {
    const kw = facility.evChargingSpeedKw;
    return {
      kw,
      label: facility.evChargingSpeedLabel || `${kw}kW`,
      isFast: kw >= 22,
      published: true,
    };
  }

  const text = `${facility.name || ""} ${facility.accessInstructions || ""} ${facility.categoryLabel || ""}`.toLowerCase();
  const match = text.match(/(\d+)\s*kw/);
  if (match) {
    const kw = Number(match[1]);
    if (Number.isFinite(kw) && kw > 0) {
      return { kw, label: `${kw}kW`, isFast: kw >= 22, published: true };
    }
  }

  return { kw: 0, label: "Speed not published", isFast: false, published: false };
}

// Compare two facilities for Fast Charging Availability:
// Sorts primarily by:
// 1. Total EV bay count (higher is better)
// 2. Charging speed capability in kW (faster is better)
// 3. Available vacant spaces / proximity as tie-breaker
export function compareFastChargingAvailability(a: ParkingFacility, b: ParkingFacility): number {
  const speedA = a.evChargingSpeedKw ?? getEvChargingSpeed(a).kw;
  const speedB = b.evChargingSpeedKw ?? getEvChargingSpeed(b).kw;
  const baysA = a.evChargingBays || 0;
  const baysB = b.evChargingBays || 0;

  // Composite charging score giving high weight to total EV bays and charging speed capability
  // score = (bays * 100) + speed
  const scoreA = (baysA * 100) + speedA;
  const scoreB = (baysB * 100) + speedB;

  if (scoreB !== scoreA) {
    return scoreB - scoreA;
  }

  // If composite score equal, sort by bays then speed
  if (baysB !== baysA) {
    return baysB - baysA;
  }
  if (speedB !== speedA) {
    return speedB - speedA;
  }

  // Then by currently available spaces (nulls sort last)
  if (b.availableSpaces !== a.availableSpaces) {
    if (a.availableSpaces == null) return 1;
    if (b.availableSpaces == null) return -1;
    return b.availableSpaces - a.availableSpaces;
  }

  // Proximity as final tie-breaker
  return (a.distanceFromUserKm ?? 999) - (b.distanceFromUserKm ?? 999);
}

export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate bearing / heading in degrees between two coordinates (0-360)
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

// Parse height restriction string into numeric meters (e.g., "1.95m" -> 1.95)
export function parseHeightMeters(clearanceStr?: string): number | null {
  if (!clearanceStr) return null;
  const lower = clearanceStr.toLowerCase();
  if (lower.includes("no restriction") || lower.includes("open air") || lower.includes("unlimited")) {
    return null;
  }
  const match = clearanceStr.match(/([0-9]+(\.[0-9]+)?)\s*m/i);
  if (match && match[1]) {
    return parseFloat(match[1]);
  }
  return null;
}

// Check if vehicle can safely enter the facility without roof scrape
export function checkHeightSafety(
  clearance?: number | string | null,
  vehicleHeightM?: number
): { safe: boolean; clearanceM: number | null; warning?: string } {
  if (!vehicleHeightM) return { safe: true, clearanceM: null };
  const maxClearance = typeof clearance === "number" ? clearance : parseHeightMeters(clearance ?? undefined);
  if (maxClearance === null) {
    // Open air / no restriction
    return { safe: true, clearanceM: null };
  }
  if (vehicleHeightM > maxClearance) {
    return {
      safe: false,
      clearanceM: maxClearance,
      warning: `Vehicle height (${vehicleHeightM.toFixed(2)}m) exceeds barrier clearance (${maxClearance.toFixed(2)}m)!`,
    };
  }
  return {
    safe: true,
    clearanceM: maxClearance,
  };
}

/**
 * Format a numeric GBP rate (e.g. 5.2 -> "£5.20", null/undefined/non-number -> null)
 */
export function formatGbp(n: any): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return `£${n.toFixed(2)}`;
}

/** Compare prices without inventing a missing hourly rate. Daily tariffs are scaled by 8 hours for sorting only. */
export function comparableHourly(facility: { hourlyRate?: number | null; dailyRate?: number | null }): number | null {
  if (typeof facility.hourlyRate === "number" && Number.isFinite(facility.hourlyRate)) return facility.hourlyRate;
  if (typeof facility.dailyRate === "number" && Number.isFinite(facility.dailyRate)) return facility.dailyRate / 8;
  return null;
}

export function calculateReservationCost(
  hourlyRate: number | null,
  dailyRate: number | null,
  hours: number
): { total: number | null; formatted: string | null; hourlyNum: number | null; dailyNum: number | null } {
  const hourlyNum = (hourlyRate !== null && !isNaN(hourlyRate)) ? hourlyRate : null;
  const dailyNum = (dailyRate !== null && !isNaN(dailyRate)) ? dailyRate : (hourlyNum !== null ? hourlyNum * 8 : null);
  if (hourlyNum === null && dailyNum === null) {
    return { total: null, formatted: null, hourlyNum: null, dailyNum: null };
  }
  if (hourlyNum === null) {
    return {
      total: dailyNum,
      formatted: dailyNum != null ? `£${dailyNum.toFixed(2)}` : null,
      hourlyNum,
      dailyNum,
    };
  }

  const cap = dailyNum ?? hours * hourlyNum;
  const rawTotal = Math.min(hours * hourlyNum, cap);
  const total = Number(rawTotal.toFixed(2));
  return {
    total,
    formatted: `£${total.toFixed(2)}`,
    hourlyNum,
    dailyNum,
  };
}

// Vehicle Profile LocalStorage Persistence
const VEHICLE_STORAGE_KEY = "london_live_parking_vehicle_profile";

export const DEFAULT_VEHICLE_PROFILE: VehicleProfile = {
  vehicleType: "petrol_diesel",
  registrationPlate: "",
  heightMeters: 0,
  isBlueBadgeHolder: false,
};

export function loadStoredVehicleProfile(): VehicleProfile {
  if (typeof window === "undefined") return DEFAULT_VEHICLE_PROFILE;
  try {
    const raw = localStorage.getItem(VEHICLE_STORAGE_KEY);
    if (!raw) return DEFAULT_VEHICLE_PROFILE;
    const parsed = JSON.parse(raw);
    return {
      vehicleType: parsed.vehicleType || "ev",
      registrationPlate: typeof parsed.registrationPlate === "string" ? parsed.registrationPlate : "",
      heightMeters: typeof parsed.heightMeters === "number" ? parsed.heightMeters : 0,
      isBlueBadgeHolder: Boolean(parsed.isBlueBadgeHolder),
    };
  } catch {
    return DEFAULT_VEHICLE_PROFILE;
  }
}

export function saveStoredVehicleProfile(profile: VehicleProfile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VEHICLE_STORAGE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.error("Failed to save vehicle profile:", err);
  }
}

// Common London & Metropolitan area spelling variants & typo normalizer
export function normalizeSearchTerm(term: string): string {
  if (!term) return "";
  return term
    .toLowerCase()
    .trim()
    .replace(/\b(saint|st\.?)\s*albans?\b/g, "st albans")
    .replace(/\bstalbans\b/g, "st albans")
    .replace(/\bmaiden\s*head\b/g, "maidenhead")
    .replace(/\bmaidenhed\b/g, "maidenhead")
    .replace(/\bsutt?on\b/g, "sutton")
    .replace(/\bromfurd\b/g, "romford")
    .replace(/\bwest\s*hamstead\b/g, "west hampstead")
    .replace(/\bhamstead\b/g, "hampstead")
    .replace(/\bhampsted\b/g, "hampstead")
    .replace(/\bkings\s*cross\b/g, "king's cross")
    .replace(/\bst\s*johns\s*wood\b/g, "st john's wood")
    .replace(/\bst\s*pancreas\b/g, "st pancras")
    .replace(/\bshepherds?\s*bush\b/g, "shepherd's bush")
    .replace(/\bmarlybone\b/g, "marylebone")
    .replace(/\bmarylebon\b/g, "marylebone")
    .replace(/\bconvent\s*garden\b/g, "covent garden")
    .replace(/\bcanary\s*warf\b/g, "canary wharf")
    .replace(/\bshorditch\b/g, "shoreditch");
}

// Full search matcher with typo tolerance, token breakdown, and cardinal region matching
export function isSearchMatch(fac: any, rawQuery: string): boolean {
  if (!rawQuery || !rawQuery.trim()) return true;
  const q = rawQuery.toLowerCase().trim();
  const normQ = normalizeSearchTerm(q);

  // Searchable text corpus
  const corpus = `
    ${fac.name}
    ${fac.address}
    ${fac.borough}
    ${fac.postcode}
    ${fac.operator}
    ${fac.categoryLabel || ""}
    ${fac.parkingCategory || ""}
    ${fac.accessInstructions || ""}
    ${fac.spaceDimensions || ""}
    ${fac.zoneLabel || ""}
    ${fac.evChargingSpeedLabel || ""}
    ${fac.evChargingSpeedKw ? `${fac.evChargingSpeedKw}kw` : ""}
    ${fac.evChargingBays ? `${fac.evChargingBays} ev bays charging` : ""}
  `.toLowerCase();

  // Direct substring match with raw or normalized search query
  if (corpus.includes(q) || corpus.includes(normQ)) return true;

  // Cardinal direction region searches:
  // North -> St Albans, Watford, Barnet, Brent Cross, Highgate
  if (normQ === "north" || normQ === "north london" || normQ === "north commuter") {
    if (
      corpus.includes("st albans") ||
      corpus.includes("watford") ||
      corpus.includes("barnet") ||
      corpus.includes("al1") ||
      corpus.includes("al3") ||
      corpus.includes("wd17") ||
      corpus.includes("camden")
    ) {
      return true;
    }
  }

  // West -> Maidenhead, Slough, Windsor, Heathrow, Ealing, Uxbridge
  if (normQ === "west" || normQ === "west london" || normQ === "west commuter") {
    if (
      corpus.includes("maidenhead") ||
      corpus.includes("slough") ||
      corpus.includes("sl6") ||
      corpus.includes("sl1") ||
      corpus.includes("windsor") ||
      corpus.includes("heathrow") ||
      corpus.includes("uxbridge") ||
      corpus.includes("ealing")
    ) {
      return true;
    }
  }

  // South -> Sutton, Cheam, Carshalton, Croydon, Kingston, Wimbledon, Richmond
  if (normQ === "south" || normQ === "south london" || normQ === "south commuter") {
    if (
      corpus.includes("sutton") ||
      corpus.includes("sm1") ||
      corpus.includes("sm2") ||
      corpus.includes("sm3") ||
      corpus.includes("cheam") ||
      corpus.includes("croydon") ||
      corpus.includes("kingston") ||
      corpus.includes("wimbledon")
    ) {
      return true;
    }
  }

  // East -> Romford, Havering, Barking, Ilford, Upminster, Stratford
  if (normQ === "east" || normQ === "east london" || normQ === "east commuter") {
    if (
      corpus.includes("romford") ||
      corpus.includes("rm1") ||
      corpus.includes("rm7") ||
      corpus.includes("havering") ||
      corpus.includes("barking") ||
      corpus.includes("ilford") ||
      corpus.includes("upminster") ||
      corpus.includes("stratford")
    ) {
      return true;
    }
  }

  // Multi-word token matching (all words must appear in corpus)
  const tokens = normQ.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length > 1 && tokens.every((t) => corpus.includes(t))) {
    return true;
  }

  // Disabled / Accessibility search
  const isSpecialDisabledSearch =
    (normQ.includes("disab") || normQ.includes("badge") || normQ.includes("access") || normQ.includes("wheelchair")) &&
    (fac.disabledBays > 0 || fac.parkingCategory === "designated_disabled_bay");
  if (isSpecialDisabledSearch) return true;

  // Zone match
  const matchesZone =
    (normQ.includes("zone 1") && fac.zone === 1) ||
    (normQ.includes("zone 2") && fac.zone === 2) ||
    (normQ.includes("zone 3") && fac.zone === 3) ||
    (normQ.includes("zone 4") && fac.zone === 4) ||
    (normQ.includes("zone 5") && fac.zone === 5) ||
    (normQ.includes("zone 6") && fac.zone === 6);
  if (matchesZone) return true;

  return false;
}

// ----------------------------------------------------
// Recent Parking History Management
// ----------------------------------------------------

export const SAMPLE_RECENT_PARKING_HISTORY: VisitedParkingHistory[] = [];

export function loadStoredParkingHistory(): VisitedParkingHistory[] {
  try {
    const raw = localStorage.getItem("RECENT_PARKING_HISTORY");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 5);
      }
    }
  } catch (e) {
    console.warn("Failed to load stored parking history", e);
  }
  return SAMPLE_RECENT_PARKING_HISTORY;
}

export function saveStoredParkingHistory(history: VisitedParkingHistory[]): void {
  try {
    localStorage.setItem("RECENT_PARKING_HISTORY", JSON.stringify(history.slice(0, 5)));
  } catch (e) {
    console.warn("Failed to save parking history", e);
  }
}

export function formatRelativeTime(isoDateString?: string | null, nowMs = Date.now()): string {
  if (!isoDateString) return "recently";
  const time = new Date(isoDateString).getTime();
  if (isNaN(time)) return "recently";
  const diffSec = Math.floor((nowMs - time) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} mins ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr === 1) return "1 hr ago";
  return `${diffHr} hrs ago`;
}



