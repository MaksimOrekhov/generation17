import { describe, expect, it } from 'vitest'
import { moments } from '../moments'
import { getOffer } from '../offers'
import { PERSONAL_TIME } from '../personalTime'
import { MODES, T9_MOMENT_IDS, playT9, policyFor, withMode } from '../../../scripts/personal-time-t9-core'

describe('T9 audit runner', () => {
  it('modes install rules and catalogue only for their scope and always restore them', () => {
    const count = moments.length
    withMode(MODES.A, () => {
      expect(PERSONAL_TIME.allowance.reduced).toBe(3)
      expect(PERSONAL_TIME.freeTimeChance).toBe(0)
      expect(getOffer('course-pro')!.attention).toBe(1)
      expect(moments.some(m => T9_MOMENT_IDS.has(m.id))).toBe(false)
    })
    withMode(MODES.N, () => { expect(PERSONAL_TIME.allowance.reduced).toBe(4); expect(PERSONAL_TIME.freeTimeChance).toBe(0) })
    expect(() => withMode(MODES.A, () => { throw Error('boom') })).toThrow('boom')
    expect(moments.length).toBe(count)
    expect(PERSONAL_TIME.allowance.reduced).toBe(4)
    expect(PERSONAL_TIME.freeTimeChance).toBe(.2)
    expect(getOffer('course-pro')!.attention).toBe(2)
  })

  it('a life is deterministic, stays within the year limit and keeps invariants clean', () => {
    const run = () => withMode(MODES.C, () => playT9(131, policyFor('TimeBuyer'), MODES.C))
    const life = run()
    expect(run()).toEqual(life)
    expect(life.violations).toEqual([])
    expect(life.years.every(y => y.left >= 0 && y.left <= y.limit)).toBe(true)
    // Spending per year is exactly what moments, shop and story purchases took.
    expect(life.years.every(y => y.limit - y.left === y.momentSpend + y.purchaseSpend + y.storySpend)).toBe(true)
    expect(life.years.filter(y => y.basis === 'reduced').every(y => y.limit === 4)).toBe(true)
  })

  it('T8 mode reproduces the flat old allowance on the same seed', () => {
    const old = withMode(MODES.A, () => playT9(131, policyFor('TimeBuyer'), MODES.A))
    expect(old.years.every(y => y.limit === (y.basis === 'ended' ? 0 : 3))).toBe(true)
    expect(old.offeredT9).toEqual([])
  })
})
