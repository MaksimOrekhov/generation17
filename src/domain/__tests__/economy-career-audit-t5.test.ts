import { describe, expect, it } from 'vitest'
import { assertProfessionStoriesExist, ownRecoveryYears, pairedParityAge, pairedRetraining, summarizeRetraining } from '../../../scripts/economy-career-t5-core'
import { playLife, retrainTargetFor } from '../../../scripts/economy-pilot-core'
import { createGame } from '../engine'

describe('T5 career audit runner', () => {
  it('Switcher: deterministic, one paid retraining at 35, accounting and invariants clean; control untouched', () => {
    assertProfessionStoriesExist()
    const a = playLife(134, 'Careerist', { retrainAt: 35 })
    const b = playLife(134, 'Careerist', { retrainAt: 35 })
    const control = playLife(134, 'Careerist')
    expect(a).toEqual(b)
    expect(a.retrain).toMatchObject({ age: 35, attempts: [{ age: 35, result: 'success' }] })
    expect(a.retrain.to).not.toBe(a.retrain.from)
    expect(a.purchases.filter(p => p.id === 'retrain')).toHaveLength(1)
    expect(a.years.find(y => y.age === 36)?.kind).toBe('trainee')
    expect(a.violations).toEqual([]); expect(a.accountingErrors).toEqual([])
    expect(control.retrain).toMatchObject({ age: null, attempts: [] })
    // До переобучения жизни совпадают годом в год: политика вмешивается только с 35 лет.
    expect(a.years.filter(y => y.age <= 35)).toEqual(control.years.filter(y => y.age <= 35))
    const summary = summarizeRetraining([a])
    expect(summary).toMatchObject({ switchedLives: 1, retrainCostTotal: 500 })
    expect(pairedRetraining([a], [control]).switchedPairs).toBe(1)
    expect(ownRecoveryYears(control)).toBeNull()
    expect(pairedParityAge(control, a)).toBeNull()
  }, 60000)

  it('target profession is a pure hash of the seed and never the current one', () => {
    for (let seed = 1; seed < 40; seed++) {
      const g = createGame(seed); g.protagonist.job = 'Медик'
      const rng = g.rng
      const job = retrainTargetFor(g)
      expect(job).not.toBe('Медик')
      expect(retrainTargetFor(g)).toBe(job)
      expect(g.rng).toBe(rng)
    }
  })
})
