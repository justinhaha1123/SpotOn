import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { SEED_CAR_PARKS } from "./src/data/seedCarParks.js";
import { fetchOnStreetRestrictions, ON_STREET_COVERAGE_NOTE } from "./src/server/onStreet.js";
import { ADVISOR_BUDGET_MS, askModelsWithinDeadline, isHighDemandError, isQuotaError } from "./src/utils/advisorRun.js";
import { humaniseManeuver, mapManeuverIcon } from "./src/utils/maneuver.js";
import { classifySecretCandidates, geminiKeyMessage, isUsableSecret, mapsKeyBanner } from "./src/utils/secrets.js";

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

      // Name and distance together. A car park merely near a station is a different place.
      if (isNameMatch && isDistMatch) {
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
  }

  return remaining;
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

      const cashlessDaily = parseRate(getProp("StandardTariffsCashlessDaily"));
      const cashDaily = parseRate(getProp("StandardTariffsCashDaily"));
      const dailyRate = cashlessDaily ?? cashDaily;
      const tariffNote = dailyRate == null
        ? "TfL did not publish a daily rate for this car park."
        : cashlessDaily != null
          ? "TfL cashless daily rate. Cash can cost more. This is not an hourly price."
          : "TfL cash daily rate. This is not an hourly price.";
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
        cctvMonitoring: getProp("CCTV") === "True" ? true : getProp("CCTV") === "False" ? false : null,
        tariffNote,
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
      confidence: cp.sourceUrl ? "static" : "unverified",
      tariffNote: cp.sourceUrl
        ? "Static catalogue figure."
        : "Unverified catalogue figure. Not a live price, and not confirmed against the operator.",
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
      nearestTflJamCam: cam ? { id: cam.id, name: cam.commonName, imageUrl: cam.imageUrl, videoUrl: cam.videoUrl, distanceMeters: jamCamDistanceM, lat: cam.lat, lng: cam.lon } : undefined,
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
      nearestTflJamCam: cam ? { id: cam.id, name: cam.commonName, imageUrl: cam.imageUrl, videoUrl: cam.videoUrl, distanceMeters: jamCamDistanceM, lat: cam.lat, lng: cam.lon } : undefined,
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
        lastOccupancyError,
        catalogueNote:
          "Commercial rows are an unverified static catalogue. TfL rows come from the Unified API car-park feed. A space count is marked live only when /Occupancy/CarPark returns numbers."
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
app.get("/api/config", (_req, res) => {
  const mapsKeyStatus = classifySecretCandidates(
    process.env.VITE_GOOGLE_MAPS_API_KEY,
    process.env.GOOGLE_MAPS_API_KEY
  );
  const mapsKey = mapsKeyStatus === "usable"
    ? [process.env.VITE_GOOGLE_MAPS_API_KEY, process.env.GOOGLE_MAPS_API_KEY].find((value) => isUsableSecret(value))
    : "";
  const geminiKeyStatus = classifySecretCandidates(process.env.GEMINI_API_KEY);
  res.json({
    googleMapsApiKey: mapsKey || "",
    hasApiKey: mapsKeyStatus === "usable",
    mapsKeyStatus,
    hasGeminiKey: geminiKeyStatus === "usable",
    geminiKeyStatus,
    mapsMessage: mapsKeyBanner(mapsKeyStatus),
    geminiMessage: geminiKeyStatus === "usable" ? null : geminiKeyMessage(geminiKeyStatus)
  });
});

app.get("/api/on-street", async (req, res) => {
  const lat = parseFloat(String(req.query.lat ?? ""));
  const lng = parseFloat(String(req.query.lng ?? ""));
  const radiusRaw = parseFloat(String(req.query.radiusM ?? "900"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ success: false, error: "lat and lng are required" });
  }
  if (lat < 51.2 || lat > 51.85 || lng < -0.8 || lng > 0.4) {
    return res.json({
      success: true,
      bays: [],
      note: ON_STREET_COVERAGE_NOTE,
      sources: [],
      message: "On-street lookups are limited to Greater London."
    });
  }
  const radiusM = Number.isFinite(radiusRaw) ? Math.min(2000, Math.max(250, radiusRaw)) : 900;
  try {
    const payload = await fetchOnStreetRestrictions(lat, lng, radiusM);
    return res.json({ success: true, ...payload });
  } catch (err: any) {
    return res.json({
      success: true,
      bays: [],
      note: ON_STREET_COVERAGE_NOTE,
      sources: [{ id: "on-street", status: "unavailable", count: 0, detail: err?.message || "lookup failed" }]
    });
  }
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
        const provided = String(st.maneuver?.instruction || "").trim();
        const looksRaw = !provided || /\bNEW NAME\b/i.test(provided) || /^[A-Z0-9 _-]+$/.test(provided);
        const instruction = looksRaw
          ? humaniseManeuver(st.maneuver?.type, st.maneuver?.modifier, st.name)
          : provided;
        return {
          id: `step-${idx}`,
          instruction,
          streetName: st.name || "Unnamed road",
          distanceMeters: Math.round(st.distance),
          durationSeconds: Math.round(st.duration),
          maneuver: mapManeuverIcon(st.maneuver?.type, st.maneuver?.modifier)
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
const ADVISOR_SYSTEM_INSTRUCTION = `You are SpotOn's parking assistant for London. You may ONLY use the CONTEXT block. It has two labelled tables, CAR PARKS and ON-STREET RULES. The first line of each table is the column header. Rules:
- Never state a space count, price, opening hour, height limit, EV detail, restriction, or tariff that is not present in CONTEXT. If a field is unknown, say it is unknown.
- Only call car-park availability 'live' when confidence is 'live'. For 'static' or 'unverified' records say availability is not confirmed. Unverified catalogue prices are not confirmed quotes.
- ON-STREET RULES are parking restrictions, never live free-space counts. capacity is marked bays, not free spaces. canParkNow is evaluated at the London time in CONTEXT. For a different time such as 7pm, use the hours column.
- If ON-STREET RULES lists any streets, answer an on-street question by naming the nearest of those streets, the bay type (restriction), and the hours. Do this for a GPS fix and for the map centre. Do not reply with a generic borough summary when street rows are present. When three or more streets are listed, name at least three, closest first.
- Never invent car parks, streets, operators, or bay numbers.
- Do not mention cameras or 'checking' anything in real time.
- If CONTEXT says the reference point is the map centre, do not describe it as the driver's GPS location.
- If the question cannot be answered from CONTEXT, say so and suggest the user check the sign or the operator's site.
- Reply in under 120 words, plain text, no markdown.`;

const CAR_PARK_CONTEXT_HEADER = "id | name | lat,lng | distanceKm | availableSpaces | totalSpaces | confidence | lastUpdated | price | openHours | heightM | evBays | disabledBays | source | tariffNote";
const ON_STREET_CONTEXT_HEADER = "id | road | borough | lat,lng | distanceM | restriction | hours | maxStay | tariff | capacity | canParkNow | source | summary";
const ADVISOR_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash"] as const;
const ADVISOR_MAX_OUTPUT_TOKENS = 2048;

function contextCell(value: unknown): string {
  const text = value == null || value === "" ? "unknown" : String(value);
  return text.replace(/\|/g, "/").replace(/\s+/g, " ").trim() || "unknown";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const tariffNote = cp.tariffNote ? contextCell(cp.tariffNote) : "unknown";

  return [id, name, latLng, distStr, availableSpaces, totalSpaces, confidence, lastUpdated, hourlyRate, openHours, heightRestriction, evChargingBays, disabledBays, source, tariffNote]
    .map((part) => contextCell(part))
    .join(" | ");
}

function buildOnStreetContextLine(bay: {
  id: string;
  roadName: string;
  borough: string;
  lat: number;
  lng: number;
  distanceMeters?: number;
  restrictionType: string | null;
  timesOfOperation: string | null;
  maximumStay: string | null;
  tariff: string | null;
  capacity: number | null;
  canParkNow: string;
  source: string;
  summary: string;
}): string {
  return [
    bay.id,
    bay.roadName,
    bay.borough,
    `${bay.lat},${bay.lng}`,
    bay.distanceMeters ?? "unknown",
    bay.restrictionType ?? "unknown",
    bay.timesOfOperation ?? "unknown",
    bay.maximumStay ?? "unknown",
    bay.tariff ?? "unknown",
    bay.capacity ?? "unknown",
    bay.canParkNow,
    bay.source,
    bay.summary,
  ].map((part) => contextCell(part)).join(" | ");
}

// Gemini AI Parking Assistant endpoint
app.post("/api/ai/assistant", async (req, res) => {
  try {
    const { prompt, userLocation, lat, lng, locationKind } = req.body;
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

    const deadlineAt = Date.now() + ADVISOR_BUDGET_MS;
    const hasUser = userLat !== undefined && userLng !== undefined;
    const fetchBudget = Math.max(1000, Math.min(7000, deadlineAt - Date.now() - 8000));
    const contextFetch = Promise.all([
      getMergedCarParks(userLat, userLng),
      hasUser
        ? fetchOnStreetRestrictions(userLat!, userLng!, 600).catch((err) => {
            console.warn("Advisor on-street context unavailable:", err);
            return null;
          })
        : Promise.resolve(null),
    ]);
    const fetched = await Promise.race([
      contextFetch.then((value) => ({ ok: true as const, value })),
      sleep(fetchBudget).then(() => ({ ok: false as const })),
    ]);
    if (!fetched.ok || Date.now() > deadlineAt - 500) {
      return res.status(200).json({
        success: false,
        error: "assistant_busy",
        message: "The assistant is busy and did not answer within 22 seconds. Try again in a moment."
      });
    }
    const [allCarParks, onStreetPayload] = fetched.value;
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
    const carParkLines = topRecords.map((cp) => buildContextLine(cp, userLat, userLng));

    const nearestOnStreet = [...(onStreetPayload?.bays ?? [])]
      .sort((a, b) => (a.distanceMeters ?? 99999) - (b.distanceMeters ?? 99999) || a.id.localeCompare(b.id))
      .slice(0, 12);
    const onStreetLines = nearestOnStreet.map((bay) => buildOnStreetContextLine(bay));
    const streetBrief = nearestOnStreet.slice(0, 5).map((bay, index) => {
      const distance = bay.distanceMeters != null ? `${bay.distanceMeters} m` : "distance unknown";
      return `${index + 1}. ${bay.roadName} — ${bay.restrictionType ?? "bay type unknown"} — hours ${bay.timesOfOperation ?? "unknown"} — ${distance}`;
    });

    const londonNow = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      day: "2-digit",
      month: "short",
    }).format(new Date());
    const locationLine = !hasUser
      ? "User location: unknown"
      : locationKind === "gps"
        ? `User GPS location: ${userLat},${userLng}`
        : `Reference point: map centre, not your location: ${userLat},${userLng}`;
    const contextBlock = [
      `London local time now: ${londonNow}`,
      locationLine,
      "",
      "CAR PARKS",
      CAR_PARK_CONTEXT_HEADER,
      ...(carParkLines.length ? carParkLines : ["(none)"]),
      "",
      "ON-STREET RULES",
      "Restrictions only. capacity is marked bays, not free spaces. canParkNow matches the London time above; use the hours column for any other time.",
      streetBrief.length ? `Nearest streets to cite: ${streetBrief.join(" | ")}` : "Nearest streets to cite: none",
      ON_STREET_CONTEXT_HEADER,
      ...(onStreetLines.length ? onStreetLines : ["(none near this point)"]),
    ].join("\n");
    console.info(`[Advisor Grounding] Car parks: ${topRecords.length}, on-street: ${onStreetLines.length}`);

    const geminiStatus = classifySecretCandidates(process.env.GEMINI_API_KEY);
    const apiKey = geminiStatus === "usable" ? process.env.GEMINI_API_KEY : "";
    if (!apiKey) {
      return res.status(200).json({
        success: false,
        error: geminiStatus === "rejected" ? "rejected_api_key" : "missing_api_key",
        message: geminiKeyMessage(geminiStatus)
      });
    }

    try {
      const { GoogleGenAI, ThinkingLevel } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = `${ADVISOR_SYSTEM_INSTRUCTION}\n\nCONTEXT:\n${contextBlock}`;
      const baseConfig = {
        systemInstruction,
        maxOutputTokens: ADVISOR_MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      };

      const callModel = async (model: string, withThinking: boolean) => {
        const response = await ai.models.generateContent({
          model,
          contents: prompt.trim(),
          config: withThinking ? baseConfig : { systemInstruction, maxOutputTokens: ADVISOR_MAX_OUTPUT_TOKENS },
        });
        return response.text?.trim() || "";
      };

      const raced = await askModelsWithinDeadline({
        deadlineAt,
        models: ADVISOR_MODELS,
        callModel: async (model) => {
          try {
            return await callModel(model, true);
          } catch (err) {
            console.warn(`Gemini ${model} failed:`, err instanceof Error ? err.message : err);
            if (isQuotaError(err) || isHighDemandError(err)) throw err;
            if (model === ADVISOR_MODELS[1]) return callModel(model, false);
            throw err;
          }
        },
      });

      if (raced.kind === "answer") {
        return res.json({ success: true, answer: raced.text });
      }
      if (raced.kind === "quota") {
        return res.status(200).json({
          success: false,
          error: "quota",
          message: "The assistant has hit the Gemini free-tier quota (about 20 requests a day for each model). Try again tomorrow, or use the map. Prices and space counts were not invented."
        });
      }
      if (raced.kind === "busy") {
        return res.status(200).json({
          success: false,
          error: "assistant_busy",
          message: "The assistant is busy and did not answer within 22 seconds. Try again in a moment."
        });
      }
      return res.status(503).json({ error: "Assistant unavailable" });
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
    const geminiStatus = classifySecretCandidates(process.env.GEMINI_API_KEY);
    if (geminiStatus !== "usable") {
      console.warn(geminiKeyMessage(geminiStatus));
    }
    const mapsStatus = classifySecretCandidates(process.env.VITE_GOOGLE_MAPS_API_KEY, process.env.GOOGLE_MAPS_API_KEY);
    if (mapsStatus !== "usable") {
      console.warn(mapsKeyBanner(mapsStatus));
    }

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
