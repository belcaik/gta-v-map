import { createApp } from './app'
import { openDatabase } from './db/schema'
import { dataRoot, dbPath, host, port, staticRoot } from './config'

const db = openDatabase(dbPath)
const server = createApp(db, dataRoot, staticRoot).listen(port, host, () => console.log('GTA V Map API on ' + host + ':' + port))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit() }))
