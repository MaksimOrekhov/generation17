import { describe, expect, it } from 'vitest'
import { annualObligationsOf, projectYears, reserveYearsOf, settleYear } from '../economy'
import { canChoose, canSetLoad, purchase } from '../engine'
import { availableSectorOptions, canBuy, familyTripParticipants, retrainOptions } from '../offers'
import { findInconsistencies } from '../invariants'
import { financialDecisions, sequencePossible } from '../../../scripts/economy-pilot-core'
import { blocker, chooseStory, forecastRisk, fullQuality, fullSequencePossible, IDS, leanState, momentReachable, playT8, policyFor, purchaseDetail, targetForOffer } from '../../../scripts/economy-t8-core'
import { comparePolicies, hookReach, summarizeT8 } from '../../../scripts/economy-t8-metrics'
import { rulesSnapshot, withScenario } from '../../../scripts/economy-t8-scenarios'
import { moneyWorker } from './t6-fixtures'

const worker = (balance = 5000, age = 35) => { const g = moneyWorker(balance, age); g.pending = null; return g }

describe('T8 protocol and real domain actions', () => {
  it('fills targets before querying the catalogue, with deterministic legal professions/sectors/people', () => {
    const g = worker(), before = structuredClone(g)
    const job = targetForOffer(g, 'retrain')!.job!
    expect(retrainOptions(g)).toContain(job); expect(job).not.toBe(g.protagonist.job)
    const sector = targetForOffer(g, 'sector-trip')!.sectorId!
    expect(availableSectorOptions(g).map(s => s.id).sort()[0]).toBe(sector)
    const people = targetForOffer(g, 'family-trip')!.participantIds!
    expect(people.every(id => familyTripParticipants(g).some(p => p.id === id))).toBe(true)
    expect(new Set([0, 1, 2].map(offset => targetForOffer(g, 'retrain', offset)!.job)).size).toBe(3)
    expect(g).toEqual(before)
  })
  it('treats missing targets and real absence of participants as nonfinancial restrictions', () => {
    const g = worker()
    expect(blocker(g, 'retrain', canBuy(g, 'retrain').reason)).toBe('target')
    expect(blocker(g, 'sector-trip', canBuy(g, 'sector-trip').reason)).toBe('target')
    g.people = []
    expect(blocker(g, 'family-trip', canBuy(g, 'family-trip', { participantIds: [] }).reason)).toBe('target')
  })
  it('supplies real participants for a story purchase without mutating state or RNG', () => {
    const g = worker(); g.pending = 'window-offer'
    const before = structuredClone(g), result = chooseStory(g, policyFor('Moderate'))
    const trip = result.options[1]!
    expect(trip.target?.participantIds!.every(id => familyTripParticipants(g).some(p => p.id === id))).toBe(true)
    expect(trip.a.available).toBe(canChoose(g, 1, trip.target).available)
    expect(g).toEqual(before)
  })
  it('falls back to a real free alternative and makes Saver a strict accumulation control', () => {
    const g = worker(); g.pending = 'window-offer'; g.attention = 0
    const result = chooseStory(g, policyFor('Spender'))
    expect(result.selected.index).toBe(2)
    g.attention = 3
    expect(chooseStory(g, policyFor('Saver')).selected.index).toBe(2)
  })
  it('StoryHelper uses its declared context and does not invariably choose a paid answer', () => {
    const results = Array.from({ length: 12 }, (_, i) => {
      const g = moneyWorker(2000, 30, i + 1); g.pending = 'family-need-cell-small'
      const before = structuredClone(g), r = chooseStory(g, policyFor('StoryHelper'))
      expect(g).toEqual(before)
      return r.selected.a.cost
    })
    expect(results.some(cost => cost > 0)).toBe(true); expect(results.some(cost => cost === 0)).toBe(true)
  })
  it('uses real retraining and preserves the ten-year pause and one-year internship', () => {
    let g = worker(10000), target = targetForOffer(g, 'retrain')!
    const first = purchase(g, 'retrain', target)
    expect(first).not.toBe(g); expect(first.economy.balance).toBe(9500)
    g = first
    for (let i = 1; i <= 10; i++) {
      g.age++; g.attention = 3; settleYear(g)
      if (i === 1) expect(g.economy.work.kind).toBe('trainee')
      if (i === 2) expect(g.economy.work.kind).toBe('working')
      target = targetForOffer(g, 'retrain')!
      if (i < 10) { const before = structuredClone(g); expect(purchase(g, 'retrain', target)).toBe(g); expect(g).toEqual(before) }
    }
    expect(canBuy(g, 'retrain', target).available).toBe(true)
    expect(findInconsistencies(g)).toEqual([])
  })
  it('reduced-load policy delegates eligibility/reserve to canSetLoad and real setLoad', () => {
    const g = worker(3000, 40); g.economy.housing = 1; g.economy.services['dome-pass'] = 30
    const c = canSetLoad(g, .6), r = financialDecisions(g, 'Family', { noPurchases: true })
    expect(c.available).toBe(true); expect(r.game.economy.work.load).toBe(.6)
    expect(r.loadChanges[0]!.requiredReserve).toBe(c.requiredReserve)
    expect(r.game.economy.balance).toBe(g.economy.balance); expect(r.game.rng).toBe(g.rng)
  })
})

describe('T8 financial and temporal metrics', () => {
  it('counts an active offered moment as reachable despite its already-stamped cooldown', () => {
    const g = worker(5000, 70); g.moment = 'm-late-cup'; g.momentLog['m-late-cup'] = 70
    expect(momentReachable(g, 'm-late-cup')).toBe(false)
    expect(momentReachable(g, 'm-late-cup', true)).toBe(true)
    g.attention = 0
    expect(momentReachable(g, 'm-late-cup', true)).toBe(false)
  })
  it('archive compaction preserves every reported full-choice metric', () => {
    for (const balance of [400, 3000]) for (const attention of [1, 3]) {
      const g = worker(balance); g.attention = attention
      expect(fullQuality(g)).toEqual(fullQuality(g, false))
    }
  })
  it('pruned sequence search agrees with exhaustive real actions for the full six-offer set', () => {
    const g = leanState(worker())
    const cs = IDS.map(id => ({ id, target: targetForOffer(g, id), availability: canBuy(g, id, targetForOffer(g, id)) }))
    expect(fullSequencePossible(g, cs)).toBe(sequencePossible(g, cs))
    expect(fullSequencePossible(g, cs)).toBe(false)
  })
  it('separates financial conflict from attention conflict', () => {
    const money = fullQuality(worker(400))
    expect(money.moneyConflict).toBe(true); expect(money.attentionConflict).toBe(false)
    const g = worker(10000); g.attention = 1
    const time = fullQuality(g)
    expect(time.moneyConflict).toBe(false); expect(time.attentionConflict).toBe(true)
  })
  it('no eligible catalogue is not total poverty or an opportunity to buy everything', () => {
    const g = worker(); g.stopped = true; g.economy.estate = g.economy.balance
    const q = fullQuality(g)
    expect(q.noEligible).toBe(true); expect(q.nothingAvailable).toBe(false); expect(q.canBuyAll).toBe(false)
  })
  it('three-year projection matches projectYears including known child ageing and preserves RNG', () => {
    const g = worker(); g.economy.housing = 1; g.economy.services['dome-pass'] = 30
    g.people.push({ id: 'child', name: 'Тест', role: 'Сын', age: 15, since: 20, alive: true, bond: 60 })
    const before = structuredClone(g)
    expect(forecastRisk(g).balances).toEqual(projectYears(g, 3).map(y => y.row.balance))
    expect(g).toEqual(before)
  })
  it('flags loss of affordable commitments, not every reduction of a healthy reserve', () => {
    const g = worker(500, 80); g.economy.work.kind = 'retired'; g.economy.work.path = 'left'
    expect(forecastRisk(g).risk).toBe(false)
    expect(fullQuality(g).intertemporal).toBe(true)
    const rich = { ...g, economy: { ...g.economy, balance: 10000 } }
    expect(fullQuality(rich).intertemporal).toBe(false)
  })
  it('zero commitments produce null coverage without NaN and remain non-risky', () => {
    const g = worker(0, 16); g.economy.work.kind = 'trainee'; g.economy.work.until = 18
    expect(annualObligationsOf(g)).toBe(0); expect(reserveYearsOf(g)).toBeNull()
    expect(forecastRisk(g).risk).toBe(false)
  })
  it('counts capped course skill separately from the still-real qualification course', () => {
    const g = worker(); g.skills.engineering = 60
    const next = purchase(g, 'course-pro')
    const p = purchaseDetail(g, next, { age: g.age, id: 'course-pro', cost: 350, action: 'purchase', attention: 1, immediateEffect: false, participantBondDelta: 0 }, 'shop')
    expect(p.cappedEffects).toBe(1); expect(next.economy.work.courses).toBe(g.economy.work.courses + 1)
  })
})

describe('T8 complete lives and aggregation', () => {
  it('outcome-only observation preserves every actual action, outcome and RNG-dependent event', () => {
    const full = playT8(102, policyFor('Switcher'), true), states: string[] = []
    const observed = playT8(102, policyFor('Switcher'), true, { observeChoiceQuality: false, onState: (_g, action) => { states.push(action) } })
    expect(observed).toEqual({ ...full, quality: [], detail: { ...full.detail, quality: [] } })
    expect(states.length).toBe(full.invariantChecks)
  }, 60000)
  it('same seeds and reversed policy order reproduce complete lives and aggregates', () => {
    const names = ['Saver', 'Switcher', 'TimeBuyer'] as const
    const first = new Map(names.map(name => [name, playT8(102, policyFor(name), true)]))
    for (const name of names.slice().reverse()) {
      const again = playT8(102, policyFor(name), true)
      expect(again).toEqual(first.get(name)); expect(summarizeT8([again])).toEqual(summarizeT8([first.get(name)!]))
      expect(again.violations).toEqual([]); expect(again.accountingErrors).toEqual([])
    }
  }, 60000)
  it('spending reconciles with actual settlements, receipts and catalogue actions in stories', () => {
    const l = playT8(102, policyFor('Spender'), true)
    expect(l.totalSpent).toBe(l.annualSpent + l.purchaseSpent + l.storySpent)
    expect(l.purchases.every(p => p.age < l.deathAge)).toBe(true)
    expect(l.quality.every(q => q.attention >= 0 && q.attention <= 3)).toBe(true)
    const s = summarizeT8([l])
    expect(s.spending.entryFees).toBe(l.purchaseSpent)
    expect(s.spending.voluntaryTotal).toBe(l.purchaseSpent + l.storySpent + l.years.reduce((n, y) => n + y.rent + y.domeCost, 0))
    expect(l.violations).toEqual([]); expect(l.accountingErrors).toEqual([])
  }, 60000)
  it('keeps dead observations missing and includes all six hero statistics', () => {
    const l = playT8(102, policyFor('Moderate'))
    const s = summarizeT8([l, { ...l, checkpoints: [] }])
    expect(s.checkpoints[40]!.observations).toBe(1); expect(s.checkpoints[40]!.survivingPct).toBe(50)
    expect(s.checkpoints[40]!.balance.p50).toBe(l.checkpoints.find(c => c.age === 40)!.balance)
    expect(s.wellbeingAtAge[40]!.stats.reputation).toBeDefined()
  }, 60000)
  it('purchase records and diary memories alone are not a narrative consequence; denominator is eligible buyers', () => {
    const l = playT8(102, policyFor('Explorer'), false)
    expect(l.purchases.some(p => p.id === 'dome-pass')).toBe(true)
    const reach = hookReach([l], 'dome-pass')
    expect(reach.experiencedLives).toBe(0)
    const blank = { ...l, detail: { ...l.detail, hooks: Object.fromEntries(Object.keys(l.detail.hooks).map(id => [id, { eligible: [], ageBlocked: [], otherBlocked: [], offered: [], experienced: [] }])) } }
    const noEligibility = hookReach([blank], 'dome-pass')
    expect(noEligibility.buyers).toBe(1); expect(noEligibility.eligibleBuyers).toBe(0); expect(noEligibility.experiencedPctOfEligible).toBeNull()
  }, 60000)
  it('forces pensions through the real retirement decision with identical prehistory', () => {
    const lives = (['left', 'mentor', 'continue'] as const).map(retirement => playT8(102, { ...policyFor('Moderate'), retirement }, false))
    expect(lives.map(l => l.detail.retirement?.path)).toEqual(['left', 'mentor', 'continue'])
    expect(new Set(lives.map(l => l.detail.retirement?.beforeFingerprint)).size).toBe(1)
    expect(comparePolicies([lives[2]!], [lives[0]!]).preRetirementFingerprintsMatch).toBe(true)
    expect(lives[1]!.years.some(y => y.mentorWage > 0)).toBe(true)
  }, 60000)
  it('S0 executes without changing or leaking any process-local parameter', () => {
    const before = rulesSnapshot()
    expect(withScenario('S0', () => rulesSnapshot())).toEqual(before)
    expect(rulesSnapshot()).toEqual(before)
  })
})
