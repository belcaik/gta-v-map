import type { Dataset } from '../../../schemas/dataset'
import { Icon } from './Icon'

type Props = {
  data: Dataset
  visible: string[]
  setVisible: (ids: string[]) => void
  found: Set<string>
}
export function Filters({ data, visible, setVisible, found }: Props) {
  const populated = data.categories.filter(category => data.waypoints.some(point => point.categoryId === category.id))
  const groups = [...new Set(populated.map(item => item.group || 'Sin grupo'))]
  return <section aria-label="Categorías">
    <div className="filter-actions">
      <button onClick={() => setVisible(data.categories.map(item => item.id))}>Mostrar todas</button>
      <button onClick={() => setVisible([])}>Ocultar todas</button>
    </div>
    {groups.map(group => <fieldset key={group}>
      <legend>{group}</legend>
      {data.categories.filter(category => (category.group || 'Sin grupo') === group).map(category => {
        const points = data.waypoints.filter(point => point.categoryId === category.id)
        if (!points.length) return null
        return <label className="category-row" key={category.id}>
          <input type="checkbox" checked={visible.includes(category.id)} onChange={() => setVisible(visible.includes(category.id) ? visible.filter(id => id !== category.id) : [...visible, category.id])} />
          <Icon category={category} assets={data.assets} />
          <span>{category.name}</span>
          <small>{points.filter(point => found.has(point.mapId + '/' + point.id)).length}/{points.length}</small>
        </label>
      })}
    </fieldset>)}
  </section>
}
