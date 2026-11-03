import type { OnStreetBay, OnStreetSourceStatus } from "../types.js";
import { describeCamdenBay, describeOsmOnStreet } from "../utils/parkingHours.js";

const CAMDEN_RESOURCE = "https://opendata.camden.gov.uk/resource/7hiv-3r9k.json";
const CAMDEN_ABOUT = "https://www.data.gov.uk/dataset/563a5530-a7a2-46aa-925e-41fe09de7ea3/parking-bays";
const OSM_MAP = "https://api.openstreetmap.org/api/0.6/map";

export const ON_STREET_COVERAGE_NOTE =
  "No public feed publishes live free on-street bays for every London borough. Camden Council publishes bay rules and capacity (not occupancy) as open data. OpenStreetMap supplies kerb geometry where it has been mapped, often with no hours. Westminster and most other boroughs do not offer an equivalent open occupancy API. A realistic option for live bay counts is a data agreement with each borough, or a commercial kerb product. Counts shown here are marked capacity, never free spaces.";

interface CacheEntry {
  at: number;
  payload: OnStreetPayload;
}

export interface OnStreetPayload {
  bays: OnStreetBay[];
  note: string;
  sources: OnStreetSourceStatus[];
}

const cache = new Map<string, CacheEntry>();
const OK_TTL_MS = 30 * 60 * 1000;
const FAIL_TTL_MS = 60 * 1000;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function clean(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || /^n\/?a$/i.test(text)) return null;
  return text;
}

async function fetchCamden(lat: number, lng: number, radiusM: number): Promise<{ bays: OnStreetBay[]; status: OnStreetSourceStatus }> {
  const where = `within_circle(location, ${lat}, ${lng}, ${Math.round(radiusM)})`;
  const params = new URLSearchParams({
    $select: [
      "unique_identifier",
      "road_name",
      "postcode",
      "restriction_type",
      "times_of_operation",
      "maximum_stay",
      "tariff",
      "parking_spaces",
      "controlled_parking_zone",
      "latitude",
      "longitude",
      "last_uploaded",
    ].join(","),
    $where: where,
    $limit: "80",
  });

  try {
    const res = await fetch(`${CAMDEN_RESOURCE}?${params.toString()}`, {
      headers: { Accept: "application/json", "User-Agent": "SpotOnLondonParking/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        bays: [],
        status: {
          id: "camden-open-data",
          status: "unavailable",
          count: 0,
          detail: `Camden parking-bays feed returned HTTP ${res.status}.`,
        },
      };
    }
    const rows = (await res.json()) as Record<string, unknown>[];
    const bays: OnStreetBay[] = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const bayLat = asNumber(row.latitude);
      const bayLng = asNumber(row.longitude);
      if (bayLat == null || bayLng == null) continue;
      const described = describeCamdenBay({
        restrictionType: clean(row.restriction_type),
        times: clean(row.times_of_operation),
        maximumStay: clean(row.maximum_stay),
        tariff: clean(row.tariff),
      });
      const id = String(row.unique_identifier || `${bayLat},${bayLng}`);
      bays.push({
        id: `camden-${id}`,
        roadName: clean(row.road_name) ?? "Camden parking bay",
        lat: bayLat,
        lng: bayLng,
        borough: "Camden",
        restrictionType: clean(row.restriction_type),
        timesOfOperation: clean(row.times_of_operation),
        maximumStay: clean(row.maximum_stay),
        tariff: clean(row.tariff),
        capacity: asNumber(row.parking_spaces),
        cpz: clean(row.controlled_parking_zone),
        postcode: clean(row.postcode),
        source: "camden-open-data",
        sourceLabel: "Camden Council open data",
        sourceUrl: CAMDEN_ABOUT,
        lastUpdated: clean(row.last_uploaded),
        canParkNow: described.canParkNow,
        summary: described.summary,
        distanceMeters: Math.round(haversineMeters(lat, lng, bayLat, bayLng)),
      });
    }
    bays.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
    const limited = bays.slice(0, 40);
    return {
      bays: limited,
      status: {
        id: "camden-open-data",
        status: "ok",
        count: limited.length,
        detail: limited.length
          ? "Bay rules and capacity from Camden’s parking-bays dataset. Occupancy is not in this feed."
          : "No Camden bays in this radius. Camden’s dataset does not cover other boroughs.",
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "request failed";
    return {
      bays: [],
      status: {
        id: "camden-open-data",
        status: "unavailable",
        count: 0,
        detail: `Camden parking-bays feed could not be reached (${message}).`,
      },
    };
  }
}

function parseOsmOnStreet(xml: string, originLat: number, originLng: number): OnStreetBay[] {
  const nodes = new Map<string, { lat: number; lng: number }>();
  const nodeRe = /<node id="(\d+)"[^>]*\blat="([\d.-]+)"\blon="([\d.-]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = nodeRe.exec(xml))) {
    nodes.set(match[1], { lat: Number(match[2]), lng: Number(match[3]) });
  }

  const bays: OnStreetBay[] = [];
  const blockRe = /<(node|way) id="(\d+)"([^>]*)>([\s\S]*?)<\/\1>/g;
  while ((match = blockRe.exec(xml))) {
    const kind = match[1];
    const osmId = match[2];
    const attrs = match[3];
    const body = match[4];
    if (!body.includes('k="parking"') && !body.includes("parking:lane") && !body.includes("parking:condition")) {
      continue;
    }
    const tags: Record<string, string> = {};
    const tagRe = /<tag k="([^"]+)" v="([^"]*)"\s*\/>/g;
    let tag: RegExpExecArray | null;
    while ((tag = tagRe.exec(body))) tags[tag[1]] = decodeXml(tag[2]);

    const parking = tags.parking || "";
    const onStreet =
      parking === "street_side" ||
      parking === "lane" ||
      parking === "on_street" ||
      Object.keys(tags).some((key) => key.startsWith("parking:lane") || key.startsWith("parking:condition"));
    if (!onStreet) continue;

    let lat: number | null = null;
    let lng: number | null = null;
    const latMatch = attrs.match(/\blat="([\d.-]+)"/);
    const lngMatch = attrs.match(/\blon="([\d.-]+)"/);
    if (latMatch && lngMatch) {
      lat = Number(latMatch[1]);
      lng = Number(lngMatch[1]);
    } else {
      const nds = [...body.matchAll(/<nd ref="(\d+)"\s*\/>/g)].map((item) => item[1]);
      let sumLat = 0;
      let sumLng = 0;
      let count = 0;
      for (const ref of nds) {
        const point = nodes.get(ref);
        if (!point) continue;
        sumLat += point.lat;
        sumLng += point.lng;
        count += 1;
      }
      if (count > 0) {
        lat = sumLat / count;
        lng = sumLng / count;
      }
    }
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const described = describeOsmOnStreet(tags);
    const capacity = asNumber(tags.capacity);
    bays.push({
      id: `osm-${kind}-${osmId}`,
      roadName: tags.name || tags["addr:street"] || "On-street parking",
      lat,
      lng,
      borough: "Mapped in OpenStreetMap",
      restrictionType: described.restrictionType,
      timesOfOperation: described.times,
      maximumStay: described.maximumStay,
      tariff: described.tariff,
      capacity,
      cpz: null,
      postcode: tags["addr:postcode"] || null,
      source: "openstreetmap",
      sourceLabel: "OpenStreetMap",
      sourceUrl: `https://www.openstreetmap.org/${kind}/${osmId}`,
      lastUpdated: null,
      canParkNow: described.canParkNow,
      summary: described.summary,
      distanceMeters: Math.round(haversineMeters(originLat, originLng, lat, lng)),
    });
  }

  bays.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  return bays.slice(0, 30);
}

async function fetchOsm(lat: number, lng: number, radiusM: number): Promise<{ bays: OnStreetBay[]; status: OnStreetSourceStatus }> {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((n) => n.toFixed(6)).join(",");
  try {
    const res = await fetch(`${OSM_MAP}?bbox=${bbox}`, {
      headers: {
        Accept: "application/xml",
        "User-Agent": "SpotOnLondonParking/1.0 (on-street restriction lookup)",
      },
      signal: AbortSignal.timeout(18000),
    });
    if (!res.ok) {
      return {
        bays: [],
        status: {
          id: "openstreetmap",
          status: "unavailable",
          count: 0,
          detail: `OpenStreetMap map API returned HTTP ${res.status}.`,
        },
      };
    }
    const xml = await res.text();
    const bays = parseOsmOnStreet(xml, lat, lng);
    return {
      bays,
      status: {
        id: "openstreetmap",
        status: "ok",
        count: bays.length,
        detail: bays.length
          ? "On-street geometry from OpenStreetMap. Hours are shown only when a mapper tagged them."
          : "No on-street parking was tagged in OpenStreetMap for this small area.",
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "request failed";
    return {
      bays: [],
      status: {
        id: "openstreetmap",
        status: "unavailable",
        count: 0,
        detail: `OpenStreetMap could not be reached (${message}).`,
      },
    };
  }
}

export async function fetchOnStreetRestrictions(lat: number, lng: number, radiusM: number): Promise<OnStreetPayload> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${radiusM}`;
  const hit = cache.get(key);
  if (hit) {
    const failed = hit.payload.sources.some((source) => source.status === "unavailable");
    const age = Date.now() - hit.at;
    if (age < (failed ? FAIL_TTL_MS : OK_TTL_MS)) return hit.payload;
  }

  const camdenRadius = Math.min(2000, Math.max(radiusM, 900));
  const osmRadius = Math.min(450, radiusM);
  const camdenPromise = fetchCamden(lat, lng, camdenRadius);
  const osmPromise = fetchOsm(lat, lng, osmRadius);
  const camden = await camdenPromise;
  const quickOsm = await Promise.race([
    osmPromise.then((value) => ({ kind: "done" as const, value })),
    new Promise<{ kind: "timeout" }>((resolve) => {
      setTimeout(() => resolve({ kind: "timeout" }), 3500);
    }),
  ]);
  const osm = quickOsm.kind === "done"
    ? quickOsm.value
    : {
        bays: [] as OnStreetBay[],
        status: {
          id: "openstreetmap",
          status: "unavailable" as const,
          count: 0,
          detail:
            "OpenStreetMap’s full-map extract is large in central London and did not return in time. Refresh once in a few seconds. It is mapped geometry, not live occupancy.",
        },
      };

  const payload: OnStreetPayload = {
    bays: [...camden.bays, ...osm.bays],
    note: ON_STREET_COVERAGE_NOTE,
    sources: [camden.status, osm.status],
  };
  cache.set(key, { at: Date.now(), payload });
  if (quickOsm.kind === "timeout") {
    osmPromise.then((finished) => {
      cache.set(key, {
        at: Date.now(),
        payload: {
          bays: [...camden.bays, ...finished.bays],
          note: ON_STREET_COVERAGE_NOTE,
          sources: [camden.status, finished.status],
        },
      });
    }).catch(() => {});
  }
  return payload;
}
