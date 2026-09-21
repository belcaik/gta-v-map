import type { MapConfig, Waypoint } from '../schemas/dataset'

export function position(map: MapConfig, coordinates: Waypoint['coordinates']): [number, number] {
  const [latX, latY, latOffset, lngX, lngY, lngOffset] = map.transform
  return [
    latX * coordinates.x + latY * coordinates.y + latOffset,
    lngX * coordinates.x + lngY * coordinates.y + lngOffset,
  ]
}
