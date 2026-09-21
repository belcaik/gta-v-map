import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDatabase } from '../src/db/schema'
import { createApp } from '../src/app'

test('health works without a dataset and static routes preserve API boundaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gta-runtime-'))
  const staticRoot = join(root, 'frontend')
  await mkdir(join(staticRoot, 'assets'), { recursive: true })
  await writeFile(join(staticRoot, 'index.html'), '<main>map shell</main>')
  await writeFile(join(staticRoot, 'assets', 'main.js'), 'console.log("map")')
  const db = openDatabase(join(root, 'data', 'gta-v.db'))
  const server = createApp(db, join(root, 'data'), staticRoot).listen(0, '127.0.0.1')
  try {
    await new Promise<void>(resolve => server.once('listening', resolve))
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const base = 'http://127.0.0.1:' + address.port

    const health = await fetch(base + '/api/health')
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { status: 'ok', database: 'ready' })
    assert.equal(await fetch(base + '/').then(response => response.text()), '<main>map shell</main>')
    assert.equal(await fetch(base + '/map/demo').then(response => response.text()), '<main>map shell</main>')
    assert.equal(await fetch(base + '/assets/main.js').then(response => response.text()), 'console.log("map")')

    for (const path of ['/api/missing', '/assets/missing.js', '/tiles/missing']) {
      const response = await fetch(base + path)
      assert.equal(response.status, 404, path)
      assert.doesNotMatch(await response.text(), /map shell/, path)
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    db.close()
    await rm(root, { recursive: true, force: true })
  }
})
