import { describe, expect, it } from 'vitest'
import { advanceYear, canChoose, canSetLoad, createGame, decide, purchase, setGoal, tick } from '../engine'
import { ECONOMY_TUNING, GRADE_RULES, RETRAIN_SKILL_BONUS, earnedGrade, gradeProgress, pensionOf, projectYear, projectYears, settleYear, wageOf } from '../economy'
import type { Grade } from '../economy'
import { findInconsistencies } from '../invariants'
import { RETRAIN_GAP, canBuy, retrainOptions } from '../offers'
import { repairSave } from '../save'
import { careerView, goalView, retirementView, spendView } from '../spendView'
import { workFinanceView } from '../economyView'
import { storylets } from '../storylets'
import { STORY_PURCHASE_OFFERS } from '../../content/validate'
import type { GameState, Job } from '../types'

const SKILL = { Техник: 'engineering', Медик: 'medicine', Агроном: 'ecology', Координатор: 'social' } as const
type Prof = keyof typeof SKILL

/** Синтетический, но согласованный работающий специалист: III разряд, два курса, действующее назначение. */
function worker(age = 35, job: Prof = 'Техник', balance = 3000): GameState {
  const g = createGame(5150)
  g.age = age; g.shipYear = 190 + age; g.phase = 0
  g.pending = null; g.moment = null
  g.protagonist.job = job
  g.flags.trackChosen = true
  g.flags.promotion = 'accepted'
  g.attention = 3; g.focus = 'rest'
  g.ship.air = 100; g.ship.food = 100
  g.skills = { engineering: 12, medicine: 12, ecology: 10, social: 20 }
  g.skills[SKILL[job]] = 52
  g.economy.balance = balance
  g.economy.settledAge = age
  g.economy.work = {
    ...g.economy.work, kind: 'working', load: 1, grade: 3, jobSince: 18, gradeSince: age - 5,
    courses: 2, service: age - 18, lastWage: ECONOMY_TUNING.wages[job][2]!, until: null,
    path: null, deferYears: 0, mentor: false, post: 'held', job
  }
  return g
}

const settleAt = (g: GameState, age: number) => { g.age = age; g.shipYear = 190 + age; return settleYear(g) }
const clean = (g: GameState) => expect(findInconsistencies(g)).toEqual([])
const roundTrip = (g: GameState) => repairSave(JSON.parse(JSON.stringify(g)) as GameState).game
const retrain = (g: GameState, job: Job) => purchase(g, 'retrain', { job })

describe('T5: покупка переобучения — цена и доступность', () => {
  it('стоит 500 кр и одно внимание, списывает ровно их и не тратит RNG', () => {
    const g = worker()
    const a = canBuy(g, 'retrain', { job: 'Медик' })
    expect(a).toMatchObject({ available: true, oneTimeCost: 500, attention: 1, annualCost: 0, reason: null, jobOptions: ['Медик', 'Агроном', 'Координатор'] })
    const next = retrain(g, 'Медик')
    expect(next).not.toBe(g)
    expect(next.economy.balance).toBe(2500)
    expect(next.attention).toBe(2)
    expect(next.rng).toBe(g.rng)
    expect(next.economy.totals.spent).toBe(g.economy.totals.spent + 500)
    clean(next)
  })

  it.each(['Медик', 'Агроном', 'Координатор'] as const)('выбор «%s»: профессия меняется сразу, профильный навык +9 ровно один раз', job => {
    const g = worker()
    const before = g.skills[SKILL[job]]
    const next = retrain(g, job)
    expect(next.protagonist.job).toBe(job)
    expect(next.skills[SKILL[job]]).toBe(before + RETRAIN_SKILL_BONUS)
    // Прежний навык не трогается.
    expect(next.skills.engineering).toBe(52)
    settleAt(next, 36)
    settleAt(next, 37)
    expect(next.skills[SKILL[job]]).toBe(before + RETRAIN_SKILL_BONUS)
    expect(next.economy.work.job).toBe(job)
  })

  it('выбор специальности только из трёх других: без цикла и случайности', () => {
    for (const job of ['Техник', 'Медик', 'Агроном', 'Координатор'] as const) {
      expect(retrainOptions(worker(35, job))).toEqual((['Техник', 'Медик', 'Агроном', 'Координатор'] as Job[]).filter(j => j !== job))
    }
  })

  it('отказывает в нынешней, несуществующей и невыбранной специальности, ничего не меняя', () => {
    const g = worker()
    const cases: [unknown, RegExp][] = [
      [undefined, /Выберите новую специальность/],
      ['Техник', /нынешняя специальность/],
      ['Ученик', /неизвестная специальность/],
      ['Без специальности', /неизвестная специальность/],
      ['Пилот', /неизвестная специальность/]
    ]
    for (const [job, reason] of cases) {
      const target = job === undefined ? undefined : { job: job as Job }
      expect(canBuy(g, 'retrain', target).reason).toMatch(reason)
      expect(purchase(g, 'retrain', target)).toBe(g)
    }
  })

  it.each([[21, false], [22, true], [55, true], [56, false]] as const)('возраст %i: доступно — %s', (age, ok) => {
    const g = worker(age)
    g.economy.work.gradeSince = Math.min(g.economy.work.gradeSince, age)
    const a = canBuy(g, 'retrain', { job: 'Медик' })
    expect(a.available).toBe(ok)
    if (!ok) expect(a.reason).toMatch(age < 22 ? /с 22 лет/ : /до 55 лет/)
  })

  it('ровно 500 кр на счету достаточно, 499 — нет, без внимания — нет', () => {
    const exact = retrain(worker(35, 'Техник', 500), 'Медик')
    expect(exact.economy.balance).toBe(0)
    clean(exact)
    const poor = worker(35, 'Техник', 499)
    expect(canBuy(poor, 'retrain', { job: 'Медик' }).reason).toBe('Не хватает 1 кр.')
    expect(retrain(poor, 'Медик')).toBe(poor)
    const tired = worker(); tired.attention = 0
    expect(canBuy(tired, 'retrain', { job: 'Медик' }).reason).toMatch(/личного времени/)
    expect(retrain(tired, 'Медик')).toBe(tired)
  })

  it('отказ не меняет состояние, журнал, хронику и RNG', () => {
    const g = worker(35, 'Техник', 100)
    const copy = structuredClone(g)
    expect(retrain(g, 'Медик')).toBe(g)
    expect(g).toEqual(copy)
  })

  it('только обычная работа: стажировка, пособие, больничный, пенсия, смерть и ожидающее решение запрещают', () => {
    const between = worker(); between.economy.work.kind = 'between'; between.economy.work.until = 36
    const sick = worker(); sick.economy.work.kind = 'sick'; sick.economy.work.until = 36
    const trainee = worker(); trainee.economy.work.kind = 'trainee'; trainee.economy.work.until = 36
    const retired = worker(55); retired.flags.retirementPath = 'left'
    const pending = worker(); pending.pending = 'mentor'
    const dead = worker(); dead.stopped = true; dead.economy.estate = dead.economy.balance
    const reason = (g: GameState) => canBuy(g, 'retrain', { job: 'Медик' }).reason
    expect(reason(between)).toMatch(/обычной работе/)
    expect(reason(sick)).toMatch(/обычной работе/)
    expect(reason(trainee)).toMatch(/Идёт стажировка/)
    expect(reason(retired)).toMatch(/пенсию уже принято/)
    expect(reason(pending)).toMatch(/ожидающее сюжетное решение/)
    expect(reason(dead)).toBe('Персонаж умер.')
    const general = worker(); general.protagonist.job = 'Без специальности'; general.economy.work.job = 'Без специальности'
    expect(reason(general)).toMatch(/основной специальности/)
  })

  it('уже оформленное переобучение нельзя купить второй раз, даже на другую специальность', () => {
    const once = retrain(worker(), 'Медик')
    once.attention = 3; once.economy.balance = 5000
    const a = canBuy(once, 'retrain', { job: 'Агроном' })
    expect(a.reason).toMatch(/уже оформлено/)
    expect(retrain(once, 'Агроном')).toBe(once)
  })

  it(`пауза ${RETRAIN_GAP} лет между переобучениями`, () => {
    const g = worker(40)
    g.economy.lastBought.retrain = 31
    expect(canBuy(g, 'retrain', { job: 'Медик' }).reason).toBe('Следующее переобучение возможно в 41 год (через 1 год).')
    g.economy.lastBought.retrain = 30
    expect(canBuy(g, 'retrain', { job: 'Медик' }).available).toBe(true)
  })
})

describe('T5: карьерные последствия и стажировка', () => {
  it('разряд −1, курсы 0, назначение завершено, стажировка ровно один год на 60% тарифа новой специальности', () => {
    const g = retrain(worker(), 'Медик')
    // До расчёта экономика ещё прежняя: переход применит ближайший годовой расчёт.
    expect(g.economy.work).toMatchObject({ job: 'Техник', grade: 3, courses: 2, post: 'held', kind: 'working' })
    expect(g.economy.lastBought.retrain).toBe(35)
    settleAt(g, 36)
    expect(g.economy.work).toMatchObject({ job: 'Медик', grade: 2, courses: 0, post: 'ended', kind: 'trainee', until: 37, jobSince: 36, gradeSince: 36 })
    expect(g.economy.years.at(-1)).toMatchObject({ age: 36, wage: Math.round(ECONOMY_TUNING.wages['Медик'][1]! * .6) })
    clean(g)
    const service = g.economy.work.service
    settleAt(g, 37)
    expect(g.economy.work).toMatchObject({ kind: 'working', grade: 2, post: 'ended', courses: 0 })
    // Назначение прежней специальности не возобновляется, хотя флаг promotion остаётся в прошлом.
    expect(g.economy.years.at(-1)!.wage).toBe(ECONOMY_TUNING.wages['Медик'][1])
    expect(g.economy.work.service).toBe(service + 1)
    clean(g)
  })

  it.each([1, 2, 3, 4] as const)('с разряда %i — ровно на ступень ниже, не ниже I', grade => {
    const g = worker(); g.economy.work.grade = grade; g.economy.work.gradeSince = 30
    const next = retrain(g, 'Агроном')
    settleAt(next, 36)
    expect(next.economy.work.grade).toBe(Math.max(1, grade - 1))
  })

  it('повторный расчёт того же года и загрузка сохранения не применяют переход второй раз', () => {
    const g = retrain(worker(), 'Координатор')
    settleAt(g, 36)
    const once = structuredClone(g.economy)
    expect(settleYear(g)).toEqual({ stats: {}, logs: [] })
    expect(g.economy).toEqual(once)
    const loaded = roundTrip(g)
    expect(loaded.economy).toEqual(once)
    settleAt(loaded, 37); settleAt(g, 37)
    expect(loaded.economy).toEqual(g.economy)
    expect(loaded.economy.work.grade).toBe(2)
  })

  it('сохранение и загрузка в каждой фазе дают ту же дальнейшую экономику', () => {
    const live = retrain(worker(), 'Медик')
    const saved = [roundTrip(live)]
    settleAt(live, 36); saved.push(roundTrip(live))
    settleAt(live, 37)
    for (const s of saved) {
      if (s.age < 36) settleAt(s, 36)
      settleAt(s, 37)
      expect(s.economy).toEqual(live.economy)
      expect(s.protagonist.job).toBe('Медик')
      expect(s.skills.medicine).toBe(live.skills.medicine)
    }
  })

  it('стаж для роста считается по новой специальности: прежние годы техником не дают II разряда сразу', () => {
    const g = worker(35); g.economy.work.grade = 1; g.economy.work.gradeSince = 18
    g.skills.medicine = 40
    const next = retrain(g, 'Медик')
    expect(earnedGrade(next)).toBe(1) // переход не рассчитан — разряд не растёт по старому стажу
    const p = gradeProgress(next)
    expect(p).toMatchObject({ job: 'Медик', grade: 1, next: 2 })
    expect(p.requirements.find(r => r.key === 'years')).toMatchObject({ current: 0, required: 3, met: false })
    for (let age = 36; age <= 40; age++) settleAt(next, age)
    // Стажировка 36, работа с 37; I→II требует 3 года на специальности с 36 → в 39.
    const grades = next.economy.years.filter(r => r.age >= 36).map(r => r.age)
    expect(grades).toEqual([36, 37, 38, 39, 40])
    expect(next.economy.work.grade).toBe(2)
    expect(next.economy.work.gradeSince).toBe(39)
  })

  it('0,6 ставки: стажировка оплачивается как 60% тарифа, после неё режим 0,6 сохраняется', () => {
    const g = worker(45); g.economy.work.load = .6
    const next = retrain(g, 'Агроном')
    expect(canSetLoad(next, 1).reason).toMatch(/переобучение/)
    settleAt(next, 46)
    expect(next.economy.years.at(-1)!.wage).toBe(Math.round(ECONOMY_TUNING.wages['Агроном'][1]! * .6))
    expect(canSetLoad(next, 1).available).toBe(false)
    const service = next.economy.work.service
    settleAt(next, 47)
    expect(next.economy.work).toMatchObject({ kind: 'working', load: .6 })
    expect(next.economy.years.at(-1)!.wage).toBe(Math.round(ECONOMY_TUNING.wages['Агроном'][1]! * .6))
    expect(next.economy.work.service).toBeCloseTo(service + .6)
    expect(canSetLoad(next, 1).available).toBe(true)
  })

  it('повтор через десять лет: второй переход применяется один раз, старые эффекты не повторяются', () => {
    let g = worker(30)
    g = retrain(g, 'Медик')
    expect(g.skills.medicine).toBe(12 + 9)
    for (let age = 31; age <= 35; age++) settleAt(g, age)
    g.attention = 3; g.economy.balance = 3000
    expect(canBuy(g, 'retrain', { job: 'Агроном' }).reason).toMatch(/в 40 лет \(через 5 лет\)/)
    for (let age = 36; age <= 40; age++) settleAt(g, age)
    g.attention = 3
    const grade = g.economy.work.grade
    const medicine = g.skills.medicine
    g = retrain(g, 'Агроном')
    expect(g.skills.ecology).toBe(10 + 9)
    expect(g.skills.medicine).toBe(medicine)
    settleAt(g, 41)
    expect(g.economy.work).toMatchObject({ job: 'Агроном', kind: 'trainee', grade: Math.max(1, grade - 1) as Grade, courses: 0 })
    settleAt(g, 42)
    expect(g.economy.work.kind).toBe('working')
    expect(g.economy.ledger.filter(t => t.ref === 'retrain').map(t => [t.age, t.amount])).toEqual([[30, 500], [40, 500]])
    const saved = roundTrip(g)
    expect(saved.economy).toEqual(g.economy)
    clean(saved)
  })

  it('финансовый журнал, хроника и память: одна операция, одна запись', () => {
    const g = worker()
    const next = retrain(g, 'Медик')
    const txns = next.economy.ledger.filter(t => t.n >= g.economy.nextTxn)
    expect(txns).toEqual([{ n: g.economy.nextTxn, age: 35, kind: 'purchase', ref: 'retrain', label: 'Переобучение', amount: 500 }])
    const logs = next.history.filter(h => h.id >= g.nextLogId)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ kind: 'life', title: 'Переобучение' })
    expect(logs[0]!.text).toMatch(/мастерской/)
    expect(logs[0]!.text).toMatch(/клиническом блоке/)
    expect(logs[0]!.text).not.toMatch(/\{\{/)
    expect(next.memories.at(-1)).toMatch(/^В 35 лет сменил(а)? профессию: из техников — в медики\.$/)
  })

  it('открытый профессиональный момент прежней специальности истекает без последствий (найдено аудитом T5)', () => {
    const g = worker()
    g.moment = 'm-job-tech'; g.momentLog['m-job-tech'] = 35
    clean(g)
    const next = retrain(g, 'Медик')
    expect(next.moment).toBeNull()
    expect(next.stats).toEqual(g.stats)
    clean(next)
    // Момент, не зависящий от профессии, покупка не трогает.
    const other = worker(); other.moment = 'm-radio-wall'; other.momentLog['m-radio-wall'] = 35
    expect(retrain(other, 'Медик').moment).toBe('m-radio-wall')
  })

  it('прогноз projectYear показывает год стажировки сразу после покупки, не меняя игру', () => {
    const next = retrain(worker(), 'Медик')
    const before = structuredClone(next)
    const p = projectYear(next)
    expect(p.economy.work).toMatchObject({ kind: 'trainee', job: 'Медик', grade: 2 })
    expect(p.economy.years.at(-1)!.wage).toBe(Math.round(1300 * .6))
    const [a, b] = projectYears(next, 2)
    expect(a!.work.kind).toBe('trainee')
    expect(b!.work.kind).toBe('working')
    expect(b!.row.wage).toBe(1300)
    expect(next).toEqual(before)
  })

  it('в реальной игре через tick: стажировка, затем работа, инварианты на каждом расчёте', () => {
    let g = retrain(worker(), 'Медик')
    const rows: { age: number; kind: string }[] = []
    for (let i = 0; i < 4 && !g.stopped; i++) {
      while (g.pending) g = decide(g, [0, 1, 2, 3].find(k => canChoose(g, k).available) ?? 0)
      g = advanceYear(g)
      clean(g)
      rows.push({ age: g.age, kind: g.economy.work.kind })
    }
    expect(rows.slice(0, 2)).toEqual([{ age: 36, kind: 'trainee' }, { age: 37, kind: 'working' }])
    expect(g.economy.years.find(r => r.age === 36)!.wage).toBe(Math.round(1300 * .6))
  })
})

describe('T5: совместимость со старым сюжетным переобучением', () => {
  const mentorChange = (g: GameState) => { g.pending = 'mentor'; g.flags.mentorTalk = false; return decide(g, 0) }

  it('сюжетная смена остаётся бесплатной, не тратит внимание и не запускает паузу покупки', () => {
    const g = worker(30)
    const next = mentorChange(g)
    expect(next.protagonist.job).toBe('Медик')
    expect(next.economy.balance).toBe(g.economy.balance)
    expect(next.attention).toBe(g.attention)
    expect(next.economy.lastBought.retrain).toBeUndefined()
    expect(next.skills.medicine).toBe(12 + RETRAIN_SKILL_BONUS)
    settleAt(next, 31)
    expect(next.economy.work).toMatchObject({ kind: 'trainee', grade: 2, courses: 0, post: 'ended' })
  })

  it('после купленного переобучения и во время перехода разговор наставника о смене профессии не появляется', () => {
    const mentor = storylets.find(s => s.id === 'mentor')!
    const g = worker(30)
    expect(mentor.available(g)).toBe(true)
    const bought = retrain(g, 'Медик')
    expect(mentor.available(bought)).toBe(false)
    const story = mentorChange(worker(30))
    story.flags.mentorTalk = false
    expect(mentor.available(story)).toBe(false) // переход не рассчитан
    settleAt(story, 31)
    expect(mentor.available(story)).toBe(false) // идёт стажировка
  })

  it('переобучение нельзя купить из сюжета: каталог сюжетных покупок прежний', () => {
    expect(STORY_PURCHASE_OFFERS).toEqual(['course-pro', 'family-trip'])
    expect(storylets.some(s => s.choices.some(c => (c.purchase?.offer as string | undefined) === 'retrain'))).toBe(false)
  })

  it('пауза курса сохраняется после смены специальности, а курсы обнуляются один раз', () => {
    let g = worker(33)
    g = purchase(g, 'course-pro')
    expect(g.economy.work.courses).toBe(3)
    g.attention = 3; g.economy.balance += 1000; g.age = 35; g.economy.settledAge = 35
    g = retrain(g, 'Медик')
    expect(canBuy(g, 'course-pro').reason).toMatch(/завершите переобучение/)
    settleAt(g, 36)
    expect(canBuy(g, 'course-pro').reason).toMatch(/нужно работать/)
    settleAt(g, 37)
    g.attention = 3
    expect(canBuy(g, 'course-pro').available).toBe(true) // 37 − 33 = 4 года
    g = purchase(g, 'course-pro')
    expect(g.economy.work.courses).toBe(1)
  })
})

describe('T5: gradeProgress и путь по разрядам', () => {
  it('пороги совпадают с §3.2', () => {
    expect(GRADE_RULES).toEqual([
      { from: 1, skill: 18, courses: 0, years: 3, since: 'job' },
      { from: 2, skill: 45, courses: 1, years: 10, since: 'job' },
      { from: 3, skill: 60, courses: 2, years: 8, since: 'grade' }
    ])
  })

  it('совпадает с earnedGrade() на сетке состояний', () => {
    let checked = 0
    for (const grade of [1, 2, 3, 4] as const) for (const skill of [17, 18, 44, 45, 59, 60, 80]) for (const courses of [0, 1, 2, 3])
      for (const jobSince of [18, 25, 32, 34]) for (const gradeSince of [jobSince, 27, 30]) {
        const g = worker(35); Object.assign(g.economy.work, { grade, courses, jobSince, gradeSince: Math.max(jobSince, gradeSince) })
        g.skills.engineering = skill
        const p = gradeProgress(g)
        expect(earnedGrade(g)).toBe(p.ready ? p.next : grade)
        if (grade === 4) expect(p.next).toBeNull()
        checked++
      }
    expect(checked).toBeGreaterThan(1000)
  })

  it('путь I → II → III → IV по годовым расчётам и только при выполнении условий', () => {
    const g = worker(18); Object.assign(g.economy.work, { grade: 1, jobSince: 18, gradeSince: 18, courses: 0, service: 0, post: 'none' })
    delete g.flags.promotion
    g.skills.engineering = 18
    const ups: [number, number][] = []
    for (let age = 19; age <= 50; age++) {
      if (age === 25) g.skills.engineering = 45
      if (age === 27) g.economy.work.courses = 1
      if (age === 30) { g.skills.engineering = 60; g.economy.work.courses = 2 }
      const before = g.economy.work.grade
      const ready = gradeProgress({ ...g, age }).ready
      settleAt(g, age)
      if (g.economy.work.grade !== before) ups.push([age, g.economy.work.grade])
      expect(g.economy.work.grade > before).toBe(ready)
    }
    expect(ups).toEqual([[21, 2], [28, 3], [36, 4]])
    const top = gradeProgress(g)
    expect(top).toMatchObject({ grade: 4, next: null, requirements: [], ready: false })
  })

  it('разряд и назначение независимы: назначение не входит в условия, отказ от него не закрывает рост', () => {
    const held = worker(); const none = worker(); none.economy.work.post = 'none'; none.flags.promotion = 'declined'
    expect(gradeProgress(held).requirements).toEqual(gradeProgress(none).requirements)
    expect(gradeProgress(held).requirements.map(r => r.key)).toEqual(['skill', 'courses', 'years'])
  })

  it('чистая функция: не меняет игру', () => {
    const g = retrain(worker(), 'Медик'); const copy = structuredClone(g)
    gradeProgress(g); careerView(g); retirementView(g); spendView(g, { job: 'Агроном' })
    expect(g).toEqual(copy)
  })
})

describe('T5: пенсионные пути не меняются, интерфейс только читает', () => {
  const retireeAt = (age: number, path: 'left' | 'mentor' | 'continue') => {
    const g = worker(Math.min(age, 76)); g.age = age; g.economy.settledAge = age
    Object.assign(g.economy.work, { kind: age >= 77 || path !== 'continue' ? 'retired' : 'working', path, mentor: path === 'mentor' && age <= 80, service: 44, deferYears: 3, lastWage: 1600, post: path === 'continue' && age < 77 ? 'held' : 'ended' })
    g.flags.retirementPath = path; g.flags.retirement = true
    return g
  }

  it('наставник: пенсия и выплата за наставничество — отдельные строки, после 80 наставничество завершено', () => {
    const g = retireeAt(78, 'mentor')
    const view = retirementView(g)!
    const row = projectYear(g).economy.years.at(-1)!
    expect(view.title).toBe('Пенсия и наставничество')
    expect(view.rows.find(r => r.label === 'Пенсия')!.value.replace(/\s/g, ' ')).toBe(`${String(row.pension).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} кр в год`)
    expect(row.wage).toBe(Math.round(1600 * .25))
    expect(view.rows.find(r => r.label === 'Наставничество')!.value).toMatch(/400 кр в год · до 80 лет/)
    expect(view.rows.find(r => r.label === 'Надбавка за отсрочку')!.value).toBe('+12%')
    const late = retireeAt(81, 'mentor'); late.economy.work.mentor = false
    expect(retirementView(late)!.rows.find(r => r.label === 'Наставничество')!.value).toBe('завершено в 80 лет')
  })

  it('работающий: пенсия по нынешним тарифу и стажу = pensionOf(), без назначения', () => {
    const g = worker(50)
    const view = retirementView(g)!
    expect(view.title).toBe('Пенсионные перспективы')
    expect(view.rows[0]!.value.replace(/\s/g, ' ')).toBe(`${pensionOf(g.economy.work)} кр в год`)
    expect(retirementView(worker(40))).toBeNull()
  })

  it('продолжение работы до 77: путь показан, расчёт годов тот же', () => {
    const g = retireeAt(70, 'continue')
    expect(retirementView(g)!.title).toBe('Работа до предела 77 лет')
    const copy = structuredClone(g)
    settleAt(copy, 71)
    expect(copy.economy.work).toMatchObject({ kind: 'working', deferYears: 4 })
    const at77 = retireeAt(76, 'continue'); settleAt(at77, 77)
    expect(at77.economy.work.kind).toBe('retired')
    expect(at77.economy.years.at(-1)!.pension).toBe(pensionOf(at77.economy.work))
  })
})

describe('T5: цель накопления', () => {
  it('выбор, смена и снятие — бесплатно, без хроники, RNG и показателей', () => {
    const g = worker()
    const a = setGoal(g, 'own-cabin')
    expect(a.economy.goal).toBe('own-cabin')
    expect(a.rng).toBe(g.rng); expect(a.history).toBe(g.history); expect(a.stats).toEqual(g.stats)
    expect(a.economy.balance).toBe(g.economy.balance); expect(a.attention).toBe(g.attention)
    const b = setGoal(a, 'retrain')
    expect(b.economy.goal).toBe('retrain')
    expect(setGoal(b, null).economy.goal).toBeNull()
    expect(setGoal(b, 'retrain')).toBe(b)
    expect(setGoal(b, 'yacht')).toBe(b)
    const dead = structuredClone(b); dead.stopped = true; dead.economy.estate = dead.economy.balance
    expect(setGoal(dead, null)).toBe(dead)
  })

  it('процент — баланс / разовая цена, не больше 100; срок по прогнозу', () => {
    const g = setGoal(worker(35, 'Техник', 250), 'own-cabin')
    const v = spendView(g).goal!
    expect(v).toMatchObject({ id: 'own-cabin', percent: 62, enough: false })
    const delta = projectYear(g).economy.years.at(-1)!.balance - 250
    expect(v.etaText).toMatch(new RegExp(`≈ ${Math.ceil(150 / delta)} `))
    const rich = setGoal(worker(35, 'Техник', 5000), 'own-cabin')
    expect(spendView(rich).goal).toMatchObject({ percent: 100, enough: true, etaText: 'Хватает средств.' })
    expect(workFinanceView(g).goal).toBe('Цель: Своя каюта — 62%')
  })

  it('позиция без разового взноса: без деления на ноль и фиктивных 100%', () => {
    const g = setGoal(worker(35, 'Техник', 0), 'dome-pass')
    const v = spendView(g).goal!
    expect(v).toMatchObject({ percent: null, costText: null })
    expect(v.conditionText).toMatch(/ежегодной оплаты/)
    expect(workFinanceView(g).goal).toBe('Цель: Абонемент в биокупол — без разового взноса')
  })

  it('отрицательный прогноз: срок не оценивается', () => {
    const g = worker(70); g.age = 70; Object.assign(g.economy.work, { kind: 'retired', path: 'left', service: 10, lastWage: 1100 })
    g.flags.retirementPath = 'left'; g.flags.retirement = true
    // Пенсия 360 кр, нужды 350, аренда каюты 280: накопления тают, жильё ещё по силам.
    g.economy.housing = 1; g.economy.balance = 400
    const goal = setGoal(g, 'retrain')
    const row = projectYear(goal).economy.years.at(-1)!
    expect(row.balance).toBeLessThan(400)
    expect(projectYear(goal).economy.housing).toBe(1)
    const v = goalView(goal, spendView(goal).offers)!
    expect(v).toMatchObject({ percent: 80, enough: false, etaText: 'По нынешнему прогнозу накопления не растут: срок не оценить.' })
    expect(v.conditionText).toMatch(/до 55 лет/)
  })

  it('не покупает сама и переживает годовой расчёт; покупка позиции снимает цель молча', () => {
    let g = setGoal(worker(35, 'Техник', 5000), 'own-cabin')
    g = tick(g)
    expect(g.economy.goal).toBe('own-cabin')
    expect(g.economy.housing).toBe(0)
    expect(g.economy.ledger.some(t => t.kind === 'purchase')).toBe(false)
    g.pending = null
    const bought = purchase(g, 'own-cabin')
    expect(bought.economy.goal).toBeNull()
    expect(bought.history.filter(h => h.id >= g.nextLogId).map(h => h.title)).toEqual(['Личные средства'])
  })

  it('сохраняется; неизвестный id в сохранении снимается', () => {
    const g = setGoal(worker(), 'retrain')
    expect(roundTrip(g).economy.goal).toBe('retrain')
    const broken = structuredClone(g); broken.economy.goal = 'old-yacht'
    const r = repairSave(JSON.parse(JSON.stringify(broken)) as GameState)
    expect(r.game.economy.goal).toBeNull()
    expect(r.notes.some(n => n.includes('old-yacht'))).toBe(true)
    expect(findInconsistencies(broken)).toContain('возраст 35: неизвестная цель накопления «old-yacht»')
  })
})

describe('T5: живая жизнь с двумя переобучениями', () => {
  it('сохранение и загрузка после двух переобучений, инварианты на каждом расчёте', () => {
    let g = createGame(2024)
    let bought = 0
    let guard = 0
    while (!g.stopped && g.age < 60 && guard++ < 200) {
      while (g.pending) g = decide(g, [0, 1, 2, 3].find(k => canChoose(g, k).available) ?? 0)
      if (g.age === 30 || g.age === 41) {
        const job = retrainOptions(g).find(j => j !== 'Ученик')!
        const next = retrain(g, job)
        if (next !== g) { bought++; g = roundTrip(next) }
      }
      g = advanceYear(g)
      expect(findInconsistencies(g)).toEqual([])
    }
    expect(bought).toBe(2)
    expect(g.economy.ledger.filter(t => t.ref === 'retrain')).toHaveLength(2)
    const reloaded = roundTrip(g)
    expect(reloaded.economy).toEqual(g.economy)
    expect(wageOf(reloaded)).toBe(wageOf(g))
  })
})
