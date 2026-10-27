import type { Wealth } from './types'

const infantFactor: Record<Wealth, number> = { 1: 1.6, 2: 1.3, 3: 1, 4: .8, 5: .6 }

/** Условный риск не дожить до 5 лет, в процентах. Зависит от достатка семьи. */
export const infantRiskFor = (wealth: Wealth) => Math.round(2.8 * infantFactor[wealth] * 10) / 10

/** Годовой шанс при суммарном риске `riskPercent` за первые пять лет. */
export const infantYearlyChance = (riskPercent: number) => 1 - Math.pow(1 - riskPercent / 100, 1 / 5)

/**
 * Условная модель смертности: после 57 лет шанс растёт, достаток слегка сдвигает кривую.
 * Это игровая формула, а не медицинский прогноз.
 */
export function elderDeathChance(age: number, health: number, wealth: Wealth) {
  if (age < 57) return 0
  const effective = age - (wealth - 3) * 1.5
  return Math.min(.95, .004 + Math.pow(Math.max(0, effective - 58) / 40, 2.5) * .22 + Math.max(0, 42 - health) * .0012)
}
