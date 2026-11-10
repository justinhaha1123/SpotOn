export interface KnownFacility {
  id: string;
  lat?: number;
  lng?: number;
}

const known = new Map<string, KnownFacility>();

export function registerFacilities(items: KnownFacility[]): void {
  for (const item of items) {
    if (!item?.id) continue;
    const previous = known.get(item.id);
    known.set(item.id, {
      id: item.id,
      lat: typeof item.lat === "number" ? item.lat : previous?.lat,
      lng: typeof item.lng === "number" ? item.lng : previous?.lng,
    });
  }
}

export function isKnownFacility(id: string): boolean {
  return known.has(id);
}

export function knownFacilityIds(): ReadonlySet<string> {
  return new Set(known.keys());
}

export function facilitiesNear(lat: number, lng: number, radiusM: number): string[] {
  const ids: string[] = [];
  for (const facility of known.values()) {
    if (typeof facility.lat !== "number" || typeof facility.lng !== "number") continue;
    if (distanceMeters(lat, lng, facility.lat, facility.lng) <= radiusM) ids.push(facility.id);
  }
  return ids;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
