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
