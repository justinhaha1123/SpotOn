import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { SEED_CAR_PARKS } from "./src/data/seedCarParks.js";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

export interface ServerCarPark {
  id: string;
  name: string;
  operator?: string;
  parkingCategory?: string;
  categoryLabel?: string;
  address?: string;
  postcode?: string;
  borough?: string | null;
  lat: number;
  lng: number;
  totalSpaces?: number | null;
  occupiedSpaces?: number | null;
  availableSpaces?: number | null;
  occupancyRate?: number | null;
  status?: string | null;
  hourlyRate?: number | null;
  dailyRate?: number | null;
  saturdayRate?: number | null;
  sundayRate?: number | null;
  eveningRate?: number | null;
  heightRestriction?: number | null;
  spaceDimensions?: string | null;
  accessInstructions?: string | null;
  securityType?: string | null;
  evChargingBays?: number | null;
  evChargingSpeedKw?: number | null;
  evChargingSpeedLabel?: string | null;
  hasFastCharger?: boolean | null;
  hasEvCharging?: boolean | null;
  disabledBays?: number | null;
  openHours?: string | null;
  cctvMonitoring?: boolean | null;
  zone?: number | null;
  zoneLabel?: string | null;
  hasLiveCam?: boolean;
  source?: "seed" | "tfl";
  sourceUrl: string | null;       // operator page the static fields came from
  verifiedAt: string | null;      // ISO date of human verification
  notes?: string | null;
  stillOperating?: boolean | null;
  congestionChargeZone?: boolean | null;
  paymentMethods?: string | null;
  staffed?: boolean | null;
  confidence?: "live" | "static" | "unverified";
  lastUpdated?: string | null;
  jamCam?: any;
  jamCamDistanceM?: number | null;
  nearestTflJamCam?: any;
  bayCameras?: any[];
  availableBays?: any[];
  distanceFromUserKm?: number;
  distanceFromUserMiles?: number;
  estimatedDriveTimeMin?: number;
}

// In-memory cache for TfL data
let cachedTflCarParks: any[] = [];
let cachedJamCams: any[] = [];
let cachedTflOccupancy: any[] = [];
export let lastOccupancySuccessAt: string | null = null;
export let lastOccupancyError: { status: number; at: string } | null = null;
export let tflWarmupComplete = false;
let occupancyDown = false;
let lastCarParkFetch = 0;
let lastJamCamFetch = 0;
let lastOccupancyFetch = 0;

// Derive hasEvCharging: evChargingBays > 0 -> true; === 0 -> false; null/undefined -> null
export function deriveHasEvCharging(bays: number | null | undefined): boolean | null {
  if (bays === null || bays === undefined) return null;
  if (bays > 0) return true;
  if (bays === 0) return false;
  return null;
}

function parseRate(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Helper to determine EV charging speed in kW and capability label
function getEvSpeedDetails(cp: any): { evChargingSpeedKw: number; evChargingSpeedLabel: string; hasFastCharger: boolean } {
  const bays = cp.evChargingBays || 0;
  if (bays === 0) {
    return { evChargingSpeedKw: 0, evChargingSpeedLabel: "None", hasFastCharger: false };
  }
  const text = `${cp.name || ""} ${cp.accessInstructions || ""} ${cp.categoryLabel || ""}`.toLowerCase();
  let kw = 7;
  let label = "7kW Standard (Type 2)";
  let isFast = false;

  if (text.includes("150kw") || text.includes("ultra-rapid") || text.includes("ultra rapid") || text.includes("high-power ccs")) {
    kw = 150;
    label = "150kW Ultra-Rapid (CCS / CHAdeMO)";
    isFast = true;
  } else if (text.includes("120kw")) {
    kw = 120;
    label = "120kW Ultra-Rapid (CCS)";
    isFast = true;
  } else if (text.includes("75kw")) {
    kw = 75;
    label = "75kW Rapid (CCS)";
    isFast = true;
  } else if (text.includes("50kw") || text.includes("rapid charger") || text.includes("rapid ccs") || text.includes("rapid bay")) {
    kw = 50;
    label = "50kW Rapid (CCS / Type 2)";
    isFast = true;
  } else if (text.includes("22kw") || text.includes("fast charger") || text.includes("fast ev") || text.includes("22 kw")) {
    kw = 22;
    label = "22kW Fast (Type 2 Fast)";
    isFast = true;
  } else if (text.includes("11kw")) {
    kw = 11;
    label = "11kW Fast AC";
    isFast = false;
  } else if (bays >= 16) {
    kw = 50;
    label = "50kW Rapid Hub";
    isFast = true;
  } else if (bays >= 6) {
    kw = 22;
    label = "22kW Fast Hub";
    isFast = true;
  } else if (bays >= 2) {
    kw = 22;
    label = "22kW Fast";
    isFast = true;
  }

  return { evChargingSpeedKw: kw, evChargingSpeedLabel: label, hasFastCharger: isFast };
}

// Great-circle distance helper (in kilometers)
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

// Curated London off-street parking spots: static seed only
export let activeSeedCarParks: ServerCarPark[] = SEED_CAR_PARKS as ServerCarPark[];

export function validateSeed(): ServerCarPark[] {
  const total = SEED_CAR_PARKS.length;
  const rejected: string[] = [];
  const valid: ServerCarPark[] = [];

  for (const s of SEED_CAR_PARKS) {
    const lat = Number(s.lat);
    const lng = Number(s.lng);

    if (isNaN(lat) || isNaN(lng) || lat < 51.2 || lat > 51.85 || lng < -0.8 || lng > 0.4) {
      rejected.push(s.id);
      continue;
    }

    if (valid.some((v) => v.id === s.id)) {
      rejected.push(s.id);
      continue;
    }

    const nameMatchAndClose = valid.some((v) => {
      const sameName = (v.name || "").trim().toLowerCase() === (s.name || "").trim().toLowerCase();
      if (!sameName) return false;
      const distKm = calculateDistanceKm(v.lat, v.lng, lat, lng);
      return distKm < 0.05; // 50m
    });

    if (nameMatchAndClose) {
      rejected.push(s.id);
      continue;
    }

    valid.push(s as ServerCarPark);
  }

  const ids = rejected.join(", ");
  console.log(`Seed validation: ${total} rows, ${rejected.length} rejected [${ids}]`);
  return valid;
}

function cleanNameForDedupe(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/\b(station|car\s*park|carpark)\b/gi, "")
    .replace(/[^a-z0-9]/gi, "")
    .trim();
}

export async function dedupeSeedVsTfl(tflStations: ServerCarPark[]): Promise<ServerCarPark[]> {
  const removed: { seedId: string; tflId: string }[] = [];
  const remaining: ServerCarPark[] = [];

  for (const s of activeSeedCarParks) {
    const sClean = cleanNameForDedupe(s.name || "");
    let matchedTfl: ServerCarPark | undefined;

    for (const t of tflStations) {
      const tClean = cleanNameForDedupe(t.name || "");
      const isNameMatch = sClean.length > 2 && tClean.length > 2 && sClean === tClean;
      const distKm = calculateDistanceKm(s.lat, s.lng, t.lat, t.lng);
      const isDistMatch = distKm < 0.15; // < 150m

      if (isNameMatch || isDistMatch) {
        matchedTfl = t;
        break;
      }
    }

    if (matchedTfl) {
      removed.push({ seedId: s.id, tflId: matchedTfl.id });
      console.log(`Dedupe: removed ${s.id} in favour of ${matchedTfl.id}`);
    } else {
      remaining.push(s);
    }
  }

  console.log(`Dedupe: ${removed.length} seed rows removed`);

  if (removed.length > 0) {
    activeSeedCarParks = remaining;
    await syncSeedFileWithRemovedIds(removed.map((r) => r.seedId));
  }

  return remaining;
}

async function syncSeedFileWithRemovedIds(removedIds: string[]) {
  try {
    const fs = await import("fs/promises");
    const filePath = path.resolve(process.cwd(), "src/data/seedCarParks.ts");
    const content = await fs.readFile(filePath, "utf-8");
    const match = content.match(/export const SEED_CAR_PARKS\s*=\s*(\[[\s\S]*\]);?/);
    if (!match) return;
    const records = JSON.parse(match[1]);
    const filtered = records.filter((r: any) => !removedIds.includes(r.id));

    const fieldOrder = [
      'id', 'name', 'operator', 'parkingCategory', 'categoryLabel', 'address', 'postcode', 'borough',
      'lat', 'lng', 'totalSpaces', 'hourlyRate', 'dailyRate', 'heightRestriction', 'spaceDimensions',
      'accessInstructions', 'securityType', 'evChargingBays', 'disabledBays', 'openHours', 'cctvMonitoring',
      'sourceUrl', 'verifiedAt', 'notes'
    ];
    const lines = ['// STATIC SEED ONLY – never contains availability', '', 'export const SEED_CAR_PARKS = ['];
    for (let i = 0; i < filtered.length; i++) {
      lines.push('  {');
      const r = filtered[i];
      for (let f = 0; f < fieldOrder.length; f++) {
        const key = fieldOrder[f];
        if (key in r) {
          const comma = f < fieldOrder.length - 1 ? ',' : '';
          lines.push(`    "${key}": ${JSON.stringify(r[key])}${comma}`);
        }
      }
      lines.push(i < filtered.length - 1 ? '  },' : '  }');
    }
    lines.push('];', '');
    await fs.writeFile(filePath, lines.join('\n'), "utf-8");
  } catch (err) {
    console.error("Error writing updated seedCarParks.ts:", err);
  }
}

// Helper to fetch TfL JamCams
export async function fetchTflJamCams() {
  const now = Date.now();
  if (cachedJamCams.length > 0 && now - lastJamCamFetch < 24 * 60 * 60 * 1000) {
    return cachedJamCams;
  }
  try {
    const jamCamUrl = process.env.TFL_APP_KEY
      ? `https://api.tfl.gov.uk/Place/Type/JamCam?app_key=${encodeURIComponent(process.env.TFL_APP_KEY)}`
      : "https://api.tfl.gov.uk/Place/Type/JamCam";
    const res = await fetch(jamCamUrl, {
      headers: { "User-Agent": "LondonParkingApp/1.0" },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) {
      return cachedJamCams;
    }
    const data = await res.json();
    const mapped = (Array.isArray(data) ? data : [])
      .map((item: any) => {
        const imageUrl = item.additionalProperties?.find((p: any) => p.key === "imageUrl")?.value || "";
        const videoUrl = item.additionalProperties?.find((p: any) => p.key === "videoUrl")?.value || "";
        return {
          id: item.id,
          commonName: item.commonName,
          lat: item.lat,
          lon: item.lon,
          imageUrl,
          videoUrl
        };
      })
      .filter((cam: any) => cam.lat && cam.lon);

    if (mapped.length > 0) {
      cachedJamCams = mapped;
      lastJamCamFetch = now;
    }
    return cachedJamCams;
  } catch (_err) {
    return cachedJamCams;
  }
}

// Helper to fetch TfL CarParks
export async function fetchTflCarParks() {
  const now = Date.now();
  if (cachedTflCarParks.length > 0 && now - lastCarParkFetch < 5 * 60 * 1000) {
    return cachedTflCarParks;
  }
  try {
    const carParkUrl = process.env.TFL_APP_KEY
      ? `https://api.tfl.gov.uk/Place/Type/CarPark?app_key=${encodeURIComponent(process.env.TFL_APP_KEY)}`
      : "https://api.tfl.gov.uk/Place/Type/CarPark";
    const res = await fetch(carParkUrl, {
      headers: { "User-Agent": "LondonParkingApp/1.0" },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`TfL CarPark HTTP ${res.status}`);
    const data = await res.json();
    const mapped = (Array.isArray(data) ? data : []).map((item: any) => {
      const getProp = (k: string) => item.additionalProperties?.find((p: any) => p.key === k)?.value;

      const rawSpaces = getProp("NumberOfSpaces");
      const parsedSpaces = rawSpaces ? parseInt(rawSpaces, 10) : NaN;
      const totalSpaces = !isNaN(parsedSpaces) ? parsedSpaces : null;

      const rawDisabled = getProp("NumberOfDisabledBays");
      const parsedDisabled = rawDisabled ? parseInt(rawDisabled, 10) : NaN;
      const disabledBays = !isNaN(parsedDisabled) ? parsedDisabled : null;

      const dailyRate = parseRate(getProp("StandardTariffsCashlessDaily"))
                     ?? parseRate(getProp("StandardTariffsCashDaily"));
      // TfL exposes no cashless Saturday key (verified 2026-10-20: only
      // StandardTariffsCashSaturdayAndBankHoliday and SaturdayAndBankHolidays
      // exist, present on all 58 stations and never differing). Saturday is
      // therefore cash-sourced; Sunday follows the dailyRate cashless??cash rule.
      const saturdayRate = parseRate(getProp("StandardTariffsCashSaturdayAndBankHoliday"))
                        ?? parseRate(getProp("SaturdayAndBankHolidays"));
      const sundayRate   = parseRate(getProp("StandardTariffsCashlessSunday"))
                        ?? parseRate(getProp("StandardTariffsCashSunday"));

      const verifiedAt = item.additionalProperties?.find((p: any) => p.modified)?.modified || null;

      const maxHeight = getProp("MaxHeightMetres");
      const heightRestriction = maxHeight && !isNaN(Number(maxHeight)) ? Number(maxHeight) : null;

      const rawOpenHours = getProp("OpeningHours");
      const openHours = rawOpenHours ? rawOpenHours.trim().replace(/;+$/, "").trim() : null;

      const rawNarrative = getProp("Narrative");
      const notes = rawNarrative ? rawNarrative.replace(/\s+/g, " ").trim() : null;

      const rawOpen = getProp("Open");
      const stillOperating = rawOpen === "True" ? true : (rawOpen === "False" ? false : null);

      const rawCC = getProp("CongestionChargeZone");
      const congestionChargeZone = rawCC === "True" ? true : (rawCC === "False" ? false : null);

      const rawPayment = getProp("MethodsOfPayment");
      const paymentMethods = rawPayment ? rawPayment.replace(/\s+/g, " ").trim() : null;

      const staffedSite = getProp("StaffedSite");
      const patrolledSite = getProp("PatrolledSite");
      const staffed = (staffedSite === "True" || patrolledSite === "True")
        ? true
        : ((staffedSite === "False" && patrolledSite === "False") ? false : null);

      const rawEv = getProp("CarElectricalChargingPoints");
      const hasEvCharging = rawEv === "True" ? true : rawEv === "False" ? false : null;

      const postCode = getProp("PostCode") || null;
      const addressParts = [getProp("Address1"), getProp("Address2"), getProp("Address3")]
        .map((p: any) => (p ? String(p).trim() : ""))
        .filter(Boolean);
      const address = addressParts.length > 0 ? addressParts.join(", ") : (item.commonName || null);

      const commonName = item.commonName || "";
      const name = /car park/i.test(commonName) ? commonName : `${commonName} Station Car Park`;

      return {
        id: `tfl-${item.id}`,
        name,
        operator: "Transport for London (TfL)",
        parkingCategory: "station_park_ride",
        categoryLabel: "TfL Station Park & Ride",
        address,
        postcode: postCode,
        borough: null,
        lat: item.lat,
        lng: item.lon,
        totalSpaces,
        occupiedSpaces: null,
        availableSpaces: null,
        occupancyRate: null,
        status: null,
        hourlyRate: null,
        dailyRate,
        saturdayRate,
        sundayRate,
        heightRestriction,
        spaceDimensions: null,
        accessInstructions: null,
        securityType: null,
        hasEvCharging,
        evChargingBays: null,
        evChargingSpeedKw: null,
        evChargingSpeedLabel: null,
        hasFastCharger: null,
        disabledBays,
        openHours,
        cctvMonitoring: getProp("CCTV") === "True",
        bayCameras: [],
        availableBays: [],
        source: "tfl",
        sourceUrl: "https://tfl.gov.uk/modes/driving/station-car-parks",
        verifiedAt,
        notes,
        confidence: "static",
        lastUpdated: null,
        stillOperating,
        congestionChargeZone,
        paymentMethods,
        staffed,
        zone: null,
        zoneLabel: null
      };
    });

    if (mapped.length > 0) {
      cachedTflCarParks = mapped;
      lastCarParkFetch = now;
    }
    const stations = mapped;
    console.log(`TfL: ${stations.length} stations loaded`);
    return cachedTflCarParks;
  } catch (err) {
    console.warn("Failed to fetch TfL CarParks:", err);
    return cachedTflCarParks;
  }
}

// Helper to fetch TfL CarPark Occupancy
export async function fetchTflOccupancy() {
  const now = Date.now();
  if (now - lastOccupancyFetch < 60 * 1000) {
    return cachedTflOccupancy;
  }
  lastOccupancyFetch = now;
  try {
    const occupancyUrl = process.env.TFL_APP_KEY
      ? `https://api.tfl.gov.uk/Occupancy/CarPark?app_key=${encodeURIComponent(process.env.TFL_APP_KEY)}`
      : "https://api.tfl.gov.uk/Occupancy/CarPark";
    const res = await fetch(occupancyUrl, {
      headers: { "User-Agent": "LondonParkingApp/1.0" },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) {
      lastOccupancyError = { status: res.status, at: new Date().toISOString() };
      if (!occupancyDown) {
        occupancyDown = true;
        console.warn(`TfL occupancy unavailable (${res.status}); serving static capacity`);
      }
      return cachedTflOccupancy;
    }
    const data = await res.json();
    const mapped = (Array.isArray(data) ? data : []).map((item: any) => {
      const hasBays = Array.isArray(item.bays) && item.bays.length > 0;
      let freeTotal = 0;
      let occupiedTotal = 0;
      let allNumeric = hasBays;

      if (hasBays) {
        for (const bay of item.bays) {
          const freeNum = (bay.free !== null && bay.free !== undefined && !isNaN(Number(bay.free))) ? Number(bay.free) : null;
          const occNum = (bay.occupied !== null && bay.occupied !== undefined && !isNaN(Number(bay.occupied))) ? Number(bay.occupied) : null;
          if (freeNum === null || occNum === null) {
            allNumeric = false;
            break;
          }
          freeTotal += freeNum;
          occupiedTotal += occNum;
        }
      }

      if (allNumeric) {
        return {
          id: item.id,
          name: item.name,
          availableSpaces: freeTotal,
          occupiedSpaces: occupiedTotal,
          lastUpdated: new Date().toISOString(),
          confidence: "live"
        };
      }

      return {
        id: item.id,
        name: item.name,
        availableSpaces: null,
        occupiedSpaces: null,
        lastUpdated: null,
        confidence: "static"
      };
    });

    if (mapped.length > 0) {
      cachedTflOccupancy = mapped;
    }
    lastOccupancySuccessAt = new Date().toISOString();
    lastOccupancyError = null;
    if (occupancyDown) {
      occupancyDown = false;
      console.info("TfL occupancy recovered");
    }
    return cachedTflOccupancy;
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 500;
    lastOccupancyError = { status, at: new Date().toISOString() };
    if (!occupancyDown) {
      occupancyDown = true;
      console.warn(`TfL occupancy unavailable (${status}); serving static capacity`);
    }
    return cachedTflOccupancy;
  }
}

// Return the closest camera within 400 m using calculateDistanceKm, or null if none
export function nearestJamCam(lat: number, lng: number, cameras: any[] = cachedJamCams): any | null {
  if (!lat || !lng || !cameras || cameras.length === 0) return null;
  let closest: any = null;
  let minDistanceKm = Infinity;
  for (const cam of cameras) {
    if (typeof cam.lat !== "number" || typeof cam.lon !== "number") continue;
    const distKm = calculateDistanceKm(lat, lng, cam.lat, cam.lon);
    if (distKm <= 0.4 && distKm < minDistanceKm) {
      minDistanceKm = distKm;
      closest = cam;
    }
  }
  return closest;
}


// ----------------------------------------------------
// API ENDPOINTS
// ----------------------------------------------------

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "London Parking & Navigation API", timestamp: new Date().toISOString() });
});

// Helper to fetch and merge all car parks with live occupancy & jam cams
async function getMergedCarParks(userLat?: number, userLng?: number): Promise<any[]> {
  const hasUserLocation = typeof userLat === "number" && typeof userLng === "number" && !isNaN(userLat) && !isNaN(userLng);

  // Fetch live TfL JamCams, TfL CarParks, and TfL Occupancy
  const [tflCams, tflCarParks, tflOccupancy] = await Promise.all([
    fetchTflJamCams(),
    fetchTflCarParks(),
    fetchTflOccupancy()
  ]);

  const occupancyMap = new Map((tflOccupancy || []).map((o: any) => [o.id, o]));

  // Static seed car parks with verified JamCams where available
  const premierWithLiveStatus = activeSeedCarParks.map((cp: any) => {
    const cam = nearestJamCam(cp.lat, cp.lng, tflCams);
    const jamCam = cam || null;
    const jamCamDistanceM = cam ? Math.round(calculateDistanceKm(cp.lat, cp.lng, cam.lat, cam.lon) * 1000) : null;
    const hasLiveCam = Boolean(cam);

    let distKm: number | undefined = undefined;
    let distMiles: number | undefined = undefined;
    let driveMin: number | undefined = undefined;

    if (hasUserLocation) {
      distKm = calculateDistanceKm(userLat, userLng, cp.lat, cp.lng);
      distMiles = distKm * 0.621371;
      // Average London driving speed
      driveMin = Math.max(2, Math.round((distKm / 24) * 60 + 3));
    }

    return {
      ...cp,
      source: "seed",
      hasEvCharging: deriveHasEvCharging(cp.evChargingBays),
      borough: cp.borough ?? null,
      zone: null,
      zoneLabel: null,
      evChargingSpeedKw: null,
      evChargingSpeedLabel: null,
      hasFastCharger: null,
      occupiedSpaces: null,
      availableSpaces: null,
      occupancyRate: null,
      status: null,
      jamCam,
      jamCamDistanceM,
      hasLiveCam,
      nearestTflJamCam: cam ? { id: cam.id, name: cam.commonName, imageUrl: cam.imageUrl, videoUrl: cam.videoUrl, distanceMeters: jamCamDistanceM } : undefined,
      bayCameras: [],
      availableBays: [],
      distanceFromUserKm: distKm ? Number(distKm.toFixed(2)) : undefined,
      distanceFromUserMiles: distMiles ? Number(distMiles.toFixed(2)) : undefined,
      estimatedDriveTimeMin: driveMin,
      sourceUrl: cp.sourceUrl ?? null,
      verifiedAt: cp.verifiedAt ?? null
    };
  });

  // Also attach distances & genuine live camera to TfL station car parks across London Zones 2 to 6
  const formattedTflParks = (tflCarParks || []).map((cp: any) => {
    let distKm: number | undefined = undefined;
    let distMiles: number | undefined = undefined;
    let driveMin: number | undefined = undefined;

    if (hasUserLocation) {
      distKm = calculateDistanceKm(userLat, userLng, cp.lat, cp.lng);
      distMiles = distKm * 0.621371;
      driveMin = Math.max(3, Math.round((distKm / 30) * 60 + 4));
    }

    const cam = nearestJamCam(cp.lat, cp.lng, tflCams);
    const jamCam = cam || null;
    const jamCamDistanceM = cam ? Math.round(calculateDistanceKm(cp.lat, cp.lng, cam.lat, cam.lon) * 1000) : null;
    const hasLiveCam = Boolean(cam);

    // Join occupancy by TfL id (strip "tfl-" prefix)
    const tflId = cp.id.startsWith("tfl-") ? cp.id.replace(/^tfl-/, "") : cp.id;
    const occ = occupancyMap.get(tflId);

    const isLive = occ && occ.confidence === "live";
    const availableSpaces = isLive ? occ.availableSpaces : null;
    const occupiedSpaces = isLive ? occ.occupiedSpaces : null;
    const lastUpdated = isLive ? occ.lastUpdated : null;
    const confidence = isLive ? "live" : "static";

    return {
      ...cp,
      hasEvCharging: deriveHasEvCharging(cp.evChargingBays) ?? cp.hasEvCharging ?? null,
      borough: null,
      zone: null,
      zoneLabel: null,
      evChargingSpeedKw: null,
      evChargingSpeedLabel: null,
      hasFastCharger: null,
      availableSpaces,
      occupiedSpaces,
      lastUpdated,
      confidence,
      source: "tfl",
      sourceUrl: "https://tfl.gov.uk/modes/driving/station-car-parks",
      verifiedAt: cp.verifiedAt ?? null,
      saturdayRate: cp.saturdayRate ?? null,
      sundayRate: cp.sundayRate ?? null,
      eveningRate: cp.eveningRate ?? null,
      stillOperating: cp.stillOperating ?? null,
      congestionChargeZone: cp.congestionChargeZone ?? null,
      paymentMethods: cp.paymentMethods ?? null,
      staffed: cp.staffed ?? null,
      notes: cp.notes ?? null,
      jamCam,
      jamCamDistanceM,
      hasLiveCam,
      nearestTflJamCam: cam ? { id: cam.id, name: cam.commonName, imageUrl: cam.imageUrl, videoUrl: cam.videoUrl, distanceMeters: jamCamDistanceM } : undefined,
      bayCameras: [],
      distanceFromUserKm: distKm ? Number(distKm.toFixed(2)) : undefined,
      distanceFromUserMiles: distMiles ? Number(distMiles.toFixed(2)) : undefined,
      estimatedDriveTimeMin: driveMin
    };
  });

  const allCarParks = [...premierWithLiveStatus, ...formattedTflParks];

  // Sort by distance if user location provided, otherwise default to Central London favorites
  if (hasUserLocation) {
    allCarParks.sort((a, b) => (a.distanceFromUserKm ?? 999) - (b.distanceFromUserKm ?? 999));
  }

  return allCarParks;
}

// All parking facilities with live dynamic occupancy & nearby cameras
app.get(["/api/parking", "/api/carparks"], async (req, res) => {
  try {
    const userLat = parseFloat(req.query.lat as string);
    const userLng = parseFloat(req.query.lng as string);
    const allCarParks = await getMergedCarParks(userLat, userLng);

    const occupancySource: "tfl-live" | "unavailable" =
      lastOccupancySuccessAt !== null && !lastOccupancyError && allCarParks.some((cp: any) => cp.confidence === "live")
        ? "tfl-live"
        : "unavailable";

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      meta: {
        tflWarmupComplete,
        occupancySource,
        lastOccupancySuccessAt,
        lastOccupancyError
      },
      totalCarParks: allCarParks.length,
      carParks: allCarParks
    });
  } catch (err: any) {
    console.error("Error in /api/parking:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Live camera feeds
app.get("/api/cameras", async (req, res) => {
  try {
    const cams = await fetchTflJamCams();
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);

    if (!isNaN(lat) && !isNaN(lng)) {
      // Return 15 nearest cameras
      const withDist = cams.map((c) => ({
        ...c,
        distanceKm: calculateDistanceKm(lat, lng, c.lat, c.lon ?? c.lng)
      }));
      withDist.sort((a, b) => a.distanceKm - b.distanceKm);
      return res.json({ success: true, count: withDist.length, cameras: withDist.slice(0, 16) });
    }

    res.json({ success: true, count: cams.length, cameras: cams.slice(0, 30) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Map configuration endpoint
app.get("/api/config", (req, res) => {
  const envKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
  res.json({
    googleMapsApiKey: envKey,
    hasApiKey: Boolean(envKey)
  });
});

// Routing engine: computes real road navigation between two points in London
app.post("/api/route", async (req, res) => {
  try {
    const { origin, destination, facilityId } = req.body;
    if (!origin || !destination) {
      return res.status(400).json({ error: "origin and destination { lat, lng } are required" });
    }

    const { lat: oLat, lng: oLng } = origin;
    const { lat: dLat, lng: dLng } = destination;

    const sendUnavailable503 = () => {
      return res.status(503).json({
        success: false,
        error: "routing_unavailable",
        message: "Turn-by-turn routing is temporarily unavailable.",
        googleMapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${dLat},${dLng}&travelmode=driving`,
        destination: { lat: dLat, lng: dLng, facilityId }
      });
    };

    let osrmData: any;
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson&steps=true`;
      const osrmRes = await fetch(osrmUrl, {
        headers: { "User-Agent": "LondonLiveParkingApp/1.0" },
        signal: AbortSignal.timeout(4000)
      });
      if (!osrmRes.ok) {
        return sendUnavailable503();
      }
      osrmData = await osrmRes.json();
    } catch (_osrmErr) {
      return sendUnavailable503();
    }

    if (!osrmData || !osrmData.routes || osrmData.routes.length === 0) {
      return sendUnavailable503();
    }

    const primary = osrmData.routes[0];
    const coordinates: [number, number][] = primary.geometry.coordinates.map((pt: [number, number]) => [pt[1], pt[0]]);
    const distanceKm = Number((primary.distance / 1000).toFixed(2));
    const durationMinutes = Math.max(2, Math.round((primary.duration / 60) * 1.25));

    let steps: any[] = [];
    if (primary.legs && primary.legs[0] && primary.legs[0].steps) {
      steps = primary.legs[0].steps.map((st: any, idx: number) => {
        let instruction = st.maneuver.instruction || "";
        if (!instruction) {
          const type = st.maneuver.type;
          const modifier = st.maneuver.modifier || "";
          instruction = `${type.toUpperCase()} ${modifier} on ${st.name || "Unnamed road"}`.trim();
        }
        return {
          id: `step-${idx}`,
          instruction,
          streetName: st.name || "Unnamed road",
          distanceMeters: Math.round(st.distance),
          durationSeconds: Math.round(st.duration),
          maneuver: st.maneuver.type || "straight"
        };
      });
    }

    return res.json({
      success: true,
      source: "osrm",
      durationNote: "includes 1.25x traffic factor",
      origin: { lat: oLat, lng: oLng },
      destination: { lat: dLat, lng: dLng, facilityId },
      distanceKm,
      distanceMiles: Number((distanceKm * 0.621371).toFixed(2)),
      durationMinutes,
      coordinates,
      steps
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Static system instruction for Gemini Parking Advisor
const ADVISOR_SYSTEM_INSTRUCTION = `You are SpotOn's parking assistant for London. You may ONLY use the car park records in the CONTEXT block. Rules:
- Never state a space count, price, opening hour, height limit or EV detail that is not present in CONTEXT. If a field is null, say it is unknown.
- Only call availability 'live' when confidence is 'live'. For 'static' or 'unverified' records say availability is not confirmed.
- Never invent car parks, streets, operators or bay numbers.
- Do not mention cameras, bays, or 'checking' anything in real time.
- If the question cannot be answered from CONTEXT, say so and suggest the user check the operator's site.
- Reply in under 120 words, plain text, no markdown.`;

// Build ONE formatted line per car park record for the CONTEXT block
function buildContextLine(cp: any, userLat?: number, userLng?: number): string {
  const hasUser = typeof userLat === "number" && typeof userLng === "number" && !isNaN(userLat) && !isNaN(userLng);
  const distKm = hasUser ? calculateDistanceKm(userLat, userLng, cp.lat, cp.lng) : null;
  const distStr = distKm !== null && Number.isFinite(distKm) ? distKm.toFixed(1) : "n/a";

  const id = String(cp.id);
  const name = String(cp.name);
  const latLng = `${cp.lat},${cp.lng}`;
  const availableSpaces = typeof cp.availableSpaces === "number" && Number.isFinite(cp.availableSpaces) ? String(cp.availableSpaces) : "unknown";
  const totalSpaces = typeof cp.totalSpaces === "number" && Number.isFinite(cp.totalSpaces) ? String(cp.totalSpaces) : "unknown";
  const confidence = cp.confidence || "static";
  const lastUpdated = cp.lastUpdated ? String(cp.lastUpdated) : "n/a";
  const hourlyRate = cp.hourlyRate != null ? `£${Number(cp.hourlyRate).toFixed(2)}/hr` : (cp.dailyRate != null ? `£${Number(cp.dailyRate).toFixed(2)}/day` : "unknown");
  const openHours = cp.openHours ? String(cp.openHours) : "unknown";
  const heightRestriction = cp.heightRestriction ? String(cp.heightRestriction) : "unknown";
  const evChargingBays = typeof cp.evChargingBays === "number" && Number.isFinite(cp.evChargingBays) ? String(cp.evChargingBays) : "unknown";
  const disabledBays = typeof cp.disabledBays === "number" && Number.isFinite(cp.disabledBays) ? String(cp.disabledBays) : "unknown";
  const source = cp.source || (String(cp.id).startsWith("tfl-") ? "tfl" : "seed");

  return `${id} | ${name} | ${latLng} | ${distStr} | ${availableSpaces} | ${totalSpaces} | ${confidence} | ${lastUpdated} | ${hourlyRate} | ${openHours} | ${heightRestriction} | ${evChargingBays} | ${disabledBays} | ${source}`;
}

// Gemini AI Parking Assistant endpoint
app.post("/api/ai/assistant", async (req, res) => {
  try {
    const { prompt, userLocation, lat, lng } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    let userLat: number | undefined;
    let userLng: number | undefined;
    if (userLocation && typeof userLocation.lat === "number" && typeof userLocation.lng === "number" && !isNaN(userLocation.lat) && !isNaN(userLocation.lng)) {
      userLat = userLocation.lat;
      userLng = userLocation.lng;
    } else if (typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng)) {
      userLat = lat;
      userLng = lng;
    } else if (lat !== undefined && lng !== undefined) {
      const pLat = parseFloat(lat);
      const pLng = parseFloat(lng);
      if (!isNaN(pLat) && !isNaN(pLng)) {
        userLat = pLat;
        userLng = pLng;
      }
    }

    const allCarParks = await getMergedCarParks(userLat, userLng);
    const hasUser = userLat !== undefined && userLng !== undefined;
    const selectedRecords = [...allCarParks];

    if (hasUser) {
      selectedRecords.sort((a, b) => {
        const distA = calculateDistanceKm(userLat!, userLng!, a.lat, a.lng);
        const distB = calculateDistanceKm(userLat!, userLng!, b.lat, b.lng);
        return distA - distB;
      });
    } else {
      selectedRecords.sort((a, b) => {
        const aLive = a.confidence === "live";
        const bLive = b.confidence === "live";
        if (aLive && !bLive) return -1;
        if (!aLive && bLive) return 1;
        const distA = calculateDistanceKm(51.5074, -0.1278, a.lat, a.lng);
        const distB = calculateDistanceKm(51.5074, -0.1278, b.lat, b.lng);
        return distA - distB;
      });
    }

    const topRecords = selectedRecords.slice(0, 8);
    const contextLines = topRecords.map((cp) => buildContextLine(cp, userLat, userLng));
    const contextBlock = contextLines.join("\n");
    console.info(`[Advisor Grounding] Context records: ${topRecords.length}, IDs: [${topRecords.map((r: any) => r.id).join(", ")}]`);
    console.info(`[Advisor Grounding] CONTEXT block:\n${contextBlock}`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Assistant unavailable" });
    }

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt.trim(),
        config: {
          systemInstruction: `${ADVISOR_SYSTEM_INSTRUCTION}\n\nCONTEXT:\n${contextBlock}`,
          temperature: 0.2,
          maxOutputTokens: 300,
        }
      });

      const text = response.text?.trim();
      if (!text) {
        return res.status(503).json({ error: "Assistant unavailable" });
      }

      return res.json({
        success: true,
        answer: text
      });
    } catch (geminiError: any) {
      console.error("Gemini API error in /api/ai/assistant:", geminiError);
      return res.status(503).json({ error: "Assistant unavailable" });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// VITE MIDDLEWARE & STATIC SERVING
// ----------------------------------------------------
// Prevent unmatched /api/* routes from falling through to the SPA HTML fallback
app.all("/api/*", (_req, res) => {
  res.status(404).json({ success: false, error: "API endpoint not found" });
});

async function start() {
  // 1. Validate seed synchronously on startup
  activeSeedCarParks = validateSeed();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);

    // 2. Warm up TfL stations, dedupe seed vs TfL, and fetch occupancy without blocking server startup
    (async () => {
      try {
        const tflStations = await fetchTflCarParks();
        await dedupeSeedVsTfl(tflStations);
        await fetchTflOccupancy();
      } catch (err: any) {
        console.warn("Startup TfL initialization error:", err);
      } finally {
        tflWarmupComplete = true;
      }
    })();
  });
}

start();
