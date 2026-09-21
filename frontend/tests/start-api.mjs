import { execFileSync, spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { rmSync } from 'node:fs'

const repo = resolve('..')
const root = resolve(repo, 'data/e2e')
rmSync(root, { recursive: true, force: true })
const env = { ...process.env, DATA_ROOT: root, DB_PATH: resolve(root, 'gta-v.db'), PORT: '3902' }
execFileSync(process.env.PYTHON || resolve(repo, '.venv/bin/python'), ['-m', 'scraper.demo', '--output', root + '/source'], { cwd: repo, env, stdio: 'inherit' })
execFileSync('npm', ['run', 'import-data', '--', root + '/source/dataset.json'], { cwd: resolve(repo, 'backend'), env, stdio: 'inherit' })
const child = spawn('npm', ['run', 'dev'], { cwd: resolve(repo, 'backend'), env, stdio: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => process.exit(code || 0))
