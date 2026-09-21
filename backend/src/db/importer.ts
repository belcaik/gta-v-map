import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type Database from 'better-sqlite3'
import { dataset } from '../contract'
import { installFiles } from '../media/files'

export async function importDataset(db: Database.Database, filename: string, root: string) {
  const data = dataset(JSON.parse(await readFile(filename, 'utf8')))
  await installFiles(data, dirname(filename), root)
  db.transaction(() => {
    const upsertPayload = (table: string, id: string, payload: unknown) =>
      db.prepare('INSERT INTO ' + table + ' (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload')
        .run(id, JSON.stringify(payload))
    for (const map of data.maps) upsertPayload('maps', map.id, map)
    for (const asset of data.assets) upsertPayload('assets', asset.id, asset)
    for (const category of data.categories) db.prepare(`
      INSERT INTO categories (id,icon_id,payload) VALUES (?,?,?)
      ON CONFLICT(id) DO UPDATE SET icon_id=excluded.icon_id,payload=excluded.payload
    `).run(category.id, category.iconAssetId, JSON.stringify(category))
    if (data.coverage.complete) {
      for (const map of data.maps) db.prepare('UPDATE waypoints SET active=0 WHERE map_id=?').run(map.id)
    }
    for (const point of data.waypoints) {
      db.prepare(`INSERT INTO waypoints (game_id,map_id,id,category_id,payload,active) VALUES ('gta-v',?,?,?,?,1)
        ON CONFLICT(game_id,map_id,id) DO UPDATE SET category_id=excluded.category_id,payload=excluded.payload,active=1`)
        .run(point.mapId, point.id, point.categoryId, JSON.stringify(point))
      db.prepare("DELETE FROM waypoint_images WHERE game_id='gta-v' AND map_id=? AND waypoint_id=?").run(point.mapId, point.id)
      for (const image of point.images) db.prepare("INSERT INTO waypoint_images VALUES ('gta-v',?,?,?,?,?)")
        .run(point.mapId, point.id, image.assetId, image.order, JSON.stringify(image))
    }
    for (const tile of data.tiles) db.prepare(`INSERT INTO tiles VALUES (?,?,?,?,?)
      ON CONFLICT(map_id,z,x,y) DO UPDATE SET payload=excluded.payload`)
      .run(tile.mapId, tile.z, tile.x, tile.y, JSON.stringify(tile))
    const { maps: _maps, categories: _categories, assets: _assets, waypoints: _waypoints, tiles: _tiles, ...metadata } = data
    db.prepare("INSERT INTO metadata VALUES ('dataset',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(metadata))
    db.prepare("INSERT INTO metadata VALUES ('activeMaps',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(data.maps.map(map => map.id)))
    db.prepare("INSERT INTO metadata VALUES ('activeCategories',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(data.categories.map(category => category.id)))
  })()
  return { waypoints: data.waypoints.length, assets: data.assets.length, complete: data.coverage.complete }
}
