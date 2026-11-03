/** Missing means no value was supplied. Rejected means a value was supplied but it is an obvious placeholder. */
export type SecretStatus = "missing" | "rejected" | "usable";

function unwrap(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

/** Obvious stand-ins from .env.example. Real keys are never listed here. */
export function isPlaceholderSecret(value: string): boolean {
  const lower = unwrap(value).toLowerCase();
  if (!lower) return false;
  if (lower.startsWith("my_") || lower.startsWith("your_") || lower.includes("changeme")) return true;
  if (lower.includes("my_gemini") || lower.includes("my_google") || lower.includes("my_app")) return true;
  if (lower === "todo" || lower === "replace_me" || lower === "xxx") return true;
  return false;
}

export function classifySecret(value: unknown): SecretStatus {
  if (typeof value !== "string") return "missing";
  const trimmed = unwrap(value);
  if (!trimmed) return "missing";
  if (isPlaceholderSecret(trimmed) || trimmed.length < 10) return "rejected";
  return "usable";
}

export function isUsableSecret(value: unknown): value is string {
  return classifySecret(value) === "usable";
}

export function firstUsableSecret(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && classifySecret(value) === "usable") return unwrap(value);
  }
  return "";
}

/** Prefer a usable key. Otherwise surface rejection if any candidate was a placeholder. */
export function classifySecretCandidates(...values: unknown[]): SecretStatus {
  let sawRejected = false;
  for (const value of values) {
    const status = classifySecret(value);
    if (status === "usable") return "usable";
    if (status === "rejected") sawRejected = true;
  }
  return sawRejected ? "rejected" : "missing";
}

export function mapsKeyBanner(status: SecretStatus): string | null {
  if (status === "usable") return null;
  if (status === "rejected") {
    return "A Google Maps key was provided but rejected because it looks like a placeholder (such as MY_GOOGLE_MAPS_API_KEY). Showing OpenStreetMap.";
  }
  return "VITE_GOOGLE_MAPS_API_KEY is not set. Showing OpenStreetMap instead of Google Maps.";
}

export function geminiKeyMessage(status: SecretStatus): string {
  if (status === "rejected") {
    return "GEMINI_API_KEY was rejected because it looks like a placeholder (such as MY_GEMINI_API_KEY). The assistant is off and is not inventing prices or space counts.";
  }
  return "GEMINI_API_KEY is not set. The assistant is off and is not inventing prices or space counts. Use the map: TfL occupancy only when that feed is up, otherwise capacity and published rules.";
}
