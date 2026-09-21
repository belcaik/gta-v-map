import Ajv from 'ajv'
import schema from '../../schemas/dataset.schema.json'
import apiSchema from '../../schemas/api.schema.json'
import type { Dataset } from '../../schemas/dataset'
import { validateRelations } from '../../shared/invariants'

const validate = new Ajv({ strict: false }).compile<Dataset>(schema)
const progressValidator = new Ajv({ strict: false }).addSchema(schema, 'dataset.schema.json').addSchema(apiSchema, 'api').getSchema('api#/definitions/ProgressList')!
export type Progress = { mapId: string; waypointId: string; found: number; updatedAt: string }

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options)
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'No se pudo conectar con la API' }))
    throw new Error(body.error || response.statusText)
  }
  return response.json()
}

export async function loadDataset() {
  const input: unknown = await request('/api/dataset')
  if (!validate(input)) throw new Error('La API devolvió un dataset incompatible')
  validateRelations(input)
  return input
}

export async function loadProgress() {
  const input: unknown = await request('/api/progress')
  if (!progressValidator(input)) throw new Error('Progreso incompatible')
  return input as Progress[]
}
