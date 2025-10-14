const EARTH_RADIUS_M = 6371000;

export interface GridCell {
  gridId: string;
  count: number;
  center: {
    lng: number;
    lat: number;
  };
  points: Array<{ lng: number; lat: number }>;
}

export function haversineDistanceMeters(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_M * c;
}

export function gridIdForPoint(
  point: { lng: number; lat: number },
  gridSizeMeters: number,
  originLng = 0,
  originLat = 0
): string {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = Math.cos((point.lat * Math.PI) / 180) * metersPerDegreeLat;

  const xMeters = (point.lng - originLng) * metersPerDegreeLng;
  const yMeters = (point.lat - originLat) * metersPerDegreeLat;

  const gridX = Math.floor(xMeters / gridSizeMeters);
  const gridY = Math.floor(yMeters / gridSizeMeters);
  return `${gridX}:${gridY}`;
}

export function aggregateToGrid(
  points: Array<{ lng: number; lat: number }>,
  gridSizeMeters: number
): GridCell[] {
  const buckets = new Map<string, GridCell>();

  for (const point of points) {
    const gridId = gridIdForPoint(point, gridSizeMeters);
    let bucket = buckets.get(gridId);
    if (!bucket) {
      bucket = {
        gridId,
        count: 0,
        center: { lng: 0, lat: 0 },
        points: [],
      };
      buckets.set(gridId, bucket);
    }
    bucket.count += 1;
    bucket.center.lng += point.lng;
    bucket.center.lat += point.lat;
    bucket.points.push(point);
  }

  for (const bucket of buckets.values()) {
    if (bucket.count > 0) {
      bucket.center.lng /= bucket.count;
      bucket.center.lat /= bucket.count;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => b.count - a.count);
}
