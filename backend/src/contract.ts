import Ajv from 'ajv'
import schema from '../../schemas/dataset.schema.json'
import apiSchema from '../../schemas/api.schema.json'
import type { Dataset } from '../../schemas/dataset'
import { validateRelations } from '../../shared/invariants'

const validate = new Ajv({ allErrors: true, strict: false }).compile<Dataset>(schema)
const api = new Ajv({ allErrors: true, strict: false }).addSchema(schema, 'dataset.schema.json').addSchema(apiSchema, 'api')

export function apiResponse(definition: string, input: unknown) {
  const check = api.getSchema('api#/definitions/' + definition)
  if (!check || !check(input)) throw new Error('API contract: ' + definition + ' ' + JSON.stringify(check?.errors))
  return input
}

export function dataset(input: unknown): Dataset {
  if (!validate(input)) throw new Error('Dataset: ' + JSON.stringify(validate.errors))
  validateRelations(input)
  return input
}
