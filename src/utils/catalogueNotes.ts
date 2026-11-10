/** Catalogue rows without a source URL are not confirmed operator facts. */
export function isUnverifiedCatalogue(facility: {
  confidence?: string | null;
  sourceUrl?: string | null;
}): boolean {
  return facility.confidence === "unverified" || !facility.sourceUrl;
}

export function catalogueFieldLabel(facility: { confidence?: string | null; sourceUrl?: string | null }, field: string): string {
  return isUnverifiedCatalogue(facility) ? `Unverified catalogue note: ${field}` : field;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-10" -> "Checked 10 Nov 2026". */
export function checkedOnLabel(verifiedAt?: string | null): string | null {
  if (!verifiedAt) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(verifiedAt);
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return null;
  return `Checked ${Number(match[3])} ${month} ${match[1]}`;
}

export function isClosedCatalogue(facility: { stillOperating?: boolean | null }): boolean {
  return facility.stillOperating === false;
}

function gbp(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `£${value.toFixed(2)}`;
}

/** Hourly and daily rates may be null when the official tariff is banded. */
export function catalogueRateLines(facility: {
  hourlyRate?: number | null;
  dailyRate?: number | null;
  tariffNote?: string | null;
  notes?: string | null;
}): { primary: string; secondary: string } {
  const hourly = gbp(facility.hourlyRate);
  const daily = gbp(facility.dailyRate);
  if (hourly) return { primary: `${hourly}/hr`, secondary: daily ? `${daily}/day` : "No daily rate" };
  if (daily) return { primary: `${daily}/day`, secondary: "Daily tariff" };
  if (facility.tariffNote || facility.notes) return { primary: "See tariff bands", secondary: "No single rate published" };
  return { primary: "Rate unknown", secondary: "Not published" };
}
