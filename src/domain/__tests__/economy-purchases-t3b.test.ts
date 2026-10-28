import { describe, expect, it } from 'vitest'
import { canSetLoad, createGame, purchase, setLoad } from '../engine'
import { projectYear, settleYear } from '../economy'
import { isKnown, residenceOf } from '../birth'
import { findInconsistencies } from '../invariants'
import { availableSectorOptions, canBuy, familyTripParticipants } from '../offers'
import { repairSave } from '../save'
import type { GameState, Job, SectorId } from '../types'

function workerAt(age: number, job: Job = 'Техник'): GameState {
  const g = createGame(17303)
  g.age = age
  g.economy.settledAge = age
  g.protagonist.job = job
  g.focus = 'rest'
  g.attention = 3
  g.stats.knowledge = 10
  g.stats.morale = 50
  g.ship.air = 100
  g.ship.food = 100
  g.economy.balance = 5_000
  g.economy.work = {
    ...g.economy.work,
    kind: age < 16 ? 'child' : age < 18 ? 'trainee' : 'working',
    load: 1,
    grade: 1,
    jobSince: 18,
    gradeSince: 18,
    courses: 0,
    service: 0,
    lastWage: ({ Техник: 1100, Медик: 1050, Агроном: 950, Координатор: 1150 } as Partial<Record<Job, number>>)[job] ?? 650,
    until: age < 18 ? 18 : null,
    path: null,
    deferYears: 0,
    mentor: false,
    post: 'none',
    job
  }
  return g
}

function closeFamily(g: GameState) {
  g.people = [
    { id: 'parent', name: 'Ада Марек', role: 'Мать', bond: 70, age: 52, alive: true, since: 0 },
    { id: 'parent2', name: 'Томас Марек', role: 'Отец', bond: 68, age: 54, alive: true, since: 0 },
    { id: 'friend', name: 'Ника Орлова', role: 'Подруга', bond: 55, age: 28, alive: true, since: 4 },
    { id: 'future-friend', name: 'Лин Весна', role: 'Знакомая', bond: 90, age: 20, alive: true, since: g.age + 1 },
    { id: 'distant', name: 'Кай Ильм', role: 'Знакомый', bond: 49, age: 28, alive: true, since: 4 }
  ]
}

const roundTrip = (g: GameState) => repairSave(JSON.parse(JSON.stringify(g)) as GameState).game
const checkClean = (g: GameState) => expect(findInconsistencies(g)).toEqual([])

describe('экскурсия в дальний сектор', () => {
  it('возвращает направления, но без выбранной цели не выполняет поездку', () => {
    const g = workerAt(30)
    const before = structuredClone(g)
    const options = availableSectorOptions(g)
    const check = canBuy(g, 'sector-trip')
    expect(options).toHaveLength(4)
    expect(options.map(option => option.id)).not.toContain(residenceOf(g))
    expect(check).toMatchObject({ available: false, reason: 'Выберите сектор для экскурсии.' })
    expect(check.sectorOptions).toEqual(options)
    expect(purchase(g, 'sector-trip')).toBe(g)
    expect(g).toEqual(before)
  })

  it('соблюдает возраст, внимание и фактическую стоимость до выполнения', () => {
    const young = workerAt(17)
    expect(canBuy(young, 'sector-trip', { sectorId: availableSectorOptions(young)[0]!.id }).reason).toMatch(/с 18 лет/)
    const poor = workerAt(30)
    poor.economy.balance = 239
    const target = availableSectorOptions(poor)[0]!
    expect(canBuy(poor, 'sector-trip', { sectorId: target.id }).reason).toBe('Не хватает 1 кр.')
    poor.economy.balance = 240
    poor.attention = 0
    expect(canBuy(poor, 'sector-trip', { sectorId: target.id }).reason).toMatch(/внимания/)
  })

  it('исключает текущую резиденцию, в том числе после переезда', () => {
    const g = workerAt(30)
    g.birth.sectorId = 'bio'
    g.residence = 'clinic'
    expect(residenceOf(g)).toBe('clinic')
    const options = availableSectorOptions(g)
    expect(options.map(option => option.id)).not.toContain('clinic')
    expect(options.map(option => option.id)).toContain('bio')
    expect(canBuy(g, 'sector-trip', { sectorId: 'clinic' }).reason).toMatch(/собственный текущий сектор/)
    expect(canBuy(g, 'sector-trip', { sectorId: 'not-a-sector' as SectorId }).reason).toMatch(/неизвестный сектор/)
  })

  it('даёт координатору ровно 25% скидки, тратит внимание и сохраняет визит', () => {
    const g = workerAt(30, 'Координатор')
    const target = availableSectorOptions(g)[0]!
    const rng = g.rng
    expect(canBuy(g, 'sector-trip', { sectorId: target.id })).toMatchObject({ available: true, oneTimeCost: 180 })
    const trip = purchase(g, 'sector-trip', { sectorId: target.id })
    expect(trip.economy.balance).toBe(4_820)
    expect(trip.attention).toBe(2)
    expect(trip.stats.knowledge).toBe(11)
    expect(trip.economy.owned[`visit-sector-${target.id}`]).toBe(30)
    expect(trip.economy.ledger.at(-1)).toMatchObject({ kind: 'purchase', ref: 'sector-trip', amount: 180 })
    expect(trip.memories.at(-1)).toContain(target.name)
    expect(trip.history[0]?.text).toContain(target.name)
    expect(trip.rng).toBe(rng)
    checkClean(trip)

    // Historical discount validation is independent of the hero's current job.
    trip.protagonist.job = 'Техник'
    trip.economy.work.job = 'Техник'
    checkClean(trip)
    const loaded = roundTrip(trip)
    expect(loaded.economy.owned[`visit-sector-${target.id}`]).toBe(30)
    expect(canBuy(loaded, 'sector-trip', { sectorId: target.id }).reason).toMatch(/уже посещён/)
  })

  it('записывает пять посещений двух направлений с точной финансовой суммой', () => {
    const g = workerAt(30)
    const first = availableSectorOptions(g)[0]!
    const second = availableSectorOptions(g).find(option => option.id !== first.id)!
    const beforeKnowledge = g.stats.knowledge
    const a = purchase(g, 'sector-trip', { sectorId: first.id })
    const b = purchase(a, 'sector-trip', { sectorId: second.id })
    expect(b.economy.balance).toBe(4_520)
    expect(b.attention).toBe(1)
    expect(b.stats.knowledge).toBe(beforeKnowledge + 2)
    expect(b.economy.ledger.filter(txn => txn.ref === 'sector-trip').map(txn => txn.amount)).toEqual([240, 240])
    expect(canBuy(b, 'sector-trip', { sectorId: first.id }).reason).toMatch(/уже посещён/)
    expect(availableSectorOptions(b)).toHaveLength(2)
    checkClean(a)
    checkClean(b)
  })

  it('позволяет посетить четыре разных направления за жизнь и затем исчерпывает каталог', () => {
    let g = workerAt(30)
    const visited: SectorId[] = []
    for (let index = 0; index < 4; index++) {
      if (index > 0 && g.attention === 0) {
        g.age++
        g.economy.settledAge = g.age
        g.attention = 3
      }
      const target = availableSectorOptions(g)[0]!
      expect(visited).not.toContain(target.id)
      g = purchase(g, 'sector-trip', { sectorId: target.id })
      visited.push(target.id)
      checkClean(g)
    }
    expect(visited).toHaveLength(4)
    expect(availableSectorOptions(g)).toEqual([])
    expect(canBuy(g, 'sector-trip').reason).toMatch(/Нет доступных/)
  })

  it('не открывает пятую экскурсию после переезда и загрузки сохранения', () => {
    let g = workerAt(30)
    const birthSector = g.birth.sectorId
    const visited: SectorId[] = []
    for (let index = 0; index < 4; index++) {
      if (g.attention === 0) {
        g.age++
        g.economy.settledAge = g.age
        g.attention = 3
      }
      const target = availableSectorOptions(g)[0]!
      g = purchase(g, 'sector-trip', { sectorId: target.id })
      visited.push(target.id)
    }

    const loaded = roundTrip(g)
    loaded.residence = visited[0]!
    expect(loaded.residence).not.toBe(birthSector)
    expect(residenceOf(loaded)).toBe(visited[0])
    expect(loaded.economy.owned[`visit-sector-${birthSector}`]).toBeUndefined()
    expect(availableSectorOptions(loaded)).toEqual([])

    const before = structuredClone(loaded)
    const rng = loaded.rng
    expect(purchase(loaded, 'sector-trip', { sectorId: birthSector })).toBe(loaded)
    expect(loaded).toEqual(before)
    expect(loaded.economy.balance).toBe(before.economy.balance)
    expect(loaded.attention).toBe(before.attention)
    expect(loaded.memories).toEqual(before.memories)
    expect(loaded.rng).toBe(rng)
  })
})

describe('семейная поездка', () => {
  it('сначала предлагает только известных живых близких и требует явный выбор', () => {
    const young = workerAt(19)
    closeFamily(young)
    expect(canBuy(young, 'family-trip', { participantIds: ['parent', 'parent2'] }).reason).toMatch(/с 20 лет/)
    const g = workerAt(20)
    closeFamily(g)
    const candidates = familyTripParticipants(g)
    expect(candidates.map(person => person.id)).toEqual(['parent', 'parent2', 'friend'])
    expect(isKnown(g, 'future-friend')).toBe(false)
    expect(canBuy(g, 'family-trip')).toMatchObject({ available: false, reason: 'Выберите двух или трёх близких участников.' })
    expect(canBuy(g, 'family-trip').familyParticipants).toEqual(candidates)
    g.people.forEach(person => { person.alive = false })
    expect(canBuy(g, 'family-trip').reason).toMatch(/не менее двух/)
  })

  it('проверяет деньги и внимание для семейной поездки', () => {
    const g = workerAt(30)
    closeFamily(g)
    const participants = { participantIds: ['parent', 'parent2'] }
    g.economy.balance = 319
    expect(canBuy(g, 'family-trip', participants).reason).toBe('Не хватает 1 кр.')
    g.economy.balance = 320
    g.attention = 0
    expect(canBuy(g, 'family-trip', participants).reason).toMatch(/внимания/)
  })

  it('стоит 320, повышает выбранные связи на 2, пишет память, флаг и журнал', () => {
    const g = workerAt(20)
    closeFamily(g)
    g.people.find(person => person.id === 'parent')!.bond = 99
    const before = structuredClone(g)
    const rng = g.rng
    const trip = purchase(g, 'family-trip', { participantIds: ['parent', 'parent2'] })
    expect(g).toEqual(before)
    expect(trip.economy.balance).toBe(4_680)
    expect(trip.attention).toBe(2)
    expect(trip.people.find(person => person.id === 'parent')?.bond).toBe(100)
    expect(trip.people.find(person => person.id === 'parent2')?.bond).toBe(70)
    expect(trip.economy.lastBought['family-trip']).toBe(20)
    expect(trip.flags.familyTrip).toBe(true)
    expect(trip.memories.at(-1)).toContain('Ада Марек')
    expect(trip.memories.at(-1)).toContain('Томас Марек')
    expect(trip.history[0]?.text).toContain('Ада Марек')
    expect(trip.economy.ledger.at(-1)).toMatchObject({ kind: 'purchase', ref: 'family-trip', amount: 320 })
    expect(trip.rng).toBe(rng)
    checkClean(trip)
    const loaded = roundTrip(trip)
    expect(loaded.economy.lastBought['family-trip']).toBe(20)
    expect(loaded.flags.familyTrip).toBe(true)
    expect(loaded.memories).toEqual(trip.memories)
  })

  it('отвергает неподходящие, повторные, незнакомые, умершие и более чем три ID', () => {
    const g = workerAt(30)
    closeFamily(g)
    expect(canBuy(g, 'family-trip', { participantIds: ['parent'] }).reason).toMatch(/не менее двух/)
    expect(canBuy(g, 'family-trip', { participantIds: ['parent', 'parent'] }).reason).toMatch(/повторы/)
    expect(canBuy(g, 'family-trip', { participantIds: ['ghost', 'parent'] }).reason).toMatch(/не известен/)
    expect(canBuy(g, 'family-trip', { participantIds: ['future-friend', 'parent'] }).reason).toMatch(/не жив или ещё не знаком/)
    expect(canBuy(g, 'family-trip', { participantIds: ['distant', 'parent'] }).reason).toMatch(/не считается близким/)
    expect(canBuy(g, 'family-trip', { participantIds: ['parent', 'parent2', 'friend', 'distant'] }).reason).toMatch(/не более трёх/)
    g.people.find(person => person.id === 'friend')!.alive = false
    expect(familyTripParticipants(g).map(person => person.id)).not.toContain('friend')
  })

  it('соблюдает пятилетнюю паузу и открывается ровно в первый допустимый год', () => {
    const g = workerAt(20)
    closeFamily(g)
    g.economy.balance = 1_000
    const first = purchase(g, 'family-trip', { participantIds: ['parent', 'parent2'] })
    const age24 = { ...first, age: 24 }
    expect(canBuy(age24, 'family-trip', { participantIds: ['parent', 'parent2'] }).reason).toMatch(/через 1 год/)
    expect(purchase(age24, 'family-trip', { participantIds: ['parent', 'parent2'] })).toBe(age24)
    const age25 = { ...first, age: 25 }
    expect(canBuy(age25, 'family-trip', { participantIds: ['parent', 'parent2'] }).available).toBe(true)
    const second = purchase(age25, 'family-trip', { participantIds: ['parent', 'parent2'] })
    expect(second.economy.balance).toBe(360)
    expect(second.economy.lastBought['family-trip']).toBe(25)
    checkClean(second)
  })

  it('сохраняет отдельные воспоминания о поездках с теми же людьми в 25 и 30 лет', () => {
    const g = workerAt(25)
    closeFamily(g)
    g.economy.balance = 1_000
    const first = purchase(g, 'family-trip', { participantIds: ['parent', 'parent2'] })
    const loaded = roundTrip(first)
    expect(loaded.memories.filter(memory => memory.includes('провёл неделю на обзорной палубе'))).toEqual([
      'В 25 лет провёл неделю на обзорной палубе вместе с Ада Марек и Томас Марек.'
    ])

    loaded.age = 30
    loaded.economy.settledAge = 30
    loaded.attention = 3
    expect(canBuy(loaded, 'family-trip', { participantIds: ['parent', 'parent2'] }).available).toBe(true)
    const second = purchase(loaded, 'family-trip', { participantIds: ['parent', 'parent2'] })
    const tripMemories = second.memories.filter(memory => memory.includes('провёл неделю на обзорной палубе'))
    expect(tripMemories).toEqual([
      'В 25 лет провёл неделю на обзорной палубе вместе с Ада Марек и Томас Марек.',
      'В 30 лет провёл неделю на обзорной палубе вместе с Ада Марек и Томас Марек.'
    ])
    expect(second.economy.lastBought['family-trip']).toBe(30)
    expect(roundTrip(second).memories.filter(memory => memory.includes('провёл неделю на обзорной палубе'))).toEqual(tripMemories)
    checkClean(second)
  })

  it('не повторяет покупку с умершим участником после завершения паузы', () => {
    const g = workerAt(30)
    closeFamily(g)
    g.economy.balance = 1_000
    const first = purchase(g, 'family-trip', { participantIds: ['parent', 'parent2'] })
    first.people.find(person => person.id === 'parent2')!.alive = false
    const age35 = { ...first, age: 35 }
    const before = structuredClone(age35)
    expect(canBuy(age35, 'family-trip', { participantIds: ['parent', 'parent2'] }).reason).toMatch(/не жив или ещё не знаком/)
    expect(purchase(age35, 'family-trip', { participantIds: ['parent', 'parent2'] })).toBe(age35)
    expect(age35).toEqual(before)
    checkClean(age35)
  })
})

describe('режим рабочей нагрузки', () => {
  it('разрешает переход с 40 лет, но не в 39; нулевой разрыв не требует резерва', () => {
    const age39 = workerAt(39)
    expect(canSetLoad(age39, 0.6)).toMatchObject({ available: false, reason: 'Сократить нагрузку можно с 40 лет.' })
    const age40 = workerAt(40)
    age40.economy.balance = 0
    expect(canSetLoad(age40, 0.6)).toMatchObject({ available: true, annualGap: 0, requiredReserve: 0, projectedBills: 350, projectedIncomeAtReducedLoad: 660 })
  })

  it.each(['trainee', 'between', 'sick', 'retired'] as const)('не меняет нагрузку вне статуса working: %s', kind => {
    const g = workerAt(50)
    g.economy.work.kind = kind
    expect(canSetLoad(g, 0.6).available).toBe(false)
    expect(setLoad(g, 0.6)).toBe(g)
  })

  it('сохраняет только допустимые значения нагрузки в экономическом состоянии', () => {
    const g = workerAt(45)
    g.economy.work.load = 0.8
    expect(findInconsistencies(g)).toContain('возраст 45: недопустимая рабочая нагрузка')
  })

  it('блокирует переобучение и ожидающий/принятый уход на пенсию', () => {
    const retraining = workerAt(45)
    retraining.protagonist.job = 'Медик'
    expect(canSetLoad(retraining, 0.6).reason).toMatch(/переобучение/)

    const pending = workerAt(60)
    pending.pending = 'retirement'
    expect(canSetLoad(pending, 0.6).reason).toMatch(/выходе на пенсию/)

    const leaving = workerAt(60)
    leaving.flags.retirement = true
    leaving.flags.retirementPath = 'left'
    expect(canSetLoad(leaving, 0.6).available).toBe(false)
  })

  it.each(['mentor', 'retirement', 'microcrack'])('отклоняет смену нагрузки при обязательном решении %s без изменений состояния', pendingId => {
    const g = workerAt(50)
    g.pending = pendingId
    const before = structuredClone(g)
    const rng = g.rng

    const result = setLoad(g, 0.6)

    expect(canSetLoad(g, 0.6)).toMatchObject({
      available: false,
      reason: pendingId === 'retirement'
        ? 'Сначала завершите решение о выходе на пенсию.'
        : 'Сначала завершите ожидающее сюжетное решение.'
    })
    expect(result).toBe(g)
    expect(g).toEqual(before)
    expect(g.history).toEqual(before.history)
    expect(g.rng).toBe(rng)
  })

  it('вычисляет резерв из projectYear при сохранении регулярных обязательств', () => {
    const g = workerAt(40)
    g.economy.housing = 1
    g.economy.owned['own-cabin'] = 25
    g.economy.services['dome-pass'] = 30
    g.economy.balance = 0
    const check = canSetLoad(g, 0.6)
    expect(check).toMatchObject({ available: false, projectedBills: 720, projectedIncomeAtReducedLoad: 660, annualGap: 60, requiredReserve: 180 })
    expect(check.reason).toContain('180 кр.')
    g.economy.balance = 179
    expect(canSetLoad(g, 0.6).available).toBe(false)
    g.economy.balance = 180
    expect(canSetLoad(g, 0.6).available).toBe(true)
  })

  it('сокращает нагрузку без немедленных эффектов, списаний, внимания или RNG', () => {
    const g = workerAt(40)
    g.economy.balance = 1_000
    g.attention = 2
    const before = structuredClone(g)
    const rng = g.rng
    const reduced = setLoad(g, 0.6)
    expect(g).toEqual(before)
    expect(reduced.economy.work.load).toBe(0.6)
    expect(reduced.economy.balance).toBe(1_000)
    expect(reduced.attention).toBe(2)
    expect(reduced.economy.ledger).toEqual(g.economy.ledger)
    expect(reduced.stats).toEqual(g.stats)
    expect(reduced.rng).toBe(rng)
    expect(canSetLoad(reduced, 0.6).reason).toMatch(/уже установлена/)
    expect(setLoad(reduced, 0.8)).toBe(reduced)
  })

  it('учитывает прогноз, зарплату 60%, стаж, годовые эффекты и повторный вызов расчёта', () => {
    const g = workerAt(40)
    g.economy.balance = 1_000
    const reduced = setLoad(g, 0.6)
    const loaded = roundTrip(reduced)
    expect(loaded.economy.work.load).toBe(0.6)
    const before = structuredClone(loaded)
    const preview = projectYear(loaded)
    expect(preview.economy.years.at(-1)).toMatchObject({ age: 41, wage: 660, bills: 350, balance: 1_310 })
    expect(loaded).toEqual(before)

    loaded.age = 41
    const effects = settleYear(loaded)
    expect(loaded.economy.years.at(-1)).toMatchObject({ wage: 660, bills: 350, balance: 1_310 })
    expect(loaded.economy.work.service).toBe(0.6)
    expect(effects.stats).toEqual({ stress: -2, bonds: 1 })
    const settled = structuredClone(loaded)
    settleYear(loaded)
    expect(loaded).toEqual(settled)
    checkClean(loaded)
  })

  it('работает вместе с каютой и абонементом, не пишет фиктивную финансовую операцию', () => {
    const g = workerAt(40)
    g.economy.balance = 180
    g.economy.housing = 1
    g.economy.owned['own-cabin'] = 25
    g.economy.services['dome-pass'] = 30
    const reduced = setLoad(g, 0.6)
    expect(reduced.economy.work.load).toBe(0.6)
    expect(reduced.economy.ledger).toEqual(g.economy.ledger)
    reduced.age = 41
    const effects = settleYear(reduced)
    expect(reduced.economy.years.at(-1)).toMatchObject({ wage: 660, bills: 720, balance: 120 })
    expect(effects.stats).toEqual({ stress: -4, morale: 1, bonds: 1 })
    expect(reduced.economy.work.service).toBe(0.6)
    checkClean(reduced)
  })

  it('разрешает менять режим несколько раз в году и возвращаться на полную без резерва', () => {
    const g = workerAt(40)
    g.economy.balance = 1_000
    let changed = setLoad(g, 0.6)
    changed = setLoad(changed, 1)
    changed.economy.balance = 0
    changed = setLoad(changed, 0.6)
    expect(changed.economy.work.load).toBe(0.6)
    expect(changed.economy.balance).toBe(0)
    changed.age = 41
    settleYear(changed)
    expect(changed.economy.years).toHaveLength(1)
    expect(changed.economy.years[0]).toMatchObject({ wage: 660, balance: 310 })
    changed.age = 42
    changed.economy.balance = 0
    const full = setLoad(changed, 1)
    expect(full.economy.work.load).toBe(1)
    expect(full.economy.balance).toBe(0)
    expect(full.attention).toBe(changed.attention)
    full.age = 42
    settleYear(full)
    expect(full.economy.years.at(-1)).toMatchObject({ wage: 1_100, balance: 750 })
    expect(full.economy.work.service).toBe(1.6)
    checkClean(full)

    const returnOnly = workerAt(45)
    returnOnly.economy.work.load = 0.6
    returnOnly.economy.balance = 0
    returnOnly.economy.housing = 2
    returnOnly.economy.services['dome-pass'] = 30
    expect(canSetLoad(returnOnly, 1)).toMatchObject({ available: true, requiredReserve: 0 })
  })

  it('позволяет сократить нагрузку перед возрастом автоматической пенсии', () => {
    const g = workerAt(76)
    g.economy.work.lastWage = 1_100
    g.economy.work.service = 40
    expect(canSetLoad(g, 0.6)).toMatchObject({ available: true, requiredReserve: 0 })
    const reduced = setLoad(g, 0.6)
    reduced.age = 77
    settleYear(reduced)
    expect(reduced.economy.work.kind).toBe('retired')
    expect(reduced.economy.years.at(-1)?.wage).toBe(0)
    expect(reduced.economy.years.at(-1)?.pension).toBeGreaterThan(0)
    checkClean(reduced)
  })
})

describe('сквозные сценарии T3b', () => {
  it('проводит курс → экскурсию → семейную поездку и следующий год без двойных списаний', () => {
    const g = workerAt(30)
    closeFamily(g)
    const target = availableSectorOptions(g)[0]!
    const course = purchase(g, 'course-pro')
    const sector = purchase(course, 'sector-trip', { sectorId: target.id })
    const family = purchase(sector, 'family-trip', { participantIds: ['parent', 'parent2'] })
    expect(family.economy.balance).toBe(4_090)
    expect(family.attention).toBe(0)
    expect(family.economy.work.courses).toBe(1)
    expect(family.stats.knowledge).toBe(11)
    expect(family.people.find(person => person.id === 'parent')?.bond).toBe(72)
    expect(family.economy.totals.spent).toBe(910)
    expect(family.economy.ledger.filter(txn => txn.kind === 'purchase').map(txn => txn.amount)).toEqual([350, 240, 320])
    checkClean(course)
    checkClean(sector)
    checkClean(family)

    const loaded = roundTrip(family)
    loaded.age = 31
    settleYear(loaded)
    expect(loaded.economy.years.at(-1)).toMatchObject({ wage: 1_100, bills: 350, balance: 4_840 })
    expect(loaded.economy.totals.spent).toBe(1_260)
    checkClean(loaded)
  })

  it('отказывает повторной покупке посещённого сектора без списаний', () => {
    const g = workerAt(30)
    const target = availableSectorOptions(g)[0]!
    const first = purchase(g, 'sector-trip', { sectorId: target.id })
    const before = structuredClone(first)
    expect(purchase(first, 'sector-trip', { sectorId: target.id })).toBe(first)
    expect(first).toEqual(before)
    checkClean(first)
  })
})
