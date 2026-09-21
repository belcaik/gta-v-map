import { openDatabase } from '../db/schema'
import { dbPath } from '../config'

const mapId = process.argv[2]
if (!mapId || !/^[a-zA-Z0-9_-]+$/.test(mapId)) throw new Error('Usage: npm run reset-progress -- MAP_ID')
const db = openDatabase(dbPath)
try {
  const result = db.prepare("DELETE FROM progress WHERE game_id='gta-v' AND map_id=?").run(mapId)
  console.log('Progress records reset: ' + result.changes)
} finally { db.close() }
