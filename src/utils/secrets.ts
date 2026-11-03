/** Keys copied from .env.example, or the old hardcoded Maps demo key, are not usable. */
const BLOCKED_KEYS = new Set([
  "AIzaSyB_-zxjEEfja2TQLUXt85jsR2AkH61kEh4",
]);

export function isUsableSecret(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  if (trimmed.length < 10) return false;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("my_") || lower.startsWith("your_") || lower.includes("changeme")) return false;
  if (lower.includes("my_gemini") || lower.includes("my_google") || lower.includes("my_app")) return false;
  if (BLOCKED_KEYS.has(trimmed)) return false;
  return true;
}

export function firstUsableSecret(...values: unknown[]): string {
  for (const value of values) {
    if (isUsableSecret(value)) return value.trim().replace(/^["']|["']$/g, "");
  }
  return "";
}
