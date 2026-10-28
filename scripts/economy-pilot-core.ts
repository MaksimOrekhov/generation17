/** T8a diagnostic runner. Never writes to the engine state except through domain actions. */
import { beat, canChoose, canSetLoad, createGame, decide, purchase, setFocus, setLoad, takeMoment, tick } from '../src/domain/engine'
import { ECONOMY_TUNING, obligationsOf, projectYear, wageOf } from '../src/domain/economy'
import { availableSectorOptions, canBuy, familyTripParticipants, isClosedByShipState, OFFERS, retrainOptions } from '../src/domain/offers'
import type { OfferId, PurchaseAvailability, PurchaseTarget } from '../src/domain/offers'
import { findInconsistencies } from '../src/domain/invariants'
import { hash32 } from '../src/domain/random'
import { storylets } from '../src/domain/storylets'
import type { Focus, GameState, Job, Stat } from '../src/domain/types'
import { describe } from './audit-stats'

export const STRATEGIES = ['Saver', 'Moderate', 'Careerist', 'Family', 'Explorer', 'Spender'] as const
export type Strategy = typeof STRATEGIES[number]
export const OFFER_IDS = Object.keys(OFFERS) as OfferId[]
export const AGES = [20, 40, 60, 80] as const
export const STATS: Stat[] = ['health', 'morale', 'stress', 'bonds', 'knowledge']
export const pct = (n: number, d: number) => d ? 100 * n / d : null
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export interface Candidate { id: OfferId; target?: PurchaseTarget; availability: PurchaseAvailability }
export interface ChoiceQuality {
  age: number; eligible: number; available: number; contested: boolean; moneyConflict: boolean
  attentionConflict: boolean; canBuyAll: boolean; nothingAffordable: boolean; attention: number
  pairs: string[]
  offers: Record<OfferId, { eligible: boolean; available: boolean; reason: string | null }>
}
export interface BuyRecord {
  age: number; id: OfferId; action: 'purchase' | 'restore'; cost: number; attention: number
  target?: PurchaseTarget; immediateEffect: boolean; participantBondDelta: number
}
export interface Checkpoint {
  age: number; balance: number; reserveYears: number | null; tariffYears: number | null
  grade: number; job: string; stats: GameState['stats']; personBonds: number; service: number
}
export interface Annual {
  age: number; balance: number; opening: number; wage: number; pension: number; bills: number
  aid: number; tight: boolean; streak: number; housingLoss: boolean; serviceCancelled: boolean
  rent: number; domeCost: number; domeSubscribed: boolean; domeClosed: boolean; domeUsed: boolean
  reduced: boolean; working: boolean; serviceDelta: number; grade: number; kind: string
}
export interface LoadRecord {
  age: number; to: number; balance: number; requiredReserve: number; projectedBills: number
  projectedReducedIncome: number; annualGap: number; fullIncome: number; reducedIncome: number
  obligations: string
}
export interface PilotOptions {
  acceptMoments?: boolean; noCourses?: boolean; noReducedLoad?: boolean; courseOnly?: boolean
  noPurchases?: boolean
  /** T5 Switcher: платное переобучение с этого возраста; при отказе — повтор ежегодно ещё четыре года. */
  retrainAt?: number
}
/** T5: попытки и итог платного переобучения в одной жизни. */
export interface RetrainRecord {
  attempts: { age: number; result: string }[]
  age: number | null; from: Job | null; to: Job | null
  /** Прогноз оплаты ближайшего года до и после покупки (projectYear, без случайных событий). */
  forecastWageBefore: number | null; forecastWageAfter: number | null
}
export interface Life {
  seed: number; strategy: Strategy; deathAge: number; completed: boolean; checkpoints: Checkpoint[]
  years: Annual[]; purchases: BuyRecord[]; quality: ChoiceQuality[]; loadChanges: LoadRecord[]
  loadChecks: { age: number; available: boolean; reason: string | null; obligations: string; requiredReserve: number }[]
  attempts: { age: number; id: OfferId; result: string }[]; moments: number; memories: number
  followups: number; grade3: number | null; grade4: number | null; wage: number; pension: number
  finalService: number; totalSpent: number; annualSpent: number; purchaseSpent: number
  /** T7: story expenses and catalogue purchases made inside story decisions. */
  storySpent: number
  invariantChecks: number; violations: { action: string; messages: string[]; trace: string[] }[]
  trace: string[]; accountingErrors: string[]; decisions: Record<string, number>
  /** T5: платное переобучение (пустые попытки, если политика его не предусматривает). */
  retrain: RetrainRecord
  /** T5: последний возраст, когда момент предлагался; профессия к концу жизни. */
  momentLog: Record<string, number>; finalJob: Job
}

/** T5: целевая специальность Switcher — чистый хэш seed, без RNG симуляции; всегда одна из трёх других. */
export function retrainTargetFor(g: GameState): Job {
  const options = retrainOptions(g)
  return options[hash32('economy-t5', g.seed, 'retrain-target') % options.length]!
}

/** Same event at the same age always gets the same answer, even after trajectories diverge. */
export function storyChoice(seed: number, id: string, age: number, count: number) {
  return hash32('economy-t8a', seed, id, age) % count
}

/** Targets are selected before affordability: a missing target is never a money refusal. */
export function targetFor(g: GameState, id: OfferId): PurchaseTarget | undefined {
  if (id === 'sector-trip') return { sectorId: availableSectorOptions(g).slice().sort((a, b) => a.id < b.id ? -1 : 1)[0]?.id }
  if (id === 'family-trip') return { participantIds: familyTripParticipants(g).slice()
    .sort((a, b) => b.bond - a.bond || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, 3).map(p => p.id) }
  return undefined
}

export function candidates(g: GameState): Candidate[] {
  return OFFER_IDS.map(id => {
    const target = targetFor(g, id)
    return { id, target, availability: canBuy(g, id, target) }
  })
}
export function resourceRefusal(reason: string | null) {
  return reason?.startsWith('Не хватает ') ?? false
}
const eligible = (c: Candidate) => c.availability.available || resourceRefusal(c.availability.reason)

/** Searches real purchase sequences on immutable states; no fictitious balance/attention. */
export function sequencePossible(g: GameState, remaining: Candidate[]): boolean {
  if (!remaining.length) return true
  return remaining.some((c, index) => {
    const next = purchase(g, c.id, c.target)
    if (next === g) return false
    return sequencePossible(next, remaining.filter((_, i) => i !== index))
  })
}

export function choiceQuality(state: GameState, compact = true): ChoiceQuality {
  // These archives are not read by any current offer or settlement rule. Avoid copying
  // 1,500 diary entries for every hypothetical pair. Preserve all eligibility/effect inputs.
  // The full-state path is retained as an equivalence oracle in tests.
  const g: GameState = compact ? { ...state, history: [], memories: [], forks: [], peers: [],
    seen: [], moodByAge: [], economy: { ...state.economy, years: state.economy.years.slice(-1), ledger: [] } } : state
  const all = candidates(g), cs = all.filter(eligible)
  const available = cs.filter(c => c.availability.available)
  const pairs: string[] = []
  let moneyConflict = false, attentionConflict = false
  for (let i = 0; i < available.length; i++) for (const b of available.slice(i + 1)) {
    const a = available[i]!
    if (sequencePossible(g, [a, b])) continue
    pairs.push(`${a.id}+${b.id}`)
    moneyConflict ||= a.availability.oneTimeCost + b.availability.oneTimeCost > g.economy.balance
    attentionConflict ||= a.availability.attention + b.availability.attention > g.attention
  }
  return { age: g.age, eligible: cs.length, available: available.length, contested: pairs.length > 0,
    moneyConflict, attentionConflict, canBuyAll: cs.length > 0 && sequencePossible(g, cs),
    nothingAffordable: cs.length > 0 && available.length === 0, attention: g.attention, pairs,
    offers: Object.fromEntries(all.map(c => [c.id, { eligible: eligible(c), available: c.availability.available,
      reason: c.availability.reason }])) as ChoiceQuality['offers'] }
}

function focusFor(strategy: Strategy): Focus {
  return strategy === 'Careerist' ? 'work' : strategy === 'Family' ? 'relationships' : 'study'
}

/** Fixed policies chosen before observing the pilot results. */
export function shoppingList(g: GameState, strategy: Strategy, opts: PilotOptions = {}): OfferId[] {
  if (opts.noPurchases || strategy === 'Saver' && !opts.courseOnly) return []
  if (opts.courseOnly) return ['course-pro']
  const courses = g.economy.work.courses
  let ids: OfferId[] = []
  if (strategy === 'Moderate') {
    if (courses < 2) ids.push('course-pro')
    if (g.age >= 26) ids.push('own-cabin')
    if (g.age >= 30) ids.push('dome-pass')
    if (g.age % 10 === 0) ids.push('family-trip')
    if (g.age % 8 === 0) ids.push('sector-trip')
  }
  if (strategy === 'Careerist') ids = ['course-pro']
  if (strategy === 'Family') {
    ids = ['family-trip']
    if (g.age >= 26) ids.push('own-cabin')
    if (g.age >= 30) ids.push('dome-pass')
    if (courses < 1) ids.push('course-pro')
  }
  if (strategy === 'Explorer') {
    ids = ['sector-trip', 'dome-pass']
    if (g.age >= 26) ids.push('own-cabin')
  }
  if (strategy === 'Spender') ids = ['course-pro', 'own-cabin', 'dome-pass', 'family-trip',
    'sector-trip', 'sector-trip', 'sector-trip', 'sector-trip']
  return opts.noCourses ? ids.filter(id => id !== 'course-pro') : ids
}

function obligationsKey(g: GameState) {
  return `H${g.economy.housing}/dome:${g.economy.services['dome-pass'] !== undefined}/child:${obligationsOf(g).essentials > ECONOMY_TUNING.personal}`
}

export function financialDecisions(state: GameState, strategy: Strategy, opts: PilotOptions = {}) {
  let g = state
  const purchases: BuyRecord[] = [], attempts: Life['attempts'] = [], loadChanges: LoadRecord[] = []
  const loadChecks: Life['loadChecks'] = []
  const states: { action: string; game: GameState }[] = []
  const retrainAttempts: RetrainRecord['attempts'] = []
  let retrainBuy: Omit<RetrainRecord, 'attempts'> | null = null
  if (g.stopped || g.pending || g.economy.estate !== null) return { game: g, purchases, attempts, loadChanges, loadChecks, states, retrainAttempts, retrainBuy }
  // T5 Switcher: переобучение рассматривается первым, до остальных трат года.
  if (opts.retrainAt !== undefined && g.economy.lastBought.retrain === undefined && g.age >= opts.retrainAt && g.age < opts.retrainAt + 5) {
    const target = { job: retrainTargetFor(g) }
    const c = canBuy(g, 'retrain', target)
    if (!c.available) retrainAttempts.push({ age: g.age, result: c.reason! })
    else {
      const next = purchase(g, 'retrain', target)
      if (next === g) throw Error('Available retraining refused')
      retrainAttempts.push({ age: g.age, result: 'success' })
      retrainBuy = { age: g.age, from: g.protagonist.job, to: target.job,
        forecastWageBefore: projectYear(g).economy.years.at(-1)!.wage, forecastWageAfter: projectYear(next).economy.years.at(-1)!.wage }
      purchases.push({ age: g.age, id: 'retrain', action: 'purchase', cost: g.economy.balance - next.economy.balance,
        attention: g.attention - next.attention, target, immediateEffect: true, participantBondDelta: 0 })
      g = next
      states.push({ action: `purchase:retrain:${target.job}`, game: g })
    }
  }
  if (strategy === 'Family' && !opts.noReducedLoad && g.age >= 40 && g.economy.work.kind === 'working') {
    if (g.economy.work.load === 1) {
      const c = canSetLoad(g, .6)
      loadChecks.push({ age: g.age, available: c.available, reason: c.reason, obligations: obligationsKey(g), requiredReserve: c.requiredReserve })
      if (c.available && g.economy.balance >= Math.max(c.requiredReserve, 3 * c.projectedBills)) {
        const full = projectYear(g).economy.years.at(-1)!
        const before = g
        g = setLoad(g, .6)
        const reduced = projectYear(g).economy.years.at(-1)!
        loadChanges.push({ age: g.age, to: .6, balance: before.economy.balance, requiredReserve: c.requiredReserve,
          projectedBills: c.projectedBills, projectedReducedIncome: c.projectedIncomeAtReducedLoad,
          annualGap: c.annualGap, fullIncome: full.wage + full.pension, reducedIncome: reduced.wage + reduced.pension,
          obligations: obligationsKey(before) })
        states.push({ action: 'setLoad:0.6', game: g })
      }
    } else {
      const forecast = projectYear(g).economy.years.at(-1)!
      if (g.economy.balance < forecast.bills && canSetLoad(g, 1).available) {
        g = setLoad(g, 1)
        loadChanges.push({ age: g.age, to: 1, balance: g.economy.balance, requiredReserve: 0,
          projectedBills: forecast.bills, projectedReducedIncome: forecast.wage + forecast.pension,
          annualGap: Math.max(0, forecast.bills - forecast.wage - forecast.pension),
          fullIncome: projectYear(g).economy.years.at(-1)!.wage, reducedIncome: forecast.wage,
          obligations: obligationsKey(g) })
        states.push({ action: 'setLoad:1', game: g })
      }
    }
  }
  const list = shoppingList(g, strategy, opts)
  for (const id of list) {
    const target = targetFor(g, id), c = canBuy(g, id, target)
    // Nonfinancially blocked catalogue entries are not attempted purchases.
    if (!eligible({ id, target, availability: c })) continue
    if (!c.available) { attempts.push({ age: g.age, id, result: c.reason! }); continue }
    const next = purchase(g, id, target)
    if (next === g) throw Error(`Available purchase refused: ${id}`)
    const reserve = strategy === 'Moderate' ? 2 : strategy === 'Family' || strategy === 'Explorer' ? 1 : 0
    if (reserve > 0) {
      const projection = projectYear(next), forecast = projection.economy.years.at(-1)!
      if (next.economy.balance < reserve * forecast.bills || projection.economy.tightStreak > 0) {
        attempts.push({ age: g.age, id, result: 'policy-reserve' }); continue
      }
    }
    const participantBondDelta = sum(next.people.map(p => p.bond - (g.people.find(old => old.id === p.id)?.bond ?? p.bond)))
    const immediateEffect = STATS.some(k => next.stats[k] !== g.stats[k]) || participantBondDelta !== 0
      || Object.keys(g.skills).some(k => next.skills[k as keyof GameState['skills']] !== g.skills[k as keyof GameState['skills']])
    purchases.push({ age: g.age, id, action: c.action, cost: g.economy.balance - next.economy.balance,
      attention: g.attention - next.attention, target, immediateEffect, participantBondDelta })
    attempts.push({ age: g.age, id, result: 'success' })
    g = next
    states.push({ action: `${c.action}:${id}:${JSON.stringify(target ?? {})}`, game: g })
    if (strategy === 'Moderate') break
  }
  return { game: g, purchases, attempts, loadChanges, loadChecks, states, retrainAttempts, retrainBuy }
}

/** Records the actual tick settlement (including the year in which death occurs). */
export function annualObservation(before: GameState, after: GameState): Annual {
  const e = after.economy, row = e.years.at(-1)!
  if (row.age !== after.age || after.age !== before.age + 1) throw Error('Expected exactly one new settlement')
  const rent = e.lastBought['own-cabin'] === after.age ? 0 : ECONOMY_TUNING.rent[e.housing]
  const domeSubscribed = before.economy.services['dome-pass'] !== undefined
  const domeClosed = isClosedByShipState(after)
  return { age: after.age, balance: row.balance, opening: before.economy.balance, wage: row.wage,
    pension: row.pension, bills: row.bills, aid: row.aid, tight: e.tightStreak > 0, streak: e.tightStreak,
    housingLoss: e.housing < before.economy.housing,
    serviceCancelled: domeSubscribed && e.services['dome-pass'] === undefined,
    rent, domeCost: row.bills - obligationsOf(after).essentials - rent,
    domeSubscribed, domeClosed: domeSubscribed && domeClosed,
    domeUsed: domeSubscribed && !domeClosed && e.services['dome-pass'] !== undefined,
    reduced: e.work.kind === 'working' && e.work.load === .6, working: e.work.kind === 'working',
    serviceDelta: e.work.service - before.economy.work.service, grade: e.work.grade, kind: e.work.kind }
}

export function playLife(seed: number, strategy: Strategy, opts: PilotOptions = {}): Life {
  let g = createGame(seed)
  const life: Life = { seed, strategy, deathAge: 0, completed: false, checkpoints: [], years: [], purchases: [],
    quality: [], loadChanges: [], loadChecks: [], attempts: [], moments: 0, memories: 0, followups: 0,
    grade3: null, grade4: null, wage: 0, pension: 0, finalService: 0, totalSpent: 0, annualSpent: 0,
    purchaseSpent: 0, storySpent: 0, invariantChecks: 0, violations: [], trace: [], accountingErrors: [], decisions: {},
    retrain: { attempts: [], age: null, from: null, to: null, forecastWageBefore: null, forecastWageAfter: null },
    momentLog: {}, finalJob: g.protagonist.job }
  function check(action: string, state: GameState) {
    life.trace.push(`${state.age}:${action}`)
    life.invariantChecks++
    const messages = findInconsistencies(state)
    if (messages.length) life.violations.push({ action, messages, trace: [...life.trace] })
    if (state.attention < 0 || state.attention > 3) throw Error(`Attention seed=${seed}: ${life.trace.join(',')}`)
  }
  check('create', g)
  for (let guard = 0; guard < 130 && !g.stopped; guard++) {
    while (g.pending && !g.stopped) {
      const event = storylets.find(s => s.id === g.pending)
      if (!event) throw Error(`Unknown pending ${g.pending}`)
      const hashed = storyChoice(seed, event.id, g.age, event.choices.length)
      // T7: a story purchase can be unavailable (money, attention, cooldown, trip participants); fall back to the first available answer.
      const index = canChoose(g, hashed).available ? hashed : event.choices.findIndex((_, i) => canChoose(g, i).available)
      life.decisions[`${g.age}:${event.id}`] = index
      const nextTxn = g.economy.nextTxn
      g = decide(g, index); check(`decide:${event.id}:${index}`, g)
      life.storySpent += sum(g.economy.ledger.filter(t => t.n >= nextTxn && (t.kind === 'purchase' || t.kind === 'story-expense')).map(t => t.amount))
    }
    const nextFocus = setFocus(g, focusFor(strategy))
    if (nextFocus !== g) { g = nextFocus; check(`focus:${g.focus}`, g) }
    while (g.phase < 3 && !g.pending && !g.stopped) {
      g = beat(g); check(`beat:${g.phase}`, g)
      if (opts.acceptMoments && g.moment && g.attention > 0) {
        const id = g.moment
        g = takeMoment(g); life.moments++; check(`moment:${id}`, g)
      }
    }
    // One common shopping window: phase 3, mandatory choice resolved, before next tick.
    if (g.age >= 16 && !g.stopped && !g.pending) {
      if (g.age >= 18) life.quality.push(choiceQuality(g))
      const result = financialDecisions(g, strategy, opts)
      for (const s of result.states) check(s.action, s.game)
      life.purchases.push(...result.purchases); life.attempts.push(...result.attempts)
      life.loadChanges.push(...result.loadChanges); life.loadChecks.push(...result.loadChecks)
      life.retrain.attempts.push(...result.retrainAttempts)
      if (result.retrainBuy) life.retrain = { ...life.retrain, ...result.retrainBuy }
      g = result.game
    }
    const before = g
    g = tick(g); check('tick', g)
    const y = annualObservation(before, g)
    life.years.push(y)
    const grants = sum(g.economy.ledger.filter(t => t.n >= before.economy.nextTxn && t.kind === 'start').map(t => t.amount))
    if (y.balance !== y.opening + y.wage + y.pension + y.aid + grants - y.bills) life.accountingErrors.push(`seed=${seed}, age=${g.age}: settlement does not reconcile`)
    if (life.grade3 === null && y.grade >= 3) life.grade3 = g.age
    if (life.grade4 === null && y.grade >= 4) life.grade4 = g.age
    if (!g.stopped && AGES.some(age => age === g.age)) life.checkpoints.push({ age: g.age,
      balance: g.economy.balance, reserveYears: y.bills > 0 ? g.economy.balance / y.bills : null,
      tariffYears: g.economy.work.kind === 'working' ? g.economy.balance / wageOf(g) : null,
      grade: y.grade, job: g.protagonist.job, stats: { ...g.stats },
      personBonds: sum(g.people.filter(p => p.alive && p.since <= g.age).map(p => p.bond)), service: g.economy.work.service })
  }
  if (!g.stopped) throw Error(`Life did not finish: seed=${seed}, strategy=${strategy}`)
  life.completed = true; life.deathAge = g.age; life.memories = g.memories.length
  life.momentLog = { ...g.momentLog }; life.finalJob = g.protagonist.job
  life.followups = sum(g.forks.map(f => f.outcomes.length))
  life.wage = sum(life.years.map(y => y.wage)); life.pension = sum(life.years.map(y => y.pension))
  life.finalService = g.economy.work.service; life.totalSpent = g.economy.totals.spent
  life.annualSpent = sum(life.years.map(y => y.bills - y.aid))
  life.purchaseSpent = sum(life.purchases.map(p => p.cost))
  if (life.totalSpent !== life.annualSpent + life.purchaseSpent + life.storySpent) life.accountingErrors.push('Lifetime spending does not reconcile')
  return life
}

export function summarizeLives(runs: Life[]) {
  const years = runs.flatMap(l => l.years), quality = runs.flatMap(l => l.quality)
  const buys = runs.flatMap(l => l.purchases.filter(p => p.action === 'purchase'))
  const attempts = runs.flatMap(l => l.attempts)
  const refused = attempts.filter(a => a.result !== 'success' && a.result !== 'policy-reserve')
  const retirees = runs.filter(l => l.years.some(y => y.kind === 'retired'))
  const categoryCosts = Object.fromEntries(OFFER_IDS.map(id => [id,
    sum(buys.filter(p => p.id === id).map(p => p.cost)) + (id === 'own-cabin' ? sum(years.map(y => y.rent)) : id === 'dome-pass' ? sum(years.map(y => y.domeCost)) : 0)]))
  const voluntaryTotal = sum(Object.values(categoryCosts))
  const reducedChanges = runs.flatMap(l => l.loadChanges.filter(c => c.to === .6))
  const loadChecks = runs.flatMap(l => l.loadChecks)
  const exhausted = retirees.filter(l => l.years.some((y, i) => y.kind === 'retired' && y.balance === 0 && l.years.slice(0, i).some(prior => prior.balance > 0)))
  return {
    lives: runs.length, completed: runs.filter(l => l.completed).length, deathAge: describe(runs.map(l => l.deathAge)),
    checkpoints: Object.fromEntries(AGES.map(age => {
      const cs = runs.flatMap(l => l.checkpoints.filter(c => c.age === age))
      return [age, { observations: cs.length, survivingPct: pct(cs.length, runs.length),
        balance: describe(cs.map(c => c.balance)), reserveYears: describe(cs.map(c => c.reserveYears)),
        balanceInAnnualTariffs: describe(cs.map(c => c.tariffYears)),
        grades: Object.fromEntries([1, 2, 3, 4].map(grade => [grade, { count: cs.filter(c => c.grade === grade).length, pct: pct(cs.filter(c => c.grade === grade).length, cs.length) }])),
        stats: Object.fromEntries(STATS.map(k => [k, describe(cs.map(c => c.stats[k]))])),
        personBonds: describe(cs.map(c => c.personBonds)), service: describe(cs.map(c => c.service)) }]
    })),
    purchases: {
      perLife: describe(runs.map(l => l.purchases.filter(p => p.action === 'purchase').length)),
      categoriesPerLife: describe(runs.map(l => new Set(l.purchases.filter(p => p.action === 'purchase').map(p => p.id)).size)),
      noPurchasesPct: pct(runs.filter(l => !l.purchases.some(p => p.action === 'purchase')).length, runs.length),
      firstAge: describe(runs.map(l => l.purchases.find(p => p.action === 'purchase')?.age)),
      byType: Object.fromEntries(OFFER_IDS.map(id => {
        const ps = buys.filter(p => p.id === id)
        return [id, { count: ps.length, lives: runs.filter(l => l.purchases.some(p => p.id === id && p.action === 'purchase')).length,
          perLife: describe(runs.map(l => l.purchases.filter(p => p.id === id && p.action === 'purchase').length)),
          entryCost: sum(ps.map(p => p.cost)), recurringCost: id === 'own-cabin' ? sum(years.map(y => y.rent)) : id === 'dome-pass' ? sum(years.map(y => y.domeCost)) : 0,
          totalCost: categoryCosts[id], voluntarySpendingSharePct: pct(categoryCosts[id]!, voluntaryTotal),
          participantBondDelta: sum(ps.map(p => p.participantBondDelta)) }]
      })),
      totalVoluntarySpending: voluntaryTotal, voluntarySpendingPerLife: describe(runs.map(l => l.purchaseSpent + sum(l.years.map(y => y.rent + y.domeCost)))),
      purchaseOnlySpending: sum(runs.map(l => l.purchaseSpent)), annualSpending: sum(runs.map(l => l.annualSpent)),
      totalSpending: sum(runs.map(l => l.totalSpent)), restorations: runs.flatMap(l => l.purchases).filter(p => p.action === 'restore').length,
      attempts: { actual: attempts.filter(a => a.result !== 'policy-reserve').length, resourceRefusals: refused.length,
        failurePct: pct(refused.length, attempts.filter(a => a.result !== 'policy-reserve').length),
        policyReserveDeferrals: attempts.filter(a => a.result === 'policy-reserve').length,
        byReason: Object.fromEntries([...new Set(refused.map(a => a.result))].sort().map(reason => [reason, refused.filter(a => a.result === reason).length])),
        technicalTargetErrors: attempts.filter(a => /Выберите|участник|сектор/.test(a.result)).length },
      livesWithImmediateMeasuredEffectPct: pct(runs.filter(l => l.purchases.some(p => p.immediateEffect) || l.years.some(y => y.domeUsed)).length, runs.length),
    },
    career: { grade3FirstAge: describe(runs.map(l => l.grade3)), grade4FirstAge: describe(runs.map(l => l.grade4)),
      reached3Pct: pct(runs.filter(l => l.grade3 !== null).length, runs.length), reached4Pct: pct(runs.filter(l => l.grade4 !== null).length, runs.length),
      wagePerLife: describe(runs.map(l => l.wage)), service: describe(runs.map(l => l.finalService)),
      retirees: retirees.length, pensionPerLife: describe(retirees.map(l => l.pension)),
      firstAnnualPension: describe(retirees.map(l => l.years.find(y => y.kind === 'retired')!.pension)),
      pensionCoverage: describe(years.filter(y => y.kind === 'retired').map(y => y.bills > 0 ? y.pension / y.bills : null)) },
    wellbeing: { memories: describe(runs.map(l => l.memories)), followupOutcomes: describe(runs.map(l => l.followups)), momentsPerLife: describe(runs.map(l => l.moments)) },
    hardship: { economicYears: years.filter(y => y.age >= 16).length,
      aidYears: years.filter(y => y.aid > 0).length, aidTotal: sum(years.map(y => y.aid)),
      tightYears: years.filter(y => y.tight).length,
      livesWithTightYearsPct: pct(runs.filter(l => l.years.some(y => y.tight)).length, runs.length),
      maxTightStreak: Math.max(0, ...years.map(y => y.streak)),
      longestStreakPerLife: describe(runs.map(l => Math.max(0, ...l.years.map(y => y.streak)))),
      livesWith5ConsecutiveTightYearsPct: pct(runs.filter(l => l.years.some(y => y.streak >= 5)).length, runs.length),
      housingLosses: years.filter(y => y.housingLoss).length, serviceCancellations: years.filter(y => y.serviceCancelled).length,
      exhaustedOnPension: { count: exhausted.length, retirees: retirees.length, pct: pct(exhausted.length, retirees.length) } },
    dome: { subscribedYears: years.filter(y => y.domeSubscribed).length, usedYears: years.filter(y => y.domeUsed).length,
      paidYears: years.filter(y => y.domeCost > 0).length, freeUsedYears: years.filter(y => y.domeUsed && y.domeCost === 0).length,
      closedSubscribedYears: years.filter(y => y.domeClosed).length, automaticCancellations: years.filter(y => y.serviceCancelled).length,
      voluntaryCancellations: 0 },
    load: { livesUsedPct: pct(runs.filter(l => l.years.some(y => y.reduced)).length, runs.length),
      reducedWorkingYears: years.filter(y => y.reduced).length, workingYears: years.filter(y => y.working).length,
      reducedWorkingYearsPct: pct(years.filter(y => y.reduced).length, years.filter(y => y.working).length),
      firstAge: describe(runs.map(l => l.loadChanges.find(c => c.to === .6)?.age)),
      balanceBefore: describe(reducedChanges.map(c => c.balance)), requiredReserve: describe(reducedChanges.map(c => c.requiredReserve)),
      forecastBills: describe(reducedChanges.map(c => c.projectedBills)), annualIncomeForgone: describe(reducedChanges.map(c => c.fullIncome - c.reducedIncome)),
      annualGap: describe(reducedChanges.map(c => c.annualGap)), returnsToFull: runs.flatMap(l => l.loadChanges).filter(c => c.to === 1).length,
      reducedYearsPerLife: describe(runs.map(l => l.years.filter(y => y.reduced).length)),
      availabilityByObligations: Object.fromEntries([...new Set(loadChecks.map(c => c.obligations))].sort().map(key => {
        const rows = loadChecks.filter(c => c.obligations === key)
        return [key, { checks: rows.length, allowedPct: pct(rows.filter(c => c.available).length, rows.length), requiredReserve: describe(rows.map(c => c.requiredReserve)) }]
      })) },
    choice: { adultYears: quality.length, atLeastTwoEligiblePct: pct(quality.filter(y => y.eligible >= 2).length, quality.length),
      atLeastTwoAvailablePct: pct(quality.filter(y => y.available >= 2).length, quality.length),
      contestedYears: quality.filter(y => y.contested).length, contestedPct: pct(quality.filter(y => y.contested).length, quality.length),
      moneyConflictPct: pct(quality.filter(y => y.moneyConflict).length, quality.length),
      attentionConflictPct: pct(quality.filter(y => y.attentionConflict).length, quality.length),
      canBuyAllPct: pct(quality.filter(y => y.canBuyAll).length, quality.length),
      noEligibleOffersPct: pct(quality.filter(y => y.eligible === 0).length, quality.length),
      noneAffordablePct: pct(quality.filter(y => y.nothingAffordable).length, quality.length),
      attentionAtWindow: describe(quality.map(y => y.attention)),
      byAgeBand: Object.fromEntries([[18, 29], [30, 39], [40, 59], [60, 120]].map(([from, to]) => {
        const rows = quality.filter(y => y.age >= from! && y.age <= to!)
        return [`${from}-${to}`, { years: rows.length, contestedPct: pct(rows.filter(y => y.contested).length, rows.length), canBuyAllPct: pct(rows.filter(y => y.canBuyAll).length, rows.length) }]
      })) },
    invariants: { checks: sum(runs.map(l => l.invariantChecks)), violations: sum(runs.map(l => l.violations.length)),
      firstReproduction: runs.find(l => l.violations.length) ? { seed: runs.find(l => l.violations.length)!.seed,
        strategy: runs.find(l => l.violations.length)!.strategy, violation: runs.find(l => l.violations.length)!.violations[0] } : null },
    accountingErrors: runs.flatMap(l => l.accountingErrors),
    examples: runs.slice(0, 2).map(l => ({ seed: l.seed, deathAge: l.deathAge, checkpoints: l.checkpoints,
      purchases: l.purchases, loadChanges: l.loadChanges,
      contestedYears: l.quality.filter(y => y.contested).map(({ offers: _offers, ...row }) => row) }))
  }
}

/** Availability across all adult windows, independently of whether the policy chooses to spend. */
export function summarizeAvailability(runs: Life[]) {
  const windows = runs.flatMap(l => l.quality)
  return { strategy: runs[0]?.strategy, lives: runs.length, adultWindows: windows.length,
    byOffer: Object.fromEntries(OFFER_IDS.map(id => {
      const rows = windows.map(w => w.offers[id])
      const availableWindows = rows.filter(r => r.available).length
      return [id, { eligibleWindows: rows.filter(r => r.eligible).length, availableWindows,
        availablePctOfAdultWindows: pct(availableWindows, windows.length),
        availableWindowsPerLife: describe(runs.map(l => l.quality.filter(w => w.offers[id].available).length)),
        blockedReasons: Object.fromEntries([...new Set(rows.flatMap(r => r.reason ? [r.reason] : []))].sort()
          .map(reason => [reason, rows.filter(r => r.reason === reason).length])) }]
    })) }
}

/** Paired differences are descriptive; only a single-intervention diagnostic isolates that policy in this model. */
export function pairedComparison(treatment: Life[], control: Life[]) {
  const pairs = treatment.map((l, i) => { const c = control[i]!; if (l.seed !== c.seed) throw Error('Unpaired seeds'); return [l, c] as const })
  return { pairs: pairs.length,
    wageDelta: describe(pairs.map(([t, c]) => t.wage - c.wage)),
    pensionDelta: describe(pairs.map(([t, c]) => t.pension - c.pension)),
    purchaseCostDelta: describe(pairs.map(([t, c]) => t.purchaseSpent - c.purchaseSpent)),
    netWorkIncomeAfterPurchaseDelta: describe(pairs.map(([t, c]) => t.wage - c.wage - (t.purchaseSpent - c.purchaseSpent))),
    atLeastOneCommonCheckpointChangedPct: pct(pairs.filter(([t, c]) => t.checkpoints.some(a => c.checkpoints.some(b => a.age === b.age &&
      (a.grade !== b.grade || STATS.some(k => Math.abs(a.stats[k] - b.stats[k]) > 1e-8) || Math.abs(a.personBonds - b.personBonds) > 1e-8)))).length, pairs.length),
    checkpoints: Object.fromEntries(AGES.map(age => {
      const cs = pairs.flatMap(([t, c]) => { const a = t.checkpoints.find(x => x.age === age), b = c.checkpoints.find(x => x.age === age); return a && b ? [[a, b] as const] : [] })
      return [age, { pairs: cs.length, balanceDelta: describe(cs.map(([a, b]) => a.balance - b.balance)),
        gradeDelta: describe(cs.map(([a, b]) => a.grade - b.grade)), serviceDelta: describe(cs.map(([a, b]) => a.service - b.service)),
        statsDelta: Object.fromEntries(STATS.map(k => [k, describe(cs.map(([a, b]) => a.stats[k] - b.stats[k]))])),
        personBondsDelta: describe(cs.map(([a, b]) => a.personBonds - b.personBonds)) }]
    })) }
}
