import { createApp } from './app'
import { openDatabase } from './db/schema'
import { dataRoot, dbPath, port } from './config'

const db = openDatabase(dbPath)
const server = createApp(db, dataRoot).listen(port, '127.0.0.1', () => console.log('GTA V Map API on port ' + port))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit() }))
