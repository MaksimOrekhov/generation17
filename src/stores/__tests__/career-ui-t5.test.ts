import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createGame } from '../../domain/engine'
import { ECONOMY_TUNING, projectYear, projectYears } from '../../domain/economy'
import { workFinanceView } from '../../domain/economyView'
import { findInconsistencies } from '../../domain/invariants'
import { repairSave } from '../../domain/save'
import { careerView, needsConfirmation, spendView } from '../../domain/spendView'
import type { GameState, Job } from '../../domain/types'
import { useGameStore } from '../game'

/** Сценарий A из задачи: техник 35 лет, III разряд, два курса, действующее назначение. */
function technician(age = 35, balance = 3000): GameState {
  const g = createGame(9035)
  g.age = age; g.shipYear = 190 + age; g.phase = 0
  g.pending = null; g.moment = null
  g.protagonist.job = 'Техник'
  g.flags.trackChosen = true; g.flags.promotion = 'accepted'
  g.attention = 3; g.focus = 'rest'
  g.ship.air = 100; g.ship.food = 100
  g.skills = { engineering: 52, medicine: 12, ecology: 10, social: 20 }
  g.economy.balance = balance
  g.economy.settledAge = age
  g.economy.work = {
    ...g.economy.work, kind: 'working', load: 1, grade: 3, jobSince: 18, gradeSince: age - 5,
    courses: 2, service: age - 18, lastWage: 1600, until: null, path: null, deferYears: 0, mentor: false, post: 'held', job: 'Техник'
  }
  return g
}

function startAt(g: GameState) {
  const store = useGameStore()
  store.begin()
  store.game = g
  return store
}

const plain = (s: string | null | undefined) => (s ?? '').replace(/ /g, ' ')
const retrainCard = (g: GameState, job: Job | null = null) => spendView(g, { job }).offers.find(o => o.id === 'retrain')!

describe('T5: карточка переобучения', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('без выбора просит специальность и ничего не выбирает сама', () => {
    const o = retrainCard(technician())
    expect(o).toMatchObject({ kind: 'profession', stage: 'needs-choice', available: false, hint: 'Выберите новую специальность', target: null, retrain: null })
    expect(o.jobOptions.map(j => j.job)).toEqual(['Медик', 'Агроном', 'Координатор'])
    expect(plain(o.oneTimeText)).toBe('500 кр разово')
    expect(o.attentionText).toBe('Личное время: 1 ед.')
    expect(o.consequences.join(' ')).toMatch(/60% тарифа/)
    expect(o.consequences.join(' ')).toMatch(/курсы \(2\) обнуляются/)
    expect(o.consequences.join(' ')).toMatch(/назначение завершится/i)
    expect(o.consequences.join(' ')).toMatch(/10 лет/)
  })

  it('варианты специальностей показывают навык +9 и тариф на ступень ниже', () => {
    const medic = retrainCard(technician()).jobOptions.find(j => j.job === 'Медик')!
    expect(medic).toMatchObject({ skillName: 'Медицина', skillNow: 12, skillAfter: 21 })
    expect(plain(medic.tariffText)).toBe('II разряд · 1 300 кр в год')
  })

  it('подтверждение всегда, даже если 500 кр — малая доля накоплений; ключ привязан к специальности и цене', () => {
    const rich = technician(35, 100_000)
    expect(needsConfirmation(rich, 'retrain', { job: 'Медик' })).toBe(true)
    const medic = retrainCard(rich, 'Медик')
    const agro = retrainCard(rich, 'Агроном')
    expect(medic.stage).toBe('ready')
    expect(plain(medic.confirmLabel)).toBe('Подтвердить переобучение: Техник → Медик · −500 кр')
    expect(medic.confirmKey).toBe('retrain|Медик|500')
    expect(agro.confirmKey).toBe('retrain|Агроном|500')
    expect(plain(medic.buttonLabel)).toBe('Начать переобучение · 500 кр')
  })

  it('сравнение до и после строится на настоящих расчётах движка', () => {
    const g = technician()
    const f = retrainCard(g, 'Медик').retrain!
    const now = projectYear(g).economy.years.at(-1)!
    const rows = Object.fromEntries(f.rows.map(r => [r.label, r]))
    expect(rows['Специальность']).toMatchObject({ now: 'Техник', after: 'Медик' })
    expect(rows['Тарифный разряд']).toMatchObject({ now: 'III разряд · мастер', after: 'II разряд · специалист' })
    expect(plain(rows['Оплата ближайшего года']!.now)).toBe(`${now.wage.toLocaleString('ru-RU').replace(/\s/g, ' ')} кр · работа`)
    expect(plain(rows['Оплата ближайшего года']!.after)).toBe('780 кр · стажировка')
    expect(plain(rows['Базовый тариф после стажировки']!.now)).toBe('1 600 кр')
    expect(plain(rows['Базовый тариф после стажировки']!.after)).toBe('1 300 кр')
    expect(rows['Пройденные курсы']).toMatchObject({ now: '2', after: '0' })
    expect(rows['Назначение']).toMatchObject({ now: 'действует (+10%)', after: 'завершено' })
    expect(rows['Навык: медицина']).toMatchObject({ now: '12', after: '21' })
    expect(plain(f.costText)).toBe('Сразу: −500 кр и 1 ед. личного времени.')
    expect(f.timeline[0]).toBe('Стажировка — ближайший годовой расчёт, в 36 лет: оплата 60% тарифа.')
    expect(f.timeline[1]).toBe('С 37 лет — обычная работа: медик, II разряд.')
    expect(plain(f.payGapText)).toBe(`Год стажировки принесёт на ${(now.wage - 780).toLocaleString('ru-RU').replace(/\s/g, ' ')} кр меньше нынешнего прогноза.`)
    expect(f.pathText).toBe('Путь к III разряду: навык 21 / 45, курсы 0 / 1, стаж на специальности 0 / 10 лет.')
    expect(f.caption).toMatch(/не учтены/)
    expect(f.hypothetical).toBe(false)
  })

  it('при нехватке денег прогноз виден, причина понятна, кнопка закрыта', () => {
    const poor = technician(35, 200)
    // Без выбора специальности выбор всё равно открыт: к переобучению копят.
    expect(retrainCard(poor)).toMatchObject({ stage: 'needs-choice', available: false, reason: 'Недостаточно средств: не хватает 300 кр.' })
    expect(retrainCard(poor).jobOptions).toHaveLength(3)
    const o = retrainCard(poor, 'Медик')
    expect(o).toMatchObject({ stage: 'invalid', available: false, reason: 'Недостаточно средств: не хватает 300 кр.' })
    expect(o.retrain?.hypothetical).toBe(true)
    const tired = technician(); tired.attention = 0
    expect(retrainCard(tired, 'Медик').reason).toBe('Не хватает личного времени: в этом году оно закончилось.')
  })

  it('при неснятой паузе выбор не показывается, причина называет год', () => {
    const g = technician(40); g.economy.lastBought.retrain = 35
    const o = retrainCard(g, 'Медик')
    expect(o.stage).toBe('unavailable')
    expect(o.jobOptions).toEqual([])
    expect(o.reason).toBe('Следующее переобучение возможно в 45 лет (через 5 лет).')
  })
})

describe('T5: вкладка «Работа» — профессиональный рост', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('показывает конкретные требования к следующему разряду', () => {
    const v = careerView(technician())
    expect(v.profession).toBe('Техник')
    expect(v.gradeTitle).toBe('III разряд · мастер')
    expect(v.next?.title).toBe('До IV разряда')
    expect(v.next?.items).toEqual([
      { label: 'Навык', value: '52 / 60', met: false },
      { label: 'Курсы', value: '2 / 2', met: true },
      { label: 'Стаж в III разряде', value: '5 / 8 лет', met: false }
    ])
    expect(v.status).toBeNull()
    expect(v.post).toMatchObject({ state: 'held' })
    expect(v.post.text).toMatch(/надбавка 10%/)
  })

  it('все условия выполнены — разряд обновится при следующем расчёте; IV — максимум', () => {
    const g = technician(); g.skills.engineering = 60; g.economy.work.gradeSince = 27
    expect(careerView(g).status).toEqual({ tone: 'ready', text: 'Условия выполнены. Разряд будет обновлён при следующем годовом расчёте.' })
    expect(careerView(g).next?.items.every(i => i.met)).toBe(true)
    g.economy.work.grade = 4
    expect(careerView(g)).toMatchObject({ next: null, status: { tone: 'max', text: 'IV разряд — высшая тарифная квалификация.' } })
  })

  it('стаж будет набран к расчёту — тоже предупреждает честно', () => {
    const g = technician(); g.skills.engineering = 60; g.economy.work.gradeSince = 28
    const v = careerView(g)
    expect(v.next?.items.at(-1)).toMatchObject({ value: '7 / 8 лет', met: false })
    expect(v.status?.text).toMatch(/К следующему годовому расчёту/)
  })

  it('после оформления: новая специальность, сниженный разряд, стажировка и прежнее назначение', () => {
    const store = startAt(technician())
    expect(store.buy('retrain', { job: 'Медик' })).toBe(true)
    const v = careerView(store.game)
    expect(v.profession).toBe('Медик')
    expect(v.gradeTitle).toBe('II разряд · специалист')
    expect(v.facts.find(f => f.label === 'Пройдено курсов')!.value).toBe('0')
    expect(v.next?.items[0]).toEqual({ label: 'Навык', value: '21 / 45', met: false })
    expect(v.transition?.title).toBe('Переобучение оформлено: Техник → Медик')
    expect(plain(v.transition?.lines.join(' '))).toMatch(/в 36 лет: оплата ≈ 780 кр/)
    expect(plain(v.transition?.lines.join(' '))).toMatch(/С 37 лет — работа по новой специальности, II разряд, тариф 1 300 кр/)
    expect(v.post.text).toMatch(/завершится/)
    expect(v.retrainAvailable).toBe(false)
    expect(v.retrainText).toBe('Следующее переобучение — не раньше 45 лет.')
    expect(workFinanceView(store.game).lines).toContain('Допуск к работе через 2 года')
    expect(findInconsistencies(store.game)).toEqual([])
  })

  it('во время стажировки и после неё прежнее назначение не показано действующим', () => {
    const store = startAt(technician())
    store.buy('retrain', { job: 'Агроном' })
    const g = structuredClone(store.game); g.pending = null
    store.game = g
    store.step()
    expect(store.game.age).toBe(36)
    const v = careerView(store.game)
    expect(store.game.economy.work.kind).toBe('trainee')
    expect(v.transition?.title).toBe('Стажировка: Агроном')
    expect(v.post).toEqual({ state: 'ended', text: 'Прежнее назначение завершено.' })
    expect(v.status?.text).toMatch(/Идёт стажировка/)
  })

  it('кнопка вкладки «Работа» существует только когда переобучение действительно доступно', () => {
    expect(careerView(technician()).retrainAvailable).toBe(true)
    const young = technician(21); young.economy.work.gradeSince = 18
    expect(careerView(young)).toMatchObject({ retrainAvailable: false })
    expect(careerView(young).retrainText).toMatch(/с 22 лет/)
  })
})

describe('T5: хранилище — покупка и цель', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('покупка переобучения через store: деньги, внимание, профессия; повтор не проходит', () => {
    const store = startAt(technician())
    const before = store.game
    expect(store.buy('retrain', { job: 'Медик' })).toBe(true)
    expect(store.game.economy.balance).toBe(2500)
    expect(store.game.attention).toBe(2)
    expect(store.game.rng).toBe(before.rng)
    expect(store.buy('retrain', { job: 'Агроном' })).toBe(false)
    expect(store.buy('retrain')).toBe(false)
  })

  it('отказ в store: нет транзакции и нет расхода RNG', () => {
    const store = startAt(technician(35, 100))
    const before = store.game
    expect(store.buy('retrain', { job: 'Медик' })).toBe(false)
    expect(store.game).toBe(before)
  })

  it('цель: выбор, смена, снятие, сохранение в localStorage-формате и загрузка', () => {
    const store = startAt(technician(35, 250))
    expect(store.chooseGoal('own-cabin')).toBe(true)
    expect(spendView(store.game).offers.find(o => o.id === 'own-cabin')!.isGoal).toBe(true)
    expect(store.chooseGoal('retrain')).toBe(true)
    expect(spendView(store.game).goal).toMatchObject({ id: 'retrain', percent: 50 })
    expect(store.chooseGoal('retrain')).toBe(false)
    const loaded = repairSave(JSON.parse(JSON.stringify(store.game)) as GameState).game
    expect(loaded.economy.goal).toBe('retrain')
    expect(store.chooseGoal(null)).toBe(true)
    expect(spendView(store.game).goal).toBeNull()
  })

  it('сценарий E: дорогая цель → смена → покупка снимает цель → сохранение и загрузка', () => {
    const store = startAt(technician(35, 600))
    store.chooseGoal('retrain')
    store.chooseGoal('own-cabin')
    expect(spendView(store.game).goal).toMatchObject({ percent: 100, enough: true })
    expect(store.buy('own-cabin')).toBe(true)
    expect(store.game.economy.goal).toBeNull()
    const loaded = repairSave(JSON.parse(JSON.stringify(store.game)) as GameState).game
    expect(loaded.economy).toEqual(store.game.economy)
  })

  it('прогноз стажировки совпадает с projectYears после покупки', () => {
    const store = startAt(technician())
    const forecast = retrainCard(store.game, 'Координатор').retrain!
    store.buy('retrain', { job: 'Координатор' })
    const [internship, back] = projectYears(store.game, 2)
    expect(plain(forecast.rows.find(r => r.label === 'Оплата ближайшего года')!.after)).toBe(`${internship!.row.wage} кр · стажировка`)
    expect(internship!.row.wage).toBe(Math.round(ECONOMY_TUNING.wages['Координатор'][1]! * .6))
    expect(back!.work).toMatchObject({ kind: 'working', job: 'Координатор', grade: 2 })
  })
})
