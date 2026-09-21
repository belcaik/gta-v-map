import express from 'express'
import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { safeFile } from './media/files'
import type { Asset, Category, Tile, Waypoint } from '../../schemas/dataset'
import { apiResponse, dataset } from './contract'

const reservedPrefixes = ['/api', '/assets', '/tiles']

function isReservedPath(path: string) {
  return reservedPrefixes.some(prefix => path === prefix || path.startsWith(prefix + '/'))
}

export function createApp(db: Database.Database, root: string, staticRoot?: string) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '8kb' }))
  app.use((_request, response, next) => {
    response.set('X-Content-Type-Options', 'nosniff')
    response.set('Cross-Origin-Resource-Policy', 'same-origin')
    next()
  })
  const payloads = <Value>(query: string): Value[] =>
    (db.prepare(query).all() as { payload: string }[]).map(row => JSON.parse(row.payload))
  app.get('/api/health', (_request, response) => {
    try {
      const result = db.prepare('SELECT 1 AS ready').get() as { ready: number }
      if (result.ready !== 1) throw new Error('database is not ready')
      response.json({ status: 'ok', database: 'ready' })
    } catch {
      response.status(503).json({ status: 'error', database: 'unavailable' })
    }
  })
  app.get('/api/categories', (_request, response) => {
    const assets = new Map(payloads<Asset>('SELECT payload FROM assets').map(asset => [asset.id, asset]))
    const selection = db.prepare("SELECT value FROM metadata WHERE key='activeMaps'").get() as { value: string } | undefined
    const maps: string[] = selection ? JSON.parse(selection.value) : []
    const active = new Set(payloads<Waypoint>('SELECT payload FROM waypoints WHERE active=1').filter(point => maps.includes(point.mapId)).map(point => point.categoryId))
    const result = payloads<Category>('SELECT payload FROM categories').filter(category => active.has(category.id)).map(category => {
      const icon = category.iconAssetId ? assets.get(category.iconAssetId) || null : null
      return { category, icon, iconUrl: icon?.status === 'downloaded' ? '/assets/' + icon.id : null }
    })
    response.json(apiResponse('CategoryList', result))
  })
  app.get('/api/dataset', (_request, response) => {
    const metadata = db.prepare("SELECT value FROM metadata WHERE key='dataset'").get() as { value: string } | undefined
    if (!metadata) { response.status(404).json({ error: 'Sin dataset. Ejecuta npm run demo o importa dataset.json.' }); return }
    const selection = db.prepare("SELECT value FROM metadata WHERE key='activeMaps'").get() as { value: string } | undefined
    const activeMaps: string[] = selection ? JSON.parse(selection.value) : []
    const points = payloads<Waypoint>('SELECT payload FROM waypoints WHERE active=1').filter(point => activeMaps.includes(point.mapId))
    const categorySelection = db.prepare("SELECT value FROM metadata WHERE key='activeCategories'").get() as { value: string } | undefined
    const activeCategories = new Set<string>(categorySelection ? JSON.parse(categorySelection.value) : [])
    for (const point of points) activeCategories.add(point.categoryId)
    const categories = payloads<Category>('SELECT payload FROM categories').filter(category => activeCategories.has(category.id))
    const activeAssets = new Set(categories.map(category => category.iconAssetId))
    for (const point of points) for (const image of point.images) activeAssets.add(image.assetId)
    const merged = {
      ...JSON.parse(metadata.value), maps: payloads<{ id: string }>('SELECT payload FROM maps').filter(map => activeMaps.includes(map.id)),
      categories, assets: payloads<Asset>('SELECT payload FROM assets').filter(asset => activeAssets.has(asset.id)),
      waypoints: points, tiles: payloads<Tile>('SELECT payload FROM tiles').filter(tile => activeMaps.includes(tile.mapId)),
    }
    merged.coverage.discovered = Math.max(merged.coverage.discovered, points.length)
    response.json(dataset(merged))
  })
  app.get('/api/progress', (_request, response) => {
    const rows = db.prepare("SELECT map_id AS mapId,waypoint_id AS waypointId,found,updated_at AS updatedAt FROM progress WHERE game_id='gta-v'").all()
    response.json(apiResponse('ProgressList', rows))
  })
  app.put('/api/progress/:mapId/:id', (request, response) => {
    try { apiResponse('ProgressUpdate', request.body) } catch {
      response.status(400).json({ error: 'found must be boolean' }); return
    }
    const { mapId, id } = request.params
    if (!db.prepare("SELECT 1 FROM waypoints WHERE game_id='gta-v' AND map_id=? AND id=?").get(mapId, id)) {
      response.status(404).json({ error: 'Waypoint not found' }); return
    }
    const updatedAt = new Date().toISOString()
    db.prepare(`INSERT INTO progress VALUES ('gta-v',?,?,?,?)
      ON CONFLICT(game_id,map_id,waypoint_id) DO UPDATE SET found=excluded.found,updated_at=excluded.updated_at`)
      .run(mapId, id, Number(request.body.found), updatedAt)
    response.json(apiResponse('Progress', { mapId, waypointId: id, found: Number(request.body.found), updatedAt }))
  })
  app.get('/api/waypoints/:mapId/:id', (request, response) => {
    const row = db.prepare('SELECT payload FROM waypoints WHERE map_id=? AND id=? AND active=1')
      .get(request.params.mapId, request.params.id) as { payload: string } | undefined
    if (!row) { response.status(404).json({ error: 'Waypoint not found' }); return }
    const point: Waypoint = JSON.parse(row.payload)
    point.images.sort((left, right) => left.order - right.order)
    response.json(point)
  })
  if (staticRoot) app.use('/assets', express.static(join(staticRoot, 'assets')))
  const send = async (item: Asset | Tile | undefined, response: express.Response) => {
    if (!item || item.status !== 'downloaded' || !item.path) { response.status(404).json({ error: 'Local image unavailable' }); return }
    try {
      const path = await safeFile(root, item.path)
      response.type('png').sendFile(path)
    } catch { response.status(404).json({ error: 'Local image missing' }) }
  }
  app.get('/assets/:id', (request, response) => {
    const row = db.prepare('SELECT payload FROM assets WHERE id=?').get(request.params.id) as { payload: string } | undefined
    void send(row ? JSON.parse(row.payload) : undefined, response)
  })
  app.get('/tiles/:mapId/:z/:x/:y.png', (request, response) => {
    const { mapId, z, x, y } = request.params
    if (![z, x, y].every(value => /^\d+$/.test(value))) { response.sendStatus(404); return }
    const row = db.prepare('SELECT payload FROM tiles WHERE map_id=? AND z=? AND x=? AND y=?').get(mapId, z, x, y) as { payload: string } | undefined
    void send(row ? JSON.parse(row.payload) : undefined, response)
  })
  if (staticRoot) {
    app.use(express.static(staticRoot))
    app.get('*', (request, response, next) => {
      if (isReservedPath(request.path)) { next(); return }
      response.sendFile(join(staticRoot, 'index.html'), error => { if (error) next(error) })
    })
  }
  app.use((_request, response) => { response.status(404).json({ error: 'Not found' }) })
  app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error(error.message)
    response.status(500).json({ error: 'Local server error; check server log' })
  })
  return app
}
