import { describe, expect, it } from 'vitest'
import { createGame } from '../engine'
import { findInconsistencies } from '../invariants'
import { repairSave } from '../save'
import { ECONOMY_TUNING, closeEstate, migrateEconomy, pensionOf, projectYear, settleYear } from '../economy'
import type { GameState, Job } from '../types'

function workerAt(age: number, job: Job = 'Техник'): GameState {
  const g = createGame(9001)
  g.age = age
  g.economy.settledAge = age - 1
  g.protagonist.job = job
  g.focus = 'rest'
  g.economy.balance = 10_000
  g.ship.air = 100
  g.ship.food = 100
  g.economy.work = {
    ...g.economy.work,
    kind: 'working', load: 1, grade: 1, jobSince: 18, gradeSince: 18,
    courses: 0, service: 0, lastWage: ECONOMY_TUNING.wages[job][0]!, until: null,
    path: null, deferYears: 0, mentor: false, post: 'none', job
  }
  return g
}

describe('годовой расчёт экономики', () => {
  it('зачисляет вклад и стипендию в 16 лет один раз, не расходуя RNG', () => {
    const g = createGame(1)
    g.age = 16
    g.economy.settledAge = 15
    const rng = g.rng
    const start = ECONOMY_TUNING.start[g.birth.wealth]!
    settleYear(g)
    expect(g.economy.years.at(-1)).toMatchObject({ age: 16, wage: 360, pension: 0, bills: 0, aid: 0, balance: start + 360 })
    expect(g.economy.ledger).toContainEqual(expect.objectContaining({ age: 16, kind: 'start', amount: start }))
    expect(g.economy.totals).toMatchObject({ earned: 360, spent: 0, aid: 0 })
    const before = structuredClone(g)
    settleYear(g)
    expect(g).toEqual(before)
    expect(g.rng).toBe(rng)
  })

  it('переводит стажёра в обычную работу в 18 лет с точной оплатой', () => {
    const g = createGame(2)
    g.age = 18
    g.economy.settledAge = 17
    g.economy.balance = 1_000
    g.protagonist.job = 'Техник'
    g.economy.work.kind = 'trainee'
    g.economy.work.until = 18
    g.economy.work.job = 'Ученик'
    settleYear(g)
    expect(g.economy.work).toMatchObject({ kind: 'working', until: null, job: 'Техник' })
    expect(g.economy.years.at(-1)).toMatchObject({ wage: 1_100, bills: 350, aid: 0, balance: 1_750 })
  })

  it.each([
    ['Техник', 1, 1, 'rest', 'none', false, 1_100],
    ['Медик', 3, 1, 'work', 'held', false, 1_888],
    ['Агроном', 2, 0.6, 'rest', 'none', false, 720],
    ['Координатор', 4, 1, 'rest', 'held', false, 2_255],
    ['Техник', 1, 1, 'rest', 'none', true, 1_232]
  ] as const)('рассчитывает оклад %s с разрядом %i: %i кр', (job, grade, load, focus, post, incident, expected) => {
    const g = workerAt(30, job)
    g.economy.work.grade = grade
    g.economy.work.load = load
    g.economy.work.post = post
    g.focus = focus
    if (incident) g.flags.shipIncidentAge = g.age
    settleYear(g)
    expect(g.economy.years.at(-1)?.wage).toBe(expected)
    expect(g.economy.work.lastWage).toBe(ECONOMY_TUNING.wages[job][grade - 1])
  })

  it.each([['between', 800], ['sick', 1_120]] as const)('рассчитывает пособие %s отдельно от тарифа: %i кр', (kind, expected) => {
    const g = workerAt(30, 'Медик')
    g.economy.work.grade = 3
    g.economy.work.lastWage = 1_600
    g.economy.work.kind = kind
    g.economy.work.until = 32
    settleYear(g)
    expect(g.economy.years.at(-1)?.wage).toBe(expected)
  })

  it('сверяет баланс, годовую строку и totals при оплате тарифа, аренды и услуги', () => {
    const g = workerAt(30)
    g.economy.balance = 1_000
    g.economy.housing = 1
    g.economy.services['dome-pass'] = 29
    const opening = g.economy.balance
    const { stats } = settleYear(g)
    const row = g.economy.years.at(-1)!
    expect(row).toEqual({ age: 30, wage: 1_100, pension: 0, bills: 720, aid: 0, balance: 1_380 })
    expect(g.economy.balance).toBe(opening + row.wage + row.pension - (row.bills - row.aid))
    expect(g.economy.totals).toMatchObject({ earned: 1_100, spent: 720, aid: 0 })
    expect(stats).toEqual({ stress: -2, morale: 1 })
  })

  it('фонд покрывает только минимум, а жильё и услуга оплачиваются или теряются отдельно', () => {
    const g = workerAt(30)
    g.economy.balance = 0
    g.economy.work.kind = 'between'
    g.economy.work.lastWage = 500
    g.economy.work.until = 100
    g.economy.housing = 2
    g.economy.services['dome-pass'] = 29

    const first = settleYear(g)
    expect(g.economy.years.at(-1)).toEqual({ age: 30, wage: 250, pension: 0, bills: 350, aid: 100, balance: 0 })
    expect(g.economy.balance).toBe(0)
    expect(g.economy.housing).toBe(0)
    expect(g.economy.housingRight).toEqual({ tier: 2, until: 33 })
    expect(g.economy.services).toEqual({})
    expect(g.economy.ledger).toContainEqual(expect.objectContaining({ kind: 'aid', age: 30, amount: 100 }))
    expect(g.economy.totals).toMatchObject({ earned: 250, spent: 250, aid: 100 })
    expect(first.stats).toEqual({ morale: -2, stress: 2 })

    g.age = 31
    const second = settleYear(g)
    expect(g.economy.years.at(-1)).toMatchObject({ wage: 250, bills: 350, aid: 100, balance: 0 })
    expect(g.economy.tightStreak).toBe(2)
    expect(second.stats).toEqual({ morale: -2, stress: 2 })

    g.age = 32
    g.economy.work.kind = 'working'
    g.economy.work.until = null
    settleYear(g)
    expect(g.economy.years.at(-1)).toMatchObject({ wage: 1_100, bills: 350, aid: 0, balance: 750 })
    expect(g.economy.tightStreak).toBe(0)
    expect(g.economy.totals).toMatchObject({ earned: 1_600, spent: 850, aid: 200 })
    expect(g.economy.ledger.filter(t => t.kind === 'aid')).toEqual([
      expect.objectContaining({ age: 30, amount: 100 }),
      expect.objectContaining({ age: 31, amount: 100 })
    ])
  })

  it('не списывает и не применяет dome-pass при закрытии, затем возобновляет его', () => {
    const g = workerAt(30)
    g.economy.balance = 1_000
    g.economy.housing = 1
    g.economy.services['dome-pass'] = 30
    g.ship.air = 54
    const closed = settleYear(g)
    expect(g.economy.years.at(-1)).toMatchObject({ wage: 1_100, bills: 630, aid: 0, balance: 1_470 })
    expect(g.economy.services['dome-pass']).toBe(30)
    expect(closed.stats).toEqual({})

    g.age = 31
    g.ship.air = 100
    const reopened = settleYear(g)
    expect(g.economy.years.at(-1)).toMatchObject({ bills: 720, aid: 0, balance: 1_850 })
    expect(g.economy.services['dome-pass']).toBe(30)
    expect(reopened.stats).toEqual({ stress: -2, morale: 1 })
  })

  it('сохраняет право возврата до граничного возраста включительно и затем очищает его', () => {
    const g = workerAt(30)
    g.economy.balance = 0
    g.economy.work.kind = 'between'
    g.economy.work.lastWage = 500
    g.economy.work.until = 100
    g.economy.housing = 2
    settleYear(g)
    const restored = repairSave(JSON.parse(JSON.stringify(g)) as GameState).game
    expect(restored.economy.housingRight).toEqual({ tier: 2, until: 33 })
    for (const age of [31, 32, 33]) {
      restored.age = age
      settleYear(restored)
      expect(restored.economy.housingRight).toEqual({ tier: 2, until: 33 })
    }
    restored.age = 34
    settleYear(restored)
    expect(restored.economy.housingRight).toBeNull()
  })

  it.each([['полной', 1], ['сокращённой', 0.6]] as const)('отсрочка учитывает полные календарные годы после 62 при %s ставке', (_loadName, load) => {
    const g = workerAt(61)
    g.economy.settledAge = 61
    g.economy.work.load = load
    g.age = 62
    settleYear(g)
    expect(g.economy.work.deferYears).toBe(0)
    expect(g.economy.work.service).toBe(load)
    g.age = 63
    settleYear(g)
    expect(g.economy.work.deferYears).toBe(1)
    expect(g.economy.work.service).toBe(load * 2)
  })

  it.each([[61, 0], [62, 0], [63, 1], [76, 14], [77, 14]] as const)('миграция оценивает отсрочку в возрасте %i как %i полных лет', (age, deferYears) => {
    const g = createGame(16)
    g.age = age
    g.protagonist.job = 'Техник'
    expect(migrateEconomy(g).work.deferYears).toBe(deferYears)
  })

  it('прогнозирует следующий год после уже рассчитанного, учитывая возраст ребёнка и регулярные платежи', () => {
    const g = workerAt(30)
    g.economy.settledAge = 29
    g.economy.balance = 1_000
    g.economy.housing = 1
    g.economy.services['dome-pass'] = 30
    g.people.push({ id: 'child', name: 'Мира', role: 'Дочь', gender: 'f', bond: 50, age: 15, alive: true, since: 15 })
    g.flags.familyChild = 'born'
    settleYear(g)
    expect(g.economy.years.at(-1)).toMatchObject({ bills: 870, aid: 0, balance: 1_230 })
    expect(g.people.find(p => p.id === 'child')?.age).toBe(15)

    const snapshot = structuredClone(g)
    const rng = g.rng
    const forecast = projectYear(g)
    expect(forecast.projectedAge).toBe(31)
    expect(forecast.economy.years.at(-1)).toMatchObject({ age: 31, wage: 1_100, bills: 720, aid: 0, balance: 1_610 })
    expect(forecast.effects.stats).toEqual({ stress: -2, morale: 1 })
    expect(forecast.pendingDecision).toBeNull()
    expect(forecast.assumptions.join(' ')).toContain('Не учитываются будущие сюжетные эффекты')
    expect(forecast.economy.work.service).toBe(2)
    expect(g.people.find(p => p.id === 'child')?.age).toBe(15)
    expect(g).toEqual(snapshot)
    expect(g.rng).toBe(rng)
    expect(projectYear(g)).toEqual(forecast)
  })

  it('прогноз обрабатывает переходы 16, 18 и 77 лет', () => {
    const at15 = createGame(15)
    at15.age = 15
    at15.economy.settledAge = 15
    at15.economy.balance = 100
    at15.birth.wealth = 3
    const sixteenth = projectYear(at15)
    expect(sixteenth.projectedAge).toBe(16)
    expect(sixteenth.economy.work.kind).toBe('trainee')
    expect(sixteenth.economy.years.at(-1)).toMatchObject({ wage: 360, balance: 860 })
    expect(sixteenth.economy.ledger).toContainEqual(expect.objectContaining({ kind: 'start', age: 16, amount: 400 }))

    const at17 = createGame(17)
    at17.age = 17
    at17.economy.settledAge = 17
    at17.economy.balance = 1_000
    at17.protagonist.job = 'Техник'
    at17.economy.work.kind = 'trainee'
    at17.economy.work.until = 18
    const eighteenth = projectYear(at17)
    expect(eighteenth.projectedAge).toBe(18)
    expect(eighteenth.economy.work.kind).toBe('working')
    expect(eighteenth.economy.years.at(-1)).toMatchObject({ wage: 1_100, bills: 350, balance: 1_750 })

    const at76 = workerAt(76)
    at76.economy.settledAge = 76
    at76.economy.balance = 1_000
    at76.economy.work.lastWage = 1_100
    at76.economy.work.service = 20
    const seventySeventh = projectYear(at76)
    expect(seventySeventh.projectedAge).toBe(77)
    expect(seventySeventh.economy.work).toMatchObject({ kind: 'retired', path: 'left' })
    expect(seventySeventh.economy.years.at(-1)).toMatchObject({ wage: 0, pension: 396, balance: 1_046 })
  })

  it('прогноз помечает активное решение как неразрешённое и не применяет его', () => {
    const g = workerAt(64)
    g.economy.settledAge = 64
    g.pending = 'retirement'
    const snapshot = structuredClone(g)
    const forecast = projectYear(g)
    expect(forecast.projectedAge).toBe(65)
    expect(forecast.pendingDecision).toBe('retirement')
    expect(forecast.assumptions.some(a => a.includes('не выбрано'))).toBe(true)
    expect(forecast.economy.work.kind).toBe('working')
    expect(g).toEqual(snapshot)
  })

  it('после смерти не прогнозирует доход, а estate закрывается один раз', () => {
    const g = workerAt(30)
    g.stopped = true
    closeEstate(g)
    const before = structuredClone(g.economy)
    const forecast = projectYear(g)
    expect(forecast.projectedAge).toBeNull()
    expect(forecast.economy).toEqual(before)
    expect(forecast.economy.years).toHaveLength(0)
    expect(forecast.assumptions.some(a => a.includes('Персонаж умер'))).toBe(true)
    settleYear(g)
    closeEstate(g)
    expect(g.economy).toEqual(before)
  })

  it('годовой расчёт после сохранения загружается без дубля и продолжает детерминированно', () => {
    const original = workerAt(30)
    original.economy.balance = 1_000
    original.economy.housing = 1
    original.economy.services['dome-pass'] = 30
    const rng = original.rng
    settleYear(original)
    const loaded = repairSave(JSON.parse(JSON.stringify(original)) as GameState).game
    expect(loaded.economy).toEqual(original.economy)
    const before = structuredClone(loaded.economy)
    settleYear(loaded)
    expect(loaded.economy).toEqual(before)
    expect(loaded.rng).toBe(rng)

    original.age = 31
    loaded.age = 31
    settleYear(original)
    settleYear(loaded)
    expect(loaded.economy).toEqual(original.economy)
    expect(loaded.rng).toBe(original.rng)
  })

  it('сохраняет totals после усечения истории и проходит финансовые инварианты всю жизнь', () => {
    const g = workerAt(30)
    g.economy.balance = 100_000
    let income = 0, ownSpending = 0, aid = 0
    const rng = g.rng
    for (let age = 30; age <= 114; age++) {
      g.age = age
      const opening = g.economy.balance
      settleYear(g)
      const row = g.economy.years.at(-1)!
      expect(row.balance).toBe(opening + row.wage + row.pension - (row.bills - row.aid))
      income += row.wage + row.pension
      ownSpending += row.bills - row.aid
      aid += row.aid
      expect(findInconsistencies(g), `age=${age}`).toEqual([])
      const once = structuredClone(g.economy)
      settleYear(g)
      expect(g.economy).toEqual(once)
      expect(g.rng).toBe(rng)
    }
    expect(g.economy.years).toHaveLength(80)
    expect(g.economy.totals).toMatchObject({ earned: income, spent: ownSpending, aid })
    expect(g.economy.totals.earned).toBeGreaterThan(g.economy.years.reduce((sum, row) => sum + row.wage + row.pension, 0))
  })

  it('помогает восстановить итоги не ниже сохранённых строк истории', () => {
    const g = workerAt(30)
    settleYear(g)
    g.economy.totals = { earned: 0, spent: 0, given: 0, aid: 0 }
    const repaired = repairSave(JSON.parse(JSON.stringify(g)) as GameState).game.economy
    expect(repaired.totals.earned).toBe(1_100)
    expect(repaired.totals.spent).toBe(350)
    expect(findInconsistencies({ ...g, economy: repaired })).toEqual([])
  })

  it('сверяет запись aid и маркер последовательности финансовых операций', () => {
    const g = workerAt(30)
    g.economy.balance = 0
    g.economy.work.kind = 'between'
    g.economy.work.lastWage = 0
    g.economy.work.until = 100
    settleYear(g)
    expect(findInconsistencies(g)).toEqual([])
    g.economy.ledger[0]!.amount += 1
    expect(findInconsistencies(g).some(problem => problem.includes('не совпадает с годовой выплатой'))).toBe(true)
    g.economy.ledger[0]!.amount -= 1
    g.economy.ledger.push({ ...g.economy.ledger[0]!, n: g.economy.nextTxn++ })
    expect(findInconsistencies(g).some(problem => problem.includes('больше одного раза за год'))).toBe(true)
  })

  it('отмечает финансовую историю с повторным возрастом или недостающим итогом', () => {
    const g = workerAt(30)
    settleYear(g)
    g.economy.years.push({ ...g.economy.years.at(-1)! })
    expect(findInconsistencies(g).some(problem => problem.includes('повторяются'))).toBe(true)
    g.economy.years.pop()
    g.economy.totals.earned = 0
    expect(findInconsistencies(g).some(problem => problem.includes('итог доходов'))).toBe(true)
  })

  it('миграция фиксирует уже рассчитанный возраст без повторного дохода', () => {
    const g = createGame(2)
    g.age = 40
    g.economy = migrateEconomy(g)
    const before = structuredClone(g.economy)
    settleYear(g)
    expect(g.economy).toEqual(before)
    expect(pensionOf(g.economy.work)).toBeGreaterThanOrEqual(360)
  })
})
