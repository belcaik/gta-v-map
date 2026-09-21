import { resolve } from 'node:path'
import { openDatabase } from './schema'
import { importDataset } from './importer'
import { dataRoot, dbPath } from '../config'

const filename = process.argv[2]
if (!filename) throw new Error('Usage: npm run import-data -- /path/to/dataset.json')
const db = openDatabase(dbPath)
importDataset(db, resolve(process.env.INIT_CWD || process.cwd(), filename), dataRoot)
  .then(result => console.log(result))
  .catch(error => { console.error(error.message); process.exitCode = 1 })
  .finally(() => db.close())
