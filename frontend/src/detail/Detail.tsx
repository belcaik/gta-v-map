import { useEffect, useRef } from 'react'
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import type { Dataset, Waypoint } from '../../../schemas/dataset'
import { Icon } from '../categories/Icon'
import { Gallery } from './Gallery'

type Props = { point: Waypoint; data: Dataset; found: boolean; saving: boolean; onToggle: () => void; onClose: () => void }
export function Detail({ point, data, found, saving, onToggle, onClose }: Props) {
  const category = data.categories.find(item => item.id === point.categoryId)!
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    close.current?.focus()
    return () => previous?.focus()
  }, [point.id])
  return <aside className="detail" aria-label="Detalle del punto" onKeyDown={event => {
    if (event.key === 'Escape' && !(event.target as HTMLElement).closest('dialog')) onClose()
  }}>
    <button ref={close} className="close" onClick={onClose}>Volver al mapa</button>
    <div className="detail-category"><Icon category={category} assets={data.assets} /><span>{category.name}</span></div>
    <h2>{point.title}</h2>
    <button className="primary" disabled={saving} onClick={onToggle}>{saving ? 'Guardando…' : found ? 'Desmarcar encontrado' : 'Marcar encontrado'}</button>
    <div className="description">
      {point.descriptionFormat === 'text' ? <p>{point.description}</p> :
        <Markdown rehypePlugins={[rehypeRaw, rehypeSanitize]} components={{
          img: () => null,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
        }}>{point.description}</Markdown>}
    </div>
    <Gallery key={point.mapId + '/' + point.id} point={point} assets={data.assets} />
    <p><a href={point.sourceUrl} target="_blank" rel="noopener noreferrer">Ver procedencia en MapGenie</a></p>
    <small>ID {point.id} · {data.maps.find(map => map.id === point.mapId)?.name}</small>
  </aside>
}
