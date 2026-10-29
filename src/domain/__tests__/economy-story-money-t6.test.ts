import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compileMoment, compileRequires } from '../../content/load'
import { annualObligationsOf, reserveYearsOf, settleYear } from '../economy'
import type { WorkKind } from '../economy'
import { beat, canChoose, checkChance, createGame, decide, skipMoment, takeMoment, tick } from '../engine'
import { findInconsistencies } from '../invariants'
import { moments } from '../moments'
import { random } from '../random'
import { repairSave } from '../save'
import { spendView } from '../spendView'
import { storylets } from '../storylets'
import type { Effects, Storylet } from '../types'
import { moneyStory, moneyWorker } from './t6-fixtures'

let story: Storylet
const storiesLength = storylets.length, momentsLength = moments.length
beforeEach(() => { story = moneyStory(); storylets.push(story) })
afterEach(() => { storylets.splice(storiesLength); moments.splice(momentsLength) })

describe('T6 financial requires', () => {
  it.each([{ min: 750 }, { max: 750 }, { min: 750, max: 750 }])('money includes its boundary %j', range => {
    expect(compileRequires({ money: range })(moneyWorker())).toBe(true)
  })
  it('rejects balances below min and above max', () => {
    expect(compileRequires({ money: { min: 751 } })(moneyWorker())).toBe(false)
    expect(compileRequires({ money: { max: 749 } })(moneyWorker())).toBe(false)
  })
  it.each<WorkKind>(['child', 'trainee', 'working', 'between', 'sick', 'retired'])('work checks status %s, not job', kind => {
    const g = moneyWorker(); g.economy.work.kind = kind
    expect(compileRequires({ work: [kind], job: ['Техник'] })(g)).toBe(true)
    expect(compileRequires({ work: [kind === 'working' ? 'retired' : 'working'] })(g)).toBe(false)
  })
  it.each([1, 2, 3, 4] as const)('grade includes exactly %i', grade => {
    const g = moneyWorker(); g.economy.work.grade = grade
    expect(compileRequires({ grade: { min: grade, max: grade } })(g)).toBe(true)
    expect(compileRequires({ grade: { min: grade + 1 } })(g)).toBe(false)
  })
  it.each([0, 1, 2] as const)('housing includes H%i', housing => {
    const g = moneyWorker(); g.economy.housing = housing
    expect(compileRequires({ housing: { min: housing, max: housing } })(g)).toBe(true)
    expect(compileRequires({ housing: { max: housing - 1 } })(g)).toBe(false)
  })
  it('distinguishes historical cabin ownership, active service and current housing', () => {
    const g = moneyWorker(); g.economy.owned['own-cabin'] = 20; g.economy.services['dome-pass'] = 25
    expect(compileRequires({ owns: ['own-cabin', 'dome-pass'], housing: { max: 0 } })(g)).toBe(true)
    expect(compileRequires({ housing: { min: 1 } })(g)).toBe(false)
    expect(compileRequires({ ownsNot: ['dome-pass'] })(g)).toBe(false)
    delete g.economy.services['dome-pass']
    expect(compileRequires({ ownsNot: ['dome-pass'], owns: ['own-cabin'] })(g)).toBe(true)
    expect(compileRequires({ owns: ['toString'] })(g)).toBe(false)
  })
  it('checks a registered specific sector without treating lastBought as ownership', () => {
    const g = moneyWorker(); g.economy.owned['visit-sector-bio'] = 20; g.economy.lastBought['course-pro'] = 25
    expect(compileRequires({ owns: ['visit-sector-bio'], ownsNot: ['visit-sector-clinic'] })(g)).toBe(true)
    expect(compileRequires({ owns: ['course-pro'] })(g)).toBe(false)
  })
  it('uses actual recurring costs and protected needs without hiding unpaid commitments', () => {
    const g = moneyWorker(1440); g.economy.housing = 1; g.economy.services['dome-pass'] = 20
    expect(annualObligationsOf(g)).toBe(720); expect(reserveYearsOf(g)).toBe(2)
    expect(compileRequires({ reserveYears: { min: 2, max: 2 } })(g)).toBe(true)
    const settled = structuredClone(g); settled.age++; settleYear(settled)
    expect(annualObligationsOf(g)).toBe(settled.economy.years.at(-1)!.bills)
    g.economy.balance = 0; g.economy.work.kind = 'retired'; g.economy.work.path = 'left'; g.age = 80
    expect(annualObligationsOf(g)).toBe(720)
    expect(compileRequires({ reserveYears: { max: .1 } })(g)).toBe(true)
  })
  it('shares service waivers with settlement and includes real child costs', () => {
    const g = moneyWorker(); g.economy.services['dome-pass'] = 20
    g.protagonist.job = 'Агроном'; g.economy.work.job = 'Агроном'
    expect(annualObligationsOf(g)).toBe(290)
    g.protagonist.job = 'Техник'; g.economy.work.job = 'Техник'; g.ship.air = 40
    expect(annualObligationsOf(g)).toBe(350)
    g.people.push({ id: 'child', name: 'Тест', role: 'Сын', alive: true, since: 25, age: 5, bond: 60 })
    expect(annualObligationsOf(g)).toBe(500)
    g.ship.air = 100; expect(annualObligationsOf(g)).toBe(590)
  })
  it('defines zero obligations as unbounded coverage without NaN or Infinity', () => {
    const g = createGame(102)
    expect(annualObligationsOf(g)).toBe(0); expect(reserveYearsOf(g)).toBeNull()
    expect(compileRequires({ reserveYears: { min: 1000 } })(g)).toBe(true)
    expect(compileRequires({ reserveYears: { max: 1000 } })(g)).toBe(false)
  })
  it('ANDs old and financial conditions without mutation or RNG use', () => {
    const g = moneyWorker(); g.flags.t6Ready = true
    const condition = compileRequires({ flag: ['t6Ready'], job: ['Техник'], alive: ['parent'],
      stat: { health: { min: 50 } }, money: { min: 750 }, work: ['working'], grade: { min: 1 }, housing: { max: 0 } })
    const before = structuredClone(g)
    expect(condition(g)).toBe(true); expect(condition(g)).toBe(true); expect(g).toEqual(before)
    g.flags.t6Ready = false; expect(condition(g)).toBe(false)
    g.flags.t6Ready = true; g.people.find(p => p.id === 'parent')!.alive = false; expect(condition(g)).toBe(false)
  })
})

describe('T6 atomic decisions and financial records', () => {
  it.each([399, 300, 0])('rejects a 400-credit choice at balance %i with no side effects', balance => {
    const g = moneyWorker(balance), before = structuredClone(g)
    expect(canChoose(g, 0)).toEqual({ available: false, reason: `Не хватает ${400 - balance} кр.`, cost: 400 })
    expect(decide(g, 0)).toBe(g); expect(g).toEqual(before); expect(g.pending).toBe(story.id)
  })
  it.each([400, 750])('applies payment and ordinary effects once at balance %i', balance => {
    const g = moneyWorker(balance), next = decide(g, 0)
    expect(next.economy.balance).toBe(balance - 400); expect(next.economy.totals.spent).toBe(400)
    expect(next.economy.totals.earned).toBe(0); expect(next.economy.totals.given).toBe(0)
    expect(next.economy.ledger).toHaveLength(1)
    expect(next.economy.ledger[0]).toMatchObject({ kind: 'story-expense', amount: 400, ref: story.id })
    expect(next.stats.health).toBe(52); expect(next.flags.t6Paid).toBe(true)
    expect(next.memories).toContain(story.choices[0]!.effects.memory)
    expect(next.pending).toBeNull(); expect(next.rng).toBe(g.rng)
    expect(decide(next, 0)).toBe(next); expect(findInconsistencies(next)).toEqual([])
    expect(decide(g, 0)).toEqual(next)
  })
  it('records positive money as earned windfall without spending or RNG', () => {
    const g = moneyWorker(), next = decide(g, 2)
    expect(next.economy.balance).toBe(1000); expect(next.economy.totals).toEqual({ earned: 250, spent: 0, aid: 0, given: 0 })
    expect(next.economy.ledger[0]).toMatchObject({ kind: 'windfall', amount: 250, ref: story.id })
    expect(next.rng).toBe(g.rng); expect(findInconsistencies(next)).toEqual([])
  })
  it('zero money creates no financial transaction, and a free alternative remains usable', () => {
    story.choices[1]!.effects.money = 0
    const g = moneyWorker(0), next = decide(g, 1)
    expect(next.economy).toEqual(g.economy); expect(next.flags.t6Free).toBe(true)
    expect(next.pending).toBeNull(); expect(next.rng).toBe(g.rng)
  })
  it.each([-1501, 1501, .5, NaN, Infinity, -Infinity, '400'])('defends the runtime against malformed money %s', value => {
    story.choices[0]!.effects.money = value as number
    const g = moneyWorker()
    expect(canChoose(g, 0).available).toBe(false); expect(decide(g, 0)).toBe(g)
  })
  it.each(['balance', 'earned', 'spent', 'transaction'] as const)('prevents safe-integer overflow in %s atomically', field => {
    const g = moneyWorker(); let index = 2
    if (field === 'balance') g.economy.balance = Number.MAX_SAFE_INTEGER - 249
    if (field === 'earned') g.economy.totals.earned = Number.MAX_SAFE_INTEGER - 249
    if (field === 'spent') { g.economy.totals.spent = Number.MAX_SAFE_INTEGER - 399; index = 0 }
    if (field === 'transaction') g.economy.nextTxn = Number.MAX_SAFE_INTEGER
    const before = structuredClone(g)
    expect(canChoose(g, index).reason).toContain('безопасного'); expect(decide(g, index)).toBe(g); expect(g).toEqual(before)
  })
  it('preflights every skill outcome, permits positive rewards and uses RNG exactly once', () => {
    story.choices[0]!.check = { skill: 'engineering', difficulty: 20, success: { money: 250 }, failure: { money: 100 },
      successText: 'Получена дополнительная награда за удачный исход.', failureText: 'Получена небольшая поддержка после проверки.' }
    for (const seed of [102, 103, 104, 105]) {
      const g = moneyWorker(750, 30, seed), probe = { rng: g.rng }
      const won = random(probe) < checkChance(g, story.choices[0]!.check!)
      const next = decide(g, 0)
      expect(next.economy.balance).toBe(350 + (won ? 250 : 100)); expect(next.economy.totals.spent).toBe(400)
      expect(next.economy.totals.earned).toBe(won ? 250 : 100); expect(next.economy.ledger).toHaveLength(2)
      expect(next.rng).toBe(probe.rng); expect(findInconsistencies(next)).toEqual([])
    }
  })
  it('allows an upfront expense to create headroom for a possible positive reward', () => {
    story.choices[0]!.check = { skill: 'engineering', difficulty: 20, success: { money: 250 }, failure: {}, successText: 'Награда.', failureText: 'Без награды.' }
    expect(canChoose(moneyWorker(Number.MAX_SAFE_INTEGER - 100), 0).available).toBe(true)
  })
  it.each(['success', 'failure'] as const)('rejects negative skill %s before payment, stats or RNG', branch => {
    story.choices[0]!.check = { skill: 'engineering', difficulty: 20, success: {}, failure: {}, successText: 'Успех.', failureText: 'Неудача.' }
    story.choices[0]!.check![branch].money = -1
    const g = moneyWorker(), before = structuredClone(g)
    expect(decide(g, 0)).toBe(g); expect(g).toEqual(before)
  })
  it('checks reward overflow for both paths before executing an ordinary effect', () => {
    story.choices[1]!.check = { skill: 'engineering', difficulty: 20, success: { money: 250 }, failure: {}, successText: 'Успех.', failureText: 'Неудача.' }
    const g = moneyWorker(Number.MAX_SAFE_INTEGER - 100)
    expect(decide(g, 1)).toBe(g); expect(g.flags.t6Free).toBeUndefined()
  })
  it('persists signed history and totals through save repair and subsequent settlement', () => {
    const paid = decide(moneyWorker(), 0)
    const restored = repairSave(JSON.parse(JSON.stringify(paid))).game
    expect(restored.economy).toEqual(paid.economy)
    const view = spendView(restored)
    expect(view.history.ledger[0]!.signed.replace(/ /g, ' ')).toBe('−400 кр')
    expect(view.history.ledger[0]!.label).toContain(story.title)
    restored.age++; settleYear(restored)
    expect(restored.economy.totals.spent).toBe(400 + restored.economy.years.at(-1)!.bills)
    expect(findInconsistencies(restored)).toEqual([])
    const income = decide(moneyWorker(), 2), saved = repairSave(JSON.parse(JSON.stringify(income))).game
    expect(saved.economy).toEqual(income.economy)
    expect(spendView(saved).history.ledger[0]!.signed.replace(/ /g, ' ')).toBe('+250 кр')
    saved.age++; settleYear(saved)
    expect(saved.economy.totals.earned).toBe(250 + saved.economy.years.at(-1)!.wage)
    expect(findInconsistencies(saved)).toEqual([])
  })
  it('preserves lifetime totals after the 40-entry financial journal truncates', () => {
    let g = moneyWorker(20000)
    for (let i = 0; i < 45; i++) { story.id = `t6-ledger-${i}`; g = { ...g, pending: story.id }; g = decide(g, 0) }
    expect(g.economy.ledger).toHaveLength(40); expect(g.economy.totals.spent).toBe(18000)
    expect(repairSave(JSON.parse(JSON.stringify(g))).game.economy).toEqual(g.economy)
    expect(findInconsistencies(g)).toEqual([])
  })
  it.each([{ amount: 0 }, { amount: 1501 }, { ref: 'bad source' }, { label: '' }])('repairs malformed story expense %j without refunding money', damage => {
    const paid = decide(moneyWorker(), 0), balance = paid.economy.balance
    Object.assign(paid.economy.ledger[0]!, damage)
    expect(findInconsistencies(paid).length).toBeGreaterThan(0)
    const repaired = repairSave(JSON.parse(JSON.stringify(paid))).game
    expect(repaired.economy.ledger).toEqual([]); expect(repaired.economy.balance).toBe(balance)
    expect(findInconsistencies(repaired)).toEqual([])
  })
  it('repairs understated totals from annual records plus story expenses and receipts', () => {
    const paid = decide(moneyWorker(), 0); paid.age++; settleYear(paid); paid.economy.totals.spent = 0
    const p = repairSave(JSON.parse(JSON.stringify(paid))).game
    expect(p.economy.totals.spent).toBe(400 + p.economy.years.at(-1)!.bills)
    const income = decide(moneyWorker(), 2); income.age++; settleYear(income); income.economy.totals.earned = 0
    const r = repairSave(JSON.parse(JSON.stringify(income))).game
    expect(r.economy.totals.earned).toBe(250 + r.economy.years.at(-1)!.wage)
    expect(findInconsistencies(p)).toEqual([]); expect(findInconsistencies(r)).toEqual([])
  })
  it('rejects absent/invalid choices and stopped lives', () => {
    const g = moneyWorker(); expect(decide(g, -1)).toBe(g); expect(canChoose(g, 8).available).toBe(false)
    g.stopped = true; g.economy.estate = g.economy.balance
    expect(canChoose(g, 0).available).toBe(false); expect(decide(g, 0)).toBe(g)
  })
})

describe('T6 money in moments', () => {
  function fixture(accept: Effects, skip: Effects = {}) {
    const m = compileMoment({ id: 'm-t6-money-fixture', title: 'Тестовый момент', text: 'Тестовый короткий момент с денежным эффектом.', spot: 'terminal', min: 18, max: 95,
      weight: 1, cooldown: 5, accept: { label: 'Принять', result: 'Тестовый момент принят, денежный эффект применён.', effects: accept }, skip: { label: 'Отказаться', effects: skip } })
    moments.push({ ...m, available: () => false })
    const g = moneyWorker(); g.pending = null; g.moment = m.id
    return g
  }
  it('uses the same ledger and totals for accepted and explicitly skipped rewards', () => {
    const g = fixture({ money: 250 }, { money: 100 }), accepted = takeMoment(g), skipped = skipMoment(g)
    expect(accepted.economy.balance).toBe(1000); expect(accepted.economy.totals.earned).toBe(250)
    expect(accepted.attention).toBe(2); expect(accepted.rng).toBe(g.rng)
    expect(skipped.economy.balance).toBe(850); expect(skipped.economy.totals.earned).toBe(100)
    expect(skipped.attention).toBe(3); expect(skipped.rng).toBe(g.rng)
    expect(findInconsistencies(accepted)).toEqual([]); expect(findInconsistencies(skipped)).toEqual([])
  })
  it('never applies either reward when a moment expires through beat or tick', () => {
    const g = fixture({ money: 250 }, { money: 100 })
    expect(beat(g).economy).toEqual(g.economy)
    expect(tick(g).economy).toEqual(tick({ ...g, moment: null }).economy)
  })
  it('blocks forged negative moment effects without spending attention or changing state', () => {
    const g = fixture({ money: -1 }, { money: -1 })
    expect(takeMoment(g)).toBe(g); expect(skipMoment(g)).toBe(g)
  })
  it('does not accept a reward if it would overflow', () => {
    const g = fixture({ money: 250 }); g.economy.balance = Number.MAX_SAFE_INTEGER
    expect(takeMoment(g)).toBe(g); expect(g.attention).toBe(3)
  })
})
