import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { advanceYear, createGame, purchase } from '../../domain/engine'
import { ECONOMY_TUNING } from '../../domain/economy'
import { workFinanceView } from '../../domain/economyView'
import { needsConfirmation, spendView } from '../../domain/spendView'
import { repairSave } from '../../domain/save'
import type { GameState, Job } from '../../domain/types'
import { useGameStore } from '../game'

function workerAt(age: number, job: Job = 'Техник', balance = 5_000): GameState {
  const g = createGame(72017)
  g.age = age
  g.economy.settledAge = age
  g.protagonist.job = job
  g.focus = 'rest'
  g.attention = 3
  g.stats.morale = 50
  g.ship.air = 100
  g.ship.food = 100
  g.economy.balance = balance
  g.economy.work = {
    ...g.economy.work, kind: age < 16 ? 'child' : age < 18 ? 'trainee' : 'working', load: 1, grade: 1, jobSince: 18, gradeSince: 18,
    courses: 0, service: 0, lastWage: ECONOMY_TUNING.wages[job][0]!, until: age < 18 ? 18 : null, path: null, deferYears: 0, mentor: false, post: 'none', job
  }
  return g
}

function startAt(g: GameState) {
  const store = useGameStore()
  store.begin()
  store.game = g
  return store
}

const plain = (s: string | null) => (s ?? '').replace(/ /g, ' ')
const offer = (g: GameState, id: string) => spendView(g).offers.find(o => o.id === id)!

describe('магазин и игровое время', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('открытие при идущем времени останавливает его, закрытие возобновляет', () => {
    const store = startAt(workerAt(30))
    expect(store.playing).toBe(true)
    const before = store.game
    const rng = before.rng
    store.openShop()
    expect(store.shopOpen).toBe(true)
    expect(store.playing).toBe(false)
    expect(store.game).toBe(before)
    expect(store.game.rng).toBe(rng)
    store.closeShop()
    expect(store.shopOpen).toBe(false)
    expect(store.playing).toBe(true)
  })

  it('открытие на паузе оставляет паузу после закрытия', () => {
    const store = startAt(workerAt(30))
    store.togglePlay()
    expect(store.playing).toBe(false)
    store.openShop()
    store.closeShop()
    expect(store.playing).toBe(false)
  })

  it('повторные открытия и закрытия не искажают восстановление', () => {
    const store = startAt(workerAt(30))
    store.openShop()
    store.openShop()
    store.closeShop()
    expect(store.playing).toBe(true)
    store.closeShop()
    store.togglePlay()
    store.openShop()
    store.closeShop()
    store.openShop()
    store.closeShop()
    expect(store.playing).toBe(false)
  })

  it('пока окно открыто, время, step, runToDecision и пробел ничего не двигают даже на 16×', () => {
    const store = startAt(workerAt(30))
    store.changeSpeed(16)
    store.togglePlay()
    store.openShop()
    const snapshot = store.game
    const progress = store.progress
    for (let i = 0; i < 200; i++) store.frame(.1)
    store.step()
    store.runToDecision()
    store.togglePlay()
    expect(store.playing).toBe(false)
    expect(store.game).toBe(snapshot)
    expect(store.progress).toBe(progress)
    store.closeShop()
    expect(store.playing).toBe(false) // пробел во время окна не запускал игру
  })

  it('активный момент сохраняется и не принимается/пропускается через открытое окно', () => {
    const g = workerAt(30)
    g.moment = 'radio' as GameState['moment']
    const store = startAt(g)
    store.openShop()
    store.acceptMoment()
    store.dismissMoment()
    expect(store.game.moment).toBe('radio')
    expect(store.game.attention).toBe(3)
    store.closeShop()
    expect(store.game.moment).toBe('radio')
  })

  it('не открывается при решении, результате, смерти, до 16 лет и до начала жизни', () => {
    let store = startAt(workerAt(30))
    store.game = { ...store.game, pending: 'x' }
    store.openShop()
    expect(store.shopOpen).toBe(false)

    setActivePinia(createPinia())
    store = startAt(workerAt(30))
    store.result = []
    store.openShop()
    expect(store.shopOpen).toBe(false)

    setActivePinia(createPinia())
    store = startAt(workerAt(30))
    store.game = { ...store.game, stopped: true }
    store.openShop()
    expect(store.shopOpen).toBe(false)

    setActivePinia(createPinia())
    store = startAt(workerAt(15))
    store.openShop()
    expect(store.shopOpen).toBe(false)

    setActivePinia(createPinia())
    const fresh = useGameStore()
    fresh.game = workerAt(30)
    fresh.openShop()
    expect(fresh.shopOpen).toBe(false)
  })

  it('закрытие не запускает время, если игра завершилась или появилось решение', () => {
    const store = startAt(workerAt(30))
    store.openShop()
    store.game = { ...store.game, pending: 'x' }
    store.closeShop()
    expect(store.playing).toBe(false)
  })

  it('новая жизнь закрывает окно и сбрасывает возобновление', () => {
    const store = startAt(workerAt(30))
    store.openShop()
    store.newLife()
    expect(store.shopOpen).toBe(false)
    store.begin()
    store.game = workerAt(30)
    store.togglePlay()
    store.openShop()
    store.closeShop()
    expect(store.playing).toBe(false)
  })

  it('не мешает логике resumeAfter сюжетного решения', () => {
    const store = startAt(workerAt(30))
    store.changeSpeed(16)
    for (let i = 0; i < 20000 && !store.game.pending && !store.game.stopped; i++) store.frame(.1)
    if (!store.game.pending) return
    expect(store.canOpenShop).toBe(false)
    store.choose(0)
    expect(store.canOpenShop).toBe(false)
    store.continueAfterResult()
    expect(store.playing).toBe(true)
    store.openShop()
    store.closeShop()
    expect(store.playing).toBe(true)
  })
})

describe('покупки через хранилище', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('показывает пять реальных предложений', () => {
    expect(spendView(workerAt(30)).offers.map(o => o.id)).toEqual(['course-pro', 'own-cabin', 'dome-pass', 'sector-trip', 'family-trip'])
  })

  it('причины недоступности приходят из canBuy: возраст и деньги', () => {
    expect(offer(workerAt(17), 'course-pro')).toMatchObject({ available: false, reason: 'Доступно с 18 лет.' })
    expect(offer(workerAt(15), 'dome-pass')).toMatchObject({ available: false })
    const poor = offer(workerAt(30, 'Техник', 280), 'own-cabin')
    expect(poor.available).toBe(false)
    expect(poor.reason).toBe('Недостаточно средств: не хватает 120 кр.')
  })

  it('курс: списывает деньги и внимание, повышает навык, окно и панель видят то же', () => {
    const g = workerAt(30)
    const store = startAt(g)
    store.openShop()
    const skill = g.skills.engineering
    expect(store.buy('course-pro')).toBe(true)
    expect(store.game.economy.balance).toBe(4_650)
    expect(store.game.attention).toBe(2)
    expect(store.game.skills.engineering).toBe(skill + 3)
    expect(store.game.economy.work.courses).toBe(1)
    expect(spendView(store.game).balanceText).toBe(workFinanceView(store.game).savings!.text)
    expect(spendView(store.game).history.ledger[0]).toMatchObject({ kind: 'purchase', amount: 350, })
    expect(plain(spendView(store.game).history.ledger[0]!.signed)).toBe('−350 кр')
    expect(offer(store.game, 'course-pro').available).toBe(false)
  })

  it('подтверждение: каюта всегда, курс от 25% баланса, абонемент и восстановление — нет', () => {
    expect(needsConfirmation(workerAt(30), 'own-cabin')).toBe(true)
    expect(needsConfirmation(workerAt(30), 'course-pro')).toBe(false)
    expect(needsConfirmation(workerAt(30, 'Техник', 1_400), 'course-pro')).toBe(true)
    expect(needsConfirmation(workerAt(30), 'dome-pass')).toBe(false)
    const g = workerAt(30)
    g.economy.housingRight = { tier: 1, until: 32 }
    expect(offer(g, 'own-cabin')).toMatchObject({ buttonLabel: 'Восстановить бесплатно', confirmLabel: null })
    expect(plain(offer(workerAt(30), 'own-cabin').confirmLabel)).toBe('Точно оформить? −400 кр')
  })

  it('каюта: оформление и невозможность второй покупки в обход интерфейса', () => {
    const store = startAt(workerAt(30))
    expect(store.buy('own-cabin')).toBe(true)
    const after = store.game
    expect(after.economy.housing).toBe(1)
    expect(after.economy.balance).toBe(4_600)
    expect(store.buy('own-cabin')).toBe(false)
    expect(purchase(after, 'own-cabin')).toBe(after)
    expect(store.game.economy.balance).toBe(4_600)
    expect(spendView(after).mine.owned.map(o => o.id)).toEqual(['own-cabin'])
  })

  it('бесплатное восстановление H1 по праву возврата', () => {
    const g = workerAt(30)
    g.economy.owned['own-cabin'] = 25
    g.economy.housingRight = { tier: 1, until: 32 }
    const store = startAt(g)
    expect(store.buy('own-cabin')).toBe(true)
    expect(store.game.economy.housing).toBe(1)
    expect(store.game.economy.balance).toBe(5_000)
    expect(store.game.economy.housingRight).toBeNull()
  })

  it('биокупол: подключение, отмена, нулевая цена агронома, аварийное закрытие', () => {
    const tech = workerAt(30)
    expect(plain(offer(tech, 'dome-pass').annualText)).toBe('90 кр в год')
    const agro = workerAt(30, 'Агроном')
    expect(plain(offer(agro, 'dome-pass').annualText)).toContain('0 кр в год · бесплатно')

    const store = startAt(agro)
    expect(store.buy('dome-pass')).toBe(true)
    expect(spendView(store.game).mine.services[0]).toMatchObject({ id: 'dome-pass', running: true })
    expect(plain(spendView(store.game).mine.services[0]!.annualText)).toBe('0 кр в год')
    const rng = store.game.rng
    const balance = store.game.economy.balance
    expect(store.cancelServiceById('dome-pass')).toBe(true)
    expect(store.game.economy.services['dome-pass']).toBeUndefined()
    expect(store.game.economy.balance).toBe(balance)
    expect(store.game.rng).toBe(rng)
    expect(store.cancelServiceById('dome-pass')).toBe(false)

    const closed = workerAt(30)
    closed.ship.air = 40
    expect(offer(closed, 'dome-pass')).toMatchObject({ available: false, reason: 'Биокупол временно закрыт.' })
    const running = workerAt(30)
    running.economy.services['dome-pass'] = 30
    running.ship.air = 40
    expect(spendView(running).mine.services[0]).toMatchObject({ running: false, statusText: 'временно закрыт' })
  })

  it('покупка и открытие окна не расходуют RNG; следующий год отражает последствия', () => {
    const store = startAt(workerAt(30))
    const rng = store.game.rng
    store.openShop()
    store.buy('own-cabin')
    store.buy('dome-pass')
    expect(store.game.rng).toBe(rng)
    const projected = workFinanceView(store.game).forecast!.after
    store.closeShop()
    expect(store.game.economy.services['dome-pass']).toBe(30)
    expect(projected).toBeLessThan(5_000)
  })

  it('сохранение и загрузка сохраняют покупки', () => {
    const store = startAt(workerAt(30))
    store.buy('own-cabin')
    store.buy('dome-pass')
    const loaded = repairSave(JSON.parse(JSON.stringify(store.game)) as GameState).game
    expect(loaded.economy.housing).toBe(1)
    expect(loaded.economy.services['dome-pass']).toBe(30)
    expect(loaded.economy.balance).toBe(store.game.economy.balance)
    expect(spendView(loaded).mine.owned).toHaveLength(1)
  })

  it('пустая история показывается без ошибок', () => {
    const v = spendView(workerAt(30))
    expect(v.history.years).toEqual([])
    expect(v.history.ledger).toEqual([])
  })

  it('после сохранения и загрузки баланс, услуги, обязательства и прогноз совпадают', () => {
    const store = startAt(workerAt(30))
    store.buy('own-cabin')
    store.buy('dome-pass')
    store.buy('course-pro')
    const loaded = repairSave(JSON.parse(JSON.stringify(store.game)) as GameState).game
    const a = workFinanceView(store.game)
    const b = workFinanceView(loaded)
    expect(b.savings).toEqual(a.savings)
    expect(b.obligations).toEqual(a.obligations)
    expect(b.forecast).toEqual(a.forecast)
    expect(loaded.economy.services).toEqual(store.game.economy.services)
    expect(loaded.economy.lastBought).toEqual(store.game.economy.lastBought)
    expect(spendView(loaded)).toEqual(spendView(store.game))
  })

  it('покупка перед сменой года списывается один раз и совпадает с прогнозом', () => {
    const store = startAt(workerAt(30))
    store.buy('dome-pass')
    store.buy('dome-pass')
    const forecast = workFinanceView(store.game).forecast!
    const rng = store.game.rng
    const next = advanceYear(store.game)
    expect(next.economy.balance).toBe(forecast.after)
    expect(next.economy.years.at(-1)!.bills).toBe(350 + 90)
    expect(store.game.rng).toBe(rng)
    expect(store.game.economy.ledger.filter(t => t.ref === 'dome-pass')).toHaveLength(1)
  })

  it('оформление каюты перед сменой года: взнос один раз, затем годовая аренда', () => {
    const base = workerAt(30)
    const store = startAt(structuredClone(base))
    store.buy('own-cabin')
    store.buy('own-cabin')
    const forecast = workFinanceView(store.game).forecast!
    const next = advanceYear(store.game)
    const control = advanceYear(base)
    expect(next.economy.balance).toBe(forecast.after)
    expect(control.economy.balance - next.economy.balance).toBe(400 + 280)
    expect(next.economy.housing).toBe(1)
    expect(next.rng).toBe(control.rng)
  })

  it('отмена перед сменой года убирает платёж и не меняет RNG относительно игры без покупки', () => {
    const base = workerAt(30)
    const store = startAt(structuredClone(base))
    store.buy('dome-pass')
    store.cancelServiceById('dome-pass')
    const next = advanceYear(store.game)
    const control = advanceYear(base)
    expect(next.economy.balance).toBe(control.economy.balance)
    expect(next.economy.years.at(-1)!.bills).toBe(control.economy.years.at(-1)!.bills)
    expect(next.rng).toBe(control.rng)
    expect(next.economy.services['dome-pass']).toBeUndefined()
  })
})
