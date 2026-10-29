/**
 * Process-local personal-time rule sets (T9). Always restored; never edits game rules on disk.
 * `T8` is the explicit compatibility mode for regression baselines: every year grants 3 units,
 * the professional course costs 1, exactly as before T9. Same pattern as economy-t8-scenarios.ts.
 */
import { OFFERS } from '../src/domain/offers'
import { PERSONAL_TIME, TIME_REGIMES } from '../src/domain/personalTime'
import type { TimeRegime } from '../src/domain/personalTime'

export interface TimeRules { allowance: Record<TimeRegime, number>; costs: Record<string, number>; moment: number; freeTimeChance: number }

const T9_ALLOWANCE = { ...PERSONAL_TIME.allowance }
const T9_COSTS = Object.fromEntries(Object.entries(OFFERS).map(([id, o]) => [id, o.attention]))
const T9_FREE_TIME = PERSONAL_TIME.freeTimeChance
const flat = (n: number) => Object.fromEntries(TIME_REGIMES.map(r => [r, n])) as Record<TimeRegime, number>

export const TIME_RULESETS = {
  /** Pre-T9 behaviour: 3 units in every year, every time-consuming catalogue entry costs 1. */
  T8: { allowance: flat(3), costs: { ...T9_COSTS, 'course-pro': 1 }, moment: 1, freeTimeChance: 0 },
  /** Shipped T9 rules. */
  T9: { allowance: { ...T9_ALLOWANCE }, costs: { ...T9_COSTS }, moment: 1, freeTimeChance: T9_FREE_TIME },
  /** Experiment: T9 allowances without the «free evening» roll — the resource alone, no extra opportunities. */
  'T9-nofree': { allowance: { ...T9_ALLOWANCE }, costs: { ...T9_COSTS }, moment: 1, freeTimeChance: 0 },
  /** Experiment: T9 allowances, but the course keeps its old cost of 1. */
  'T9-course1': { allowance: { ...T9_ALLOWANCE }, costs: { ...T9_COSTS, 'course-pro': 1 }, moment: 1, freeTimeChance: T9_FREE_TIME },
  /** Experiment: T9 costs with the old flat allowance — isolates the price of the course. */
  'T8-course2': { allowance: flat(3), costs: { ...T9_COSTS }, moment: 1, freeTimeChance: 0 },
  /** Experiment: retirement keeps the working allowance of 3 (and therefore gets no free-evening roll). */
  'T9-retired3': { allowance: { ...T9_ALLOWANCE, retired: 3, mentor: 3 }, costs: { ...T9_COSTS }, moment: 1, freeTimeChance: T9_FREE_TIME }
} satisfies Record<string, TimeRules>
export type TimeRulesetName = keyof typeof TIME_RULESETS

export function timeRulesSnapshot(): TimeRules {
  return { allowance: { ...PERSONAL_TIME.allowance }, costs: Object.fromEntries(Object.entries(OFFERS).map(([id, o]) => [id, o.attention])), moment: PERSONAL_TIME.moment, freeTimeChance: PERSONAL_TIME.freeTimeChance }
}

function install(rules: TimeRules) {
  const offers = OFFERS as unknown as Record<string, { attention: number }>
  Object.assign(PERSONAL_TIME.allowance, rules.allowance)
  PERSONAL_TIME.moment = rules.moment
  PERSONAL_TIME.freeTimeChance = rules.freeTimeChance
  for (const [id, cost] of Object.entries(rules.costs)) offers[id]!.attention = cost
}

/** Installs a rule set until the returned restore() is called (for beforeAll/afterAll in regression tests). */
export function applyTimeRules(name: TimeRulesetName): () => void {
  const before = timeRulesSnapshot()
  install(TIME_RULESETS[name])
  return () => install(before)
}

export function withTimeRules<T>(name: TimeRulesetName, run: () => T): T {
  const restore = applyTimeRules(name)
  try { return run() } finally { restore() }
}
