import { projectYear } from './economy'
import type { Work } from './economy'
import type { GameState } from './types'

/**
 * Личное время (T9): сколько значимых дел сверх обязанностей герой успевает за год.
 * Это не энергия и не здоровье: оно не восстанавливается отдыхом, не копится и не покупается.
 * Внутреннее поле сохранения по-прежнему называется `attention` (остаток), а `timeYear` — лимит года.
 */

/** Режим, который действительно действует в этом году: по нему выдаётся годовое личное время. */
export type TimeRegime = 'childhood' | 'study' | 'full' | 'reduced' | 'trainee' | 'transition' | 'retired' | 'mentor'
/** `legacy` — год, начатый по прежнему правилу (до T9 любой год давал 3); `ended` — жизнь завершена. */
export type TimeBasis = TimeRegime | 'legacy' | 'ended'

/** Лимит и основание фиксируются один раз, в начале года. Смена нагрузки посреди года их не меняет. */
export interface PersonalTimeYear { limit: number; basis: TimeBasis }

export const TIME_REGIMES = ['childhood', 'study', 'full', 'reduced', 'trainee', 'transition', 'retired', 'mentor'] as const satisfies readonly TimeRegime[]
const TIME_BASES: readonly TimeBasis[] = [...TIME_REGIMES, 'legacy', 'ended']

/**
 * Единственный источник чисел. Стоимость покупок — в каталоге (`OfferDefinition.attention`),
 * стоимость принятого момента — `moment`. Процессные эксперименты аудита меняют эту таблицу и восстанавливают её.
 */
export const PERSONAL_TIME = {
  allowance: { childhood: 3, study: 3, full: 3, reduced: 4, trainee: 3, transition: 3, retired: 4, mentor: 4 } satisfies Record<TimeRegime, number>,
  /** Принятый короткий момент. */
  moment: 1,
  /** Год, начатый до T9: прежнее правило «3 единицы на любой год». */
  legacy: 3,
  /**
   * «Свободный вечер»: если на отметке года обычный момент не выпал, герой, чей режим этого года даёт
   * время сверх рабочей нормы, получает ещё один шанс — столько за каждую лишнюю единицу.
   * Частота моментов у полной ставки, стажировки и детства не меняется.
   */
  freeTimeChance: .2
}

/** Рабочий режим по фактическому карьерному состоянию (после годового расчёта), а не по возрасту. */
export function timeRegimeOf(work: Work, age: number): TimeRegime {
  if (work.kind === 'child') return 'childhood'
  if (work.kind === 'trainee') return age < 18 ? 'study' : 'trainee'
  if (work.kind === 'working') return work.load < 1 ? 'reduced' : 'full'
  if (work.kind === 'retired') return work.mentor ? 'mentor' : 'retired'
  return 'transition'
}

const limitOf = (basis: TimeBasis) => basis === 'ended' ? 0 : basis === 'legacy' ? PERSONAL_TIME.legacy : PERSONAL_TIME.allowance[basis]

/** Сколько личного времени даёт год, который начинается в этом состоянии. Чистая функция, без RNG. */
export function personalTimeAllowance(g: GameState): PersonalTimeYear {
  if (g.stopped) return { limit: 0, basis: 'ended' }
  const basis = timeRegimeOf(g.economy.work, g.age)
  return { limit: limitOf(basis), basis }
}

/** Шанс «свободного вечера» на отметке года: 0, если режим года не даёт времени сверх полной ставки. */
export function freeTimeChance(g: GameState): number {
  const extra = personalTimeOf(g).limit - PERSONAL_TIME.allowance.full
  const basis = g.timeYear?.basis
  return extra > 0 && basis !== 'legacy' && basis !== 'ended' ? Math.min(1, PERSONAL_TIME.freeTimeChance * extra) : 0
}

/** Начало года: выдаётся лимит года и полный остаток. Вызывается только из `tick()` после годового расчёта. */
export function startPersonalTimeYear(g: GameState) {
  g.timeYear = personalTimeAllowance(g)
  g.attention = g.timeYear.limit
}

/** Остаток и лимит текущего года в допустимых границах (старое или повреждённое сохранение не даёт лишнего). */
export function personalTimeOf(g: GameState): { left: number; limit: number; basis: TimeBasis } {
  const year = validYear(g.timeYear) ?? { limit: PERSONAL_TIME.legacy, basis: 'legacy' as const }
  const left = Number.isFinite(g.attention) ? Math.max(0, Math.min(year.limit, Math.floor(g.attention))) : 0
  return { left, limit: year.limit, basis: year.basis }
}

export interface TimeAvailability { available: boolean; reason: string | null }

/** Хватает ли личного времени на дело ценой `cost`. Бесплатное по времени (0) доступно всегда. */
export function canSpendPersonalTime(g: GameState, cost: number): TimeAvailability {
  if (cost <= 0) return { available: true, reason: null }
  const { left } = personalTimeOf(g)
  if (left >= cost) return { available: true, reason: null }
  return { available: false, reason: left === 0 ? 'Не хватает личного времени: в этом году оно закончилось.' : `Не хватает личного времени: нужно ${cost} ед., осталось ${left}.` }
}

/** Списывает личное время на копии состояния; доступность уже проверена `canSpendPersonalTime()`. */
export function spendPersonalTime(g: GameState, cost: number) {
  if (cost > 0) g.attention = Math.max(0, personalTimeOf(g).left - cost)
}

/** Смерть: личного времени больше нет. */
export function endPersonalTime(g: GameState) {
  g.timeYear = { limit: 0, basis: 'ended' }
  g.attention = 0
}

function validYear(v: unknown): PersonalTimeYear | null {
  if (v === null || typeof v !== 'object') return null
  const { limit, basis } = v as Record<string, unknown>
  if (!TIME_BASES.includes(basis as TimeBasis)) return null
  if (limit !== limitOf(basis as TimeBasis)) return null
  return { limit, basis: basis as TimeBasis }
}

/**
 * Сохранение до T9 (нет `timeYear`): текущий год остаётся по прежним правилам — лимит 3, потраченное не возвращается.
 * Новые правила действуют со следующего года. Повреждённый лимит пересчитывается по нынешнему режиму,
 * но остаток никогда не растёт: дробь округляется вниз, отрицательное или нечисловое значение даёт 0.
 * Деньги, здоровье, отношения, история и RNG не меняются.
 */
export function repairPersonalTime(g: GameState): { game: GameState; note: string | null } {
  const raw = (g as { timeYear?: unknown }).timeYear
  const valid = validYear(raw)
  let year: PersonalTimeYear
  let note: string | null = null
  if (g.stopped) year = { limit: 0, basis: 'ended' }
  else if (raw === undefined) {
    year = { limit: PERSONAL_TIME.legacy, basis: 'legacy' }
    note = 'Личное время: текущий год сохранён по прежним правилам, новые действуют со следующего года.'
  } else if (!valid || valid.basis === 'ended') {
    year = personalTimeAllowance(g)
    note = 'Личное время: повреждённый лимит года пересчитан, остаток не увеличен.'
  } else year = valid
  const attention = typeof g.attention === 'number' && Number.isFinite(g.attention) ? Math.max(0, Math.min(year.limit, Math.floor(g.attention))) : 0
  if (attention !== g.attention) note ??= 'Личное время: недопустимый остаток приведён к границам года.'
  if (valid && valid.limit === year.limit && valid.basis === year.basis && attention === g.attention) return { game: g, note: null }
  return { game: { ...g, timeYear: year, attention }, note }
}

const REGIME_NAME: Record<TimeBasis, string> = {
  childhood: 'Детство', study: 'Учёба до допуска к работе', full: 'Полная ставка', reduced: 'Сокращённая ставка',
  trainee: 'Стажировка по новой специальности', transition: 'Переходный период', retired: 'Пенсия',
  mentor: 'Пенсия и наставничество', legacy: 'Год начат по прежним правилам', ended: 'Жизнь завершена'
}

/** «4 ед.»: сокращение «единица» не склоняется и читается при любом числе. */
export const timeUnits = (n: number) => `${n} ед.`

/** «Сокращённая ставка · +1 ед. в год» — основание лимита по сравнению с полной ставкой. */
export function basisText(year: PersonalTimeYear): string {
  const extra = year.limit - PERSONAL_TIME.allowance.full
  if (year.basis === 'ended' || year.basis === 'legacy') return REGIME_NAME[year.basis]
  return extra > 0 ? `${REGIME_NAME[year.basis]} · +${extra} ед. в год` : `${REGIME_NAME[year.basis]} · ${timeUnits(year.limit)} в год`
}

export interface PersonalTimeView {
  left: number
  limit: number
  basis: TimeBasis
  /** «Личное время: 2/4». */
  counter: string
  /** Почему именно такой максимум. */
  basisText: string
  /** «В этом году не осталось личного времени» или `null`. */
  emptyText: string | null
  /** Лимит следующего года по прогнозу годового расчёта, если он отличается от нынешнего. */
  next: { limit: number; basis: TimeBasis; text: string } | null
}

/**
 * Модель счётчика для окна трат. Следующий год оценивается тем же `projectYear()`, что и деньги:
 * смена ставки, пенсионный переход или стажировка видны заранее, но ничего не выдают сейчас.
 */
export function personalTimeView(g: GameState): PersonalTimeView {
  const now = personalTimeOf(g)
  let next: PersonalTimeView['next'] = null
  if (!g.stopped && g.economy.estate === null) {
    const p = projectYear(g)
    if (p.projectedAge !== null) {
      const regime = timeRegimeOf(p.economy.work, p.projectedAge)
      const limit = PERSONAL_TIME.allowance[regime]
      if (limit !== now.limit || now.basis === 'legacy') {
        next = { limit, basis: regime, text: `Со следующего года: ${timeUnits(limit)} — ${REGIME_NAME[regime].toLowerCase()}.` }
      }
    }
  }
  return {
    left: now.left, limit: now.limit, basis: now.basis,
    counter: `Личное время: ${now.left}/${now.limit}`,
    basisText: basisText(now),
    emptyText: now.left === 0 && now.limit > 0 ? 'В этом году не осталось личного времени.' : null,
    next
  }
}
