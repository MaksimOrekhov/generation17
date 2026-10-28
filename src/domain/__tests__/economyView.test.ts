import { createPinia, setActivePinia } from 'pinia'
import { computed, createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { beforeEach, describe, expect, it } from 'vitest'
import WorkFinancePanel from '../../components/panels/WorkFinancePanel.vue'
import { useGameStore } from '../../stores/game'
import { ECONOMY_TUNING, pensionOf, projectYear, settleYear } from '../economy'
import { formatCredits, formatSigned, groupDigits, workFinanceView } from '../economyView'
import { advanceYear, createGame, decide } from '../engine'
import { repairSave } from '../save'
import type { Work } from '../economy'
import type { GameState, Job } from '../types'

const NBSP = ' '
const sp = (s: string) => s.replaceAll(NBSP, ' ')

function person(age: number, job: Job = 'Техник', work: Partial<Work> = {}): GameState {
  const g = createGame(1717)
  g.age = age
  g.protagonist.job = job
  g.focus = 'study'
  g.ship.air = 100
  g.ship.food = 100
  g.economy.settledAge = age
  g.economy.work = {
    ...g.economy.work,
    kind: 'working', load: 1, grade: 2, jobSince: 18, gradeSince: 24,
    courses: 0, service: 6, lastWage: ECONOMY_TUNING.wages[job][1]!, until: null,
    path: null, deferYears: 0, mentor: false, post: 'none', job,
    ...work
  }
  return g
}

function retiree(age: number, work: Partial<Work> = {}): GameState {
  const g = person(age, 'Техник', {
    kind: 'retired', grade: 4, lastWage: 1850, service: 40, path: 'left', ...work
  })
  g.economy.balance = 20_000
  return g
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}

describe('форматирование сумм', () => {
  it('разделяет разряды неразрывным пробелом и не использует экспоненту', () => {
    expect(sp(groupDigits(2640))).toBe('2 640')
    expect(groupDigits(999)).toBe('999')
    expect(sp(formatCredits(23_929))).toBe('23 929 кр')
    expect(sp(groupDigits(Number.MAX_SAFE_INTEGER))).toBe('9 007 199 254 740 991')
    expect(groupDigits(Number.MAX_SAFE_INTEGER)).not.toMatch(/e/i)
  })

  it('знак различим без цвета, ноль без знака', () => {
    expect(formatSigned(738)).toBe('+738')
    expect(formatSigned(-118)).toBe('−118')
    expect(formatSigned(0)).toBe('0')
    expect(sp(formatSigned(-12_345))).toBe('−12 345')
  })

  it('не пропускает нечисловые значения', () => {
    expect(groupDigits(Number.NaN)).toBe('0')
    expect(groupDigits(Infinity)).toBe('0')
  })
})

describe('workFinanceView: этапы жизни', () => {
  it('ребёнок до 16 лет: образование и достаток семьи, личных денег нет', () => {
    const g = createGame(1717)
    for (const age of [0, 5, 12, 15]) {
      g.age = age
      const v = workFinanceView(g)
      expect(v.stage).toBe('child')
      expect(v.title).toBe('Образование')
      expect(v.family).toBe(g.birth.wealth)
      expect(v.savings).toBeNull()
      expect(v.income).toBeNull()
      expect(v.obligations).toBeNull()
      expect(v.forecast).toBeNull()
      expect(v.runway).toBeNull()
      expect(v.rows).toEqual([])
      expect(v.actionsSoon).toBe(false)
      expect(v.lines.join(' ')).not.toMatch(/разряд|стаж|кр\b/i)
    }
    g.age = 12
    expect(workFinanceView(g).lines).toEqual(['Школа · 12 лет', 'Семья содержит тебя', 'Распределение по специальностям через 4 года'])
    g.age = 15
    expect(workFinanceView(g).lines.at(-1)).toBe('Распределение по специальностям через год')
    g.age = 4
    expect(workFinanceView(g).lines[0]).toBe('Дошкольный возраст')
  })

  it('стажёр 16–17 лет: стипендия, срок допуска, без обязательств', () => {
    const g = person(16, 'Техник', { kind: 'trainee', grade: 1, until: 18, service: 0, lastWage: 650, jobSince: 18 })
    g.economy.balance = 540
    let v = workFinanceView(g)
    expect(v.stage).toBe('trainee')
    expect(v.title).toBe('Техник · стажёр')
    expect(v.lines).toEqual(['Допуск к разряду через 2 года', 'Стаж 0 лет'])
    expect(v.savings?.amount).toBe(540)
    expect(v.income).toMatchObject({ label: 'Стипендия', total: 360, text: '360 в год' })
    expect(v.obligations).toBeNull()
    expect(v.forecast).toMatchObject({ delta: 360, after: 900, direction: 'up', deltaText: '≈ +360' })
    expect(v.notice).toBeNull()
    g.age = 17
    g.economy.settledAge = 17
    v = workFinanceView(g)
    expect(v.lines[0]).toBe('Допуск к разряду через год')
  })

  it('16-летний без выбранной специальности не получает разряда', () => {
    const g = person(16, 'Ученик', { kind: 'trainee', grade: 1, until: 18, service: 0, job: 'Ученик' })
    const v = workFinanceView(g)
    expect(v.title).toBe('Без специальности · стажёр')
    expect(v.lines.join(' ')).not.toMatch(/разряд/)
    expect(v.lines[0]).toBe('Специальность не выбрана')
  })

  it('экономика в 16 лет ещё в состоянии child, но панель уже показывает стажёра', () => {
    const g = person(16, 'Техник', { kind: 'child', grade: 1, until: null, service: 0 })
    g.economy.settledAge = 15
    expect(workFinanceView(g).stage).toBe('trainee')
  })

  it('работающий взрослый: разряд, стаж, доход, обязательства и прогноз', () => {
    const g = person(30)
    g.economy.balance = 2640
    const v = workFinanceView(g)
    expect(v.stage).toBe('working')
    expect(v.title).toBe('Техник · работает')
    expect(v.lines).toEqual(['II разряд (специалист)', 'Полная ставка · стаж 6 лет'])
    expect(sp(v.savings!.text)).toBe('2 640 кр')
    expect(v.savings!.label).toBe('Накоплено')
    expect(v.income).toMatchObject({ label: 'Доход', total: 1350, text: '1 350 в год'.replace(' ', NBSP) })
    expect(v.obligations?.amount).toBe(ECONOMY_TUNING.personal)
    expect(v.forecast).toMatchObject({ delta: 1350 - 350, after: 2640 + 1000, direction: 'up' })
    expect(sp(v.rows.map(r => `${r.label}: ${r.value}`).join('|'))).toBe('Доход: 1 350 в год|Обязательства: 350 в год|За год: ≈ +1 000 → 3 640 кр')
    expect(v.actionsSoon).toBe(true)
    expect(v.rows.length + v.lines.length + 2).toBeLessThanOrEqual(9)
  })

  it('0,6 ставки: нагрузка и дробный стаж в подписи, доход пересчитан', () => {
    const g = person(45, 'Медик', { load: .6, grade: 3, service: 6.6, lastWage: 1600 })
    const v = workFinanceView(g)
    expect(v.lines).toEqual(['III разряд (мастер)', '0,6 ставки · стаж 6,6 года'])
    expect(v.income?.total).toBe(Math.round(1600 * .6))
  })

  it('переобучение: стажёр взрослого возраста на 60% тарифа', () => {
    const g = person(30, 'Агроном', { kind: 'trainee', grade: 2, until: 31, job: 'Агроном', lastWage: 1350 })
    const v = workFinanceView(g)
    expect(v.stage).toBe('retraining')
    expect(v.title).toBe('Агроном · переобучение')
    expect(v.lines).toEqual(['II разряд (специалист)', 'Допуск к работе через год', 'Стаж 6 лет'])
    // Год стажировки уже оплачен: со следующей отметки года — обычный тариф.
    expect(v.income).toMatchObject({ label: 'Доход', total: 1200 })
    expect(v.obligations?.amount).toBe(ECONOMY_TUNING.personal - 60)
  })

  it('смена профессии ещё не рассчитана: разряд показан уже сниженным', () => {
    const g = person(40, 'Медик', { grade: 3, job: 'Техник', lastWage: 1600 })
    const v = workFinanceView(g)
    expect(v.stage).toBe('retraining')
    expect(v.title).toBe('Медик · переобучение')
    expect(v.lines[0]).toBe('II разряд (специалист)')
    expect(g.economy.work.grade).toBe(3)
    // Стажировка начнётся с ближайшей отметки года: оплата 60% тарифа нового разряда (II → Медик 1300).
    expect(v.income).toMatchObject({ label: 'Оплата стажировки', total: Math.round(1300 * .6) })
  })

  it('в 17 лет подпись дохода уже не «стипендия»: следующий год — обычная оплата', () => {
    const g = person(17, 'Техник', { kind: 'trainee', grade: 1, until: 18, service: 0, lastWage: 650 })
    const v = workFinanceView(g)
    expect(v.income?.label).toBe('Доход')
    expect(v.income?.total).toBe(Math.round(ECONOMY_TUNING.wages['Техник'][0] * 1))
  })

  it('между назначениями и больничный: пособие 50% и 70%, профессия сохраняется', () => {
    const between = workFinanceView(person(40, 'Техник', { kind: 'between', until: 41, lastWage: 1600 }))
    expect(between.stage).toBe('between')
    expect(between.title).toBe('Техник · между назначениями')
    expect(between.lines).toContain('Пособие 50% последнего тарифа')
    expect(between.income).toMatchObject({ label: 'Выплата', total: 800 })

    const sick = workFinanceView(person(40, 'Техник', { kind: 'sick', until: 41 }))
    expect(sick.stage).toBe('sick')
    expect(sick.title).toBe('Техник · на больничном')
    expect(sick.lines).toContain('Выплата 70% тарифа')
    expect(sick.income?.total).toBe(Math.round(1350 * .7))
  })

  it('взрослый без специальности: общие службы без несуществующего разряда', () => {
    const g = person(30, 'Без специальности', { grade: 1, lastWage: 650, job: 'Без специальности' })
    const v = workFinanceView(g)
    expect(v.title).toBe('Без специальности · работает')
    expect(v.lines[0]).toBe('Общие службы · без разряда')
    expect(v.lines.join(' ')).not.toMatch(/[IV]+ разряд/)
    expect(v.income?.total).toBe(650)
  })

  it('«Ученик» старше 18 называется «Без специальности»', () => {
    const g = person(30, 'Ученик', { grade: 1, lastWage: 650, job: 'Ученик' })
    expect(workFinanceView(g).title).toBe('Без специальности · работает')
  })

  it('пенсионер: прежняя профессия и разряд, пенсия вместо дохода', () => {
    const g = retiree(70)
    const v = workFinanceView(g)
    const pension = pensionOf(g.economy.work)
    expect(v.stage).toBe('retired')
    expect(v.title).toBe('Пенсионер')
    expect(v.lines).toEqual(['Прежняя профессия: техник, IV разряд', 'Стаж 40 лет'])
    expect(v.income).toMatchObject({ label: 'Выплаты', total: pension })
    expect(v.income?.parts).toEqual([{ key: 'pension', label: 'пенсия', amount: pension }])
    expect(v.income?.text).toBe(`пенсия ${groupDigits(pension)} в год`)
    expect(v.lines.join(' ')).not.toMatch(/Полная ставка|работает/)
  })

  it('пенсионер-наставник: пенсия и наставническая выплата раздельно', () => {
    const g = retiree(70, { path: 'mentor', mentor: true })
    const v = workFinanceView(g)
    const pension = pensionOf(g.economy.work)
    expect(v.title).toBe('Пенсионер · наставник')
    expect(v.income?.parts).toEqual([
      { key: 'pension', label: 'пенсия', amount: pension },
      { key: 'mentoring', label: 'наставн.', amount: Math.round(1850 * .25) }
    ])
    expect(v.income?.total).toBe(pension + Math.round(1850 * .25))
    expect(sp(v.income!.text)).toBe(`пенсия ${sp(groupDigits(pension))} + наставн. ${Math.round(1850 * .25)}`)
  })

  it('последний год наставничества: выплата уже не прогнозируется и это сказано', () => {
    const v = workFinanceView(retiree(80, { path: 'mentor', mentor: true }))
    expect(v.title).toBe('Пенсионер · наставник')
    expect(v.income?.parts.map(p => p.key)).toEqual(['pension'])
    expect(v.lines).toContain('Наставничество завершается')
  })

  it('пенсионер без профессии: не выдумывает специальность', () => {
    const v = workFinanceView(retiree(70, { job: 'Без специальности', grade: 1, lastWage: 650 }))
    expect(v.lines[0]).toBe('Прежняя профессия: ' + 'техник, I разряд')
  })

  it('завершённая жизнь: итог накоплений, без прогноза и действий', () => {
    const g = retiree(83)
    g.stopped = true
    g.economy.estate = 12_345
    const v = workFinanceView(g)
    expect(v.stage).toBe('ended')
    expect(v.title).toBe('Жизнь завершена · 83 года')
    expect(sp(v.savings!.text)).toBe('12 345 кр')
    expect(v.savings!.label).toBe('Итог накоплений')
    expect(v.income).toBeNull()
    expect(v.forecast).toBeNull()
    expect(v.notice).toBeNull()
    expect(v.rows).toEqual([])
    expect(v.actionsSoon).toBe(false)
    expect(v.lines).toEqual(['Техник, IV разряд', 'Стаж 40 лет'])
  })

  it('жизнь, оборвавшаяся в детстве, не получает личных сумм', () => {
    const g = createGame(1717)
    g.age = 9
    g.stopped = true
    g.economy.estate = 0
    const v = workFinanceView(g)
    expect(v.stage).toBe('ended')
    expect(v.savings).toBeNull()
    expect(v.family).toBe(g.birth.wealth)
  })
})

describe('workFinanceView: прогноз и предупреждения', () => {
  it('прогноз берётся из projectYear и отделён от текущего баланса', () => {
    const g = person(30, 'Техник', { grade: 3 })
    g.economy.balance = 5000
    g.focus = 'work'
    const row = projectYear(g).economy.years.at(-1)!
    const v = workFinanceView(g)
    expect(v.savings?.amount).toBe(5000)
    expect(v.forecast?.after).toBe(row.balance)
    expect(v.forecast?.delta).toBe(row.balance - 5000)
    expect(v.income?.total).toBe(row.wage)
    expect(v.obligations?.amount).toBe(row.bills)
    expect(v.forecast?.after).not.toBe(v.savings?.amount)
  })

  it('прогноз не выдаётся за гарантию и перечисляет допущения', () => {
    const g = person(30)
    g.pending = 'retirement'
    const f = workFinanceView(g).forecast!
    expect(f.caption).toMatch(/Оценка/)
    expect(f.caption).toMatch(/без случайных событий/)
    expect(f.assumptions.join(' ')).toMatch(/Не учитываются будущие сюжетные эффекты/)
    expect(f.assumptions.join(' ')).toMatch(/Ожидающее решение/)
  })

  it('отрицательный прогноз: направление, знак, срок накоплений', () => {
    const g = retiree(70, { lastWage: 650, service: 10, grade: 1 })
    g.economy.housing = 2
    g.economy.balance = 5000
    const v = workFinanceView(g)
    expect(v.forecast?.direction).toBe('down')
    expect(v.forecast?.deltaText).toMatch(/^≈ −\d/)
    expect(v.forecast!.delta).toBeLessThan(0)
    expect(v.runway).toBe(`Накоплений хватит на ≈ ${Math.floor(5000 / -v.forecast!.delta)} лет`)
  })

  it('большие накопления при небольшом дефиците — «с запасом»', () => {
    const g = retiree(70, { lastWage: 650, service: 10, grade: 1 })
    g.economy.housing = 2
    g.economy.balance = 500_000
    expect(workFinanceView(g).runway).toBe('Накоплений хватит с запасом')
  })

  it('у растущего баланса срока накоплений нет', () => {
    expect(workFinanceView(person(30)).runway).toBeNull()
  })

  it('недостаток средств: фонд покроет разницу, предупреждение короткое', () => {
    const g = person(30, 'Техник', { kind: 'between', until: 31, lastWage: 360 })
    g.economy.balance = 0
    const v = workFinanceView(g)
    expect(v.notice?.level).toBe('warn')
    expect(sp(v.notice!.text)).toBe('Средств не хватает: фонд покроет ≈ 170 кр')
    expect(v.notice!.text.length).toBeLessThan(60)
  })

  it('угроза отмены услуги называется по имени', () => {
    const g = retiree(70, { lastWage: 650, service: 0, grade: 1 })
    g.economy.balance = 0
    g.economy.services = { 'dome-pass': 69 }
    expect(workFinanceView(g).notice).toEqual({ level: 'warn', text: 'К концу года будет отменено: абонемент в биокупол' })
  })

  it('понижение жилья', () => {
    const g = person(30, 'Техник', { kind: 'between', until: 31, lastWage: 1000 })
    g.economy.housing = 2
    g.economy.balance = 0
    const v = workFinanceView(g)
    expect(v.notice?.level).toBe('warn')
    expect(v.notice?.text).toMatch(/жильё|Средств/)
  })

  it('«тугой год» в прошлом: спокойная строка без тревоги', () => {
    const g = person(30)
    g.economy.years.push({ age: 30, wage: 1000, pension: 0, bills: 1000, aid: 40, balance: 0 })
    g.economy.balance = 8000
    expect(workFinanceView(g).notice?.level).toBe('calm')
    expect(sp(workFinanceView(g).notice!.text)).toBe('Фонд покрыл 40 кр')
  })

  it('большая сумма не ломает строки и не даёт экспоненты', () => {
    const g = person(30)
    g.economy.balance = 9_007_199_254_000_000 / 1000
    const v = workFinanceView(g)
    expect(v.savings!.text).toMatch(/^\d{1,3}( \d{3})+ кр$/)
    const huge = person(30)
    huge.economy.balance = Number.MAX_SAFE_INTEGER - 5000
    const hv = workFinanceView(huge)
    expect(hv.savings!.text).not.toMatch(/e\+/)
    expect(Number.isFinite(hv.forecast!.after)).toBe(true)
    expect(hv.rows.map(r => r.value).join('')).not.toMatch(/NaN|undefined|Infinity/)
  })
})

describe('workFinanceView: пенсионные переходы', () => {
  function deciding(age: number, over: Partial<Work> = {}): GameState {
    const g = person(age, 'Техник', { grade: 3, service: 35, lastWage: 1600, post: 'held', deferYears: 2, ...over })
    g.economy.balance = 30_000
    g.pending = 'retirement'
    return g
  }

  it('выбор «left»: панель сразу показывает пенсионера, хотя settleYear ещё не выполнялся', () => {
    const g = decide(deciding(64), 0)
    expect(g.economy.work.kind).toBe('working')
    const v = workFinanceView(g)
    const pension = pensionOf({ ...g.economy.work, kind: 'retired' })
    expect(v.stage).toBe('retired')
    expect(v.title).toBe('Пенсионер')
    expect(v.lines[0]).toBe('Прежняя профессия: техник, III разряд')
    expect(v.lines.join(' ')).not.toMatch(/Полная ставка/)
    expect(v.income).toMatchObject({ label: 'Выплаты', total: pension })
    expect(v.income?.parts.map(p => p.key)).toEqual(['pension'])
  })

  it('выбор «mentor»: пенсия и наставничество раздельно ещё до годового расчёта', () => {
    const g = decide(deciding(64), 1)
    expect(g.economy.work.mentor).toBe(false)
    const v = workFinanceView(g)
    expect(v.title).toBe('Пенсионер · наставник')
    expect(v.income?.parts.map(p => p.key)).toEqual(['pension', 'mentoring'])
    expect(v.income?.parts[1]!.amount).toBe(Math.round(1600 * .25))
    expect(v.lines).not.toContain('Наставничество завершается')
  })

  it('выбор «continue»: остаётся работа с обычным доходом', () => {
    const v = workFinanceView(decide(deciding(64), 2))
    expect(v.stage).toBe('working')
    expect(v.title).toBe('Техник · работает')
    expect(v.income?.label).toBe('Доход')
    expect(v.income?.parts.map(p => p.key)).toEqual(['wage'])
  })

  it('до решения (pending) и без возраста 60+ панель остаётся рабочей', () => {
    expect(workFinanceView(deciding(64)).stage).toBe('working')
    const g = person(55)
    g.flags.retirementPath = 'left'
    expect(workFinanceView(g).stage).toBe('working')
  })

  it.each([0, 1] as const)('вариант %i: панель до и после settleYear показывает одно и то же состояние и сумму', choice => {
    const g = decide(deciding(64), choice)
    const before = workFinanceView(g)
    const forecast = before.forecast!
    g.age += 1
    settleYear(g)
    const after = workFinanceView(g)
    expect(after.stage).toBe('retired')
    expect(after.title).toBe(before.title)
    expect(after.savings?.amount).toBe(forecast.after)
    expect(after.lines[0]).toBe(before.lines[0])
    expect(after.income?.parts.map(p => p.key)).toEqual(before.income?.parts.map(p => p.key))
  })

  it('устаревшее сохранение (retirement=true без пути) в 60+ — обычная пенсия, как в settleYear', () => {
    const g = person(66)
    g.flags.retirement = true
    const v = workFinanceView(g)
    expect(v.stage).toBe('retired')
    expect(v.income?.parts.map(p => p.key)).toEqual(['pension'])
    const settled = structuredClone(g)
    settled.age += 1
    settleYear(settled)
    expect(settled.economy.work.kind).toBe('retired')
  })

  it('в 76 лет следующий год — пенсионная выплата, а не зарплата', () => {
    const g = person(76, 'Техник', { grade: 3, service: 40, lastWage: 1600, post: 'none' })
    const v = workFinanceView(g)
    const pension = pensionOf({ ...g.economy.work, kind: 'retired' })
    expect(v.stage).toBe('working')
    expect(v.title).toBe('Техник · работает')
    expect(v.income?.label).toBe('Выплаты')
    expect(v.income?.parts).toEqual([{ key: 'pension', label: 'пенсия', amount: pension }])
    expect(v.income?.text).toBe(`пенсия ${groupDigits(pension)} в год`)
    expect(v.lines).toContain('Со следующего года — пенсия')
  })

  it('в 75 лет без решения: обычный доход, без упоминания пенсии', () => {
    const v = workFinanceView(person(75))
    expect(v.income?.label).toBe('Доход')
    expect(v.lines).not.toContain('Со следующего года — пенсия')
  })

  it('сохранение с принятым решением после сериализации и repairSave показывает то же', () => {
    const g = decide(deciding(64), 1)
    const before = workFinanceView(g)
    const loaded = repairSave(JSON.parse(JSON.stringify(g)) as GameState).game
    const after = workFinanceView(loaded)
    expect(after.stage).toBe('retired')
    expect(after.title).toBe(before.title)
    expect(after.income?.parts).toEqual(before.income?.parts)
  })
})

describe('workFinanceView: чистота', () => {
  const cases: [string, () => GameState][] = [
    ['ребёнок', () => { const g = createGame(5); g.age = 10; return g }],
    ['стажёр', () => person(16, 'Техник', { kind: 'trainee', until: 18, grade: 1 })],
    ['работающий', () => person(40)],
    ['наставник', () => retiree(70, { path: 'mentor', mentor: true })],
    ['переобучение', () => person(40, 'Медик', { job: 'Техник' })],
    ['завершённая', () => { const g = retiree(85); g.stopped = true; g.economy.estate = 1; return g }]
  ]

  it.each(cases)('%s: состояние не меняется, RNG не расходуется', (_name, make) => {
    const g = make()
    const before = structuredClone(g)
    workFinanceView(g)
    expect(g).toEqual(before)
    expect(g.rng).toBe(before.rng)
  })

  it.each(cases)('%s: работает на полностью замороженном состоянии', (_name, make) => {
    const g = deepFreeze(make())
    expect(() => workFinanceView(g)).not.toThrow()
  })

  it('детерминирован и не делит ссылки с игрой', () => {
    const g = person(40)
    const a = workFinanceView(g)
    const b = workFinanceView(g)
    expect(a).toEqual(b)
    a.forecast!.assumptions.push('x')
    expect(workFinanceView(g).forecast!.assumptions).not.toContain('x')
  })

  it('прожитая жизнь: на каждом возрасте согласуется с экономикой игры', () => {
    for (const seed of [11, 202, 3003]) {
      let g = createGame(seed)
      for (let i = 0; i < 140 && !g.stopped; i++) {
        g = g.pending ? decide(g, 0) : advanceYear(g)
        const v = workFinanceView(g)
        const label = `seed ${seed}, age ${g.age}`
        if (g.age < 16 && !g.stopped) {
          expect(v.stage, label).toBe('child')
          expect(v.savings, label).toBeNull()
          continue
        }
        if (g.stopped) {
          expect(v.stage, label).toBe('ended')
          continue
        }
        expect(v.savings?.amount, label).toBe(Math.round(g.economy.balance))
        expect(v.forecast?.after, label).toBe(projectYear(g).economy.years.at(-1)?.balance)
        expect(v.title, label).not.toMatch(/undefined|NaN/)
        expect(v.rows.length + v.lines.length + 1, label).toBeLessThanOrEqual(10)
        if (v.stage === 'retired') expect(v.income?.parts.map(p => p.key), label).toContain('pension')
        // Пенсия в доходе вне пенсионного этапа допустима только как прямо названный переход.
        if (v.stage !== 'retired' && v.income?.parts.some(p => p.key === 'pension')) expect(v.lines, label).toContain('Со следующего года — пенсия')
      }
    }
  })
})

describe('панель «Работа и финансы» и состояние игры', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('модель пересчитывается при замене состояния (событие, загрузка сохранения)', () => {
    const store = useGameStore()
    const view = computed(() => workFinanceView(store.game))
    const child = createGame(7)
    child.age = 8
    store.game = child
    expect(view.value.stage).toBe('child')

    const worker = person(30)
    worker.economy.balance = 1000
    store.game = worker
    expect(view.value.stage).toBe('working')
    expect(view.value.savings?.amount).toBe(1000)

    store.game = { ...worker, economy: { ...worker.economy, balance: 4321 } }
    expect(view.value.savings?.amount).toBe(4321)

    const retired = retiree(70)
    store.game = retired
    expect(view.value.title).toBe('Пенсионер')

    store.game = { ...retired, stopped: true, economy: { ...retired.economy, estate: 777 } }
    expect(view.value.stage).toBe('ended')
    expect(view.value.savings?.amount).toBe(777)
  })

  it('отрисовывает данные из хранилища и обновляется после изменения состояния', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useGameStore()
    const app = createSSRApp({ render: () => h(WorkFinancePanel) })
    app.use(pinia)

    const child = createGame(7)
    child.age = 8
    store.game = child
    let html = await renderToString(app)
    expect(html).toContain('Работа и финансы')
    expect(html).toContain('Образование')
    expect(html).toContain('Семья содержит тебя')
    expect(html).not.toContain('Накоплено')
    expect(html).not.toContain('Траты и карьера')

    const worker = person(30)
    worker.economy.balance = 2640
    store.game = worker
    html = await renderToString(app)
    expect(html).toContain('Техник · работает')
    expect(html).toContain('II разряд (специалист)')
    expect(html).toContain(`2${NBSP}640${NBSP}кр`)
    expect(html).toContain('≈ +1')
    expect(html).toContain('Оценка без случайных событий')
    expect(html).toContain('Траты и карьера — скоро')
    expect(html).not.toContain('Образование')
    expect(html).not.toMatch(/<button[^>]*>\s*(Траты|Карьера)/)

    const mentor = retiree(70, { path: 'mentor', mentor: true })
    store.game = mentor
    html = await renderToString(app)
    expect(html).toContain('Пенсионер · наставник')
    expect(html).toContain('Прежняя профессия: техник, IV разряд')
    expect(html).toContain('наставн.')

    // Решение о пенсии принято в браузере: панель обновляется без годового расчёта.
    const deciding = person(64, 'Техник', { grade: 3, service: 35, lastWage: 1600, post: 'held' })
    deciding.economy.balance = 30_000
    deciding.pending = 'retirement'
    store.game = deciding
    html = await renderToString(app)
    expect(html).toContain('Техник · работает')
    expect(html).not.toContain('Пенсионер')
    store.game = decide(deciding, 0)
    html = await renderToString(app)
    expect(html).toContain('Пенсионер')
    expect(html).toContain('Прежняя профессия: техник, III разряд')
    expect(html).toContain('Выплаты')
    expect(html).not.toContain('Полная ставка')
    // Годовой расчёт и загрузка сохранения.
    const settled = structuredClone(store.game)
    settled.age += 1
    settleYear(settled)
    store.game = settled
    html = await renderToString(app)
    expect(html).toContain('Пенсионер')
    store.game = repairSave(JSON.parse(JSON.stringify(settled)) as GameState).game
    html = await renderToString(app)
    expect(html).toContain('Пенсионер')

    store.game = { ...mentor, stopped: true, economy: { ...mentor.economy, estate: 9_999_999 } }
    html = await renderToString(app)
    expect(html).toContain('Жизнь завершена')
    expect(html).toContain(`9${NBSP}999${NBSP}999${NBSP}кр`)
    expect(html).not.toContain('Траты и карьера')
  })
})
