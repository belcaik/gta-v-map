import { useRef, useState } from 'react'
import type { Asset, Waypoint } from '../../../schemas/dataset'

function Photo({ asset, title }: { asset: Asset; title: string }) {
  const [state, setState] = useState('loading')
  if (asset.status !== 'downloaded') return <p role="status">{asset.status === 'failed' ? 'No se pudo descargar esta imagen.' : 'Imagen pendiente de descarga.'}</p>
  return <div className="photo" style={{ aspectRatio: (asset.width || 4) + '/' + (asset.height || 3) }}>
    {state === 'loading' && <span role="status">Cargando imagen…</span>}
    {state === 'error' && <span role="status">El archivo local no está disponible.</span>}
    <img src={'/assets/' + asset.id} alt={title} loading="lazy" hidden={state === 'error'}
      width={asset.width || undefined} height={asset.height || undefined}
      onLoad={() => setState('loaded')} onError={() => setState('error')} />
  </div>
}

export function Gallery({ point, assets }: { point: Waypoint; assets: Asset[] }) {
  const [index, setIndex] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const images = [...point.images].sort((left, right) => left.order - right.order)
  if (!images.length) {
    const message = { none: 'Este punto no tiene imágenes en la fuente.', failed: 'No se pudieron inspeccionar las imágenes.', uninspected: 'Imágenes todavía no inspeccionadas.', present: '' }
    return <p className="muted">{message[point.imageDiscovery]}</p>
  }
  const association = images[index]
  const asset = assets.find(item => item.id === association.assetId)!
  const navigate = (offset: number) => setIndex(current => (current + offset + images.length) % images.length)
  const controls = <div className="gallery-controls">
    <button disabled={images.length === 1} onClick={() => navigate(-1)} aria-label="Imagen anterior">Anterior</button>
    <span>{index + 1} / {images.length}</span>
    <button disabled={images.length === 1} onClick={() => navigate(1)} aria-label="Imagen siguiente">Siguiente</button>
  </div>
  return <section aria-label="Imágenes del punto">
    <Photo key={asset.id} asset={asset} title={association.caption || point.title} />
    {association.caption && <p>{association.caption}</p>}
    {association.attribution && <small>{association.attribution}</small>}
    {controls}
    <button disabled={asset.status !== 'downloaded'} onClick={() => dialog.current?.showModal()}>Ampliar imagen</button>
    <dialog ref={dialog} aria-label="Imagen ampliada" onKeyDown={event => {
      if (event.key === 'ArrowRight') navigate(1)
      if (event.key === 'ArrowLeft') navigate(-1)
    }}>
      <button className="close" onClick={() => dialog.current?.close()}>Cerrar imagen</button>
      <Photo key={asset.id} asset={asset} title={association.caption || point.title} />
      {controls}
    </dialog>
  </section>
}
