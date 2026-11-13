export interface ParkedSession {
  name: string;
  lat: number;
  lng: number;
  startedAt: string;
  endsAt: string;
  warnedTen: boolean;
  warnedEnd: boolean;
}

const STORAGE_KEY = "spoton_parked_car";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStore(): KeyValueStore | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadParkedSession(store: KeyValueStore | null = browserStore()): ParkedSession | null {
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ParkedSession>;
    if (typeof parsed.name !== "string" || typeof parsed.lat !== "number" || typeof parsed.lng !== "number") return null;
    if (typeof parsed.startedAt !== "string" || typeof parsed.endsAt !== "string") return null;
    if (Number.isNaN(new Date(parsed.endsAt).getTime())) return null;
    return {
      name: parsed.name,
      lat: parsed.lat,
      lng: parsed.lng,
      startedAt: parsed.startedAt,
      endsAt: parsed.endsAt,
      warnedTen: Boolean(parsed.warnedTen),
      warnedEnd: Boolean(parsed.warnedEnd),
    };
  } catch {
    return null;
  }
}

export function saveParkedSession(session: ParkedSession, store: KeyValueStore | null = browserStore()): void {
  store?.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearParkedSession(store: KeyValueStore | null = browserStore()): void {
  store?.removeItem(STORAGE_KEY);
}

export function sessionEndingIn(minutes: number, now = new Date()): { startedAt: string; endsAt: string } {
  const safe = Math.max(1, Math.round(minutes));
  return {
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + safe * 60000).toISOString(),
  };
}

/** What the open tab should announce. Already-shown alerts stay quiet. */
export function timerPhase(nowMs: number, session: Pick<ParkedSession, "endsAt" | "warnedTen" | "warnedEnd">): "quiet" | "ten" | "ended" {
  const remain = new Date(session.endsAt).getTime() - nowMs;
  if (!Number.isFinite(remain)) return "quiet";
  if (remain <= 0) return session.warnedEnd ? "quiet" : "ended";
  if (remain <= 10 * 60 * 1000) return session.warnedTen ? "quiet" : "ten";
  return "quiet";
}

export function countdownLabel(nowMs: number, endsAt: string): string {
  const remain = new Date(endsAt).getTime() - nowMs;
  if (!Number.isFinite(remain) || remain <= 0) return "Time is up";
  const minutes = Math.ceil(remain / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${minutes} min left`;
  return `${hours}h ${rest}m left`;
}

export function walkingDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}
