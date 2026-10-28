/** Full T8 observer; reuses T8a actions/statistics and T5 paired career measurements. */
import { beat, canChoose, canSetLoad, createGame, decide, eligibleMoments, purchase, resolveText, setFocus, takeMoment, tick } from '../src/domain/engine'
import { annualObligationsOf, professionSkillOf, projectYear, reserveYearsOf, wageOf } from '../src/domain/economy'
import { isKnown } from '../src/domain/birth'
import { findInconsistencies } from '../src/domain/invariants'
import { canBuy, getOffer, OFFERS, availableSectorOptions, familyTripParticipants, retrainOptions } from '../src/domain/offers'
import type { OfferId, PurchaseTarget } from '../src/domain/offers'
import { moments } from '../src/domain/moments'
import { storylets } from '../src/domain/storylets'
import { hash32 } from '../src/domain/random'
import type { Focus, GameState, Job, Stat, Storylet } from '../src/domain/types'
import { annualObservation, choiceQuality, financialDecisions, retrainTargetFor, sequencePossible, storyChoice, targetFor } from './economy-pilot-core'
import type { Annual, BuyRecord, Candidate, Checkpoint, Life, Strategy } from './economy-pilot-core'
import t7Stories from '../content/storylets/economy-t7.json'
import t7Moments from '../content/moments/economy-t7.json'

export const ENGINE_BASE = 'add6aa3c90a7b555333609a4326f9bd19699cab5'
export const MAIN_POLICIES = ['Saver', 'Moderate', 'Careerist', 'Family', 'Explorer', 'Spender', 'Switcher', 'TimeBuyer', 'StoryHelper'] as const
export type PolicyName = typeof MAIN_POLICIES[number]
export type RetirementPath = 'left' | 'mentor' | 'continue'
export interface Policy {
  name: string; base: Strategy; strictSaver?: boolean; helper?: boolean; timeBuyer?: boolean
  fullLoad?: boolean; switchAge?: number; targetOffset?: number; retirement?: RetirementPath
}
export function policyFor(name: PolicyName): Policy {
  if (name === 'Switcher') return { name, base: 'Careerist', switchAge: 35, targetOffset: 0 }
  if (name === 'TimeBuyer') return { name, base: 'Moderate', timeBuyer: true }
  if (name === 'StoryHelper') return { name, base: 'Moderate', helper: true }
  return { name, base: name, strictSaver: name === 'Saver' }
}
export function focusFor(policy: Policy, age: number): Focus {
  if (policy.timeBuyer && age >= 40) return age % 3 === 0 ? 'relationships' : 'rest'
  return policy.base === 'Careerist' ? 'work' : policy.base === 'Family' ? 'relationships' : 'study'
}
export const IDS = Object.keys(OFFERS) as OfferId[]
export const ALL_STATS: Stat[] = ['health', 'morale', 'stress', 'bonds', 'knowledge', 'reputation']
/** Selection stamps cooldown immediately, while the active offer remains accept-able. */
export function momentReachable(g: GameState, id: string, includeActive = false): boolean {
  return !g.stopped && !g.pending && g.attention > 0 && ((includeActive && g.moment === id) || eligibleMoments(g).some(m => m.id === id))
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const unique = (xs: number[]) => [...new Set(xs)]

/** Keep every domain condition/effect input; discard archives only for hypothetical calculations. */
export function leanState(g: GameState): GameState {
  return { ...g, history: [], memories: [], forks: [], peers: [], seen: [], moodByAge: [],
    economy: { ...g.economy, years: g.economy.years.slice(-1), ledger: [] } }
}
export function targetForOffer(g: GameState, id: OfferId, offset = 0): PurchaseTarget | undefined {
  if (id !== 'retrain') return targetFor(g, id)
  const jobs = retrainOptions(g), original = jobs.indexOf(retrainTargetFor(g))
  return { job: jobs[(Math.max(0, original) + offset) % jobs.length] }
}
export function targetForChoice(g: GameState, event: Storylet, index: number) {
  const id = event.choices[index]?.purchase?.offer
  return id ? targetForOffer(g, id) : undefined
}

/** Pure common policy; semantic preferences are confined to the explicitly named help stories. */
export function chooseStory(g: GameState, policy: Policy) {
  const event = storylets.find(s => s.id === g.pending)
  if (!event) throw Error(`Unknown pending: ${g.pending}`)
  const options = event.choices.map((choice, index) => {
    const target = targetForChoice(g, event, index), a = canChoose(g, index, target)
    return { index, target, a, choice }
  })
  const allowed = options.filter(o => o.a.available && !(policy.strictSaver && (o.a.cost > 0 || o.choice.purchase)))
  if (!allowed.length) throw Error(`No available answer seed=${g.seed} age=${g.age} event=${event.id}`)
  let index = storyChoice(g.seed, event.id, g.age, event.choices.length)
  if (event.id === 'retirement' && policy.retirement) {
    index = event.choices.findIndex(c => c.effects.flags?.retirementPath === policy.retirement)
  } else if (policy.helper && /^family-need-cell-(small|medium|large)$/.test(event.id)) {
    index = 2
    if (hash32('economy-t8-help', g.seed, event.id, g.age) % 3 !== 0) {
      const bills = annualObligationsOf(g)
      const preferred = allowed.find(o => o.a.cost > 0 && g.economy.balance - o.a.cost >= (o.index === 0 ? 2 : 1) * bills)
      if (preferred) index = preferred.index
    }
  }
  return { event, options, selected: allowed.find(o => o.index === index) ?? allowed[0]! }
}

export type Blocker = 'money' | 'attention' | 'age' | 'cooldown' | 'target' | 'conditions' | 'none'
export function blocker(g: GameState, id: OfferId, reason: string | null): Blocker {
  if (!reason) return 'none'
  if (/^Не хватает .*кр\.$/.test(reason)) return 'money'
  if (/^Не хватает .*внимания/.test(reason)) return 'attention'
  if (/^Доступно (с|до) /.test(reason)) return 'age'
  if (/Следующ|через .*год|через .*лет/.test(reason)) return 'cooldown'
  if (id === 'sector-trip' && !availableSectorOptions(g).length || id === 'family-trip' && familyTripParticipants(g).length < 2
    || /^Выберите |участник|сектор.*неизвест/.test(reason)) return 'target'
  return 'conditions'
}

export interface ForecastRisk { risk: boolean; aid: number; housingLoss: boolean; cancelled: boolean; lowBuffer: boolean; balances: number[] }
/** Three consecutive projectYear calls, carrying its economy and the same known child ageing as projectYears. */
export function forecastRisk(state: GameState, count = 3): ForecastRisk {
  let g = leanState(state)
  const out: ForecastRisk = { risk: false, aid: 0, housingLoss: false, cancelled: false, lowBuffer: false, balances: [] }
  for (let i = 0; i < count; i++) {
    const p = projectYear(g), row = p.economy.years.at(-1)
    if (p.projectedAge === null || !row) break
    out.aid += row.aid; out.housingLoss ||= p.economy.housing < g.economy.housing
    out.cancelled ||= Object.keys(g.economy.services).some(id => !(id in p.economy.services))
    out.lowBuffer ||= row.wage + row.pension < row.bills && row.balance < row.bills
    out.balances.push(row.balance)
    g = { ...g, age: p.projectedAge, economy: p.economy,
      people: g.people.map(person => person.id === 'child' && person.alive ? { ...person, age: person.age + 1 } : person) }
  }
  out.risk = out.aid > 0 || out.housingLoss || out.cancelled || out.lowBuffer
  return out
}

export interface FullQuality {
  age: number; eligible: number; available: number; categories: number; moneyConflict: boolean; attentionConflict: boolean
  historicalContested: boolean; canBuyAll: boolean; noEligible: boolean; nothingAvailable: boolean
  moneyBound: boolean; attentionBound: boolean; ageBound: boolean; cooldownBound: boolean; targetBound: boolean; conditionBound: boolean
  intertemporal: boolean; loadAvailable: boolean; offers: Record<string, { eligible: boolean; available: boolean; blocker: Blocker; cost: number }>
}
export function fullQuality(state: GameState, compact = true): FullQuality {
  const g = compact ? leanState(state) : state
  const entries = IDS.map(id => {
    const target = targetForOffer(g, id), a = canBuy(g, id, target), why = blocker(g, id, a.reason)
    return { id, target, availability: a, why, eligible: why === 'none' || why === 'money' || why === 'attention' }
  })
  const cs = entries.filter(c => c.eligible), available = cs.filter(c => c.availability.available)
  let moneyConflict = false, attentionConflict = false
  for (let i = 0; i < available.length; i++) for (const b of available.slice(i + 1)) {
    const a = available[i]!
    if (getOffer(a.id)!.category === getOffer(b.id)!.category || sequencePossible(g, [a, b])) continue
    moneyConflict ||= a.availability.oneTimeCost + b.availability.oneTimeCost > g.economy.balance
    attentionConflict ||= a.availability.attention + b.availability.attention > g.attention
  }
  const baseRisk = forecastRisk(g)
  const intertemporal = !baseRisk.risk && available.some(c => forecastRisk(purchase(g, c.id, c.target)).risk)
  const loadAvailable = canSetLoad(g, .6).available
  return { age: g.age, eligible: cs.length, available: available.length, categories: new Set(available.map(c => getOffer(c.id)!.category)).size,
    moneyConflict, attentionConflict, historicalContested: choiceQuality(g).contested,
    canBuyAll: cs.length > 0 && fullSequencePossible(g, cs), noEligible: cs.length === 0, nothingAvailable: cs.length > 0 && available.length === 0,
    moneyBound: cs.some(c => g.economy.balance < c.availability.oneTimeCost),
    attentionBound: cs.some(c => g.attention < c.availability.attention),
    ageBound: entries.some(c => c.why === 'age'), cooldownBound: entries.some(c => c.why === 'cooldown'), targetBound: entries.some(c => c.why === 'target'),
    conditionBound: entries.some(c => c.why === 'conditions'), intertemporal, loadAvailable,
    offers: Object.fromEntries(entries.map(c => [c.id, { eligible: c.eligible, available: c.availability.available, blocker: c.why, cost: c.availability.oneTimeCost }])) }
}

/** Attention cannot be refunded by any catalogue purchase; prune impossible permutations exactly. */
export function fullSequencePossible(g: GameState, remaining: Candidate[]): boolean {
  if (sum(remaining.map(c => c.availability.attention)) > g.attention) return false
  if (!remaining.length) return true
  return remaining.some((c, i) => {
    const next = purchase(g, c.id, c.target)
    return next !== g && fullSequencePossible(next, remaining.filter((_, j) => i !== j))
  })
}

export const OFFER_HOOKS: Record<OfferId, string[]> = {
  'course-pro': ['m-window-course'], retrain: [],
  'own-cabin': ['cabin-closed-door', 'm-cabin-asleep', 'm-cabin-thursday', 'm-cabin-curtain'],
  'dome-pass': ['m-dome-pruner', 'm-dome-trays'],
  'sector-trip': ['lower-deck-stranger', 'm-sector-engineering', 'm-sector-bio', 'm-sector-clinic'],
  'family-trip': ['trip-memory-friend', 'm-trip-ticket', 'm-trip-photo', 'm-window-trip']
}
const rawHooks = [...t7Stories.map(s => ({ ...s, kind: 'story' as const })), ...t7Moments.map(m => ({ ...m, kind: 'moment' as const }))]
export const HOOKS = rawHooks.map(raw => {
  const item = raw.kind === 'story' ? storylets.find(s => s.id === raw.id) : moments.find(m => m.id === raw.id)
  if (!item) throw Error(`Missing T7 hook ${raw.id}`)
  const r = raw.requires as { since?: Record<string, number>; ownedYears?: Record<string, { min?: number }> }
  const lag = Math.min(...[...Object.values(r?.since ?? {}), ...Object.values(r?.ownedYears ?? {}).map(v => v.min ?? 0)].filter(n => n > 0))
  return { id: raw.id, kind: raw.kind, title: raw.title, min: raw.min, max: raw.max, lag: Number.isFinite(lag) ? lag : 0, delayed: Number.isFinite(lag), item }
})
export interface HookObservation { eligible: number[]; ageBlocked: number[]; otherBlocked: number[]; offered: number[]; experienced: number[] }
export interface PurchaseDetail extends BuyRecord { source: 'shop' | 'story'; stateAtCap: boolean; positiveEffects: number; cappedEffects: number; attenuatedEffects: number }
export interface T8Year extends Annual { job: Job; load: number; child: boolean; mentorWage: number; stats: GameState['stats'] }
export interface T8Checkpoint extends Checkpoint { memories: number; followups: number; meanBond: number | null; liveClosePeople: number }
export interface StoryWindow { age: number; id: string; index: number; text: string; cost: number; income: number; available: number; paidCategories: number; job: Job }
export interface T8Life extends Life {
  years: T8Year[]; purchases: PurchaseDetail[]; checkpoints: T8Checkpoint[]
  detail: {
    policy: Policy; mode: boolean; quality: FullQuality[]; hooks: Record<string, HookObservation>; storyWindows: StoryWindow[]
    storyIncome: number; storyCatalogueCost: number; startCapital: number; balancesReconciled: number
    workChanges: { age: number; job: Job; kind: string; grade: number; load: number; service: number; path: string | null }[]
    retirement: { age: number; path: string; beforeFingerprint: number } | null
    saturation: { positive: number; capped: number; attenuated: number }; offeredMoments: number; storyDecisions: number
    professionEvents: { age: number; id: string; job: Job; kind: 'story' | 'offered' | 'accepted' }[]
  }
}

function observeHooks(g: GameState, life: T8Life, kind: 'story' | 'moment') {
  if (g.age < 18) return
  for (const hook of HOOKS.filter(h => h.kind === kind)) {
    const o = life.detail.hooks[hook.id]!
    if (hook.kind === 'story' && g.seen.includes(hook.id) && g.pending !== hook.id) continue
    const m = hook.kind === 'moment' ? moments.find(m => m.id === hook.id)! : null
    if (m && g.momentLog[m.id] !== undefined && g.age - g.momentLog[m.id]! < m.cooldown) continue
    if (g.age < hook.min || g.age > hook.max) { o.ageBlocked.push(g.age); continue }
    const fits = (!m?.needs || m.needs.every(id => isKnown(g, id))) && (!hook.item.available || hook.item.available(g))
    if (fits && (!m || g.attention > 0)) o.eligible.push(g.age)
    else o.otherBlocked.push(g.age)
  }
}

export function purchaseDetail(before: GameState, after: GameState, p: BuyRecord, source: 'shop' | 'story'): PurchaseDetail {
  const offer = getOffer(p.id)!, gains: { expected: number; actual: number; atCap: boolean }[] = []
  for (const [key, amount] of Object.entries(offer.effects.stats ?? {})) {
    if (p.action === 'restore' || p.id === 'own-cabin' && before.economy.owned['own-cabin'] !== undefined) continue
    const k = key as Stat
    if (k === 'stress' ? amount < 0 : amount > 0) gains.push({ expected: Math.abs(amount), actual: Math.abs(after.stats[k] - before.stats[k]), atCap: k === 'stress' ? before.stats[k] === 0 : before.stats[k] === 100 })
  }
  if (offer.effects.professionalSkill) {
    const k = professionSkillOf(before.protagonist.job)
    if (k) gains.push({ expected: offer.effects.professionalSkill.amount, actual: after.skills[k] - before.skills[k], atCap: before.skills[k] >= offer.effects.professionalSkill.cap })
  }
  if (offer.effects.familyTripBond) for (const id of p.target?.participantIds ?? []) {
    const a = before.people.find(p => p.id === id)!, b = after.people.find(p => p.id === id)!
    gains.push({ expected: offer.effects.familyTripBond, actual: b.bond - a.bond, atCap: a.bond === 100 })
  }
  return { ...p, source, stateAtCap: gains.some(g => g.atCap), positiveEffects: gains.length,
    cappedEffects: gains.filter(g => g.atCap || g.actual < 1e-9).length, attenuatedEffects: gains.filter(g => g.actual + 1e-9 < g.expected).length }
}

/** Additional observers see real post-action states. Outcome-only diagnostics may skip
 * hypothetical catalogue enumeration; this never changes actions or the simulated state. */
export interface PlayOptions { observeChoiceQuality?: boolean; onState?: (state: GameState, action: string) => void }
export function playT8(seed: number, policy: Policy, acceptMoments = false, options: PlayOptions = {}): T8Life {
  let g = createGame(seed)
  const life: T8Life = { seed, strategy: policy.base, deathAge: 0, completed: false, checkpoints: [], years: [], purchases: [], quality: [],
    loadChanges: [], loadChecks: [], attempts: [], moments: 0, memories: 0, followups: 0, grade3: null, grade4: null, wage: 0, pension: 0,
    finalService: 0, totalSpent: 0, annualSpent: 0, purchaseSpent: 0, storySpent: 0, invariantChecks: 0, violations: [], trace: [], accountingErrors: [], decisions: {},
    retrain: { attempts: [], age: null, from: null, to: null, forecastWageBefore: null, forecastWageAfter: null }, momentLog: {}, finalJob: g.protagonist.job,
    detail: { policy, mode: acceptMoments, quality: [], hooks: Object.fromEntries(HOOKS.map(h => [h.id, { eligible: [], ageBlocked: [], otherBlocked: [], offered: [], experienced: [] }])),
      storyIncome: 0, storyCatalogueCost: 0, startCapital: 0, balancesReconciled: 0, workChanges: [], retirement: null, saturation: { positive: 0, capped: 0, attenuated: 0 },
      offeredMoments: 0, storyDecisions: 0, storyWindows: [], professionEvents: [] } }
  function check(action: string, state: GameState) {
    life.trace.push(`${state.age}:${action}`); life.invariantChecks++
    const messages = findInconsistencies(state)
    if (messages.length) life.violations.push({ action, messages, trace: [...life.trace] })
    if (state.attention < 0 || state.attention > 3) throw Error(`Attention: ${seed} ${action}`)
    options.onState?.(state, action)
  }
  function recordPurchase(before: GameState, after: GameState, p: BuyRecord, source: 'shop' | 'story') {
    const d = purchaseDetail(before, after, p, source)
    life.purchases.push(d); life.detail.saturation.positive += d.positiveEffects; life.detail.saturation.capped += d.cappedEffects; life.detail.saturation.attenuated += d.attenuatedEffects
    if (source === 'story') life.detail.storyCatalogueCost += p.cost
  }
  check('create', g)
  for (let guard = 0; guard < 130 && !g.stopped; guard++) {
    observeHooks(g, life, 'story')
    while (g.pending && !g.stopped) {
      const { event, options, selected } = chooseStory(g, policy), before = g
      if (event.id === 'retirement') life.detail.retirement = { age: g.age, path: String(selected.choice.effects.flags?.retirementPath), beforeFingerprint: hash32(JSON.stringify(g)) }
      const economic = event.choices.some(c => c.purchase || c.effects.money !== undefined)
      if (economic || event.id === 'retirement') life.detail.storyWindows.push({ age: g.age, id: event.id, index: selected.index,
        text: resolveText(g, selected.choice.text), cost: selected.a.cost, income: Math.max(0, selected.choice.effects.money ?? 0),
        available: options.filter(o => o.a.available).length, paidCategories: new Set(options.filter(o => o.a.available && o.choice.purchase).map(o => getOffer(o.choice.purchase!.offer)!.category)).size,
        job: g.protagonist.job })
      life.decisions[`${g.age}:${event.id}`] = selected.index; life.detail.storyDecisions++
      life.detail.professionEvents.push({ age: g.age, id: event.id, job: g.protagonist.job, kind: 'story' })
      g = decide(g, selected.index, selected.target)
      if (g === before || g.pending === before.pending) throw Error(`Stuck decision seed=${seed}: ${event.id}`)
      check(`decide:${event.id}:${selected.index}:${JSON.stringify(selected.target ?? {})}`, g)
      const h = life.detail.hooks[event.id]; if (h) { h.offered.push(g.age); h.experienced.push(g.age) }
      const tx = g.economy.ledger.filter(t => t.n >= before.economy.nextTxn)
      life.storySpent += sum(tx.filter(t => t.kind === 'story-expense').map(t => t.amount))
      life.detail.storyIncome += sum(tx.filter(t => t.kind === 'windfall').map(t => t.amount))
      if (selected.choice.purchase) {
        const c = selected.a.purchase!, id = selected.choice.purchase.offer
        recordPurchase(before, g, { age: g.age, id, action: c.action, cost: c.oneTimeCost, attention: c.attention, target: selected.target,
          immediateEffect: ALL_STATS.some(k => before.stats[k] !== g.stats[k]), participantBondDelta: sum(g.people.map(p => p.bond - (before.people.find(a => a.id === p.id)?.bond ?? p.bond))) }, 'story')
      }
    }
    const nextFocus = setFocus(g, focusFor(policy, g.age))
    if (nextFocus !== g) { g = nextFocus; check(`focus:${g.focus}`, g) }
    while (g.phase < 3 && !g.pending && !g.stopped) {
      observeHooks(g, life, 'moment')
      g = beat(g); check(`beat:${g.phase}`, g)
      if (g.moment) {
        const id = g.moment; life.detail.offeredMoments++
        life.detail.hooks[id]?.offered.push(g.age)
        life.detail.professionEvents.push({ age: g.age, id, job: g.protagonist.job, kind: 'offered' })
        if (acceptMoments && g.attention > 0) {
          const before = g; g = takeMoment(g)
          if (g !== before) {
            life.moments++; life.detail.hooks[id]?.experienced.push(g.age)
            life.detail.professionEvents.push({ age: g.age, id, job: g.protagonist.job, kind: 'accepted' })
            life.detail.storyIncome += sum(g.economy.ledger.filter(t => t.n >= before.economy.nextTxn && t.kind === 'windfall').map(t => t.amount))
            check(`moment:${id}`, g)
          }
        }
      }
    }
    if (g.age >= 16 && !g.stopped && !g.pending) {
      if (g.age >= 18 && options.observeChoiceQuality !== false) { life.quality.push(choiceQuality(g)); life.detail.quality.push(fullQuality(g)) }
      if (policy.switchAge !== undefined && life.retrain.age === null && g.age >= policy.switchAge && g.age < policy.switchAge + 5) {
        const target = targetForOffer(g, 'retrain', policy.targetOffset ?? 0), c = canBuy(g, 'retrain', target)
        life.retrain.attempts.push({ age: g.age, result: c.available ? 'success' : c.reason! })
        if (c.available) {
          const before = g; g = purchase(g, 'retrain', target)
          life.retrain = { ...life.retrain, age: g.age, from: before.protagonist.job, to: target!.job!,
            forecastWageBefore: projectYear(before).economy.years.at(-1)!.wage, forecastWageAfter: projectYear(g).economy.years.at(-1)!.wage }
          recordPurchase(before, g, { age: g.age, id: 'retrain', action: c.action, cost: c.oneTimeCost, attention: c.attention, target,
            immediateEffect: true, participantBondDelta: 0 }, 'shop')
          check(`purchase:retrain:${target!.job}`, g)
        }
      }
      if (policy.timeBuyer && !policy.fullLoad) {
        const r = financialDecisions(g, 'Family', { noPurchases: true })
        for (const s of r.states) check(s.action, s.game)
        life.loadChanges.push(...r.loadChanges); life.loadChecks.push(...r.loadChecks); g = r.game
      }
      const r = financialDecisions(g, policy.base, { noReducedLoad: policy.fullLoad })
      let cursor = g, buyIndex = 0
      for (const s of r.states) {
        if (s.action.startsWith('purchase:') || s.action.startsWith('restore:')) recordPurchase(cursor, s.game, r.purchases[buyIndex++]!, 'shop')
        check(s.action, s.game); cursor = s.game
      }
      life.loadChanges.push(...r.loadChanges); life.loadChecks.push(...r.loadChecks); life.attempts.push(...r.attempts); g = r.game
    }
    const before = g; g = tick(g); check('tick', g)
    const y = annualObservation(before, g), w = g.economy.work
    life.years.push({ ...y, job: w.job, load: w.load, child: g.people.some(p => p.id === 'child' && p.alive && p.age < 16 && p.since <= g.age), mentorWage: w.kind === 'retired' ? y.wage : 0, stats: { ...g.stats } })
    const grants = sum(g.economy.ledger.filter(t => t.n >= before.economy.nextTxn && t.kind === 'start').map(t => t.amount))
    life.detail.startCapital += grants; life.detail.balancesReconciled++
    if (y.balance !== y.opening + y.wage + y.pension + y.aid + grants - y.bills) life.accountingErrors.push(`Annual mismatch: seed=${seed} age=${g.age}`)
    if (life.grade3 === null && y.grade >= 3) life.grade3 = g.age
    if (life.grade4 === null && y.grade >= 4) life.grade4 = g.age
    const change = { age: g.age, job: w.job, kind: w.kind, grade: w.grade, load: w.load, service: w.service, path: w.path }
    const last = life.detail.workChanges.at(-1)
    if (!last || last.job !== change.job || last.kind !== change.kind || last.grade !== change.grade || last.load !== change.load || last.path !== change.path) life.detail.workChanges.push(change)
    if (!g.stopped && [20, 40, 60, 65, 70, 80].includes(g.age)) {
      const people = g.people.filter(p => isKnown(g, p.id)), close = people.filter(p => p.bond >= 50)
      life.checkpoints.push({ age: g.age, balance: g.economy.balance, reserveYears: reserveYearsOf(g), tariffYears: w.kind === 'working' ? g.economy.balance / wageOf(g) : null,
        grade: w.grade, job: g.protagonist.job, stats: { ...g.stats }, personBonds: sum(people.map(p => p.bond)), service: w.service,
        memories: g.memories.length, followups: sum(g.forks.map(f => f.outcomes.length)), meanBond: people.length ? sum(people.map(p => p.bond)) / people.length : null, liveClosePeople: close.length })
    }
  }
  if (!g.stopped) throw Error(`Unfinished life ${seed} ${policy.name}`)
  life.completed = true; life.deathAge = g.age; life.memories = g.memories.length; life.followups = sum(g.forks.map(f => f.outcomes.length))
  life.momentLog = { ...g.momentLog }; life.finalJob = g.protagonist.job
  life.wage = sum(life.years.map(y => y.wage)); life.pension = sum(life.years.map(y => y.pension)); life.finalService = g.economy.work.service
  life.totalSpent = g.economy.totals.spent; life.annualSpent = sum(life.years.map(y => y.bills - y.aid)); life.purchaseSpent = sum(life.purchases.map(p => p.cost))
  if (life.totalSpent !== life.annualSpent + life.purchaseSpent + life.storySpent) life.accountingErrors.push(`Lifetime spending mismatch ${seed}`)
  if (g.economy.totals.earned !== life.wage + life.pension + life.detail.storyIncome) life.accountingErrors.push(`Lifetime income mismatch ${seed}`)
  if (g.economy.balance !== life.detail.startCapital + g.economy.totals.earned + g.economy.totals.aid - g.economy.totals.spent) life.accountingErrors.push(`Lifetime balance mismatch ${seed}`)
  for (const o of Object.values(life.detail.hooks)) for (const key of ['eligible', 'ageBlocked', 'otherBlocked', 'offered', 'experienced'] as const) o[key] = unique(o[key])
  return life
}
