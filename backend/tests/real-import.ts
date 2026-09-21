import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { openDatabase } from '../src/db/schema'
import { importDataset } from '../src/db/importer'
import { dataRoot, dbPath } from '../src/config'

async function verify() {
  const filename = process.argv[2]
  if (!filename) throw new Error('Pass a real dataset filename')
  const db = openDatabase(dbPath)
  const original = db.prepare("SELECT found,updated_at FROM progress WHERE game_id='gta-v' AND map_id='27' AND waypoint_id='13607'").get() as { found: number; updated_at: string } | undefined
  try {
    await importDataset(db, resolve(filename), dataRoot)
    db.prepare("INSERT INTO progress VALUES ('gta-v','27','13607',1,?) ON CONFLICT(game_id,map_id,waypoint_id) DO UPDATE SET found=1")
      .run(new Date().toISOString())
    await importDataset(db, resolve(filename), dataRoot)
    assert.equal((db.prepare("SELECT found FROM progress WHERE map_id='27' AND waypoint_id='13607'").get() as { found: number }).found, 1)
    const reopened = openDatabase(dbPath)
    try {
      assert.equal((reopened.prepare("SELECT found FROM progress WHERE map_id='27' AND waypoint_id='13607'").get() as { found: number }).found, 1)
    } finally { reopened.close() }
    console.log('Real reimport and reopened SQLite preserved found; restoring original progress.')
  } finally {
    if (original) db.prepare("UPDATE progress SET found=?,updated_at=? WHERE game_id='gta-v' AND map_id='27' AND waypoint_id='13607'").run(original.found, original.updated_at)
    else db.prepare("DELETE FROM progress WHERE game_id='gta-v' AND map_id='27' AND waypoint_id='13607'").run()
    db.close()
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
