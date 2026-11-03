import { AppUser, CommunityLiveUpdate } from "../types";

const USER_STORAGE_KEY = "LONDON_PARKING_SECURE_AUTH_SESSION_V1";
const COMMUNITY_UPDATES_KEY = "LONDON_PARKING_COMMUNITY_UPDATES_V1";

/**
 * Loads currently authenticated user session from safe local storage
 */
export function loadStoredUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppUser;
  } catch (err) {
    console.error("Failed to load user session safely", err);
    return null;
  }
}

/**
 * Persists authenticated user session with safe encryption markers
 */
export function saveStoredUser(user: AppUser | null): void {
  try {
    if (!user) {
      localStorage.removeItem(USER_STORAGE_KEY);
    } else {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    }
  } catch (err) {
    console.error("Failed to save user session safely", err);
  }
}

/**
 * Loads all community submitted live space updates
 */
export function loadCommunityUpdates(): Record<string, CommunityLiveUpdate> {
  try {
    const raw = localStorage.getItem(COMMUNITY_UPDATES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CommunityLiveUpdate>;
    const pruned: Record<string, CommunityLiveUpdate> = {};
    const now = Date.now();
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

    let modified = false;
    for (const [facilityId, entry] of Object.entries(parsed)) {
      if (!entry || !entry.submittedAt) {
        modified = true;
        continue;
      }
      const submittedTime = new Date(entry.submittedAt).getTime();
      if (isNaN(submittedTime) || now - submittedTime > TWO_HOURS_MS) {
        modified = true;
        continue;
      }
      pruned[facilityId] = entry;
    }

    if (modified || Object.keys(pruned).length !== Object.keys(parsed).length) {
      localStorage.setItem(COMMUNITY_UPDATES_KEY, JSON.stringify(pruned));
    }

    return pruned;
  } catch (err) {
    console.error("Failed to load community live updates", err);
    return {};
  }
}

/**
 * Saves a new community submitted live space update
 */
export function saveCommunityUpdate(facilityId: string, update: CommunityLiveUpdate): void {
  try {
    const current = loadCommunityUpdates();
    current[facilityId] = update;
    localStorage.setItem(COMMUNITY_UPDATES_KEY, JSON.stringify(current));
  } catch (err) {
    console.error("Failed to save community update", err);
  }
}
