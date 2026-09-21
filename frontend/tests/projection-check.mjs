import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const probes = JSON.parse(await readFile('../data/source-verification/projections.json', 'utf8'))
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
try {
  const page = await browser.newPage()
  await page.goto(process.env.LOCAL_URL || 'http://127.0.0.1:5175')
  const results = await page.evaluate(async ({ probes, coordinatesPath }) => {
    const { default: leaflet } = await import('/node_modules/.vite/deps/leaflet.js')
    const { position } = await import('/@fs' + coordinatesPath)
    const data = await fetch('/api/dataset').then(response => response.json())
    return probes.flatMap(probe => {
      const center = leaflet.CRS.EPSG3857.latLngToPoint(leaflet.latLng(probe.center.lat, probe.center.lng), probe.zoom + 1)
      return probe.points.map(point => {
        const mapped = position(data.maps[0], { x: point.latitude, y: point.longitude })
        const projected = leaflet.CRS.EPSG3857.latLngToPoint(leaflet.latLng(mapped), probe.zoom + 1)
        const horizontal = projected.x - center.x + probe.width / 2
        const vertical = projected.y - center.y + probe.height / 2
        return { id: point.id, sourceZoom: probe.zoom, leafletZoom: probe.zoom + 1,
          errorPx: Math.hypot(horizontal - point.pixel.x, vertical - point.pixel.y) }
      })
    })
  }, { probes, coordinatesPath: resolve('../shared/coordinates.ts') })
  const maximum = Math.max(...results.map(result => result.errorPx))
  await mkdir('../reports', { recursive: true })
  await writeFile('../reports/projection-check.json', JSON.stringify({ maximumErrorPx: maximum, results }, null, 2))
  if (maximum > 0.01) throw new Error('Projection mismatch: ' + maximum)
  console.log('Projection maximum error (pixels): ' + maximum)
} finally { await browser.close() }
