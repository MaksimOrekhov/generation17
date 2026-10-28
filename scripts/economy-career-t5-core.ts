/** T5 career audit: Switcher (paid retraining at 35) against the same policy without it. Pure summaries over T8a lives. */
import { storylets } from '../src/domain/storylets'
import type { Job } from '../src/domain/types'
import { describe } from './audit-stats'
import { pct } from './economy-pilot-core'
import type { Life } from './economy-pilot-core'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
export const RETRAIN_AGES = [40, 60, 80] as const

/** Profession-gated storylets and moments: what a new profession can open in the narrative. */
export const PROFESSION_STORIES: Record<string, string[]> = {
  Техник: ['microcrack', 'late-tech-handbook'],
  Медик: ['clinic', 'late-medic-routine'],
  Агроном: ['seed-vault'],
  Координатор: ['council']
}
export const PROFESSION_MOMENTS: Record<string, string> = { Техник: 'm-job-tech', Медик: 'm-job-medic', Агроном: 'm-job-agro', Координатор: 'm-job-coord' }

const knownStorylets = new Set(storylets.map(s => s.id))
/** Guard: if content is renamed, the narrative metric must fail loudly instead of silently reporting zero. */
export function assertProfessionStoriesExist() {
  for (const id of Object.values(PROFESSION_STORIES).flat()) if (!knownStorylets.has(id)) throw Error(`Unknown profession storylet ${id}`)
}

function decisionsAfter(l: Life, age: number) {
  return Object.keys(l.decisions).map(key => { const [a, ...id] = key.split(':'); return { age: Number(a), id: id.join(':') } }).filter(d => d.age > age)
}

/** Years after the switch until annual wage first reaches the wage of the switch year itself; null if never observed. */
export function ownRecoveryYears(l: Life): number | null {
  if (l.retrain.age === null) return null
  const base = l.years.find(y => y.age === l.retrain.age)
  if (!base || base.kind !== 'working') return null
  const back = l.years.find(y => y.age > l.retrain.age! && y.kind === 'working' && y.wage >= base.wage)
  return back ? back.age - l.retrain.age : null
}

/** First age after the switch from which the switcher's wage is at least the paired control's at every later joint working age. */
export function pairedParityAge(t: Life, c: Life): number | null {
  if (t.retrain.age === null) return null
  const joint = t.years.filter(y => y.age > t.retrain.age! && y.kind === 'working')
    .map(y => [y, c.years.find(x => x.age === y.age)] as const).filter(([, x]) => x?.kind === 'working')
  for (let i = 0; i < joint.length; i++) if (joint.slice(i).every(([a, b]) => a.wage >= b!.wage)) return joint[i]![0].age
  return null
}

export function summarizeRetraining(runs: Life[]) {
  const switched = runs.filter(l => l.retrain.age !== null)
  const attempts = runs.flatMap(l => l.retrain.attempts)
  const refused = attempts.filter(a => a.result !== 'success')
  const eligibleAt35 = runs.filter(l => l.retrain.attempts.some(a => a.age === 35))
  return {
    lives: runs.length,
    reachedFirstAttempt: eligibleAt35.length,
    switchedLives: switched.length,
    switchedPctOfAttempting: pct(switched.length, eligibleAt35.length),
    switchedAtFirstAttemptPct: pct(runs.filter(l => l.retrain.attempts[0]?.result === 'success').length, eligibleAt35.length),
    switchAge: describe(switched.map(l => l.retrain.age)),
    attempts: { total: attempts.length, refused: refused.length, refusedPct: pct(refused.length, attempts.length),
      byReason: Object.fromEntries([...new Set(refused.map(a => a.result))].sort().map(r => [r, refused.filter(a => a.result === r).length])) },
    retrainCostTotal: sum(runs.flatMap(l => l.purchases.filter(p => p.id === 'retrain').map(p => p.cost))),
    /** Balance after the settlement of the switch year, before the purchase window: how heavy 500 kr is. */
    balanceAtSwitch: describe(switched.map(l => l.years.find(y => y.age === l.retrain.age)?.balance)),
    feeShareOfBalancePct: describe(switched.map(l => { const b = l.years.find(y => y.age === l.retrain.age)?.balance; return b ? 100 * 500 / b : null })),
    forecastInternshipLoss: describe(switched.map(l => l.retrain.forecastWageBefore! - l.retrain.forecastWageAfter!)),
    actualInternshipWage: describe(switched.map(l => l.years.find(y => y.age === l.retrain.age! + 1)?.wage)),
    internshipYearKinds: Object.fromEntries([...new Set(switched.map(l => l.years.find(y => y.age === l.retrain.age! + 1)?.kind ?? 'dead'))].sort()
      .map(k => [k, switched.filter(l => (l.years.find(y => y.age === l.retrain.age! + 1)?.kind ?? 'dead') === k).length])),
    ownRecoveryYears: describe(switched.map(ownRecoveryYears)),
    neverRecoveredOwnWage: switched.filter(l => ownRecoveryYears(l) === null).length,
    targetJobs: Object.fromEntries((['Техник', 'Медик', 'Агроном', 'Координатор'] as Job[]).map(j => [j, switched.filter(l => l.retrain.to === j).length])),
    narrative: {
      newProfessionStorySeenPct: pct(switched.filter(l => decisionsAfter(l, l.retrain.age!).some(d => PROFESSION_STORIES[l.retrain.to!]!.includes(d.id))).length, switched.length),
      oldProfessionStorySeenAfterSwitch: switched.filter(l => decisionsAfter(l, l.retrain.age!).some(d => PROFESSION_STORIES[l.retrain.from!]!.includes(d.id))).length,
      newProfessionMomentOfferedPct: pct(switched.filter(l => (l.momentLog[PROFESSION_MOMENTS[l.retrain.to!]!] ?? -1) > l.retrain.age!).length, switched.length),
      storyMentorRetrainLives: runs.filter(l => Object.entries(l.decisions).some(([k, v]) => k.endsWith(':mentor') && v === 0)).length
    }
  }
}

/** Paired comparison restricted to the same seeds; deltas are treatment minus control. */
export function pairedRetraining(treatment: Life[], control: Life[]) {
  const pairs = treatment.map((t, i) => { const c = control[i]!; if (t.seed !== c.seed) throw Error('Unpaired seeds'); return [t, c] as const })
  const switched = pairs.filter(([t]) => t.retrain.age !== null)
  const ckpt = (l: Life, age: number) => l.checkpoints.find(c => c.age === age)
  const firstPension = (l: Life) => l.years.find(y => y.kind === 'retired')?.pension
  return {
    pairs: pairs.length, switchedPairs: switched.length,
    /** Intention-to-treat: every seed, whether or not the switch actually happened. */
    lifetimeWageDeltaAll: describe(pairs.map(([t, c]) => t.wage - c.wage)),
    lifetimeWageDeltaSwitched: describe(switched.map(([t, c]) => t.wage - c.wage)),
    lifetimeWageDeltaSwitchedPct: describe(switched.map(([t, c]) => c.wage ? 100 * (t.wage - c.wage) / c.wage : null)),
    /** Wages after the switch, only at ages both lives reached: removes differences in death age from the comparison. */
    jointPostSwitchWageDelta: describe(switched.map(([t, c]) => sum(t.years.filter(y => y.age > t.retrain.age!)
      .map(y => { const x = c.years.find(z => z.age === y.age); return x ? y.wage - x.wage : 0 })))),
    jointPostSwitchWageDeltaPct: describe(switched.map(([t, c]) => {
      const joint = t.years.filter(y => y.age > t.retrain.age!).flatMap(y => { const x = c.years.find(z => z.age === y.age); return x ? [[y.wage, x.wage] as const] : [] })
      const base = sum(joint.map(([, b]) => b))
      return base ? 100 * sum(joint.map(([a, b]) => a - b)) / base : null
    })),
    internshipYearWageDelta: describe(switched.map(([t, c]) => { const a = t.years.find(y => y.age === t.retrain.age! + 1), b = c.years.find(y => y.age === t.retrain.age! + 1); return a && b ? a.wage - b.wage : null })),
    pairedParityAge: describe(switched.map(([t, c]) => pairedParityAge(t, c))),
    neverParity: switched.filter(([t, c]) => pairedParityAge(t, c) === null).length,
    pensionLifetimeDeltaSwitched: describe(switched.map(([t, c]) => t.pension - c.pension)),
    firstPensionDeltaSwitched: describe(switched.map(([t, c]) => { const a = firstPension(t), b = firstPension(c); return a !== undefined && b !== undefined ? a - b : null })),
    finalServiceDeltaSwitched: describe(switched.map(([t, c]) => t.finalService - c.finalService)),
    checkpoints: Object.fromEntries(RETRAIN_AGES.map(age => {
      const cs = switched.flatMap(([t, c]) => { const a = ckpt(t, age), b = ckpt(c, age); return a && b ? [[a, b] as const] : [] })
      return [age, { jointSurvivors: cs.length,
        balanceDelta: describe(cs.map(([a, b]) => a.balance - b.balance)),
        gradeTreatment: Object.fromEntries([1, 2, 3, 4].map(g => [g, cs.filter(([a]) => a.grade === g).length])),
        gradeControl: Object.fromEntries([1, 2, 3, 4].map(g => [g, cs.filter(([, b]) => b.grade === g).length])),
        gradeDelta: describe(cs.map(([a, b]) => a.grade - b.grade)) }]
    })),
    reached4: { treatmentPct: pct(switched.filter(([t]) => t.grade4 !== null).length, switched.length), controlPct: pct(switched.filter(([, c]) => c.grade4 !== null).length, switched.length),
      treatmentAge: describe(switched.map(([t]) => t.grade4)), controlAge: describe(switched.map(([, c]) => c.grade4)) }
  }
}
