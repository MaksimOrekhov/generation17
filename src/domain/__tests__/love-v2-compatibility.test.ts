import { describe, expect, it } from 'vitest'
import baseline from './fixtures/love-v2-baseline.json'
import { decide } from '../engine'
import { repairSave } from '../save'
import { storylets } from '../storylets'
import type { GameState } from '../types'

describe('Love: frozen original simulations from origin/main', () => {
  it.each(Object.entries(baseline.states))('%s preserves availability and every immediate outcome', (id, sample) => {
    const old = sample.state as unknown as GameState
    const event = storylets.find(s => s.id === id)!
    const restored = repairSave(structuredClone(old)).game
    expect(restored.flags).toEqual(old.flags)
    expect(restored.people).toEqual(old.people)
    expect(event.available(restored)).toBe(true)
    sample.outcomes.forEach((expected, index) => {
      if (expected !== null) expect(decide(restored, index)).toEqual(expected)
    })
    expect(repairSave(restored).game).toEqual(restored)
  })
})
