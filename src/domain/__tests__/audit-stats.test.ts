import { describe, expect, it } from 'vitest'
import { describe as summarize, percentile } from '../../../scripts/audit-stats'

describe('метрики аудита экономики', () => {
  it('считает линейные p10/p50/p90 по наблюдениям', () => {
    expect(percentile([4, 1, 3, 2], .1)).toBeCloseTo(1.3)
    expect(percentile([4, 1, 3, 2], .5)).toBe(2.5)
    expect(percentile([4, 1, 3, 2], .9)).toBeCloseTo(3.7)
  })

  it('исключает отсутствующие наблюдения вместо подстановки нуля', () => {
    expect(summarize([10, undefined, null, Number.NaN, 30, Number.POSITIVE_INFINITY, 50])).toEqual({
      observations: 3, p10: 14, p50: 30, p90: 46, mean: 30
    })
  })

  it('возвращает пустые процентили для возраста без доживших наблюдений', () => {
    expect(summarize([undefined, null])).toEqual({
      observations: 0, p10: null, p50: null, p90: null, mean: null
    })
  })

  it('отклоняет процентиль за пределами [0, 1]', () => {
    expect(() => percentile([1, 2], -0.1)).toThrow(RangeError)
    expect(() => percentile([1, 2], 1.1)).toThrow(RangeError)
  })
})
