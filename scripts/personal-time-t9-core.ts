/**
 * T9 personal-time audit: the same seeds and policies under the old (T8) and new (T9) rules.
 * Every state change goes through real domain actions (decide, beat, takeMoment, purchase, setLoad, tick);
 * policies never consume game RNG. Rule sets are process-local (personal-time-rules.ts) and always restored.
 */
import { beat, canTakeMoment, createGame, decide, setFocus, takeMoment, tick } from '../src/domain/engine'
import { isKnown } from '../src/domain/birth'
import { findInconsistencies } from '../src/domain/invariants'
import { moments } from '../src/domain/moments'
import { canBuy } from '../src/domain/offers'
import type { OfferId } from '../src/domain/offers'
import type { TimeBasis } from '../src/domain/personalTime'
import type { GameState } from '../src/domain/types'
import { financialDecisions, targetFor } from './economy-pilot-core'
import { chooseStory, focusFor, leanState, policyFor } from './economy-t8-core'
import type { Policy, PolicyName } from './economy-t8-core'
import { withTimeRules } from './personal-time-rules'
import type { TimeRulesetName } from './personal-time-rules'
import t9Moments from '../content/moments/personal-time-t9.json'

export const T9_POLICIES = ['Careerist', 'Moderate', 'Family', 'TimeBuyer', 'Spender', 'Saver'] as const satisfies readonly PolicyName[]
export const T9_MOMENT_IDS = new Set((t9Moments as { id: string }[]).map(m => m.id))
/** planned — a player keeps time for the purchases their strategy plans this year; greedy — takes every moment first. */
export type MomentPolicy = 'planned' | 'greedy'
export type ContentMode = 'T8' | 'T9'
export interface Mode { key: string; rules: TimeRulesetName; content: ContentMode; moments: MomentPolicy }

export const MODES = {
  /** Old rules, old catalogue: the T8 world. */
  A: { key: 'A', rules: 'T8', content: 'T8', moments: 'planned' },
  /** New allowances and costs only: no free-evening roll, old catalogue. */
  N: { key: 'N', rules: 'T9-nofree', content: 'T8', moments: 'planned' },
  /** Full T9 rules (with the free-evening roll), old catalogue: isolates the new content. */
  B: { key: 'B', rules: 'T9', content: 'T8', moments: 'planned' },
  /** Shipped T9: new rules and the free-time moments. */
  C: { key: 'C', rules: 'T9', content: 'T9', moments: 'planned' },
  /** Sensitivity: greedy moments under old and new rules. */
  AG: { key: 'AG', rules: 'T8', content: 'T8', moments: 'greedy' },
  CG: { key: 'CG', rules: 'T9', content: 'T9', moments: 'greedy' }
} as const satisfies Record<string, Mode>

/** The pre-T9 catalogue is the current one without the T9 moments (same approach as the T6/T7 baselines). */
export function withContent<T>(content: ContentMode, run: () => T): T {
  if (content === 'T9') return run()
  const saved = [...moments]
  moments.splice(0, moments.length, ...saved.filter(m => !T9_MOMENT_IDS.has(m.id)))
  try { return run() } finally { moments.splice(0, moments.length, ...saved) }
}
export function withMode<T>(mode: Mode, run: () => T): T {
  return withTimeRules(mode.rules, () => withContent(mode.content, run))
}

export interface YearRecord {
  age: number; basis: TimeBasis; limit: number; left: number; kind: string; load: number
  offered: number; accepted: number; declinedForPlan: number; emptyBeats: number
  momentSpend: number; purchaseSpend: number; storySpend: number
}
export interface WindowRecord {
  age: number; basis: TimeBasis
  /** Per offer: 'available' | 'time' (blocked only by personal time) | 'money' | 'other'. */
  offers: Partial<Record<OfferId, 'available' | 'time' | 'money' | 'other'>>
}
export interface T9Life {
  seed: number; policy: string; mode: string; deathAge: number
  years: YearRecord[]; windows: WindowRecord[]
  purchases: { age: number; id: OfferId; source: 'shop' | 'story'; time: number; cost: number }[]
  timeBlockedAttempts: { age: number; id: string }[]
  acceptedMoments: { age: number; id: string; basis: TimeBasis }[]
  offeredT9: { age: number; id: string }[]
  grade3: number | null; grade4: number | null
  wage: number; pension: number; finalBalance: number
  memories: number; followups: number; storylets: number
  checkpoints: { age: number; stats: GameState['stats']; meanBond: number | null; closePeople: number; balance: number }[]
  reducedYears: number; retiredYears: number
  invariantChecks: number; violations: string[]
}

const TIME_REASON = /^Не хватает (личного времени|.*внимания)/
const classify = (reason: string | null): 'available' | 'time' | 'money' | 'other' =>
  reason === null ? 'available' : TIME_REASON.test(reason) ? 'time' : /^Не хватает \d+ кр\.$/.test(reason) ? 'money' : 'other'
const WINDOW_OFFERS: OfferId[] = ['course-pro', 'retrain', 'sector-trip', 'family-trip']
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** The purchases a policy would make right now: the same function the shop window of the audit calls. */
function plannedIds(g: GameState, policy: Policy) {
  return financialDecisions(g, policy.base, { noReducedLoad: true }).purchases.map(p => p.id).join(',')
}

export function playT9(seed: number, policy: Policy, mode: Mode): T9Life {
  let g = createGame(seed)
  const life: T9Life = { seed, policy: policy.name, mode: mode.key, deathAge: 0, years: [], windows: [], purchases: [], timeBlockedAttempts: [],
    acceptedMoments: [], offeredT9: [], grade3: null, grade4: null, wage: 0, pension: 0, finalBalance: 0, memories: 0, followups: 0, storylets: 0,
    checkpoints: [], reducedYears: 0, retiredYears: 0, invariantChecks: 0, violations: [] }
  const check = (action: string, s: GameState) => {
    life.invariantChecks++
    if (s.attention < 0 || s.attention > s.timeYear.limit) throw Error(`Personal time out of bounds seed=${seed} ${action}`)
    const problems = findInconsistencies(s)
    if (problems.length) life.violations.push(`${seed}:${policy.name}:${mode.key}:${action}: ${problems.join('; ')}`)
  }
  check('create', g)
  for (let guard = 0; guard < 130 && !g.stopped; guard++) {
    const year: YearRecord = { age: g.age, basis: g.timeYear.basis, limit: g.timeYear.limit, left: 0, kind: g.economy.work.kind, load: g.economy.work.load,
      offered: 0, accepted: 0, declinedForPlan: 0, emptyBeats: 0, momentSpend: 0, purchaseSpend: 0, storySpend: 0 }
    while (g.pending && !g.stopped) {
      const { selected } = chooseStory(g, policy), before = g
      g = decide(g, selected.index, selected.target)
      if (g === before) throw Error(`Stuck decision seed=${seed}`)
      check(`decide:${before.pending}`, g)
      year.storySpend += before.attention - g.attention
      if (selected.choice.purchase) life.purchases.push({ age: g.age, id: selected.choice.purchase.offer, source: 'story', time: before.attention - g.attention, cost: before.economy.balance - g.economy.balance })
    }
    const focused = setFocus(g, focusFor(policy, g.age))
    if (focused !== g) { g = focused; check('focus', g) }
    while (g.phase < 3 && !g.pending && !g.stopped) {
      if (g.attention === 0) year.emptyBeats++
      g = beat(g); check(`beat:${g.phase}`, g)
      if (!g.moment) continue
      year.offered++
      if (T9_MOMENT_IDS.has(g.moment)) life.offeredT9.push({ age: g.age, id: g.moment })
      if (!canTakeMoment(g)) continue
      if (mode.moments === 'planned' && g.age >= 16) {
        // Hypothetical plans run on a lean copy (no diary archives): same eligibility inputs, cheaper clones.
        const lean = leanState(g)
        if (plannedIds(lean, policy) !== plannedIds(takeMoment(lean), policy)) { year.declinedForPlan++; continue }
      }
      const before = g, id = g.moment
      g = takeMoment(g); check(`moment:${id}`, g)
      year.accepted++; year.momentSpend += before.attention - g.attention
      life.acceptedMoments.push({ age: g.age, id, basis: g.timeYear.basis })
    }
    if (g.age >= 16 && !g.stopped && !g.pending) {
      if (g.age >= 18) {
        const offers: WindowRecord['offers'] = {}
        for (const id of WINDOW_OFFERS) offers[id] = classify(canBuy(g, id, targetFor(g, id) ?? (id === 'retrain' ? { job: g.protagonist.job === 'Техник' ? 'Медик' : 'Техник' } : undefined)).reason)
        life.windows.push({ age: g.age, basis: g.timeYear.basis, offers })
      }
      if (policy.timeBuyer && !policy.fullLoad) {
        const r = financialDecisions(g, 'Family', { noPurchases: true })
        for (const s of r.states) check(s.action, s.game)
        g = r.game
      }
      const r = financialDecisions(g, policy.base, { noReducedLoad: policy.fullLoad })
      let cursor = g
      for (const s of r.states) {
        if (s.action.startsWith('purchase:') || s.action.startsWith('restore:')) {
          const id = s.action.split(':')[1] as OfferId
          life.purchases.push({ age: g.age, id, source: 'shop', time: cursor.attention - s.game.attention, cost: cursor.economy.balance - s.game.economy.balance })
          year.purchaseSpend += cursor.attention - s.game.attention
        }
        check(s.action, s.game); cursor = s.game
      }
      for (const a of r.attempts) if (TIME_REASON.test(a.result)) life.timeBlockedAttempts.push({ age: a.age, id: a.id })
      g = r.game
    }
    year.left = g.attention
    life.years.push(year)
    if (year.basis === 'reduced') life.reducedYears++
    if (year.basis === 'retired' || year.basis === 'mentor') life.retiredYears++
    g = tick(g); check('tick', g)
    const row = g.economy.years.at(-1)
    if (row?.age === g.age) { life.wage += row.wage; life.pension += row.pension }
    const w = g.economy.work
    if (life.grade3 === null && w.grade >= 3) life.grade3 = g.age
    if (life.grade4 === null && w.grade >= 4) life.grade4 = g.age
    if (!g.stopped && [40, 60, 80].includes(g.age)) {
      const people = g.people.filter(p => isKnown(g, p.id))
      life.checkpoints.push({ age: g.age, stats: { ...g.stats }, meanBond: people.length ? sum(people.map(p => p.bond)) / people.length : null,
        closePeople: people.filter(p => p.bond >= 50).length, balance: g.economy.balance })
    }
  }
  if (!g.stopped) throw Error(`Unfinished life ${seed}`)
  life.deathAge = g.age; life.finalBalance = g.economy.balance; life.memories = g.memories.length
  life.followups = sum(g.forks.map(f => f.outcomes.length)); life.storylets = g.seen.length
  return life
}

export function runBatch(mode: Mode, policy: Policy, seeds: number[]): T9Life[] {
  return withMode(mode, () => seeds.map(seed => playT9(seed, policy, mode)))
}
export { policyFor }
