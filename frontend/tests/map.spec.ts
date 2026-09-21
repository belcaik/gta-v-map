import { test, expect } from '@playwright/test'

test.beforeEach(async ({ context, request }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort()
    return route.continue()
  })
  for (const id of ['100', '101', '102', '103', '104', '105']) {
    await request.put('http://127.0.0.1:3902/api/progress/demo/' + id, { data: { found: false } })
  }
})

test('offline map, category icon consistency, photos, filters and durable progress', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(6)
  await expect(page.locator('.leaflet-marker-icon img')).toHaveCount(6)
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible()
  await page.getByRole('button', { name: 'Varias imágenes', exact: true }).click()
  const detail = page.getByRole('complementary', { name: 'Detalle del punto' })
  await expect(detail.locator('strong')).toHaveText('Fixture sintética.')
  await expect(detail.locator('script')).toHaveCount(0)
  const icon = await detail.locator('.category-icon').getAttribute('src')
  expect(icon).toBe(await page.locator('.category-row').filter({ hasText: 'Triángulo' }).locator('img').getAttribute('src'))
  expect(icon).toBe(await page.getByRole('button', { name: 'Varias imágenes', exact: true }).locator('img').getAttribute('src'))
  await expect(detail.locator('.photo img').first()).toHaveAttribute('src', '/assets/demo-photo-0')
  await detail.getByRole('button', { name: 'Imagen siguiente' }).click()
  await expect(detail.locator('.photo img').first()).toHaveAttribute('src', '/assets/demo-photo-1')
  await detail.getByRole('button', { name: 'Ampliar imagen' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('dialog').locator('img')).toHaveAttribute('src', '/assets/demo-photo-0')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await detail.getByRole('button', { name: 'Marcar encontrado', exact: true }).click()
  await expect(detail.getByRole('button', { name: 'Desmarcar encontrado' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.topbar')).toContainText('1 / 6 encontrados')
  await expect(page.locator('.pin.found img')).toHaveCount(1)
  await page.getByLabel('Ocultar encontrados').check()
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(5)
  await page.getByRole('button', { name: 'Ocultar todas' }).click()
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mostrar todas' }).click()
  await page.getByLabel('Ocultar encontrados').uncheck()
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(6)
  await page.locator('.leaflet-control-zoom-in').click()
  await page.locator('.leaflet-control-zoom-out').click()
  await page.screenshot({ path: '../reports/demo-desktop.png' })
  expect(errors).toEqual([])
})

test('legitimate absence, failed discovery, pending discovery and failed local files', async ({ page }) => {
  await page.goto('/')
  const cases = [
    ['Sin imágenes', 'Este punto no tiene imágenes en la fuente.'],
    ['Descubrimiento fallido', 'No se pudieron inspeccionar las imágenes.'],
    ['Sin inspeccionar', 'Imágenes todavía no inspeccionadas.'],
    ['Archivo fallido', 'No se pudo descargar esta imagen.'],
  ]
  for (const [title, message] of cases) {
    await page.getByRole('button', { name: title, exact: true }).click()
    await expect(page.getByText(message, { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Volver al mapa' }).click()
  }
  await page.route('**/assets/demo-photo-0', route => route.fulfill({ status: 404, body: '' }))
  await page.getByRole('button', { name: 'Una imagen', exact: true }).click()
  await expect(page.getByText('El archivo local no está disponible.').first()).toBeVisible()
})

test('mobile categories, gallery, escape and map remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Categorías', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Ocultar todas' })).toBeVisible()
  await page.getByLabel('Cuadrado (demo)').uncheck()
  await page.getByLabel('Cuadrado (demo)').check()
  await page.getByRole('button', { name: 'Categorías', exact: true }).click()
  await page.getByRole('button', { name: 'Varias imágenes', exact: true }).click()
  await page.getByRole('button', { name: 'Ampliar imagen' }).click()
  await page.getByRole('button', { name: 'Cerrar imagen' }).click()
  await page.screenshot({ path: '../reports/demo-mobile.png' })
  await page.getByRole('button', { name: 'Volver al mapa' }).click()
  await expect(page.getByRole('complementary', { name: 'Detalle del punto' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('empty installation explains how to import or start demo', async ({ page }) => {
  await page.route('**/api/dataset', route => route.fulfill({
    status: 404, contentType: 'application/json',
    body: JSON.stringify({ error: 'Sin dataset. Ejecuta npm run demo o importa dataset.json.' }),
  }))
  await page.goto('/')
  await expect(page.getByRole('status')).toContainText('Sin dataset')
  await expect(page.locator('code')).toHaveText('npm run demo')
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
})
