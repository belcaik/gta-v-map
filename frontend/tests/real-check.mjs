import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.LOCAL_URL || 'http://127.0.0.1:5175'
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const external = []
await context.route('**/*', route => {
  if (new URL(route.request().url()).origin !== new URL(base).origin) {
    external.push(route.request().url())
    return route.abort()
  }
  return route.continue()
})
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const check = (condition, message) => { if (!condition) throw new Error(message) }
try {
  await page.goto(base)
  const data = await page.evaluate(() => fetch('/api/dataset').then(response => response.json()))
  check(data.source.kind !== 'synthetic', 'Expected real extracted dataset')
  await page.locator('.leaflet-marker-icon').first().waitFor()
  await page.getByRole('button', { name: 'Mostrar todas' }).click()
  await page.getByLabel('Ocultar encontrados').uncheck()
  await page.locator('.leaflet-control-zoom-in').click()
  await page.locator('.leaflet-control-zoom-in').click()
  await page.locator('.leaflet-tile-loaded').first().waitFor()
  await mkdir('../reports', { recursive: true })
  await page.screenshot({ path: '../reports/real-desktop.png' })
  const controls = ['Mount Chiliad Peak', 'Los Santos International Airport', 'Del Perro Pier']
  for (const title of controls) {
    await page.locator('summary').click()
    await page.locator('.point-list').getByRole('button', { name: title, exact: true }).first().click()
    await page.getByRole('heading', { name: title, exact: true }).waitFor()
    await page.waitForFunction(() => [...document.querySelectorAll('.leaflet-tile')].every(image => image.complete))
    await page.waitForTimeout(350)
    await page.screenshot({ path: '../reports/real-' + title.toLowerCase().replaceAll(' ', '-') + '.png' })
    await page.getByRole('button', { name: 'Volver al mapa' }).click()
    await page.locator('summary').click()
  }
  await page.locator('summary').click()
  await page.locator('.point-list').getByRole('button', { name: 'Hidden Package #1', exact: true }).click()
  await page.getByRole('heading', { name: 'Hidden Package #1', exact: true }).waitFor()
  const photo = page.locator('.detail > section .photo img').first()
  await photo.waitFor()
  await page.waitForFunction(() => {
    const image = document.querySelector('.detail > section .photo img')
    return image?.complete && image.naturalWidth > 0
  })
  const first = await photo.getAttribute('src')
  check(first.startsWith('/assets/'), 'Expected local photo')
  const originalProgress = await page.evaluate(() => fetch('/api/progress').then(response => response.json()))
  const originalFound = originalProgress.some(item => item.mapId === '27' && item.waypointId === '13607' && item.found === 1)
  const buttonName = originalFound ? 'Desmarcar encontrado' : 'Marcar encontrado'
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await page.getByRole('button', { name: originalFound ? 'Marcar encontrado' : 'Desmarcar encontrado', exact: true }).waitFor()
  await page.reload()
  const persisted = await page.evaluate(() => fetch('/api/progress').then(response => response.json()))
  check(persisted.some(item => item.mapId === '27' && item.waypointId === '13607' && item.found === Number(!originalFound)), 'Progress did not survive reload')
  await page.locator('summary').click()
  await page.locator('.point-list').getByRole('button', { name: 'Hidden Package #1', exact: true }).click()
  await page.getByRole('button', { name: 'Imagen siguiente' }).first().click()
  check(await photo.getAttribute('src') !== first, 'Gallery did not advance')
  await page.waitForTimeout(350)
  const before = await page.locator('.leaflet-map-pane').getAttribute('style')
  await page.getByRole('button', { name: 'Ampliar imagen' }).click()
  await page.keyboard.press('Escape')
  check(await page.locator('.leaflet-map-pane').getAttribute('style') === before, 'Gallery moved map')
  await page.getByRole('button', { name: 'Ocultar todas' }).click()
  for (const category of ['Ammu-Nation', 'Hidden Package', 'Mountain Peak']) {
    await page.locator('.category-row').filter({ hasText: category }).getByRole('checkbox').check()
  }
  await page.locator('.leaflet-control-zoom-in').click()
  await page.waitForTimeout(350)
  await page.locator('.leaflet-control-zoom-in').click()
  await page.waitForFunction(() => [...document.querySelectorAll('.leaflet-tile')].every(image => image.complete))
  await page.waitForTimeout(350)
  await page.screenshot({ path: '../reports/real-gallery.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '../reports/real-mobile.png' })
  await page.getByRole('button', { name: 'Volver al mapa' }).click()
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile overflow')
  await page.evaluate(async found => {
    await fetch('/api/progress/27/13607', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ found }) })
  }, originalFound)
  check(external.length === 0, 'App attempted external requests')
  check(errors.length === 0, 'Browser errors: ' + errors.join(', '))
  await writeFile('../reports/real-check.json', JSON.stringify({ waypoints: data.waypoints.length, controls, externalRequests: external.length, browserErrors: errors, photos: 'local ordered gallery', progress: 'persisted; original value restored', result: 'pass' }, null, 2))
  console.log('Real local checks passed; screenshots in reports/')
} finally { await browser.close() }
