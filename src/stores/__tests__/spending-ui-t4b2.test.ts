import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { advanceYear, canSetLoad, createGame, decide, purchase, setLoad } from '../../domain/engine'
import { ECONOMY_TUNING, projectYear } from '../../domain/economy'
import { workFinanceView } from '../../domain/economyView'
import { findInconsistencies } from '../../domain/invariants'
import { availableSectorOptions, canBuy } from '../../domain/offers'
import { repairSave } from '../../domain/save'
import { needsConfirmation, sanitizeSelection, spendView } from '../../domain/spendView'
import type { GameState, Job } from '../../domain/types'
import { useGameStore } from '../game'

function workerAt(age: number, job: Job = 'Техник', balance = 5_000): GameState {
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
  g.economy.balance = balance
  g.economy.work = {
    ...g.economy.work, kind: age < 16 ? 'child' : age < 18 ? 'trainee' : 'working', load: 1, grade: 1, jobSince: 18, gradeSince: 18,
    courses: 0, service: 0, lastWage: ECONOMY_TUNING.wages[job][0]!, until: age < 18 ? 18 : null, path: null, deferYears: 0, mentor: false, post: 'none', job
  }
  g.people = [
    { id: 'parent', name: 'Ада Марек', role: 'Мать', bond: 70, age: 52, alive: true, since: 0 },
    { id: 'parent2', name: 'Томас Марек', role: 'Отец', bond: 68, age: 54, alive: true, since: 0 },
    { id: 'friend', name: 'Ника Орлова', role: 'Подруга', bond: 55, age: 28, alive: true, since: 4 },
    { id: 'friend2', name: 'Рен Ильм', role: 'Друг', bond: 60, age: 30, alive: true, since: 4 },
    { id: 'distant', name: 'Кай Ильм', role: 'Знакомый', bond: 49, age: 28, alive: true, since: 4 }
  ]
  return g
}

function startAt(g: GameState) {
  const store = useGameStore()
  store.begin()
  store.game = g
  return store
}

const plain = (s: string | null) => (s ?? '').replace(/ /g, ' ')
const offer = (g: GameState, id: string, sel = {}) => spendView(g, sel).offers.find(o => o.id === id)!
const clean = (g: GameState) => expect(findInconsistencies(g)).toEqual([])
const roundTrip = (g: GameState) => repairSave(JSON.parse(JSON.stringify(g)) as GameState).game

describe('экскурсии в интерфейсе', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('без выбора предлагает направления, но ничего не выбирает и не покупает', () => {
    const g = workerAt(30)
    const o = offer(g, 'sector-trip')
    expect(o.stage).toBe('needs-choice')
    expect(o.available).toBe(false)
    expect(o.hint).toBe('Выберите направление')
    expect(o.target).toBeNull()
    expect(o.sectorOptions).toEqual(availableSectorOptions(g))
    expect(o.sectorOptions.length).toBeGreaterThan(0)
    expect(spendView(g).selection.sectorId).toBeNull()
  })

  it('выбранный сектор делает предложение готовым; чужой или устаревший выбор снимается', () => {
    const g = workerAt(30)
    const id = availableSectorOptions(g)[0]!.id
    expect(offer(g, 'sector-trip', { sectorId: id })).toMatchObject({ stage: 'ready', available: true, target: { sectorId: id } })
    expect(sanitizeSelection(g, { sectorId: 'nonexistent' as never }).sectorId).toBeNull()
  })

  it('цена: 240 обычному специалисту и 180 координатору, как у домена', () => {
    const tech = workerAt(30)
    const coord = workerAt(30, 'Координатор')
    const sid = availableSectorOptions(tech)[0]!.id
    expect(plain(offer(tech, 'sector-trip', { sectorId: sid }).oneTimeText)).toBe('240 кр разово')
    expect(plain(offer(coord, 'sector-trip', { sectorId: availableSectorOptions(coord)[0]!.id }).oneTimeText)).toBe('180 кр разово')
  })

  it('покупка: баланс, внимание, знания, исчезновение сектора, посещённое во вкладке «Моё», без двойного списания и RNG', () => {
    const store = startAt(workerAt(30))
    store.openShop()
    const rng = store.game.rng
    const sid = availableSectorOptions(store.game)[1]!.id
    const target = offer(store.game, 'sector-trip', { sectorId: sid }).target!
    expect(store.buy('sector-trip', target)).toBe(true)
    expect(store.buy('sector-trip', target)).toBe(false)
    const g = store.game
    expect(g.economy.balance).toBe(4_760)
    expect(g.attention).toBe(2)
    expect(g.stats.knowledge).toBe(11)
    expect(g.rng).toBe(rng)
    expect(availableSectorOptions(g).some(o => o.id === sid)).toBe(false)
    const mine = spendView(g).mine
    expect(mine.visited).toHaveLength(1)
    expect(mine.visited[0]!.text).toContain('30 лет')
    expect(mine.visited[0]!.name).not.toMatch(/visit-sector/)
    expect(mine.visitedLine).toBe('Экскурсий: 1 из 4')
    clean(g)
    expect(spendView(roundTrip(g)).mine).toEqual(mine)
    // прежний выбор больше не принимается
    expect(spendView(g, { sectorId: sid }).selection.sectorId).toBeNull()
  })

  it('лимит четырёх поездок', () => {
    let g = workerAt(30)
    for (let i = 0; i < 4; i++) {
      g.attention = 3
      const id = availableSectorOptions(g)[0]!.id
      g = purchase(g, 'sector-trip', { sectorId: id })
    }
    expect(spendView(g).mine.visited).toHaveLength(4)
    expect(offer(g, 'sector-trip')).toMatchObject({ stage: 'unavailable', available: false })
    expect(offer(g, 'sector-trip').reason).toMatch(/Нет доступных/)
  })

  it('причины недоступности приходят из домена: внимание и деньги', () => {
    const g = workerAt(30, 'Техник', 200)
    expect(offer(g, 'sector-trip').stage).toBe('unavailable')
    expect(offer(g, 'sector-trip').reason).toBe('Недостаточно средств: не хватает 40 кр.')
    const noAttention = workerAt(30)
    noAttention.attention = 0
    expect(offer(noAttention, 'sector-trip').reason).toMatch(/внимания/)
  })

  it('подтверждение привязано к сектору и стоимости', () => {
    const g = workerAt(30, 'Техник', 800)
    const [a, b] = availableSectorOptions(g)
    const oa = offer(g, 'sector-trip', { sectorId: a!.id })
    const ob = offer(g, 'sector-trip', { sectorId: b!.id })
    expect(oa.confirmKey).not.toBeNull()
    expect(oa.confirmKey).not.toBe(ob.confirmKey)
    expect(plain(oa.confirmLabel)).toContain(a!.name)
    expect(plain(oa.confirmLabel)).toContain('−240 кр')
    const rich = workerAt(30)
    expect(offer(rich, 'sector-trip', { sectorId: a!.id }).confirmKey).toBeNull()
    expect(needsConfirmation(g, 'sector-trip', { sectorId: a!.id })).toBe(true)
  })
})

describe('семейная поездка в интерфейсе', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('показывает близких без автовыбора; один участник — подсказка «ещё одного»', () => {
    const g = workerAt(30)
    const o = offer(g, 'family-trip')
    expect(o.stage).toBe('needs-choice')
    expect(o.hint).toBe('Выберите двух или трёх близких')
    expect(o.participantOptions.map(p => p.id)).toEqual(['parent', 'parent2', 'friend', 'friend2'])
    expect(o.participantOptions[0]).toMatchObject({ name: 'Ада Марек', role: 'Мать', bond: 70 })
    expect(o.target).toBeNull()
    const one = offer(g, 'family-trip', { participantIds: ['parent'] })
    expect(one.hint).toBe('Выберите ещё одного близкого')
    expect(one.available).toBe(false)
  })

  it('два и три участника допустимы, четвёртый отсеивается', () => {
    const g = workerAt(30)
    expect(offer(g, 'family-trip', { participantIds: ['parent', 'friend'] }).stage).toBe('ready')
    expect(offer(g, 'family-trip', { participantIds: ['parent', 'friend', 'friend2'] }).stage).toBe('ready')
    const four = spendView(g, { participantIds: ['parent', 'parent2', 'friend', 'friend2'] })
    expect(four.selection.participantIds).toHaveLength(3)
  })

  it('умерший, неизвестный и дальний участники не попадают в выбор', () => {
    const g = workerAt(30)
    g.people.find(p => p.id === 'parent2')!.alive = false
    const sel = sanitizeSelection(g, { participantIds: ['parent', 'parent2', 'distant', 'ghost', 'parent'] })
    expect(sel.participantIds).toEqual(['parent'])
  })

  it('смена набора участников и смерть участника сбрасывают ключ подтверждения', () => {
    const g = workerAt(30, 'Техник', 1_000)
    const k1 = offer(g, 'family-trip', { participantIds: ['parent', 'friend'] }).confirmKey
    const k2 = offer(g, 'family-trip', { participantIds: ['parent', 'friend2'] }).confirmKey
    expect(k1).not.toBeNull()
    expect(k1).not.toBe(k2)
    expect(offer(g, 'family-trip', { participantIds: ['friend', 'parent'] }).confirmKey).toBe(k1)
    g.people.find(p => p.id === 'friend')!.alive = false
    expect(offer(g, 'family-trip', { participantIds: ['parent', 'friend'] }).confirmKey).not.toBe(k1)
  })

  it('покупка: 320 кр, внимание, связи +2, хроника, пауза пять лет, повтор после паузы, сохранение', () => {
    const store = startAt(workerAt(30))
    store.openShop()
    const rng = store.game.rng
    const target = offer(store.game, 'family-trip', { participantIds: ['parent', 'friend'] }).target!
    expect(store.buy('family-trip', target)).toBe(true)
    expect(store.buy('family-trip', target)).toBe(false)
    let g = store.game
    expect(g.economy.balance).toBe(4_680)
    expect(g.attention).toBe(2)
    expect(g.people.find(p => p.id === 'parent')!.bond).toBe(72)
    expect(g.people.find(p => p.id === 'friend')!.bond).toBe(57)
    expect(g.people.find(p => p.id === 'parent2')!.bond).toBe(68)
    expect(g.history[0]!.text).toContain('Ада Марек')
    expect(g.rng).toBe(rng)
    clean(g)

    const view = offer(g, 'family-trip')
    expect(view.available).toBe(false)
    expect(view.cooldownText).toBe('Следующая поездка — в 35 лет')
    expect(view.reason).toMatch(/через 5 лет/)
    expect(spendView(g).mine.familyTripText).toBe('Последняя совместная поездка — в 30 лет')
    expect(spendView(roundTrip(g)).mine.familyTripText).toBe('Последняя совместная поездка — в 30 лет')

    g = { ...g, age: 35, attention: 3 }
    g.economy = { ...g.economy, settledAge: 35 }
    expect(offer(g, 'family-trip', { participantIds: ['parent', 'parent2'] }).stage).toBe('ready')
  })

  it('поездка с одним участником отклоняется доменом', () => {
    const store = startAt(workerAt(30))
    expect(store.buy('family-trip', { participantIds: ['parent'] })).toBe(false)
    expect(store.game.economy.balance).toBe(5_000)
  })
})

describe('режим работы', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('до 40 лет сокращение закрыто с причиной домена, с 40 — доступно', () => {
    const young = spendView(workerAt(39)).work.load
    expect(young.action).toMatchObject({ available: false, nextLoad: 0.6 })
    expect(young.action.reason).toBe(canSetLoad(workerAt(39), 0.6).reason)
    expect(spendView(workerAt(40)).work.load.action.available).toBe(true)
  })

  it('резерв в подписи совпадает с canSetLoad; недостаточный резерв блокирует с той же причиной', () => {
    const g = workerAt(45, 'Техник', 500)
    g.economy.housing = 2
    const check = canSetLoad(g, 0.6)
    expect(check.annualGap).toBeGreaterThan(0)
    expect(check.available).toBe(false)
    const load = spendView(g).work.load
    expect(load.action.reason).toBe(check.reason)
    expect(load.reserve).toContain(`${check.annualGap} кр./год`)
    expect(load.reserve).toContain(`резерв ${check.requiredReserve} кр`)
    expect(load.reserve).toContain('Сейчас накоплено 500 кр')
    const store = startAt(g)
    expect(store.changeLoad(0.6)).toBe(false)
    expect(store.game.economy.work.load).toBe(1)
  })

  it('сравнение берётся из projectYear: доход, обязательства, баланс, стаж', () => {
    const g = workerAt(45)
    const rows = Object.fromEntries(spendView(g).work.load.compare!.map(r => [r.label, r]))
    const full = projectYear(g).economy.years.at(-1)!
    const reducedState = structuredClone(g)
    reducedState.economy.work.load = 0.6
    const reduced = projectYear(reducedState).economy.years.at(-1)!
    expect(plain(rows['Доход за год']!.full)).toBe(`${full.wage.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} кр`)
    expect(plain(rows['Доход за год']!.reduced)).toBe(`${String(reduced.wage).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} кр`)
    expect(reduced.wage).toBeLessThan(full.wage)
    expect(rows['Прирост стажа']).toMatchObject({ full: '+1', reduced: '+0,6' })
    expect(rows['Эффекты нагрузки']!.reduced).toMatch(/Стресс −2/)
    expect(rows['Эффекты нагрузки']!.reduced).toMatch(/связи \+1/)
    expect(rows['Эффекты нагрузки']!.full).toBe('Обычные')
  })

  it('переход на 0,6 и возврат: без списаний, внимания и RNG; прогноз и следующий год совпадают', () => {
    const store = startAt(workerAt(45))
    store.openShop()
    const before = store.game
    expect(store.changeLoad(0.6)).toBe(true)
    const g = store.game
    expect(g.economy.work.load).toBe(0.6)
    expect(g.economy.balance).toBe(before.economy.balance)
    expect(g.attention).toBe(before.attention)
    expect(g.rng).toBe(before.rng)
    expect(spendView(g).work.load).toMatchObject({ current: 0.6, title: '0,6 ставки' })
    expect(spendView(g).work.load.action).toMatchObject({ label: 'Вернуться на полную ставку', nextLoad: 1, available: true })
    const forecast = workFinanceView(g).forecast!
    const next = advanceYear(g)
    expect(next.economy.balance).toBe(forecast.after)
    expect(next.economy.work.service).toBeCloseTo(before.economy.work.service + 0.6, 5)
    clean(next)
    expect(roundTrip(g).economy.work.load).toBe(0.6)

    expect(store.changeLoad(1)).toBe(true)
    expect(store.game.economy.work.load).toBe(1)
    expect(store.game.economy.balance).toBe(before.economy.balance)
    expect(store.changeLoad(1)).toBe(false)
  })

  it('возврат на полную ставку не требует резерва', () => {
    const g = workerAt(45, 'Техник', 10)
    g.economy.work.load = 0.6
    expect(spendView(g).work.load.action.available).toBe(true)
    expect(spendView(g).work.load.reserve).toBeNull()
  })

  it('пограничные состояния: переобучение, больничный, пенсия, ожидающее решение, принятый уход', () => {
    const retrain = workerAt(45)
    retrain.protagonist.job = 'Медик'
    expect(spendView(retrain).work.load.action.available).toBe(false)
    const sick = workerAt(45)
    sick.economy.work.kind = 'sick'
    expect(spendView(sick).work.load.action.available).toBe(false)
    expect(spendView(sick).work.load.compare).toBeNull()
    const retired = workerAt(70)
    retired.economy.work.kind = 'retired'
    retired.economy.work.path = 'left'
    expect(spendView(retired).work.load.action.available).toBe(false)
    const pending = workerAt(45)
    pending.pending = 'retirement'
    const store = startAt(pending)
    expect(store.changeLoad(0.6)).toBe(false)
    expect(spendView(pending).work.load.action.available).toBe(false)
    const leaving = workerAt(60)
    leaving.flags.retirement = true
    leaving.flags.retirementPath = 'left'
    expect(spendView(leaving).work.load.action.available).toBe(false)
  })

  it('в 76 лет честно предупреждает о пенсионном переходе следующего года', () => {
    const g = workerAt(76)
    const load = spendView(g).work.load
    expect(load.retirementNote).toMatch(/пенсионн/)
    expect(load.retirementNote).toMatch(/не начисляется/)
    expect(spendView(workerAt(50)).work.load.retirementNote).toBeNull()
    const next = advanceYear(g)
    expect(next.economy.work.kind).toBe('retired')
  })

  it('смена нагрузки доступна из окна при открытом магазине и сохраняет паузу', () => {
    const store = startAt(workerAt(45))
    store.togglePlay()
    store.openShop()
    store.changeSpeed(16)
    const age = store.game.age
    for (let i = 0; i < 50; i++) store.frame(.1)
    store.changeLoad(0.6)
    expect(store.game.age).toBe(age)
    store.closeShop()
    expect(store.playing).toBe(false)
  })
})

describe('регрессии предыдущих покупок', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('старые предложения работают как раньше, а при ожидающем решении всё заблокировано', () => {
    const store = startAt(workerAt(30))
    expect(store.buy('course-pro')).toBe(true)
    expect(store.buy('own-cabin')).toBe(true)
    expect(store.buy('dome-pass')).toBe(true)
    expect(store.cancelServiceById('dome-pass')).toBe(true)
    const pending = workerAt(30)
    pending.pending = 'x'
    const o = spendView(pending).offers
    expect(o.every(x => !x.available)).toBe(true)
    expect(canBuy(pending, 'course-pro').available).toBe(false)
  })
})

describe('сценарный прогон: покупки и нагрузка сохраняют инварианты', () => {
  it('20 жизней с экскурсиями, поездками и сокращённой ставкой', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let g = createGame(seed * 7919)
      for (let guard = 0; guard < 900 && g.age < 70 && !g.stopped; guard++) {
        g = g.pending ? decide(g, 0) : advanceYear(g)
        if (g.pending || g.stopped || g.age < 18) continue
        const view = spendView(g)
        const sector = view.offers.find(o => o.id === 'sector-trip')!.sectorOptions[0]
        if (sector && g.age % 5 === 0) g = purchase(g, 'sector-trip', { sectorId: sector.id })
        const people = view.offers.find(o => o.id === 'family-trip')!.participantOptions
        if (people.length >= 2 && g.age % 7 === 0) g = purchase(g, 'family-trip', { participantIds: people.slice(0, 2).map(p => p.id) })
        if (g.age >= 40 && g.age % 3 === 0) g = setLoad(g, g.economy.work.load === 1 ? 0.6 : 1)
        expect(findInconsistencies(g), `seed ${seed}, age ${g.age}`).toEqual([])
      }
    }
  }, 120_000)
})

describe('подтверждение и формулировки бонусов', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('ключ подтверждения курса не меняется от бесплатного абонемента и нагрузки — поэтому сброс следит за игрой', () => {
    const g = workerAt(45, 'Техник', 1_000)
    const key = offer(g, 'course-pro').confirmKey
    expect(key).not.toBeNull()
    const withDome = purchase(g, 'dome-pass')
    expect(withDome).not.toBe(g)
    expect(offer(withDome, 'course-pro').confirmKey).toBe(key)
    const reduced = setLoad(g, 0.6)
    expect(reduced).not.toBe(g)
    expect(offer(reduced, 'course-pro').confirmKey).toBe(key)
  })

  it('подтверждение привязано к актуальной цели', () => {
    const g = workerAt(30, 'Техник', 800)
    const [a, b] = availableSectorOptions(g)
    expect(offer(g, 'sector-trip', { sectorId: a!.id }).confirmKey).not.toBe(offer(g, 'sector-trip', { sectorId: b!.id }).confirmKey)
  })

  it('формулировки говорят «до», а не обещают точный прирост', () => {
    const g = workerAt(30)
    expect(offer(g, 'sector-trip').resultText).toMatch(/до \+1 к знаниям/)
    expect(offer(g, 'family-trip').resultText).toMatch(/до \+2 к связи/)
  })

  it('при знаниях выше 55 и связи 99 фактический эффект не больше заявленного', () => {
    const g = workerAt(30)
    g.stats.knowledge = 70
    g.people.find(p => p.id === 'parent')!.bond = 99
    const sid = availableSectorOptions(g)[0]!.id
    const after = purchase(g, 'sector-trip', { sectorId: sid })
    const gain = after.stats.knowledge - 70
    expect(gain).toBeGreaterThanOrEqual(0)
    expect(gain).toBeLessThanOrEqual(1)
    const trip = purchase(g, 'family-trip', { participantIds: ['parent', 'parent2'] })
    expect(trip.people.find(p => p.id === 'parent')!.bond).toBe(100)
    expect(trip.people.find(p => p.id === 'parent2')!.bond - 68).toBeLessThanOrEqual(2)
  })

  it('старые покупки T3a работают', () => {
    const store = startAt(workerAt(30))
    expect(store.buy('course-pro')).toBe(true)
    expect(store.buy('own-cabin')).toBe(true)
    expect(store.buy('dome-pass')).toBe(true)
    expect(store.cancelServiceById('dome-pass')).toBe(true)
  })
})
