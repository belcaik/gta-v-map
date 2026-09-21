import { lazy, Suspense, useEffect, useState } from 'react'
import type { Dataset, Waypoint } from '../../schemas/dataset'
import { loadDataset, loadProgress, request } from './api'
import { Filters } from './categories/Filters'
import { Map } from './map/Map'

const Detail = lazy(() => import('./detail/Detail').then(module => ({ default: module.Detail })))

function preferences(): { visible?: string[]; hideFound?: boolean } {
  try { return JSON.parse(localStorage.getItem('gta-v-filters') || '{}') } catch { return {} }
}

export default function App() {
  const [data, setData] = useState<Dataset>()
  const [error, setError] = useState('')
  const [found, setFound] = useState(new Set<string>())
  const [visible, setVisible] = useState<string[]>([])
  const [hideFound, setHideFound] = useState(Boolean(preferences().hideFound))
  const [selected, setSelected] = useState<Waypoint>()
  const [saving, setSaving] = useState(false)
  const [panel, setPanel] = useState(false)
  useEffect(() => {
    let active = true
    Promise.all([loadDataset(), loadProgress()]).then(([dataset, progress]) => {
      if (!active) return
      setData(dataset)
      const saved = preferences().visible
      setVisible(Array.isArray(saved) && saved.every(id => typeof id === 'string') ? saved : dataset.categories.map(item => item.id))
      setFound(new Set(progress.filter(item => item.found).map(item => item.mapId + '/' + item.waypointId)))
    }).catch(reason => { if (active) setError(String(reason.message)) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (data) {
      try { localStorage.setItem('gta-v-filters', JSON.stringify({ visible, hideFound })) } catch { setError('No se pueden conservar los filtros en este navegador.') }
    }
  }, [visible, hideFound, data])
  async function toggle() {
    if (!selected) return
    const key = selected.mapId + '/' + selected.id
    const next = !found.has(key)
    setSaving(true)
    try {
      await request('/api/progress/' + key, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ found: next }) })
      setFound(current => { const updated = new Set(current); if (next) updated.add(key); else updated.delete(key); return updated })
      setError('')
    } catch (reason) { setError((reason as Error).message) }
    finally { setSaving(false) }
  }
  if (!data) return <main className="empty"><h1>GTA V Map</h1><p role="status">{error || 'Cargando mapa local…'}</p>
    {error && <><p>Importa un dataset o ejecuta la demo desde la raíz del proyecto.</p><code>npm run demo</code><p><button onClick={() => location.reload()}>Reintentar</button></p></>}</main>
  const points = data.waypoints.filter(point => visible.includes(point.categoryId) && (!hideFound || !found.has(point.mapId + '/' + point.id)))
  const completed = data.waypoints.filter(point => found.has(point.mapId + '/' + point.id)).length
  return <main className="app">
    <header className="topbar"><h1>GTA V Map <span>Local</span></h1><button className="mobile-toggle" onClick={() => setPanel(!panel)} aria-expanded={panel}>Categorías</button>
      <p>{completed} / {data.waypoints.length} encontrados</p></header>
    <aside className={'sidebar ' + (panel ? 'is-open' : '')}>
      <p className="dataset-state">{data.source.kind === 'synthetic' ? 'Demo sintética: no representa GTA V' : data.coverage.complete ? 'Dataset completo' : 'Extracción parcial'}</p>
      <p className="muted">Progreso de este mapa, no de los logros del juego.</p>
      <label className="hide-found"><input type="checkbox" checked={hideFound} onChange={event => setHideFound(event.target.checked)} /> Ocultar encontrados</label>
      <Filters data={data} visible={visible} setVisible={setVisible} found={found} />
      <details><summary>Puntos visibles ({points.length})</summary>
        <ul className="point-list">{points.map(point => <li key={point.mapId + '/' + point.id}><button onClick={() => { setSelected(point); setPanel(false) }}>{point.title}</button></li>)}</ul>
      </details>
    </aside>
    <Map data={data} points={points} found={found} selected={selected} onSelect={point => { setSelected(point); setPanel(false) }} />
    {error && <p className="error" role="alert">{error}</p>}
    {selected && <Suspense fallback={<aside className="detail" role="status">Cargando detalle…</aside>}><Detail point={selected} data={data} found={found.has(selected.mapId + '/' + selected.id)} saving={saving} onToggle={toggle} onClose={() => setSelected(undefined)} /></Suspense>}
  </main>
}
