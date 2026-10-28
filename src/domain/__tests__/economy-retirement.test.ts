import { describe, expect, it } from 'vitest'
import { createGame, decide } from '../engine'
import { pensionOf, settleYear } from '../economy'
import { repairSave } from '../save'
import type { GameState } from '../types'

function workerAt(age: number): GameState {
  const g = createGame(1717)
  g.age = age
  g.protagonist.job = 'Техник'
  g.focus = 'work'
  g.pending = 'retirement'
  g.economy.balance = 100_000
  g.economy.settledAge = age
  g.economy.work = {
    ...g.economy.work,
    kind: 'working', load: 1, grade: 3, jobSince: 18, gradeSince: 30,
    courses: 0, service: 35, lastWage: 1600, until: null,
    path: null, deferYears: 2, mentor: false, post: 'held', job: 'Техник'
  }
  g.flags.promotion = 'accepted'
  return g
}

function chooseRetirement(age: number, choice: number): GameState {
  return decide(workerAt(age), choice)
}

function settleNextYear(g: GameState) {
  g.age += 1
  return settleYear(g)
}

const basePension = (lastWage: number, service: number, deferYears = 0) => pensionOf({
  ...createGame(1).economy.work, lastWage, service, deferYears
})

describe('пенсия и поздняя занятость', () => {
  it.each([
    { choice: 0, path: 'left', kind: 'retired', wage: 0, pension: true },
    { choice: 1, path: 'mentor', kind: 'retired', wage: 400, pension: true },
    { choice: 2, path: 'continue', kind: 'working', wage: 1888, pension: false }
  ] as const)('выбор retirement №$choice задаёт путь $path и расчёт первого года', ({ choice, path, kind, wage, pension }) => {
    const g = chooseRetirement(64, choice)
    expect(g.flags.retirement).toBe(true)
    expect(g.flags.retirementPath).toBe(path)
    const beforeService = g.economy.work.service
    const beforeDefer = g.economy.work.deferYears
    const { stats } = settleNextYear(g)
    expect(g.economy.work.kind).toBe(kind)
    expect(g.economy.years.at(-1)?.wage).toBe(wage)
    expect(g.economy.years.at(-1)?.pension).toBe(pension ? basePension(1600, 35, 2) : 0)
    expect(g.economy.work.lastWage).toBe(1600)

    if (path === 'left') {
      expect(g.economy.work).toMatchObject({ path, mentor: false, post: 'ended', service: beforeService, deferYears: beforeDefer })
      expect(stats).toEqual({})
    } else if (path === 'mentor') {
      expect(g.economy.work).toMatchObject({ path, mentor: true, post: 'ended', service: beforeService, deferYears: beforeDefer })
      expect(stats).toEqual({})
    } else {
      expect(g.economy.work).toMatchObject({ path, mentor: false, post: 'held', service: beforeService + 1, deferYears: beforeDefer + 1 })
      expect(stats).toEqual({ health: -1, stress: 2 })
    }
  })

  it('в 77 лет завершает работу без решения и начинает пенсию', () => {
    const g = workerAt(76)
    g.pending = null
    delete g.flags.promotion
    g.age = 77
    const service = g.economy.work.service
    const defer = g.economy.work.deferYears
    const { stats } = settleYear(g)
    expect(g.economy.work).toMatchObject({ kind: 'retired', path: 'left', mentor: false, post: 'ended', service, deferYears: defer })
    expect(g.flags.retirement).toBe(true)
    expect(g.economy.years.at(-1)).toMatchObject({ wage: 0, pension: basePension(1600, service, defer) })
    expect(stats).toEqual({})
  })

  it('путь continue работает в 76 лет и принудительно выходит на пенсию в 77', () => {
    const g = chooseRetirement(75, 2)
    g.age = 76
    const serviceAt75 = g.economy.work.service
    settleYear(g)
    expect(g.economy.work.kind).toBe('working')
    expect(g.economy.years.at(-1)?.pension).toBe(0)
    expect(g.economy.work.service).toBe(serviceAt75 + 1)
    g.age = 77
    settleYear(g)
    expect(g.economy.work).toMatchObject({ kind: 'retired', path: 'continue', mentor: false, service: serviceAt75 + 1 })
    expect(g.flags.retirement).toBe(true)
    expect(g.economy.years.at(-1)?.wage).toBe(0)
    expect(g.economy.years.at(-1)?.pension).toBeGreaterThan(0)
  })

  it('оплачивает наставничество в 80 лет включительно и отключает его с 81', () => {
    const g = workerAt(79)
    g.economy.work.kind = 'retired'
    g.economy.work.path = 'mentor'
    g.economy.work.mentor = true
    g.economy.work.lastWage = 1000
    g.economy.work.post = 'ended'
    const service = g.economy.work.service
    const defer = g.economy.work.deferYears
    g.age = 80
    settleYear(g)
    expect(g.economy.work.mentor).toBe(true)
    expect(g.economy.years.at(-1)).toMatchObject({ wage: 250, pension: basePension(1000, service, defer) })
    expect(g.economy.work.service).toBe(service)
    expect(g.economy.work.deferYears).toBe(defer)
    g.age = 81
    settleYear(g)
    expect(g.economy.work).toMatchObject({ kind: 'retired', path: 'mentor', mentor: false, service, deferYears: defer })
    expect(g.economy.years.at(-1)).toMatchObject({ wage: 0, pension: basePension(1000, service, defer) })
  })

  it.each([
    [1850, 44, 0, 962], [1600, 35, 0, 768], [1450, 30, 0, 638],
    [1100, 20, 0, 396], [650, 15, 0, 360], [1850, 44, 6, 1193]
  ])('формула пенсии для тарифа %i, стажа %i, отсрочки %i даёт %i', (wage, service, defer, expected) => {
    expect(basePension(wage, service, defer)).toBe(expected)
  })

  it('ограничивает надбавку отсрочки 25% и округляет до целых кредитов', () => {
    expect(basePension(1850, 44, 100)).toBe(1203)
    expect(basePension(1850, 44, 6)).toBe(Math.round(962 * 1.24))
  })

  it('не включает сверхурочные, назначение или аварийную выплату в тарифную базу пенсии', () => {
    const g = workerAt(64)
    g.flags.shipIncidentAge = 65
    g.age = 65
    settleYear(g)
    expect(g.economy.years.at(-1)?.wage).toBe(Math.round(1600 * 1.18 * 1.12))
    expect(g.economy.work.lastWage).toBe(1600)
    const expected = basePension(1600, g.economy.work.service, g.economy.work.deferYears)
    g.pending = 'retirement'
    const retired = decide(g, 0)
    retired.age = 66
    settleYear(retired)
    expect(retired.economy.years.at(-1)?.pension).toBe(expected)
  })

  it('не начисляет пенсию при полной занятости', () => {
    const g = workerAt(64)
    g.flags.retirementPath = 'continue'
    settleNextYear(g)
    expect(g.economy.work.kind).toBe('working')
    expect(g.economy.years.at(-1)?.pension).toBe(0)
  })

  it('штраф после 65 лет действует при полной ставке, но не при 0,6 ставки', () => {
    const full = workerAt(64)
    full.economy.work.post = 'none'
    delete full.flags.promotion
    full.focus = 'rest'
    const fullResult = settleNextYear(full)
    expect(fullResult.stats).toEqual({ health: -1, stress: 2 })

    const reduced = workerAt(64)
    reduced.economy.work.load = 0.6
    reduced.economy.work.post = 'none'
    delete reduced.flags.promotion
    reduced.focus = 'rest'
    const reducedResult = settleNextYear(reduced)
    expect(reducedResult.stats).toEqual({ stress: -2, bonds: 1 })
    expect(reduced.economy.work.service).toBe(35.6)
  })

  it.each(['between', 'sick'] as const)('не применяет штраф полной работы в статусе %s', kind => {
    const g = workerAt(64)
    g.economy.work.kind = kind
    g.economy.work.until = 70
    g.economy.work.post = 'none'
    const { stats } = settleNextYear(g)
    expect(stats.health).toBeUndefined()
    expect(stats.stress).toBeUndefined()
    expect(g.economy.years.at(-1)?.pension).toBe(0)
  })

  it('сохраняет активное решение и retirementPath при загрузке, не начисляет год дважды', () => {
    const original = workerAt(64)
    const preserved = { seed: original.seed, rng: original.rng, people: structuredClone(original.people), memories: [...original.memories], pending: original.pending }
    const loadedBeforeChoice = repairSave(JSON.parse(JSON.stringify(original)) as GameState).game
    expect(loadedBeforeChoice).toMatchObject(preserved)
    expect(loadedBeforeChoice.pending).toBe('retirement')
    const chosen = decide(loadedBeforeChoice, 1)
    const loaded = repairSave(JSON.parse(JSON.stringify(chosen)) as GameState).game
    expect(loaded.flags.retirementPath).toBe('mentor')
    expect(loaded.pending).toBeNull()
    const rng = loaded.rng
    const firstResult = settleNextYear(loaded)
    expect(loaded.rng).toBe(rng)
    expect(firstResult.logs).toEqual([])
    const saved = JSON.stringify(loaded)
    const reloaded = repairSave(JSON.parse(saved) as GameState).game
    const before = structuredClone(reloaded.economy)
    const beforeRng = reloaded.rng
    settleYear(reloaded)
    expect(reloaded.economy).toEqual(before)
    expect(reloaded.rng).toBe(beforeRng)
    expect(reloaded.economy.years.at(-1)?.pension).toBe(basePension(1600, 35, 2))
    expect(reloaded.flags.retirementPath).toBe('mentor')
  })

  it('восстанавливает старое economy v1 с одним flags.retirement как обычную пенсию', () => {
    const legacy = workerAt(64)
    legacy.pending = null
    legacy.flags.retirement = true
    delete legacy.flags.retirementPath
    const loaded = repairSave(JSON.parse(JSON.stringify(legacy)) as GameState).game
    expect(loaded.economy.work).toMatchObject({ kind: 'retired', path: 'left', mentor: false })
    expect(loaded.flags.retirement).toBe(true)
    expect(loaded.flags.retirementPath).toBeUndefined()
  })

  it('наставническая выплата не получает фокусную надбавку и RNG не расходуется', () => {
    const a = chooseRetirement(64, 1)
    const b = structuredClone(a)
    a.focus = 'work'
    b.focus = 'rest'
    const rng = a.rng
    const resultA = settleNextYear(a)
    const resultB = settleNextYear(b)
    expect(a.economy.years.at(-1)?.wage).toBe(400)
    expect(b.economy.years.at(-1)?.wage).toBe(400)
    expect(a.economy).toEqual(b.economy)
    expect(a.rng).toBe(rng)
    expect(b.rng).toBe(rng)
    expect(resultA.stats).toEqual(resultB.stats)
  })
})
