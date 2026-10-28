import { projectYear } from './economy'
import type { Grade, WorkKind, YearRow } from './economy'
import type { GameState, Job } from './types'

/**
 * Модель панели «Работа и финансы» (docs/ECONOMY_DESIGN.md, §8.1).
 * Чистая функция: читает `GameState.economy`, ничего не хранит и не меняет игру.
 */
export type WorkFinanceStage = 'child' | 'trainee' | 'retraining' | 'working' | 'between' | 'sick' | 'retired' | 'ended'

export interface WorkFinanceRow {
  key: 'income' | 'obligations' | 'forecast'
  label: string
  /** Основное значение строки. */
  value: string
}

export interface WorkFinanceIncomePart {
  key: 'wage' | 'pension' | 'mentoring'
  label: string
  amount: number
}

export interface WorkFinanceForecast {
  /** Ожидаемое изменение баланса за следующий год. */
  delta: number
  /** Ожидаемый баланс через год (текущий баланс хранится отдельно в `savings`). */
  after: number
  direction: 'up' | 'down' | 'flat'
  deltaText: string
  afterText: string
  /** Прогноз — оценка, а не обещание: допущения берутся из `projectYear`. */
  caption: string
  assumptions: string[]
}

export interface WorkFinanceView {
  stage: WorkFinanceStage
  /** Короткая пометка в шапке панели. */
  aside: string
  /** «Техник · работает». */
  title: string
  /** Пояснения под заголовком: разряд, нагрузка, стаж и т. п. */
  lines: string[]
  /** Достаток семьи 1–5: только у ребёнка и в архиве раннего возраста. */
  family: number | null
  /** Текущий баланс (у завершённой жизни — итог). `null`, если личных средств ещё нет. */
  savings: { amount: number; text: string; label: string } | null
  /** Ожидаемые поступления в год: пенсия и наставничество не смешиваются. */
  income: { label: string; parts: WorkFinanceIncomePart[]; total: number; text: string } | null
  obligations: { amount: number; text: string } | null
  forecast: WorkFinanceForecast | null
  /** Сколько лет хватит накоплений, если прогноз отрицательный. */
  runway: string | null
  notice: { level: 'warn' | 'calm'; text: string } | null
  /** Строки для вывода в панели в порядке показа. */
  rows: WorkFinanceRow[]
  /** С 16 лет, пока жизнь идёт: в панели показывается кнопка «Траты и карьера». */
  spendOffered: boolean
}

const PROFESSIONS: readonly Job[] = ['Техник', 'Медик', 'Агроном', 'Координатор']
const GRADE_ROMAN = ['I', 'II', 'III', 'IV'] as const
const GRADE_NAME = ['допущенный', 'специалист', 'мастер', 'эксперт'] as const
const SERVICE_NAMES: Record<string, string> = { 'dome-pass': 'абонемент в биокупол' }
const NBSP = ' '
const RUNWAY_PLENTY_YEARS = 40

export const hasProfession = (job: Job) => PROFESSIONS.includes(job)

function whole(n: number) {
  return Number.isFinite(n) ? Math.round(n) : 0
}

/** «2 640» — разряды разделены неразрывным пробелом, чтобы сумма не рвалась на строки. */
export function groupDigits(n: number) {
  const v = whole(n)
  const digits = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  return v < 0 ? `−${digits}` : digits
}

export function formatCredits(n: number) {
  return `${groupDigits(n)}${NBSP}кр`
}

export function formatSigned(n: number) {
  const v = whole(n)
  return v > 0 ? `+${groupDigits(v)}` : v < 0 ? groupDigits(v) : '0'
}

function yearsWord(n: number) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return `${n} год`
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} года`
  return `${n} лет`
}

/** Стаж считается в ставко-годах, поэтому может быть дробным: «6,6 года». */
function serviceText(service: number) {
  const v = Math.round(Math.max(0, service) * 10) / 10
  return Number.isInteger(v) ? yearsWord(v) : `${String(v).replace('.', ',')} года`
}

function inYears(n: number) {
  return n <= 1 ? 'через год' : `через ${yearsWord(n)}`
}

function professionLabel(job: Job) {
  return job === 'Ученик' ? 'Без специальности' : job
}

function gradeLine(grade: Grade) {
  return `${GRADE_ROMAN[grade - 1]} разряд (${GRADE_NAME[grade - 1]})`
}

/**
 * Решение о пенсии принято (`flags`), но годовой расчёт ещё не перевёл экономику в `retired`.
 * Условия повторяют начало `settleYear`, чтобы панель не ждала отметки года.
 */
function retirementPending(g: GameState) {
  const w = g.economy.work
  if (w.kind !== 'working' || g.age < 60) return false
  const path = g.flags.retirementPath
  if (path === 'left' || path === 'mentor') return true
  return g.flags.retirement === true && path === undefined && w.path === null
}

function stageOf(g: GameState): WorkFinanceStage {
  const e = g.economy
  const kind: WorkKind = e.work.kind
  if (g.stopped || e.estate !== null) return 'ended'
  if (g.age < 16) return 'child'
  // Смена профессии записана героем, но экономика учтёт её на ближайшей отметке года.
  const retrainPending = hasProfession(e.work.job) && e.work.job !== g.protagonist.job
  if (retrainPending) return 'retraining'
  if (g.age < 18) return 'trainee'
  if (kind === 'trainee') return 'retraining'
  if (kind === 'retired' || retirementPending(g)) return 'retired'
  if (kind === 'between' || kind === 'sick') return kind
  return 'working'
}

const ASIDE: Record<WorkFinanceStage, string> = {
  child: 'образование', trainee: 'стажировка', retraining: 'переобучение', working: 'занятость',
  between: 'пособие', sick: 'больничный', retired: 'пенсия', ended: 'архив'
}

function lastRow(rows: YearRow[], age: number) {
  const row = rows.at(-1)
  return row && row.age === age ? row : null
}

export function workFinanceView(g: GameState): WorkFinanceView {
  const e = g.economy
  const w = e.work
  const stage = stageOf(g)
  const job = g.protagonist.job
  const profession = hasProfession(job)
  const lines: string[] = []
  const view: WorkFinanceView = {
    stage, aside: ASIDE[stage], title: '', lines, family: null, savings: null, income: null, obligations: null,
    forecast: null, runway: null, notice: null, rows: [], spendOffered: false
  }

  if (stage === 'child') {
    view.title = 'Образование'
    lines.push(g.age < 6 ? 'Дошкольный возраст' : `Школа · ${yearsWord(g.age)}`)
    lines.push('Семья содержит тебя')
    lines.push(`Распределение по специальностям ${inYears(16 - g.age)}`)
    view.family = g.birth.wealth
    return view
  }

  if (stage === 'ended') {
    view.title = `Жизнь завершена · ${yearsWord(g.age)}`
    if (g.age < 16) {
      lines.push('Учился до самого конца')
      view.family = g.birth.wealth
      return view
    }
    if (profession) lines.push(`${job}, ${GRADE_ROMAN[w.grade - 1]} разряд`)
    else lines.push('Без специальности')
    lines.push(`Стаж ${serviceText(w.service)}`)
    const estate = e.estate ?? e.balance
    view.savings = { amount: whole(estate), text: formatCredits(estate), label: 'Итог накоплений' }
    return view
  }

  // Прогноз нужен и заголовку: наставничество видно по расчётному году даже у неразвёрнутого решения или восстановленного сохранения.
  const projection = projectYear(g)
  const next = projection.economy.work
  const mentorNow = w.mentor || (next.kind === 'retired' && next.mentor)
  const retrain = stage === 'retraining'
  // При ожидающей смене профессии прежний разряд упадёт на ступень, как в settleYear.
  const grade = (retrain && hasProfession(w.job) && w.job !== job ? Math.max(1, w.grade - 1) : w.grade) as Grade
  const jobName = professionLabel(job)

  switch (stage) {
    case 'trainee':
      view.title = `${jobName} · стажёр`
      lines.push(profession ? `Допуск к разряду ${inYears(Math.max(1, (w.until ?? 18) - g.age))}` : 'Специальность не выбрана')
      break
    case 'retraining':
      view.title = `${jobName} · переобучение`
      lines.push(profession ? gradeLine(grade) : 'Без разряда')
      lines.push(`Допуск к работе ${inYears(w.kind === 'trainee' && w.until !== null ? Math.max(1, w.until - g.age) : 1)}`)
      break
    case 'between':
      view.title = `${jobName} · между назначениями`
      if (profession) lines.push(gradeLine(grade))
      lines.push('Пособие 50% последнего тарифа')
      break
    case 'sick':
      view.title = `${jobName} · на больничном`
      if (profession) lines.push(gradeLine(grade))
      lines.push('Выплата 70% тарифа')
      break
    case 'retired':
      view.title = mentorNow ? 'Пенсионер · наставник' : 'Пенсионер'
      lines.push(profession ? `Прежняя профессия: ${job.toLowerCase()}, ${GRADE_ROMAN[w.grade - 1]} разряд` : 'Прежняя работа: общие службы')
      break
    default:
      view.title = `${jobName} · работает`
      lines.push(profession ? gradeLine(grade) : 'Общие службы · без разряда')
      break
  }

  if (stage === 'working' || stage === 'between' || stage === 'sick') {
    lines.push(`${w.load < 1 ? '0,6 ставки' : 'Полная ставка'} · стаж ${serviceText(w.service)}`)
  } else if (stage === 'retired' || stage === 'retraining' || stage === 'trainee') {
    lines.push(`Стаж ${serviceText(w.service)}`)
  }

  view.spendOffered = true
  view.savings = { amount: whole(e.balance), text: formatCredits(e.balance), label: 'Накоплено' }

  const row = projection.economy.years.at(-1)
  if (projection.projectedAge === null || !row || row.age !== projection.projectedAge) return view

  const parts: WorkFinanceIncomePart[] = []
  // Выплаты определяются состоянием в прогнозном году: в 76 лет следующий год уже пенсионный.
  const pensionNext = next.kind === 'retired'
  const mentoring = pensionNext && next.mentor ? row.wage : 0
  if (pensionNext) {
    parts.push({ key: 'pension', label: 'пенсия', amount: row.pension })
    if (mentoring > 0) parts.push({ key: 'mentoring', label: 'наставн.', amount: mentoring })
  } else if (row.wage > 0) {
    parts.push({ key: 'wage', label: 'доход', amount: row.wage })
  }
  const incomeTotal = row.wage + row.pension
  if (stage === 'retired' && mentorNow && mentoring === 0) lines.push('Наставничество завершается')
  if (stage !== 'retired' && pensionNext) lines.push('Со следующего года — пенсия')
  // Подпись следует за состоянием в прогнозном году: в 17 лет стипендия уже сменяется обычной оплатой.
  const incomeLabel = pensionNext ? 'Выплаты'
    : next.kind === 'trainee' ? (projection.projectedAge! < 18 ? 'Стипендия' : 'Оплата стажировки')
    : next.kind === 'between' || next.kind === 'sick' ? 'Выплата'
    : 'Доход'
  const incomeText = pensionNext
    ? mentoring > 0 ? `пенсия ${groupDigits(row.pension)} + наставн. ${groupDigits(mentoring)}` : `пенсия ${groupDigits(row.pension)} в год`
    : `${groupDigits(incomeTotal)} в год`
  view.income = { label: incomeLabel, parts, total: incomeTotal, text: incomeText }
  view.rows.push({ key: 'income', label: incomeLabel, value: incomeText })

  // Обязательства года: нужды, аренда и оплаченные услуги — то же, что спишет settleYear.
  const bills = row.bills
  if (bills > 0) {
    view.obligations = { amount: bills, text: `${groupDigits(bills)} в год` }
    view.rows.push({ key: 'obligations', label: 'Обязательства', value: view.obligations.text })
  }

  const delta = row.balance - e.balance
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  view.forecast = {
    delta, after: row.balance, direction,
    deltaText: `≈ ${delta === 0 ? '0' : formatSigned(delta)}`,
    afterText: groupDigits(row.balance),
    caption: 'Оценка без случайных событий и будущих решений',
    assumptions: projection.assumptions
  }
  view.rows.push({ key: 'forecast', label: 'За год', value: `${view.forecast.deltaText} → ${formatCredits(row.balance)}` })

  if (delta < 0) {
    const years = Math.floor(e.balance / -delta)
    view.runway = years >= RUNWAY_PLENTY_YEARS ? 'Накоплений хватит с запасом'
      : years < 1 ? 'Накоплений хватит меньше чем на год'
      : `Накоплений хватит на ≈ ${yearsWord(years)}`
  }

  view.notice = noticeOf(g, projection.economy.services, projection.economy.housing, row)
  return view
}

function noticeOf(g: GameState, services: Record<string, number>, housing: number, row: YearRow): WorkFinanceView['notice'] {
  const cancelled = Object.keys(g.economy.services).filter(id => !(id in services))
  if (row.aid > 0) return { level: 'warn', text: `Средств не хватает: фонд покроет ≈ ${formatCredits(row.aid)}` }
  if (cancelled.length) return { level: 'warn', text: `К концу года будет отменено: ${cancelled.map(id => SERVICE_NAMES[id] ?? id).join(', ')}` }
  if (housing < g.economy.housing) return { level: 'warn', text: 'К концу года жильё будет понижено' }
  const settled = lastRow(g.economy.years, g.age)
  if (settled && settled.aid > 0) return { level: 'calm', text: `Фонд покрыл ${formatCredits(settled.aid)}` }
  return null
}
