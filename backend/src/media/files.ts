import { readFile, realpath, mkdir, writeFile, rename } from 'node:fs/promises'
import { resolve, sep, dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { Dataset } from '../../../schemas/dataset'

export async function safeFile(root: string, relative: string) {
  const base = await realpath(root)
  const target = await realpath(resolve(base, relative))
  if (!target.startsWith(base + sep)) throw new Error('Asset outside data root')
  return target
}

export async function installFiles(data: Dataset, source: string, target: string) {
  for (const item of [...data.assets, ...data.tiles]) {
    if (item.status !== 'downloaded' || !item.path) continue
    const file = await readFile(await safeFile(source, item.path))
    if (file.length > 20 * 1024 * 1024) throw new Error('File too large: ' + item.path)
    if (createHash('sha256').update(file).digest('hex') !== item.sha256) throw new Error('Hash mismatch: ' + item.path)
    const decoder = sharp(file, { limitInputPixels: 40_000_000 })
    const metadata = await decoder.metadata()
    await decoder.raw().toBuffer()
    if (metadata.format !== 'png') throw new Error('Expected PNG: ' + item.path)
    if ('bytes' in item && (item.bytes !== file.length || item.width !== metadata.width || item.height !== metadata.height)) {
      throw new Error('Image metadata mismatch: ' + item.path)
    }
    if (!('bytes' in item) && (metadata.width !== 256 || metadata.height !== 256)) throw new Error('Expected 256px tile')
  }
  for (const item of [...data.assets, ...data.tiles]) {
    if (item.status !== 'downloaded' || !item.path) continue
    const sourcePath = await safeFile(source, item.path)
    const destination = resolve(target, item.path)
    await mkdir(dirname(destination), { recursive: true })
    const parent = await realpath(dirname(destination))
    const base = await realpath(target)
    if (!parent.startsWith(base + sep)) throw new Error('Destination outside data root')
    const temp = destination + '.' + randomUUID() + '.tmp'
    await writeFile(temp, await readFile(sourcePath))
    await rename(temp, destination)
  }
}
