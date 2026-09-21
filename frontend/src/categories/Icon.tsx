import { useState } from 'react'
import type { Asset, Category } from '../../../schemas/dataset'

export function Icon({ category, assets }: { category: Category; assets: Asset[] }) {
  const [failed, setFailed] = useState(false)
  const asset = assets.find(item => item.id === category.iconAssetId)
  return asset?.status === 'downloaded' && !failed
    ? <img className="category-icon" src={'/assets/' + asset.id} alt="" onError={() => setFailed(true)} />
    : <span className="icon-fallback" title={category.iconReason || asset?.error || 'Icono local no disponible'} aria-label="Icono no disponible">?</span>
}
