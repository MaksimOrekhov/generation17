// Test-only frozen narrative adapter. The v1 oracle (neighbor-v1.ts) stays untouched; this overlays
// its historical prose (body, choice text/hint/result, memory) onto the CURRENT storylet so the
// immutable replay digest keeps checking mechanics while the live prose is free to be edited (GEN-102).
import type { Storylet } from '../../types'
import { legacyNeighbor } from './neighbor-v1'

export function withHistoricalNeighborText(current: Storylet): Storylet {
  const old = legacyNeighbor.find(s => s.id === current.id)
  if (!old) return current
  return {
    ...current,
    body: old.body,
    choices: current.choices.map((choice, i) => {
      const frozen = old.choices[i]!
      const effects = choice.effects && frozen.effects && 'memory' in frozen.effects
        ? { ...choice.effects, memory: frozen.effects.memory }
        : choice.effects
      return { ...choice, text: frozen.text, hint: frozen.hint, result: frozen.result, effects }
    })
  }
}
