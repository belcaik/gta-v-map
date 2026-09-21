import type { Dataset } from '../schemas/dataset'
import { position } from './coordinates'

export function validateRelations(data: Dataset): void {
  const require = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message)
  }
  const unique = (values: string[], label: string) => {
    require(new Set(values).size === values.length, 'Duplicate ' + label)
  }
  unique(data.maps.map(item => item.id), 'map')
  unique(data.categories.map(item => item.id), 'category')
  unique(data.assets.map(item => item.id), 'asset')
  unique(data.waypoints.map(item => item.mapId + '/' + item.id), 'waypoint')
  unique(data.tiles.map(item => [item.mapId, item.z, item.x, item.y].join('/')), 'tile')
  require(data.maps.length > 0, 'At least one map required')
  require(data.coverage.discovered >= data.waypoints.length, 'Invalid discovered count')
  const assets = new Map(data.assets.map(item => [item.id, item]))
  const maps = new Map(data.maps.map(item => [item.id, item]))
  const categories = new Set(data.categories.map(item => item.id))
  for (const map of data.maps) {
    require(map.bounds.flat().every(Number.isFinite), 'Non-finite bounds')
    require(map.minZoom <= map.maxZoom && map.maxZoom <= 22, 'Invalid zoom')
    require(map.bounds[0][0] < map.bounds[1][0] && map.bounds[0][1] < map.bounds[1][1], 'Invalid bounds')
    require(map.tileTemplate === '/tiles/' + map.id + '/{z}/{x}/{y}.png', 'Invalid local tile template')
    require(map.transform.every(Number.isFinite), 'Non-finite transform')
  }
  for (const asset of data.assets) {
    if (asset.status === 'downloaded') {
      require(asset.path && asset.sha256 && asset.mime && asset.bytes && asset.width && asset.height, 'Downloaded asset lacks metadata')
      require(asset.path === (asset.kind === 'category-icon' ? 'icons/' : 'images/') + asset.sha256 + '.png', 'Asset path/hash mismatch')
    } else {
      require(asset.path === null, 'Undownloaded asset has path')
    }
    require(asset.status !== 'failed' || asset.error, 'Failed asset lacks reason')
  }
  for (const category of data.categories) {
    require(category.iconAssetId ? assets.get(category.iconAssetId)?.kind === 'category-icon' : category.iconReason, 'Invalid category icon')
  }
  for (const point of data.waypoints) {
    const map = maps.get(point.mapId)
    require(map && categories.has(point.categoryId), 'Orphan waypoint')
    require(Number.isFinite(point.coordinates.x) && Number.isFinite(point.coordinates.y), 'Non-finite coordinates')
    if (map) {
      const [lat, lng] = position(map, point.coordinates)
      require(lat >= map.bounds[0][0] && lat <= map.bounds[1][0] && lng >= map.bounds[0][1] && lng <= map.bounds[1][1], 'Coordinates outside bounds')
    }
    unique(point.images.map(item => String(item.order)), 'image order')
    require(point.images.every(item => assets.get(item.assetId)?.kind === 'waypoint-image'), 'Orphan or wrong-kind image')
    require(point.imageDiscovery === 'present' ? point.images.length > 0 : point.images.length === 0, 'Discovery/images mismatch')
    require(point.imageDiscovery !== 'failed' || point.discoveryError, 'Failed discovery lacks reason')
  }
  for (const tile of data.tiles) {
    const map = maps.get(tile.mapId)
    require(map && tile.z >= map.minZoom && tile.z <= map.maxZoom, 'Invalid tile map/zoom')
    require(tile.status !== 'downloaded' || (tile.sha256 && tile.path === 'tiles/' + [tile.mapId, tile.z, tile.x, tile.y].join('/') + '.png'), 'Invalid downloaded tile')
    require(tile.status === 'downloaded' || tile.path === null, 'Undownloaded tile has path')
    require(tile.status !== 'failed' || tile.error, 'Failed tile lacks reason')
  }
  if (data.coverage.complete) {
    require(data.coverage.filters.length === 0 && data.coverage.omissions.length === 0 && data.coverage.discovered === data.waypoints.length, 'Incomplete coverage')
    require(data.waypoints.every(item => ['none', 'present'].includes(item.imageDiscovery)), 'Incomplete discovery')
    require([...data.assets, ...data.tiles].every(item => item.status === 'downloaded'), 'Incomplete downloads')
  }
}
