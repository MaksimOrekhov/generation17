/**
 * T7 narrative audit: how often the new money stories, story purchases and late consequences actually happen.
 * Spending reuses the fixed T8a policies (financialDecisions); story answers use a stable hash, as in the pilot.
 * A paid or trip answer that the domain refuses falls back to the first available one, as a player would.
 *
 *   npx tsx scripts/narrative-t7.ts -- 60 --json docs/audit/narrative-t7.json
 */
import { writeFileSync } from 'node:fs'
import storyletsJson from '../content/storylets/economy-t7.json'
import momentsJson from '../content/moments/economy-t7.json'
import { beat, canChoose, createGame, decide, setFocus, takeMoment, tick } from '../src/domain/engine'
import { reserveYearsOf } from '../src/domain/economy'
import { findInconsistencies } from '../src/domain/invariants'
import { moments } from '../src/domain/moments'
import { hash32 } from '../src/domain/random'
import { storylets } from '../src/domain/storylets'
import type { Focus, GameState, Storylet } from '../src/domain/types'
import { financialDecisions, targetFor, type Strategy } from './economy-pilot-core'

const args = process.argv.slice(2).filter(a => a !== '--')
const perPolicy = Number(args[0] ?? 60)
const jsonPath = args.includes('--json') ? args[args.indexOf('--json') + 1] : null
if (!Number.isInteger(perPolicy) || perPolicy < 1 || perPolicy > 2000) throw Error('Usage: npx tsx scripts/narrative-t7.ts -- 60 [--json path]')

const POLICIES: Strategy[] = ['Saver', 'Moderate', 'Family', 'Explorer', 'Spender']
const T7_STORIES = new Set((storyletsJson as { id: string }[]).map(s => s.id))
const T7_MOMENTS = new Set((momentsJson as { id: string }[]).map(m => m.id))
const ECHO_STORIES = ['family-need-key', 'window-last-call', 'trip-memory-friend', 'lower-deck-stranger']
const ECHO_MOMENTS = [...T7_MOMENTS]
const focusFor = (s: Strategy): Focus => s === 'Family' ? 'relationships' : 'study'
const isMoney = (s: Storylet) => s.choices.some(c => c.purchase || c.effects.money !== undefined && c.effects.money !== 0)
const pct = (n: number, d: number) => d ? Math.round(1000 * n / d) / 10 : 0

interface LifeT7 {
  policy: Strategy; seed: number; deathAge: number
  decisions: { age: number; id: string; index: number; money: boolean; paid: number; purchase: string | null; fellBack: boolean; balance: number; reserve: number | null }[]
  momentsSeen: string[]; momentsTaken: string[]; followups: number; violations: string[]; stuck: number; rngDrift: number; negative: number
}

function playLife(seed: number, policy: Strategy, withT7: boolean): LifeT7 {
  let g = createGame(seed)
  const life: LifeT7 = { policy, seed, deathAge: 0, decisions: [], momentsSeen: [], momentsTaken: [], followups: 0, violations: [], stuck: 0, rngDrift: 0, negative: 0 }
  const check = (state: GameState) => {
    for (const v of findInconsistencies(state)) life.violations.push(v)
    if (state.economy.balance < 0) life.negative++
  }
  for (let guard = 0; guard < 130 && !g.stopped; guard++) {
    while (g.pending && !g.stopped) {
      const event = storylets.find(s => s.id === g.pending)!
      const hashed = hash32('narrative-t7', seed, event.id, g.age) % event.choices.length
      const targetOf = (i: number) => event.choices[i]!.purchase?.offer === 'family-trip' ? targetFor(g, 'family-trip') : undefined
      const fellBack = !canChoose(g, hashed, targetOf(hashed)).available
      const index = fellBack ? event.choices.findIndex((_, i) => canChoose(g, i, targetOf(i)).available) : hashed
      const availability = canChoose(g, index, targetOf(index))
      const before = g
      g = decide(g, index, targetOf(index))
      if (g === before) { life.stuck++; break }
      if (g.rng !== before.rng && !event.choices[index]!.check && !event.choices[index]!.effects.addPerson) life.rngDrift++
      if (event.priority === 'followup') life.followups++
      life.decisions.push({ age: before.age, id: event.id, index, money: isMoney(event), paid: availability.cost, purchase: event.choices[index]!.purchase?.offer ?? null, fellBack, balance: before.economy.balance, reserve: reserveYearsOf(before) })
      check(g)
    }
    if (g.pending) break
    const focused = setFocus(g, focusFor(policy))
    if (focused !== g) g = focused
    while (g.phase < 3 && !g.pending && !g.stopped) {
      g = beat(g); check(g)
      if (g.moment) {
        life.momentsSeen.push(g.moment)
        // Half of the moments are taken: a player neither ignores nor clicks everything.
        if (g.attention > 0 && hash32('narrative-t7-moment', seed, g.moment, g.age) % 2 === 0) {
          life.momentsTaken.push(g.moment); g = takeMoment(g); check(g)
        }
      }
    }
    if (g.age >= 16 && !g.stopped && !g.pending) g = financialDecisions(g, policy).game
    g = tick(g); check(g)
  }
  if (!g.stopped) throw Error(`Life did not finish: seed=${seed}, policy=${policy}, withT7=${withT7}`)
  life.deathAge = g.age
  return life
}

function runAll(withT7: boolean) {
  const savedS = [...storylets], savedM = [...moments]
  if (!withT7) {
    storylets.splice(0, storylets.length, ...savedS.filter(s => !T7_STORIES.has(s.id)))
    moments.splice(0, moments.length, ...savedM.filter(m => !T7_MOMENTS.has(m.id)))
  }
  try {
    return POLICIES.flatMap(policy => Array.from({ length: perPolicy }, (_, i) => playLife(102 + i, policy, withT7)))
  } finally {
    storylets.splice(0, storylets.length, ...savedS)
    moments.splice(0, moments.length, ...savedM)
  }
}

const lives = runAll(true)
const baseline = runAll(false)
const adults = lives.filter(l => l.deathAge >= 18)

function perId(ids: Iterable<string>, select: (l: LifeT7) => string[]) {
  return Object.fromEntries([...ids].map(id => {
    const byPolicy = Object.fromEntries(POLICIES.map(p => [p, lives.filter(l => l.policy === p && select(l).includes(id)).length]))
    const total = lives.filter(l => select(l).includes(id)).length
    return [id, { lives: total, pctAdultLives: pct(total, adults.length), byPolicy }]
  }))
}

const storyStats = perId(T7_STORIES, l => l.decisions.map(d => d.id))
const choiceSplit = Object.fromEntries([...T7_STORIES].map(id => {
  const ds = lives.flatMap(l => l.decisions.filter(d => d.id === id))
  const counts: Record<number, number> = {}
  for (const d of ds) counts[d.index] = (counts[d.index] ?? 0) + 1
  return [id, { shown: ds.length, byChoice: counts, paid: ds.filter(d => d.paid > 0).length, fallbacks: ds.filter(d => d.fellBack).length }]
}))
const momentSeen = perId(T7_MOMENTS, l => l.momentsSeen)
const momentTaken = perId(T7_MOMENTS, l => l.momentsTaken)

const allDecisions = lives.flatMap(l => l.decisions)
const moneyDecisions = allDecisions.filter(d => d.money)
let moneyPairs = 0, pairs = 0
for (const l of lives) for (let i = 1; i < l.decisions.length; i++) {
  pairs++
  if (l.decisions[i]!.money && l.decisions[i - 1]!.money) moneyPairs++
}
const echoLife = (l: LifeT7) => l.decisions.some(d => ECHO_STORIES.includes(d.id)) || l.momentsSeen.some(id => ECHO_MOMENTS.includes(id))
const meanOf = (xs: number[]) => xs.length ? Math.round(10 * xs.reduce((a, b) => a + b, 0) / xs.length) / 10 : 0
const continuations = (ls: LifeT7[], t7: boolean) => meanOf(ls.map(l => l.followups + (t7 ? l.momentsSeen.filter(id => T7_MOMENTS.has(id)).length + l.decisions.filter(d => d.id === 'lower-deck-stranger').length : 0)))

const report = {
  generatedAt: new Date().toISOString(),
  perPolicy, policies: POLICIES, lives: lives.length, adultLives: adults.length,
  integrity: {
    violations: lives.reduce((n, l) => n + l.violations.length, 0), samples: lives.flatMap(l => l.violations).slice(0, 10),
    stuckDecisions: lives.reduce((n, l) => n + l.stuck, 0), rngDriftOnPlainChoices: lives.reduce((n, l) => n + l.rngDrift, 0),
    negativeBalances: lives.reduce((n, l) => n + l.negative, 0)
  },
  decisions: {
    total: allDecisions.length, perLife: meanOf(lives.map(l => l.decisions.length)),
    money: moneyDecisions.length, moneyShare: pct(moneyDecisions.length, allDecisions.length),
    moneySharePerPolicy: Object.fromEntries(POLICIES.map(p => {
      const ds = lives.filter(l => l.policy === p).flatMap(l => l.decisions)
      return [p, pct(ds.filter(d => d.money).length, ds.length)]
    })),
    paidAmongMoney: pct(moneyDecisions.filter(d => d.paid > 0).length, moneyDecisions.length),
    storyPurchases: { 'course-pro': allDecisions.filter(d => d.purchase === 'course-pro').length, 'family-trip': allDecisions.filter(d => d.purchase === 'family-trip').length },
    consecutiveMoneyDecisions: moneyPairs, consecutivePairs: pairs,
    t7PerLife: meanOf(lives.map(l => l.decisions.filter(d => T7_STORIES.has(d.id)).length))
  },
  consequences: {
    livesWithLateEcho: pct(lives.filter(echoLife).length, adults.length),
    continuationsPerLife: { before: continuations(baseline, false), after: continuations(lives, true) },
    followupDecisionsPerLife: { before: meanOf(baseline.map(l => l.followups)), after: meanOf(lives.map(l => l.followups)) }
  },
  stories: storyStats, choices: choiceSplit, momentsSeen: momentSeen, momentsTaken: momentTaken,
  unreachable: { stories: Object.entries(storyStats).filter(([, v]) => v.lives === 0).map(([k]) => k), moments: Object.entries(momentSeen).filter(([, v]) => v.lives === 0).map(([k]) => k) },
  baselineDecisionsPerLife: meanOf(baseline.map(l => l.decisions.length)),
  balanceAtRequest: Object.fromEntries(['family-need-cell-small', 'family-need-cell-medium', 'family-need-cell-large', 'family-need-apples', 'window-offer'].map(id => {
    const ds = lives.flatMap(l => l.decisions.filter(d => d.id === id))
    return [id, ds.map(d => `${d.age}:${d.balance}`)]
  })),
  followupShift: (() => {
    const count = (ls: LifeT7[]) => { const c: Record<string, number> = {}; for (const l of ls) for (const d of l.decisions) if (storylets.find(s => s.id === d.id)?.priority === 'followup') c[d.id] = (c[d.id] ?? 0) + 1; return c }
    const a = count(baseline), b = count(lives)
    return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map(id => [id, (b[id] ?? 0) - (a[id] ?? 0)]).filter(([, d]) => d !== 0).sort((x, y) => (x[1] as number) - (y[1] as number)))
  })(),
  allDecisionShift: (() => {
    const count = (ls: LifeT7[]) => { const c: Record<string, number> = {}; for (const l of ls) for (const d of l.decisions) c[d.id] = (c[d.id] ?? 0) + 1; return c }
    const a = count(baseline), b = count(lives)
    return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map(id => [id, (b[id] ?? 0) - (a[id] ?? 0)]).filter(([, d]) => Math.abs(d as number) >= 3).sort((x, y) => (x[1] as number) - (y[1] as number)))
  })()
}
if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.integrity.violations || report.integrity.stuckDecisions || report.integrity.negativeBalances || report.integrity.rngDriftOnPlainChoices) process.exitCode = 1
