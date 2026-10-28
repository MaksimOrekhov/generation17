import { describe, expect, it } from 'vitest'
import { cancelService, createGame, decide, purchase } from '../engine'
import { ECONOMY_TUNING, closeEstate, projectYear, settleYear } from '../economy'
import { findInconsistencies } from '../invariants'
import { canBuy, getOffer } from '../offers'
import { repairSave } from '../save'
import type { GameState, Job, Skill } from '../types'

function workerAt(age: number, job: Job = 'Техник'): GameState {
  const g = createGame(72017)
  g.age = age
  g.economy.settledAge = age
  g.protagonist.job = job
  g.focus = 'rest'
  g.attention = 3
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
    lastWage: ECONOMY_TUNING.wages[job][0]!,
    until: age < 18 ? 18 : null,
    path: null,
    deferYears: 0,
    mentor: false,
    post: 'none',
    job
  }
  return g
}

const roundTrip = (g: GameState) => repairSave(JSON.parse(JSON.stringify(g)) as GameState).game

describe('доступность каталога и чистота проверок', () => {
  it('проверяет покупку без изменения игры и выдаёт структурированные условия', () => {
    const g = workerAt(30)
    const before = structuredClone(g)
    const rng = g.rng
    const result = canBuy(g, 'course-pro')
    expect(result).toMatchObject({ available: true, oneTimeCost: 350, annualCost: 0, attention: 1, reason: null, action: 'purchase' })
    expect(result.opens.length).toBeGreaterThan(0)
    expect(g).toEqual(before)
    expect(g.rng).toBe(rng)
  })

  it.each([17, 59])('ограничивает профессиональный курс возрастом: %i лет', age => {
    const result = canBuy(workerAt(age), 'course-pro')
    expect(result.available).toBe(false)
    expect(result.reason).toMatch(age < 18 ? /с 18/ : /до 58/)
  })

  it('принимает границы курса 18 и 58 лет', () => {
    expect(canBuy(workerAt(18), 'course-pro').available).toBe(true)
    expect(canBuy(workerAt(58), 'course-pro').available).toBe(true)
  })

  it('различает профессию, рабочий статус, паузу, внимание и недостаток денег', () => {
    const between = workerAt(30)
    between.economy.work.kind = 'between'
    expect(canBuy(between, 'course-pro').reason).toMatch(/нужно работать/)

    const noProfession = workerAt(30, 'Без специальности')
    expect(canBuy(noProfession, 'course-pro').reason).toMatch(/основной специальности/)

    const paused = workerAt(30)
    paused.economy.lastBought['course-pro'] = 28
    expect(canBuy(paused, 'course-pro').reason).toMatch(/через 2/)

    const noAttention = workerAt(30)
    noAttention.attention = 0
    expect(canBuy(noAttention, 'course-pro').reason).toMatch(/внимания/)

    const poor = workerAt(30)
    poor.economy.balance = 349
    expect(canBuy(poor, 'course-pro').reason).toBe('Не хватает 1 кр.')
  })

  it('различает уже подключённую услугу, аварию, смерть, pending и неизвестное предложение', () => {
    const active = workerAt(30)
    active.economy.services['dome-pass'] = 29
    expect(canBuy(active, 'dome-pass').reason).toMatch(/уже подключён/)

    const closed = workerAt(30)
    closed.flags.shipIncidentAge = 30
    expect(canBuy(closed, 'dome-pass').reason).toMatch(/временно закрыт/)

    const pending = workerAt(30)
    pending.pending = 'retirement'
    expect(canBuy(pending, 'own-cabin').reason).toMatch(/ожидающее сюжетное решение/)

    const dead = workerAt(30)
    dead.stopped = true
    closeEstate(dead)
    expect(canBuy(dead, 'course-pro').reason).toMatch(/умер/)

    expect(canBuy(workerAt(30), 'future-offer').reason).toMatch(/предложения нет/)
  })

  it.each(['constructor', 'toString', '__proto__', '', 'unknown-offer'])('отклоняет небезопасный или неизвестный id: %s', id => {
    const g = workerAt(30)
    const before = structuredClone(g)
    const rng = g.rng
    expect(getOffer(id)).toBeUndefined()
    expect(canBuy(g, id)).toMatchObject({ available: false, offerId: id, reason: 'Такого предложения нет.' })
    expect(purchase(g, id)).toBe(g)
    expect(g).toEqual(before)
    expect(g.rng).toBe(rng)
  })

  it('не требует держать будущую аренду на балансе, если её покрывает ожидаемый доход', () => {
    const g = workerAt(30)
    g.economy.balance = 400
    const result = canBuy(g, 'own-cabin')
    expect(result).toMatchObject({ available: true, oneTimeCost: 400, annualCost: 280 })
    expect(result.warnings).toEqual([])
  })

  it('предупреждает о прогнозируемой нехватке на аренду или абонемент', () => {
    const cabin = workerAt(30)
    cabin.economy.balance = 400
    cabin.economy.work.kind = 'between'
    cabin.economy.work.lastWage = 0
    cabin.economy.work.until = 100
    expect(canBuy(cabin, 'own-cabin').warnings.join(' ')).toMatch(/аренду H1/)

    const pass = workerAt(30)
    pass.economy.balance = 0
    pass.economy.work.kind = 'between'
    pass.economy.work.lastWage = 0
    pass.economy.work.until = 100
    const result = canBuy(pass, 'dome-pass')
    expect(result.available).toBe(true)
    expect(result.warnings.join(' ')).toMatch(/абонемент будет отменён/)
  })
})

describe('профессиональный курс', () => {
  it('блокируется после настоящего решения mentor до завершения переобучения', () => {
    const g = workerAt(30)
    g.flags.trackChosen = true
    g.flags.mentorTalk = false
    g.pending = 'mentor'
    g.economy.work.courses = 2

    const changed = decide(g, 0)
    expect(changed.protagonist.job).toBe('Медик')
    expect(changed.economy.work.job).toBe('Техник')
    expect(canBuy(changed, 'course-pro')).toMatchObject({ available: false, reason: 'Сначала завершите переобучение.' })
    const before = structuredClone(changed)
    expect(purchase(changed, 'course-pro')).toBe(changed)
    expect(changed).toEqual(before)

    changed.age = 31
    settleYear(changed)
    expect(changed.economy.work).toMatchObject({ job: 'Медик', kind: 'trainee', courses: 0, until: 32 })
    changed.age = 32
    settleYear(changed)
    expect(changed.economy.work.kind).toBe('working')
    expect(canBuy(changed, 'course-pro').available).toBe(true)
    const course = purchase(changed, 'course-pro')
    expect(course.economy.work.courses).toBe(1)
    expect(course.skills.medicine).toBe(changed.skills.medicine + 3)
  })

  it.each([
    ['Техник', 'engineering'], ['Медик', 'medicine'], ['Агроном', 'ecology'], ['Координатор', 'social']
  ] as const)('списывает курс для профиля %s и не повышает разряд немедленно', (job, skill) => {
    const g = workerAt(30, job)
    g.economy.balance = 1_000
    g.economy.work.grade = 2
    g.economy.work.jobSince = 20
    g.economy.work.gradeSince = 20
    g.skills[skill] = 42
    const rng = g.rng
    const purchased = purchase(g, 'course-pro')
    expect(g.economy.balance).toBe(1_000)
    expect(purchased.economy.balance).toBe(650)
    expect(purchased.attention).toBe(2)
    expect(purchased.economy.work.courses).toBe(1)
    expect(purchased.skills[skill]).toBe(45)
    expect(purchased.economy.work.grade).toBe(2)
    expect(purchased.economy.lastBought['course-pro']).toBe(30)
    expect(purchased.economy.ledger.at(-1)).toMatchObject({ kind: 'purchase', ref: 'course-pro', amount: 350, label: 'Профессиональный курс' })
    expect(purchased.economy.totals.spent).toBe(350)
    expect(purchased.rng).toBe(rng)
    expect(findInconsistencies(purchased)).toEqual([])

    purchased.age = 31
    settleYear(purchased)
    expect(purchased.economy.work.grade).toBe(3)
  })

  it('ограничивает навык 60, не снижая уже более высокий навык', () => {
    const skill: Skill = 'engineering'
    const almost = workerAt(30)
    almost.skills[skill] = 59
    expect(purchase(almost, 'course-pro').skills[skill]).toBe(60)

    const already = workerAt(30)
    already.skills[skill] = 62
    expect(purchase(already, 'course-pro').skills[skill]).toBe(62)
  })

  it('разрешает следующий курс через четыре года и сохраняет паузу после загрузки', () => {
    const g = workerAt(25)
    g.economy.balance = 10_000
    const first = purchase(g, 'course-pro')
    const loaded = roundTrip(first)
    expect(loaded.economy.lastBought['course-pro']).toBe(25)
    expect(canBuy({ ...loaded, age: 28, economy: { ...loaded.economy, settledAge: 28 } }, 'course-pro').reason).toMatch(/через 1 год/)
    const afterFourYears = { ...loaded, age: 29, economy: { ...loaded.economy, settledAge: 29 } }
    expect(canBuy(afterFourYears, 'course-pro').available).toBe(true)
    const second = purchase(afterFourYears, 'course-pro')
    expect(second.economy.work.courses).toBe(2)
    expect(second.economy.lastBought['course-pro']).toBe(29)
    expect(findInconsistencies(second)).toEqual([])
  })

  it('сохраняет навык, курсы, lastBought и отсутствие повторного списания', () => {
    const g = workerAt(35)
    g.economy.balance = 1_000
    const purchased = purchase(g, 'course-pro')
    const loaded = roundTrip(purchased)
    expect(loaded.economy).toEqual(purchased.economy)
    expect(loaded.skills).toEqual(purchased.skills)
    expect(loaded.economy.balance).toBe(650)
    expect(purchase(loaded, 'course-pro')).toBe(loaded)
  })
})

describe('собственная каюта и право возврата', () => {
  it('покупается с 18 лет, стоит 400, повышает жильё и применяет штатный эффект настроения', () => {
    const young = workerAt(17)
    expect(canBuy(young, 'own-cabin').reason).toMatch(/с 18/)

    const poor = workerAt(25)
    poor.economy.balance = 399
    expect(canBuy(poor, 'own-cabin').reason).toBe('Не хватает 1 кр.')

    const g = workerAt(25)
    g.economy.balance = 1_000
    const rng = g.rng
    const purchased = purchase(g, 'own-cabin')
    expect(g.economy.housing).toBe(0)
    expect(purchased.economy.balance).toBe(600)
    expect(purchased.economy.housing).toBe(1)
    expect(purchased.stats.morale).toBe(52)
    expect(purchased.economy.owned['own-cabin']).toBe(25)
    expect(purchased.economy.lastBought['own-cabin']).toBe(25)
    expect(purchased.economy.ledger.at(-1)).toMatchObject({ ref: 'own-cabin', amount: 400 })
    expect(purchased.economy.totals.spent).toBe(400)
    expect(purchased.economy.years).toHaveLength(0)
    expect(purchased.rng).toBe(rng)
    expect(findInconsistencies(purchased)).toEqual([])
    expect(canBuy(purchased, 'own-cabin').reason).toMatch(/Уже есть/)
    expect(purchase(purchased, 'own-cabin')).toBe(purchased)
  })

  it('не списывает вступительный взнос повторно в текущем возрасте и платит аренду со следующего года', () => {
    const g = workerAt(25)
    g.economy.settledAge = 24
    g.economy.balance = 1_000
    const purchased = purchase(g, 'own-cabin')
    settleYear(purchased)
    expect(purchased.economy.years.at(-1)).toMatchObject({ age: 25, wage: 1_100, bills: 350, balance: 1_350 })
    purchased.age = 26
    settleYear(purchased)
    expect(purchased.economy.years.at(-1)).toMatchObject({ age: 26, wage: 1_100, bills: 630, balance: 1_820 })
    expect(purchased.economy.totals.spent).toBe(1_380)
    expect(findInconsistencies(purchased)).toEqual([])
  })

  it('отражает аренду в projectYear после покупки', () => {
    const g = workerAt(25)
    g.economy.balance = 1_000
    const purchased = purchase(g, 'own-cabin')
    const before = structuredClone(purchased)
    const forecast = projectYear(purchased)
    expect(forecast.economy.years.at(-1)).toMatchObject({ age: 26, bills: 630, balance: 1_070 })
    expect(purchased).toEqual(before)
    expect(purchased.rng).toBe(g.rng)
  })

  it('при нехватке теряет H1 и выдаёт право возврата на три года', () => {
    const g = workerAt(25)
    g.economy.balance = 400
    g.economy.work.kind = 'between'
    g.economy.work.lastWage = 0
    g.economy.work.until = 100
    const purchased = purchase(g, 'own-cabin')
    purchased.age = 26
    settleYear(purchased)
    expect(purchased.economy.years.at(-1)).toMatchObject({ age: 26, wage: 0, bills: 350, aid: 350, balance: 0 })
    expect(purchased.economy.housing).toBe(0)
    expect(purchased.economy.housingRight).toEqual({ tier: 1, until: 29 })
    expect(findInconsistencies(purchased)).toEqual([])
  })

  it('восстанавливает H1 без 400 кр. до граничного возраста, включая после загрузки', () => {
    const g = workerAt(25)
    g.economy.balance = 400
    g.economy.work.kind = 'between'
    g.economy.work.lastWage = 0
    g.economy.work.until = 100
    const cabin = purchase(g, 'own-cabin')
    cabin.age = 26
    settleYear(cabin)
    const loaded = roundTrip(cabin)
    expect(loaded.economy.housingRight).toEqual({ tier: 1, until: 29 })

    for (const age of [26, 27, 28, 29]) {
      const candidate = { ...loaded, age, economy: { ...loaded.economy, settledAge: age } }
      const availability = canBuy(candidate, 'own-cabin')
      expect(availability).toMatchObject({ available: true, oneTimeCost: 0, action: 'restore' })
    }
    const returned = purchase(loaded, 'own-cabin')
    expect(returned.economy.balance).toBe(0)
    expect(returned.economy.housing).toBe(1)
    expect(returned.economy.housingRight).toBeNull()
    expect(returned.economy.totals.spent).toBe(cabin.economy.totals.spent)
    expect(returned.economy.ledger).toEqual(cabin.economy.ledger)
    expect(returned.history[0]?.title).toBe('Возврат жилья')
    expect(findInconsistencies(returned)).toEqual([])

    returned.age = 30
    returned.economy.settledAge = 29
    returned.economy.balance = 1_000
    returned.economy.work.kind = 'working'
    returned.economy.work.until = null
    settleYear(returned)
    expect(returned.economy.years.at(-1)).toMatchObject({ age: 30, bills: 630, aid: 0, balance: 1_470 })
  })

  it('после истечения права требует новый взнос и сохраняет право H2', () => {
    const expired = workerAt(30)
    expired.economy.balance = 1_000
    expired.economy.housingRight = { tier: 1, until: 29 }
    const ordinary = canBuy(expired, 'own-cabin')
    expect(ordinary).toMatchObject({ available: true, oneTimeCost: 400, action: 'purchase' })
    const purchased = purchase(expired, 'own-cabin')
    expect(purchased.economy.balance).toBe(600)
    expect(purchased.economy.housingRight).toBeNull()

    const h2 = workerAt(30)
    h2.economy.balance = 1_000
    h2.economy.housingRight = { tier: 2, until: 32 }
    const upgraded = purchase(h2, 'own-cabin')
    expect(upgraded.economy.housing).toBe(1)
    expect(upgraded.economy.housingRight).toEqual({ tier: 2, until: 32 })
    expect(findInconsistencies(upgraded)).toEqual([])
  })

  it('не повторяет однократный бонус после потери жилья и платного возврата', () => {
    const g = workerAt(25)
    g.economy.balance = 400
    g.economy.work.kind = 'between'
    g.economy.work.lastWage = 0
    g.economy.work.until = 100

    const first = purchase(g, 'own-cabin')
    expect(first.economy.balance).toBe(0)
    expect(first.stats.morale).toBe(52)
    expect(first.economy.owned['own-cabin']).toBe(25)
    first.age = 26
    settleYear(first)
    expect(first.economy.housing).toBe(0)
    expect(first.economy.housingRight).toEqual({ tier: 1, until: 29 })

    for (const age of [27, 28, 29]) {
      first.age = age
      settleYear(first)
    }
    first.economy.work.kind = 'working'
    first.economy.work.until = null
    first.age = 30
    settleYear(first)
    expect(first.economy.housingRight).toBeNull()
    expect(first.economy.balance).toBeGreaterThanOrEqual(400)

    const balanceBefore = first.economy.balance
    const reacquired = purchase(first, 'own-cabin')
    expect(reacquired.economy.balance).toBe(balanceBefore - 400)
    expect(reacquired.economy.housing).toBe(1)
    expect(reacquired.stats.morale).toBe(52)
    expect(reacquired.economy.owned['own-cabin']).toBe(30)
  })

  it('бесплатное восстановление H1 не повторяет однократный бонус настроения', () => {
    const g = workerAt(25)
    g.economy.balance = 400
    g.economy.work.kind = 'between'
    g.economy.work.lastWage = 0
    g.economy.work.until = 100
    const first = purchase(g, 'own-cabin')
    expect(first.stats.morale).toBe(52)

    first.age = 26
    settleYear(first)
    const restored = purchase(first, 'own-cabin')
    expect(restored.economy.housing).toBe(1)
    expect(restored.economy.balance).toBe(first.economy.balance)
    expect(restored.economy.housingRight).toBeNull()
    expect(restored.stats.morale).toBe(52)
  })
})

describe('абонемент в биокупол', () => {
  it('подключается с 16 лет без предоплаты, внимания или мгновенного эффекта', () => {
    const g = workerAt(16)
    g.economy.balance = 250
    const beforeStats = structuredClone(g.stats)
    const connected = purchase(g, 'dome-pass')
    expect(canBuy(workerAt(15), 'dome-pass').reason).toMatch(/с 16/)
    expect(connected.economy.balance).toBe(250)
    expect(connected.attention).toBe(3)
    expect(connected.stats).toEqual(beforeStats)
    expect(connected.economy.services['dome-pass']).toBe(16)
    expect(connected.economy.ledger.at(-1)).toMatchObject({ kind: 'purchase', ref: 'dome-pass', amount: 0 })
    expect(canBuy(connected, 'dome-pass').reason).toMatch(/уже подключён/)
    expect(purchase(connected, 'dome-pass')).toBe(connected)
    expect(findInconsistencies(connected)).toEqual([])
  })

  it('списывает 90 кр. и применяет эффекты ровно один раз в следующем открытом году', () => {
    const g = workerAt(30)
    g.economy.balance = 1_000
    const connected = purchase(g, 'dome-pass')
    expect(connected.economy.balance).toBe(1_000)
    expect(connected.stats).toEqual(g.stats)
    const sameAge = settleYear(connected)
    expect(connected.economy.years).toHaveLength(0)
    expect(sameAge.stats).toEqual({})
    expect(connected.stats).toEqual(g.stats)
    const same = structuredClone(connected)
    settleYear(connected)
    expect(connected).toEqual(same)

    connected.age = 31
    const paidYear = settleYear(connected)
    expect(connected.economy.years.at(-1)).toMatchObject({ age: 31, wage: 1_100, bills: 440, balance: 1_660 })
    expect(paidYear.stats).toEqual({ stress: -2, morale: 1 })
    const after = structuredClone(connected)
    settleYear(connected)
    expect(connected).toEqual(after)
    expect(findInconsistencies(connected)).toEqual([])
  })

  it('не списывает плату при подключении; следующий годовой расчёт включает абонемент', () => {
    const g = workerAt(30)
    g.economy.settledAge = 29
    g.economy.balance = 1_000
    const connected = purchase(g, 'dome-pass')
    settleYear(connected)
    expect(connected.economy.years.at(-1)).toMatchObject({ age: 30, bills: 440, balance: 1_660 })
    connected.age = 31
    const paidYear = settleYear(connected)
    expect(connected.economy.years.at(-1)).toMatchObject({ age: 31, bills: 440, balance: 2_320 })
    expect(paidYear.stats).toEqual({ stress: -2, morale: 1 })
  })

  it('для агронома ежегодный платёж нулевой, но эффект сохраняется', () => {
    const g = workerAt(30, 'Агроном')
    g.economy.balance = 1_000
    expect(canBuy(g, 'dome-pass').annualCost).toBe(0)
    const connected = purchase(g, 'dome-pass')
    connected.age = 31
    const paidYear = settleYear(connected)
    expect(connected.economy.years.at(-1)).toMatchObject({ wage: 950, bills: 290, balance: 1_660 })
    expect(paidYear.stats).toEqual({ stress: -2, morale: 1 })
  })

  it('при аварии оставляет услугу, не списывает деньги и возобновляет её позднее', () => {
    const g = workerAt(30)
    g.economy.balance = 1_000
    g.economy.services['dome-pass'] = 29
    g.flags.shipIncidentAge = 30
    const closedRequest = workerAt(30)
    closedRequest.flags.shipIncidentAge = 30
    expect(canBuy(closedRequest, 'dome-pass').reason).toMatch(/временно закрыт/)
    g.economy.settledAge = 29
    const closed = settleYear(g)
    expect(g.economy.years.at(-1)).toMatchObject({ bills: 350, balance: 1_882 })
    expect(g.economy.services['dome-pass']).toBe(29)
    expect(closed.stats).toEqual({})

    g.age = 31
    g.flags.shipIncidentAge = 30
    const open = settleYear(g)
    expect(g.economy.years.at(-1)).toMatchObject({ bills: 440, balance: 2_542 })
    expect(g.economy.services['dome-pass']).toBe(29)
    expect(open.stats).toEqual({ stress: -2, morale: 1 })
  })

  it('автоматически отменяет абонемент при нехватке денег', () => {
    const g = workerAt(30)
    g.economy.balance = 0
    g.economy.work.kind = 'between'
    g.economy.work.lastWage = 0
    g.economy.work.until = 100
    g.economy.services['dome-pass'] = 29
    g.economy.settledAge = 29
    settleYear(g)
    expect(g.economy.years.at(-1)).toMatchObject({ wage: 0, bills: 350, aid: 350, balance: 0 })
    expect(g.economy.services['dome-pass']).toBeUndefined()
    expect(findInconsistencies(g)).toEqual([])
  })

  it('отменяет вручную без возврата и позволяет подключить заново', () => {
    const g = workerAt(30)
    g.economy.balance = 1_000
    const connected = purchase(g, 'dome-pass')
    connected.age = 31
    settleYear(connected)
    const paidBalance = connected.economy.balance
    const paidTotals = structuredClone(connected.economy.totals)
    const cancelled = cancelService(connected, 'dome-pass')
    expect(cancelled.economy.balance).toBe(paidBalance)
    expect(cancelled.economy.totals).toEqual(paidTotals)
    expect(cancelled.economy.services['dome-pass']).toBeUndefined()
    expect(cancelService(cancelled, 'dome-pass')).toBe(cancelled)
    const loaded = roundTrip(cancelled)
    expect(loaded.economy.services['dome-pass']).toBeUndefined()
    expect(loaded.history[0]?.text).toMatch(/не возвращается/)

    const reconnected = purchase(loaded, 'dome-pass')
    expect(reconnected.economy.services['dome-pass']).toBe(31)
    reconnected.age = 32
    settleYear(reconnected)
    expect(reconnected.economy.years.at(-1)).toMatchObject({ bills: 440, balance: paidBalance + 1_100 - 440 })
  })
})

describe('покупки вместе, сохранение и ограничения действий', () => {
  it('проводит курс и каюту в одном году с точным итогом следующего расчёта', () => {
    const g = workerAt(30)
    g.economy.balance = 2_000
    const course = purchase(g, 'course-pro')
    const cabin = purchase(course, 'own-cabin')
    expect(cabin.economy.balance).toBe(1_250)
    expect(cabin.attention).toBe(2)
    cabin.age = 31
    settleYear(cabin)
    expect(cabin.economy.years.at(-1)).toMatchObject({ wage: 1_100, bills: 630, balance: 1_720 })
    expect(cabin.economy.totals.spent).toBe(1_380)
    expect(findInconsistencies(cabin)).toEqual([])
  })

  it('проводит каюту и абонемент вместе, списывая обе ежегодные суммы', () => {
    const g = workerAt(30)
    g.economy.balance = 1_000
    const cabin = purchase(g, 'own-cabin')
    const connected = purchase(cabin, 'dome-pass')
    connected.age = 31
    const paidYear = settleYear(connected)
    expect(connected.economy.years.at(-1)).toMatchObject({ wage: 1_100, bills: 720, balance: 980 })
    expect(paidYear.stats).toEqual({ stress: -2, morale: 1 })
    expect(findInconsistencies(connected)).toEqual([])
  })

  it('разрешает несколько курсов с паузой четыре года', () => {
    let g = workerAt(25)
    g.economy.balance = 10_000
    for (const age of [25, 29, 33]) {
      g.age = age
      g.economy.settledAge = age
      g = purchase(g, 'course-pro')
    }
    expect(g.economy.work.courses).toBe(3)
    expect(g.economy.lastBought['course-pro']).toBe(33)
    expect(g.economy.ledger.filter(t => t.ref === 'course-pro')).toHaveLength(3)
    expect(g.economy.balance).toBe(8_950)
    expect(findInconsistencies(g)).toEqual([])
  })

  it('переносит активные каюту и абонемент в пенсию без потери платежей и эффектов', () => {
    const g = workerAt(76)
    g.economy.balance = 1_000
    g.economy.housing = 1
    g.economy.owned['own-cabin'] = 30
    g.economy.services['dome-pass'] = 74
    g.economy.work.grade = 1
    g.economy.work.lastWage = 1_100
    g.economy.work.service = 20
    g.economy.work.deferYears = 14
    g.age = 77
    const settled = settleYear(g)
    expect(g.economy.work.kind).toBe('retired')
    expect(g.economy.years.at(-1)).toMatchObject({ pension: 495, bills: 720, balance: 775 })
    expect(g.economy.services['dome-pass']).toBe(74)
    expect(settled.stats).toEqual({ stress: -2, morale: 1 })
    expect(findInconsistencies(g)).toEqual([])
  })

  it('сохраняет отдельные покупки и продолжает следующий год без повторного взноса', () => {
    for (const id of ['course-pro', 'own-cabin', 'dome-pass'] as const) {
      const g = workerAt(30)
      g.economy.balance = 1_000
      const purchased = purchase(g, id)
      const loaded = roundTrip(purchased)
      expect(loaded.economy).toEqual(purchased.economy)
      const before = loaded.economy.balance
      loaded.age = 31
      settleYear(loaded)
      expect(loaded.economy.balance).toBeGreaterThanOrEqual(0)
      expect(loaded.economy.balance).toBe(before + loaded.economy.years.at(-1)!.wage + loaded.economy.years.at(-1)!.pension - (loaded.economy.years.at(-1)!.bills - loaded.economy.years.at(-1)!.aid))
      expect(findInconsistencies(loaded)).toEqual([])
    }
  })

  it('не разрешает покупку при pending или после смерти и сохраняет RNG', () => {
    const pending = workerAt(30)
    pending.pending = 'retirement'
    expect(purchase(pending, 'own-cabin')).toBe(pending)

    const dead = workerAt(30)
    dead.stopped = true
    closeEstate(dead)
    dead.economy.services['dome-pass'] = 29
    const rng = dead.rng
    expect(purchase(dead, 'course-pro')).toBe(dead)
    expect(cancelService(dead, 'dome-pass')).toBe(dead)
    expect(dead.rng).toBe(rng)
  })
})
