/** Supplemental S0 outcomes: real next promotion after retraining and late pension content.
 * npx tsx scripts/economy-t8-diagnostics.ts -- 100 --json docs/audit/economy-t8-diagnostics.json
 * No catalogue counterfactual enumeration; every actual action and state is still checked.
 */
import { writeFileSync } from 'node:fs'
import { describe } from './audit-stats'
import { ENGINE_BASE, momentReachable, playT8, policyFor } from './economy-t8-core'
import type { T8Life } from './economy-t8-core'
import { exampleLife } from './economy-t8-metrics'
import { pct } from './economy-pilot-core'
import { storylets } from '../src/domain/storylets'
import lateStories from '../content/storylets/late-life-01.json'
import lateMoments from '../content/moments/late-life-01.json'

const args = process.argv.slice(2).filter(a => a !== '--'), count = Number(args[0] ?? 100)
const jsonPath = args[args.indexOf('--json') + 1]
if (!Number.isInteger(count) || count < 1 || count > 1000 || !args.includes('--json')) throw Error('Use count --json path')
const integrity = { completedLives: 0, checks: 0, violations: 0, accountingErrors: 0 }
const options = { observeChoiceQuality: false }
function record(l: T8Life) { integrity.completedLives++; integrity.checks += l.invariantChecks; integrity.violations += l.violations.length; integrity.accountingErrors += l.accountingErrors.length; return l }
const control = Array.from({ length: count }, (_, i) => record(playT8(102 + i, policyFor('Careerist'), true, options)))
const retraining: Record<string, unknown> = {}
const nextGrade = (l: T8Life) => {
  if (l.retrain.age === null) return null
  const after = l.years.find(y => y.age > l.retrain.age! && y.job === l.retrain.to)
  const next = after && l.years.find(y => y.age > l.retrain.age! && y.job === l.retrain.to && y.grade > after.grade)
  return next ? next.age - l.retrain.age : null
}
const health = (l: T8Life, age: number) => l.checkpoints.find(c => c.age === age)?.stats.health
for (const age of [25, 35, 45]) for (const offset of [0, 1, 2]) {
  console.error(`Supplement B Switcher ${age}/${offset}: ${count}`)
  const lives = Array.from({ length: count }, (_, i) => record(playT8(102 + i, { ...policyFor('Switcher'), name: `Switcher${age}-${offset}`, switchAge: age, targetOffset: offset }, true, options)))
  const switched = lives.filter(l => l.retrain.age !== null)
  const directions = [...new Set(switched.map(l => `${l.retrain.from} → ${l.retrain.to}`))].sort()
  const summarize = (rows: T8Life[]) => ({ switchedLives: rows.length, nextGradeAfterSwitchYears: describe(rows.map(nextGrade)),
    noNextGradeObserved: rows.filter(l => nextGrade(l) === null).length,
    postSwitchAdultTraineeYears: describe(rows.map(l => l.years.filter(y => y.age > l.retrain.age! && y.kind === 'trainee').length)),
    jointAge60HealthDelta: describe(rows.map(l => { const c = control.find(c => c.seed === l.seed)!, a = health(l, 60), b = health(c, 60); return a === undefined || b === undefined ? null : a - b })) })
  retraining[`${age}/${offset}`] = { ...summarize(switched), byDirection: Object.fromEntries(directions.map(d => [d, summarize(switched.filter(l => `${l.retrain.from} → ${l.retrain.to}` === d))])) }
}
const late = [...lateStories.map(s => ({ id: s.id, kind: 'story' as const })), ...lateMoments.map(m => ({ id: m.id, kind: 'moment' as const }))]
const pensions: Record<string, unknown> = {}, examples: ReturnType<typeof exampleLife>[] = []
for (const retirement of ['left', 'mentor', 'continue'] as const) {
  console.error(`Supplement B Retirement ${retirement}: ${count}`)
  const observed = Array.from({ length: count }, (_, i) => {
    const eligible: Record<string, Set<number>> = Object.fromEntries(late.map(h => [h.id, new Set<number>()]))
    const l = record(playT8(102 + i, { ...policyFor('Moderate'), name: `Retirement-${retirement}`, retirement }, true, {
      ...options, onState: (g, action) => {
        if (g.age < 65 || g.stopped) return
        for (const h of late) {
          if (h.kind === 'story') {
            const s = storylets.find(s => s.id === h.id)!
            if ((action === 'tick' || g.pending === h.id) && g.age >= s.min && g.age <= s.max && (!g.seen.includes(s.id) || g.pending === s.id) && (!s.available || s.available(g))) eligible[h.id]!.add(g.age)
          } else {
            // beat records the offered moment's cooldown immediately; its active offer
            // is still eligible for acceptance in this very state.
            if (action.startsWith('beat:') && momentReachable(g, h.id, true)) eligible[h.id]!.add(g.age)
          }
        }
      }
    }))
    return { l, eligible }
  })
  pensions[retirement] = { lives: count, reachedDecision: observed.filter(({ l }) => l.detail.retirement).length,
    lateContent: Object.fromEntries(late.map(h => {
      const experienced = ({ l }: typeof observed[number]) => h.kind === 'story' ? Object.keys(l.decisions).some(k => k.endsWith(':' + h.id)) : l.trace.some(a => a.includes(':moment:' + h.id))
      const eligibleLives = observed.filter(o => o.eligible[h.id]!.size).length
      return [h.id, { eligibleLives, experiencedLives: observed.filter(experienced).length,
        experiencedPctOfEligible: pct(observed.filter(o => o.eligible[h.id]!.size && experienced(o)).length, eligibleLives) }]
    })) }
  if (retirement === 'left') {
    const candidate = observed.find(({ l }) => l.years.some(y => y.tight)) ?? observed.find(({ l }) => l.detail.retirement && l.checkpoints.some(c => c.age === 80)) ?? observed[0]!
    examples.push(exampleLife(candidate.l))
  }
}
writeFileSync(jsonPath, JSON.stringify({ schemaVersion: 1, engineBaseRevision: ENGINE_BASE, scenario: 'S0', seeds: { first: 102, last: 101 + count, count }, mode: 'B',
  methodology: 'Outcome-only supplementary replays, same policies and real actions; catalogue counterfactuals disabled. Next grade is the first grade above the initial post-switch grade in the new job. Missing recovery/promotion is censored, never zero. Late eligibility observed at real tick/beat states, before acceptance; no retirement-path-specific late content is invented.',
  retraining, pensions, examples, integrity }, null, 2) + '\n')
if (integrity.violations || integrity.accountingErrors) process.exitCode = 1
console.error(JSON.stringify(integrity))
