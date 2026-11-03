export interface NearbyJamCam {
  id: string;
  name: string;
  imageUrl: string;
  videoUrl?: string;
  distanceMeters: number;
  available?: boolean;
  lat?: number;
  lng?: number;
}

/** What a driver can do at an on-street bay right now. Never a free-space count. */
export type CanParkNow = "pay" | "restricted" | "outside_hours" | "unknown";

export interface OnStreetBay {
  id: string;
  roadName: string;
  lat: number;
  lng: number;
  borough: string;
  restrictionType: string | null;
  timesOfOperation: string | null;
  maximumStay: string | null;
  tariff: string | null;
  /** Marked spaces or OSM capacity. Never a live free-space count. */
  capacity: number | null;
  cpz: string | null;
  postcode: string | null;
  source: "camden-open-data" | "openstreetmap";
  sourceLabel: string;
  sourceUrl: string;
  lastUpdated: string | null;
  canParkNow: CanParkNow;
  summary: string;
  distanceMeters?: number;
}

export interface OnStreetSourceStatus {
  id: string;
  status: "ok" | "unavailable";
  count: number;
  detail: string;
}

export type ParkingCategory =
  | 'private_driveway'
  | 'gated_mews'
  | 'hotel_forecourt'
  | 'commercial_multistorey'
  | 'station_park_ride'
  | 'surface'
  | 'on_street_sensor'
  | 'designated_disabled_bay';

export interface CommunityLiveUpdate {
  userId: string;
  userName: string;
  updatedAt: string;
  submittedAt: string;
  previousAvailable: number;
  newAvailable: number;
  evBaysAvailable?: number;
  disabledBaysAvailable?: number;
  notes?: string;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  verifiedContributor: boolean;
  updatesCount: number;
  loginTime: string;
  encryptionSecurity: string;
}

export interface ParkingFacility {
  id: string;
  name: string;
  operator: string;
  parkingCategory: ParkingCategory;
  categoryLabel: string;
  address: string;
  postcode: string;
  borough: string | null;
  lat: number;
  lng: number;
  totalSpaces: number | null;
  occupiedSpaces: number | null;
  availableSpaces: number | null;
  occupancyRate?: number | null;
  status?: 'available' | 'filling_fast' | 'almost_full' | 'full' | null;
  hourlyRate: number | null;
  dailyRate: number | null;
  saturdayRate?: number | null;
  sundayRate?: number | null;
  eveningRate?: number | null;
  heightRestriction: number | null;
  spaceDimensions?: string | null;
  accessInstructions?: string | null;
  securityType?: string | null;
  evChargingBays: number | null;
  evChargingSpeedKw?: number | null;
  evChargingSpeedLabel?: string | null;
  hasFastCharger?: boolean | null;
  hasEvCharging?: boolean | null;
  disabledBays: number | null;
  openHours: string | null;
  cctvMonitoring: boolean | null;
  zone: number | null;
  zoneLabel: string | null;
  hasLiveCam: boolean;
  source?: "seed" | "tfl";
  /** Shown beside a price so catalogue or cashless figures are not read as a confirmed quote. */
  tariffNote?: string | null;
  sourceUrl: string | null;       // operator page the static fields came from
  verifiedAt: string | null;      // LEGACY: seed=null; tfl=TfL `modified` stamp (NOT a verification date). Superseded by provenance[field].checkedOn / upstreamModified
  provenance?: FacilityProvenance; // policy B per-field provenance; filled by mapper (Step 10). Key absent = not yet migrated; null = explicitly unsourced.
  notes: string | null;
  stillOperating?: boolean | null;
  congestionChargeZone?: boolean | null;
  paymentMethods?: string | null;
  staffed?: boolean | null;
  confidence?: "live" | "static" | "unverified";
  lastUpdated?: string | null;
  jamCam?: {
    id: string;
    commonName: string;
    lat: number;
    lon: number;
    imageUrl: string | null;
    videoUrl: string | null;
  } | null;
  jamCamDistanceM?: number | null;
  nearestTflJamCam?: NearbyJamCam;
  distanceFromUserKm?: number;
  distanceFromUserMiles?: number;
  estimatedDriveTimeMin?: number;
  lastCommunityUpdate?: CommunityLiveUpdate;
}

export interface RouteStep {
  id: string;
  instruction: string;
  streetName: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuver: 'straight' | 'turn-left' | 'turn-right' | 'slight-left' | 'slight-right' | 'roundabout' | 'arrive';
}

export interface NavigationSession {
  sessionId: string;
  facility: ParkingFacility;
  coordinates: [number, number][];
  steps: RouteStep[];
  currentStepIndex: number;
  distanceKm: number;
  durationMinutes: number;
  eta: string;
  currentVehiclePos: [number, number];
  speedKmh: number | null;
  heading: number | null;
  offRoute: boolean;
  arrived: boolean;
  locationError: string | null;
  voiceAnnouncementsEnabled: boolean;
  isDrivingMode?: boolean;
  nightMode?: boolean;
}

export type FilterType =
  | 'all'
  | 'carpark'
  | 'off_street'
  | 'ev'
  | 'disabled'
  | 'no_congestion_charge'
  | 'private_driveways'
  | 'gated_mews'
  | 'hotel_forecourts'
  | 'on_street_sensors'
  | 'commercial_multistorey'
  | 'commercial_car_parks'
  | 'available'
  | 'fast_charging'
  | 'low_cost'
  | 'high_clearance';

export interface VehicleProfile {
  vehicleType: 'ev' | 'hybrid' | 'petrol_diesel' | 'suv' | 'van';
  registrationPlate: string;
  heightMeters: number;
  isBlueBadgeHolder: boolean;
}

export interface ParkingReservation {
  bookingId: string;
  facilityId: string;
  facilityName: string;
  facilityAddress: string;
  bayId: string;
  bayNumber: string;
  floor: string;
  vehiclePlate: string;
  arrivalDate: string;
  arrivalTime: string;
  durationHours: number;
  totalPriceFormatted: string;
  accessInstructions?: string;
  createdAt: string;
  qrCodePayload: string;
}

export interface MapAreaSearch {
  center: { lat: number; lng: number };
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  radiusKm: number;
  label?: string;
  categoryFilter?: 'all' | 'driveways' | 'off_street' | 'car_parks';
}

export interface VisitedParkingHistory {
  id: string;
  name: string;
  address: string;
  postcode?: string;
  hourlyRate: number | null;
  categoryLabel?: string;
  lat: number;
  lng: number;
  visitedAt: string;
}

// ---------------------------------------------------------------------------
// Provenance (policy B: verified > api > null). Added Step 9b, 2026-10-26.
// ---------------------------------------------------------------------------
export type SourceTier = 'verified' | 'api';
export type SourceKind = 'image' | 'pdf' | 'html' | 'tfl-api' | 'user';
/** = verification/seed-verification.csv verify_status, plus 'confirmed' (legal; 0 rows today). */
export type VerifyOutcome = 'confirmed' | 'mismatch' | 'unreachable' | 'unverified' | 'api-match';

export interface SourceRef {
  tier: SourceTier;
  kind: SourceKind;
  outcome: VerifyOutcome;
  url: string | null;
  checkedOn: string;                // YYYY-MM-DD — the date WE checked. Never a feed's `modified`.
  upstreamModified: string | null;  // the feed's own stamp (TfL `modified`) lives here.
  note: string | null;
}

/** Invariant: value === null  <=>  source === null. No other combination is legal. */
export type SourcedValue<T> =
  | { value: T; source: SourceRef }
  | { value: null; source: null };

export const unsourced = <T,>(): SourcedValue<T> => ({ value: null, source: null });
export const hasSource = <T,>(v: SourcedValue<T>): v is { value: T; source: SourceRef } => v.source !== null;
/** Only these outcomes mean the value itself was corroborated. The others record that a check was attempted. */
export const isCorroborated = (s: SourceRef | null): boolean =>
  s !== null && (s.outcome === 'confirmed' || s.outcome === 'api-match');

/** Fields that carry per-field provenance. Identity/geometry fields (id, name, lat, lng) are deliberately excluded. */
export type ProvenancedField =
  | 'operator' | 'address' | 'postcode' | 'borough'
  | 'totalSpaces' | 'disabledBays'
  | 'hourlyRate' | 'dailyRate' | 'saturdayRate' | 'sundayRate' | 'eveningRate'
  | 'heightRestriction' | 'openHours'
  | 'hasEvCharging' | 'evChargingBays' | 'evChargingSpeedKw'
  | 'cctvMonitoring' | 'staffed' | 'securityType' | 'paymentMethods'
  | 'congestionChargeZone' | 'stillOperating' | 'notes'
  | 'spaceDimensions' | 'accessInstructions';

/** Key absent = not yet migrated; null = explicitly unsourced (render as "not confirmed", never as a value). */
export type FacilityProvenance = Partial<Record<ProvenancedField, SourceRef | null>>;

// --- opening hours: structured + raw retained ---
export type Day = 'Mo' | 'Tu' | 'We' | 'Th' | 'Fr' | 'Sa' | 'Su';
export interface TimeWindow { days: Day[]; from: string; to: string; }   // "08:00" .. "18:30"
export interface OpeningHours {
  always: boolean | null;        // true = 24h; null = unknown
  periods: TimeWindow[] | null;  // null = unparsed -> UI shows `raw`
  raw: string;                   // "Mo-Su 24 Hr" — never discarded
}

// --- tariffs: banded, per channel (cash != cashless on 57/58 TfL rows) ---
export type PaymentChannel = 'cash' | 'cashless';
export interface TariffBand {
  channel: PaymentChannel | null; // null = applies to both
  when: TimeWindow[] | null;      // null = any time
  upToMin: number | null;         // null = beyond last band / flat
  priceGbp: number;
}
export interface Tariff { bands: TariffBand[]; raw: string; }

// --- EV: restriction qualifier (Liberty: 12 bays, Tesla Supercharger only) ---
export interface EvRestriction {
  network: string | null;         // "Tesla Supercharger"
  vehiclesOnly: string | null;    // "Tesla"
  freeMinutes: number | null;
  maxSessionsPer24h: number | null;
  raw: string;
}
export interface EvCharging {
  available: SourcedValue<boolean>;
  bays: SourcedValue<number>;
  speedKw: SourcedValue<number>;
  restriction: SourcedValue<EvRestriction>;
}
