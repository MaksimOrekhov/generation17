import type { DecisionRecord } from './types'

const stableId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Unknown catalogue IDs are valid history. Invalid facts are discarded, never reconstructed. */
export function repairDecisions(value: unknown, age: number): DecisionRecord[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>(), records: DecisionRecord[] = []
  let lastAge = -1
  for (const record of value) {
    if (!record || typeof record !== 'object') continue
    const { id, choice, age: at, legacy, epilogue } = record as Record<string, unknown>
    if (typeof id !== 'string' || !stableId.test(id) || ids.has(id)
      || typeof choice !== 'string' || (legacy === true ? !/^legacy-index:\d+$/.test(choice) : !stableId.test(choice))
      || !Number.isInteger(at) || typeof at !== 'number' || at < lastAge || at < 0 || at > age) continue
    ids.add(id)
    lastAge = at
    records.push({ id, choice, age: at, ...(legacy === true ? { legacy: true } : {}),
      ...(typeof epilogue === 'string' && epilogue.length > 0 && epilogue.length <= 1000 ? { epilogue } : {}) })
  }
  return records
}
