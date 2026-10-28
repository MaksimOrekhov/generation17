/** Process-local numerical experiments. Always restored; never edits game rules on disk. */
import { ECONOMY_TUNING, PROFESSIONS } from '../src/domain/economy'
import { OFFERS } from '../src/domain/offers'
import type { Job } from '../src/domain/types'

export const SCENARIOS = {
  S0: 'Current rules', S1: 'personal 350→380, H1 rent 280→300',
  S2: 'sector-trip 240→270, dome-pass 90→105', S3: 'four professional wage grids ×0.97, rounded'
} as const
export type Scenario = keyof typeof SCENARIOS
export function rulesSnapshot() {
  return { tuning: JSON.parse(JSON.stringify(ECONOMY_TUNING)), offers: Object.fromEntries(Object.entries(OFFERS).map(([id, o]) => [id, { oneTimeCost: o.oneTimeCost, annualCost: o.annualCost }])) }
}
export function withScenario<T>(scenario: Scenario, run: () => T): T {
  const before = rulesSnapshot()
  const tuning = ECONOMY_TUNING as unknown as { personal: number; rent: number[]; wages: Record<Job, number[]>; services: { domePass: number } }
  const offers = OFFERS as unknown as Record<string, { oneTimeCost: number; annualCost: number }>
  try {
    if (scenario === 'S1') { tuning.personal = 380; tuning.rent[1] = 300; offers['own-cabin']!.annualCost = 300 }
    if (scenario === 'S2') { offers['sector-trip']!.oneTimeCost = 270; tuning.services.domePass = 105; offers['dome-pass']!.annualCost = 105 }
    if (scenario === 'S3') for (const job of PROFESSIONS) tuning.wages[job] = tuning.wages[job].map(n => Math.round(n * .97))
    return run()
  } finally {
    Object.assign(tuning, before.tuning)
    for (const [id, values] of Object.entries(before.offers)) Object.assign(offers[id]!, values)
  }
}
