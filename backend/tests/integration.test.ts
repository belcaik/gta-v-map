import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { openDatabase } from '../src/db/schema'
import { importDataset } from '../src/db/importer'
import { createApp } from '../src/app'
import { dataset } from '../src/contract'
import { safeFile } from '../src/media/files'
import { position } from '../../shared/coordinates'
import type { Dataset } from '../../schemas/dataset'

test('contract, atomic imports, durable progress, partial/full policy, API and safe assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gta-test-'))
  const repo = resolve('..')
  const python = process.env.PYTHON || resolve(repo, '.venv/bin/python')
  execFileSync(python, ['-m', 'scraper.demo', '--output', join(root, 'source')], { cwd: repo })
  const filename = join(root, 'source/dataset.json')
  const original: Dataset = JSON.parse(await readFile(filename, 'utf8'))
  const data = dataset(original)
  const cases = JSON.parse(await readFile(resolve(repo, 'fixtures/contract-cases.json'), 'utf8')) as {
    name: string; path: (string | number)[]; value: unknown; valid: boolean
  }[]
  for (const scenario of cases) {
    const mutated = structuredClone(original)
    let parent: unknown = mutated
    for (const key of scenario.path.slice(0, -1)) parent = (parent as Record<string, unknown>)[key]
    ;(parent as Record<string, unknown>)[scenario.path.at(-1)!] = scenario.value
    if (scenario.valid) assert.doesNotThrow(() => dataset(mutated), scenario.name)
    else assert.throws(() => dataset(mutated), undefined, scenario.name)
  }
  assert.deepEqual(position(data.maps[0], { x: -80, y: 55 }), [-80, 55])
  const invalid = structuredClone(data)
  invalid.waypoints[0].coordinates.x = Number.NaN
  assert.throws(() => dataset(invalid))
  const dbPath = join(root, 'runtime/map.db')
  let db = openDatabase(dbPath)
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined
  try {
    await importDataset(db, filename, join(root, 'runtime'))
    db.prepare("INSERT INTO progress VALUES ('gta-v','demo','102',1,'2026-09-21')").run()
    await importDataset(db, filename, join(root, 'runtime'))
    assert.equal((db.prepare('SELECT count(*) AS count FROM waypoints').get() as { count: number }).count, 6)
    assert.equal((db.prepare('SELECT found FROM progress').get() as { found: number }).found, 1)
    const partial = structuredClone(data)
    partial.waypoints = partial.waypoints.slice(0, 1)
    await writeFile(filename, JSON.stringify(partial))
    await importDataset(db, filename, join(root, 'runtime'))
    assert.equal((db.prepare('SELECT count(*) AS count FROM waypoints WHERE active=1').get() as { count: number }).count, 6)
    const orphan = structuredClone(partial)
    orphan.waypoints[0].categoryId = 'missing'
    await writeFile(filename, JSON.stringify(orphan))
    await assert.rejects(importDataset(db, filename, join(root, 'runtime')), /Orphan/)
    assert.equal((db.prepare('SELECT count(*) AS count FROM waypoints').get() as { count: number }).count, 6)
    const complete = structuredClone(partial)
    complete.coverage = { complete: true, filters: [], discovered: 1, omissions: [] }
    complete.assets = complete.assets.filter(asset => asset.status === 'downloaded')
    await writeFile(filename, JSON.stringify(complete))
    await importDataset(db, filename, join(root, 'runtime'))
    assert.equal((db.prepare('SELECT active FROM waypoints WHERE id=?').get('102') as { active: number }).active, 0)
    assert.equal((db.prepare('SELECT found FROM progress').get() as { found: number }).found, 1)
    await writeFile(filename, JSON.stringify(original))
    await importDataset(db, filename, join(root, 'runtime'))
    db.close()
    db = openDatabase(dbPath)
    const app = createApp(db, join(root, 'runtime'))
    server = app.listen(0, '127.0.0.1')
    await new Promise<void>(resolve => server!.once('listening', resolve))
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const base = 'http://127.0.0.1:' + address.port
    const snapshot = await fetch(base + '/api/dataset').then(response => response.json())
    assert.equal(dataset(snapshot).waypoints.length, 6)
    const categories = await fetch(base + '/api/categories').then(response => response.json()) as { iconUrl: string }[]
    assert.equal(categories[0].iconUrl, '/assets/demo-icon-0')
    const point = await fetch(base + '/api/waypoints/demo/102').then(response => response.json()) as Dataset['waypoints'][number]
    assert.deepEqual(point.images.map(image => image.order), [0, 1])
    const progress = await fetch(base + '/api/progress').then(response => response.json()) as { found: number }[]
    assert.equal(progress[0].found, 1)
    assert.equal((await fetch(base + '/api/progress/demo/102', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"found":false}' })).status, 200)
    assert.equal((await fetch(base + '/api/progress/demo/102', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"found":"false"}' })).status, 400)
    const asset = await fetch(base + '/assets/demo-photo-0')
    assert.equal(asset.headers.get('content-type'), 'image/png')
    assert.equal((await fetch(base + '/assets/demo-failed')).status, 404)
    assert.equal((await fetch(base + '/assets/..%2F..%2Fetc%2Fpasswd')).status, 404)
    assert.equal((await fetch(base + '/tiles/demo/0/0/0.png')).status, 200)
    await symlink('/etc/passwd', join(root, 'runtime/escape'))
    await assert.rejects(safeFile(join(root, 'runtime'), 'escape'), /outside/)
    await rm(join(root, 'source', original.assets[0].path!))
    await assert.rejects(importDataset(db, filename, join(root, 'runtime')))
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
    db.close()
    await rm(root, { recursive: true, force: true })
  }
})
