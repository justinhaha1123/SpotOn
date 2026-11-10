/** Close the map info window when a filter or search drops the selected place. */
export function selectedPlaceLeftTheList(
  selectedId: string | null | undefined,
  visibleIds: readonly string[]
): boolean {
  if (!selectedId) return false;
  return !visibleIds.includes(selectedId);
}
