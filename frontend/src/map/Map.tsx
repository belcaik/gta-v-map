import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Dataset, Waypoint } from '../../../schemas/dataset'
import { position } from '../../../shared/coordinates'

type Props = { data: Dataset; points: Waypoint[]; found: Set<string>; selected?: Waypoint; onSelect: (point: Waypoint) => void }

function Selection({ selected, data }: Pick<Props, 'selected' | 'data'>) {
  const map = useMap()
  useEffect(() => {
    if (selected) map.panTo(position(data.maps[0], selected.coordinates))
  }, [selected, map, data])
  return null
}

class CategoryIcon extends L.DivIcon {
  createIcon(oldIcon?: HTMLElement) {
    const element = super.createIcon(oldIcon)
    const image = element.querySelector('img')
    image?.addEventListener('error', () => {
      image.remove()
      element.querySelector('.icon-fallback')?.removeAttribute('hidden')
    })
    return element
  }
}

export function Map({ data, points, found, selected, onSelect }: Props) {
  const [tileError, setTileError] = useState(false)
  const config = data.maps[0]
  const bounds = L.latLngBounds(config.bounds)
  const icons = useMemo(() => {
    const result = new globalThis.Map<string, L.DivIcon>()
    for (const category of data.categories) {
      const asset = data.assets.find(item => item.id === category.iconAssetId && item.status === 'downloaded')
      for (const isFound of [false, true]) {
        const wrapper = document.createElement('div')
        wrapper.className = 'pin' + (isFound ? ' found' : '')
        const fallback = document.createElement('span')
        fallback.className = 'icon-fallback'
        fallback.textContent = '?'
        fallback.title = category.iconReason || 'Icono no disponible'
        if (asset) {
          const image = document.createElement('img')
          image.src = '/assets/' + asset.id
          image.alt = ''
          fallback.hidden = true
          wrapper.append(image)
        }
        wrapper.append(fallback)
        if (isFound) {
          const check = document.createElement('b')
          check.textContent = '✓'
          wrapper.append(check)
        }
        result.set(category.id + '/' + isFound, new CategoryIcon({
          className: 'map-pin', html: wrapper.outerHTML, iconSize: [44, 44], iconAnchor: [22, 44],
        }))
      }
    }
    return result
  }, [data])
  return <div className="map-frame">
    <MapContainer bounds={bounds} maxBounds={bounds.pad(0.05)} minZoom={config.minZoom} maxZoom={config.maxZoom}
      crs={config.crs === 'simple' ? L.CRS.Simple : L.CRS.EPSG3857} maxBoundsViscosity={1}>
      <Selection selected={selected} data={data} />
      <TileLayer url={config.tileTemplate} tileSize={config.tileSize} minZoom={config.minZoom} maxZoom={config.maxZoom}
        bounds={bounds} noWrap tms={config.tileScheme === 'tms'} attribution="Fuente: MapGenie · GTA V / Rockstar Games"
        eventHandlers={{ tileerror: () => setTileError(true) }} />
      {points.map(point => <Marker key={point.mapId + '/' + point.id}
        position={position(config, point.coordinates)}
        icon={icons.get(point.categoryId + '/' + found.has(point.mapId + '/' + point.id))}
        title={point.title} alt={point.title} eventHandlers={{ click: () => onSelect(point) }} />)}
    </MapContainer>
    {tileError && <div className="map-message" role="status">Faltan tiles locales en esta zona o zoom.</div>}
  </div>
}
