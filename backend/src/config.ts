import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

const projectRoot = resolve(process.cwd(), '..')
const envFile = resolve(projectRoot, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)
export const dataRoot = resolve(projectRoot, process.env.DATA_ROOT || 'data')
export const dbPath = process.env.DB_PATH ? resolve(projectRoot, process.env.DB_PATH) : resolve(dataRoot, 'gta-v.db')
export const port = Number(process.env.PORT || 3002)
