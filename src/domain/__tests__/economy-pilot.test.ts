import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyTimeRules } from '../../../scripts/personal-time-rules'
import { beat, createGame, decide, tick } from '../engine'
import { obligationsOf, projectYear, settleYear } from '../economy'
import { residenceOf } from '../birth'
import { availableSectorOptions, canBuy, familyTripParticipants } from '../offers'
import { storylets } from '../storylets'
import { annualObservation, choiceQuality, financialDecisions, playLife, sequencePossible, shoppingList,
  storyChoice, summarizeAvailability, summarizeLives, targetFor } from '../../../scripts/economy-pilot-core'
import type { GameState } from '../types'

/** Synthetic boundary fixture only: production runs always start with untouched createGame(seed). */
function worker(age = 30, balance = 2000): GameState {
  const g = createGame(102)
  g.age = age; g.economy.settledAge = age; g.pending = null
  g.protagonist.job = 'Координатор'; g.economy.balance = balance
  g.economy.work = { ...g.economy.work, job: 'Координатор', kind: 'working', jobSince: 18, gradeSince: 18 }
  g.ship.air = 100; g.ship.food = 100
  g.people.forEach(p => { p.alive = true; p.bond = 60; p.since = 0 })
  return g
}


// The T8/T8a/T5 audit tooling reproduces pre-T9 rules: explicit personal-time compatibility mode
// (3 units every year, the course costs 1). T9 behaviour is covered by personal-time-t9.test.ts.
let restoreTimeRules = () => {}
beforeAll(() => { restoreTimeRules = applyTimeRules('T8') })
afterAll(() => restoreTimeRules())
describe('T8a policy boundaries and accounting', () => {
  it('uses pure event/age hashes and deterministic policies/targets without consuming RNG', () => {
    const g = worker(), before = structuredClone(g)
    expect(storyChoice(102, 'career', 30, 3)).toBe(storyChoice(102, 'career', 30, 3))
    expect(shoppingList(g, 'Moderate')).toEqual(shoppingList(g, 'Moderate'))
    expect(targetFor(g, 'family-trip')).toEqual(targetFor(g, 'family-trip'))
    const quality = choiceQuality(g)
    expect(quality.offers['family-trip'].available).toBe(canBuy(g, 'family-trip', targetFor(g, 'family-trip')).available)
    expect(g).toEqual(before)
    const result = financialDecisions(g, 'Spender')
    expect(result.game.rng).toBe(g.rng)
    expect(result.game.economy.balance).toBe(g.economy.balance - result.purchases.reduce((n, p) => n + p.cost, 0))
    expect(result.game.economy.totals.earned).toBe(g.economy.totals.earned)
  })

  it('shares real attention across purchases and never makes a forbidden call', () => {
    const g = worker(); g.attention = 1
    const r = financialDecisions(g, 'Spender')
    expect(r.purchases.reduce((n, p) => n + p.attention, 0)).toBeLessThanOrEqual(1)
    expect(r.game.attention).toBeGreaterThanOrEqual(0)
    expect(r.states.every(s => s.game.attention >= 0)).toBe(true)
    expect(r.attempts.some(a => a.result.includes('личного времени'))).toBe(true)
  })

  it('makes no economic action while pending or after death', () => {
    for (const mode of ['pending', 'dead'] as const) {
      const g = worker(40)
      if (mode === 'pending') g.pending = 'retirement'
      else { g.stopped = true; g.economy.estate = g.economy.balance }
      const r = financialDecisions(g, 'Family')
      expect(r.game).toBe(g); expect(r.states).toEqual([])
      expect(r.purchases).toEqual([]); expect(r.loadChanges).toEqual([])
    }
  })

  it('selects an explicit legal discounted sector, never repeats, stops at four', () => {
    let g = worker(30, 10000)
    const visited: string[] = []
    for (let year = 0; year < 5; year++) {
      const expected = availableSectorOptions(g).map(s => s.id).sort()[0]
      const r = financialDecisions(g, 'Explorer')
      const trip = r.purchases.find(p => p.id === 'sector-trip')
      if (expected) {
        expect(trip?.target?.sectorId).toBe(expected); expect(trip?.cost).toBe(180)
        expect(trip?.target?.sectorId).not.toBe(residenceOf(g)); visited.push(expected)
      } else expect(trip).toBeUndefined()
      g = r.game; g.age++; g.attention = 3
    }
    expect(visited.length).toBe(4); expect(new Set(visited).size).toBe(4)
  })

  it('chooses two or three existing eligible people and observes the five-year family cooldown', () => {
    const g = worker(30, 10000), ids = targetFor(g, 'family-trip')!.participantIds!
    expect(ids.length).toBeGreaterThanOrEqual(2); expect(ids.length).toBeLessThanOrEqual(3)
    expect(ids.every(id => familyTripParticipants(g).some(p => p.id === id))).toBe(true)
    const r = financialDecisions(g, 'Family')
    expect(r.purchases.some(p => p.id === 'family-trip')).toBe(true)
    const next = structuredClone(r.game)
    for (let gap = 1; gap <= 5; gap++) {
      next.age = g.age + gap; next.attention = 3
      const trips = financialDecisions(next, 'Family').purchases.filter(p => p.id === 'family-trip')
      expect(trips.length).toBe(gap === 5 ? 1 : 0)
    }
    const alone = worker(); alone.people = alone.people.slice(0, 1)
    expect(financialDecisions(alone, 'Family').purchases.some(p => p.id === 'family-trip')).toBe(false)
  })

  it('does not misclassify missing targets, age rules or cooldowns as financial errors', () => {
    const g = worker()
    expect(canBuy(g, 'sector-trip').reason).toMatch(/Выберите/)
    const r = financialDecisions(g, 'Spender')
    expect(r.attempts.some(a => /Выберите|участник|сектор/.test(a.result))).toBe(false)
    const child = worker(15)
    expect(financialDecisions(child, 'Spender').purchases).toEqual([])
  })

  it('counts real pair conflicts across categories and checks both sequences; empty catalogue is separate', () => {
    const g = worker(30, 400)
    const q = choiceQuality(g)
    expect(q.contested).toBe(true); expect(q.moneyConflict).toBe(true)
    expect(q.pairs).toContain('course-pro+own-cabin')
    g.attention = 1; g.economy.balance = 10000
    expect(choiceQuality(g).attentionConflict).toBe(true)
    g.attention = 3
    expect(choiceQuality(g).contested).toBe(false)
    expect(choiceQuality(g).canBuyAll).toBe(true)
    expect(sequencePossible(g, [])).toBe(true)
    g.stopped = true
    const empty = choiceQuality(g)
    expect(empty.eligible).toBe(0); expect(empty.canBuyAll).toBe(false); expect(empty.nothingAffordable).toBe(false)
  })

  it('archive compaction preserves the exact full-state purchase-sequence assessment', () => {
    for (const age of [18, 20, 40, 60, 80]) for (const balance of [0, 400, 10000]) for (const attention of [0, 1, 3]) {
      const g = worker(age, balance); g.attention = attention
      expect(choiceQuality(g)).toEqual(choiceQuality(g, false))
    }
  })

  it('keeps actual recurring bills separate from entries, including closure and cancellation', () => {
    const g = worker(30, 4000)
    const bought = financialDecisions(g, 'Spender')
    const before = bought.game, after = structuredClone(before)
    after.age++; const projection = projectYear(before)
    settleYear(after)
    const y = annualObservation(before, after)
    expect(y.bills).toBe(projection.economy.years.at(-1)!.bills)
    expect(y.rent).toBe(280); expect(y.domeCost).toBe(90)
    expect(y.bills).toBe(obligationsOf(after).essentials + y.rent + y.domeCost)
    expect(after.economy.balance).toBe(before.economy.balance + y.wage + y.pension + y.aid - y.bills)
    expect(after.economy.totals.spent - g.economy.totals.spent).toBe(bought.purchases.reduce((n, p) => n + p.cost, 0) + y.bills - y.aid)
    const closed = structuredClone(before); closed.age++; closed.ship.air = 20; settleYear(closed)
    expect(annualObservation(before, closed)).toMatchObject({ domeClosed: true, domeCost: 0, domeUsed: false })
    const poorBefore = worker(80, 0)
    poorBefore.economy.work.kind = 'retired'; poorBefore.economy.work.path = 'left'
    poorBefore.economy.work.lastWage = 650; poorBefore.economy.housing = 1
    poorBefore.economy.services['dome-pass'] = 30
    const poorAfter = structuredClone(poorBefore); poorAfter.age++; settleYear(poorAfter)
    expect(annualObservation(poorBefore, poorAfter)).toMatchObject({ housingLoss: true, serviceCancelled: true, domeCost: 0, rent: 0 })
  })

  it('records free H1 restoration as restoration, not a new paid acquisition', () => {
    const g = worker(40)
    g.economy.housingRight = { tier: 1, until: 43 }
    const r = financialDecisions(g, 'Explorer')
    const restoration = r.purchases.find(p => p.id === 'own-cabin')!
    expect(restoration).toMatchObject({ action: 'restore', cost: 0 })
    expect(r.game.economy.ledger.some(t => t.ref === 'own-cabin')).toBe(false)
  })
})

describe('T8a real full lives', () => {
  it('matches an independent no-spend domain loop without manufactured income or skipped choices', () => {
    let g = createGame(102)
    while (!g.stopped) {
      if (g.pending) {
        const ev = storylets.find(s => s.id === g.pending)!
        g = decide(g, storyChoice(102, ev.id, g.age, ev.choices.length))
      } else {
        while (g.phase < 3) g = beat(g)
        g = tick(g)
      }
    }
    const l = playLife(102, 'Saver')
    expect(l.purchases).toEqual([])
    expect(l.totalSpent).toBe(g.economy.totals.spent)
    expect(l.wage + l.pension).toBe(g.economy.totals.earned)
    expect(l.years.at(-1)?.balance).toBe(g.economy.balance)
    expect(l.violations).toEqual([]); expect(l.accountingErrors).toEqual([])
  }, 60000)

  it('reproduces two complete paired batches and a meaningful Saver vs Spender contrast', () => {
    const run = () => ['Saver', 'Spender'].map(s => [102, 103].map(seed => playLife(seed, s as 'Saver' | 'Spender')))
    const a = run(), b = run()
    expect(a).toEqual(b)
    const saver = summarizeLives(a[0]!), spender = summarizeLives(a[1]!)
    expect(spender.purchases.purchaseOnlySpending).toBeGreaterThan(saver.purchases.purchaseOnlySpending)
    expect(spender.purchases.categoriesPerLife.mean!).toBeGreaterThan(saver.purchases.categoriesPerLife.mean!)
    for (const l of a.flat()) {
      expect(l.completed).toBe(true); expect(l.violations).toEqual([]); expect(l.accountingErrors).toEqual([])
      expect(l.totalSpent).toBe(l.annualSpent + l.purchaseSpent + l.storySpent)
      expect(l.quality.every(y => y.attention >= 0 && y.attention <= 3)).toBe(true)
      const familyAges = l.purchases.filter(p => p.id === 'family-trip').map(p => p.age)
      expect(familyAges.every((age, i) => i === 0 || age - familyAges[i - 1]! >= 5)).toBe(true)
      expect(l.purchases.every(p => p.age < l.deathAge)).toBe(true)
    }
  }, 60000)

  it('uses living checkpoints only, with explicit survival denominators and null empty summaries', () => {
    const life = playLife(102, 'Saver')
    expect(summarizeAvailability([life]).adultWindows).toBe(life.quality.length)
    // Reuse a real record with removed checkpoints to represent a non-observed life; never insert zeros.
    const report = summarizeLives([life, { ...life, checkpoints: [] }])
    const c = report.checkpoints[40]!
    expect(c.observations).toBe(1); expect(c.survivingPct).toBe(50)
    expect(c.balance.p50).toBe(life.checkpoints.find(c => c.age === 40)!.balance)
    expect(summarizeLives([{ ...life, checkpoints: [] }]).checkpoints[80]!.balance.p50).toBeNull()
  }, 60000)
})
