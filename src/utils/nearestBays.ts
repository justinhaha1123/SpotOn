export function selectNearestBays<T extends { id: string; distanceMeters?: number }>(bays: T[], limit: number): T[] {
  return [...bays]
    .sort((a, b) => {
      const delta = (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY);
      if (delta !== 0) return delta;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, limit);
}
