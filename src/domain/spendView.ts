import { sectors } from './birth'
import { ECONOMY_TUNING, RETRAIN_SKILL_BONUS, gradeProgress, pensionOf, professionSkillOf, projectYear, projectYears, wageOf } from './economy'
import type { Grade, Txn, Work, YearRow } from './economy'
import { formatCredits, formatSigned, groupDigits, hasProfession } from './economyView'
import { canSetLoad, purchase } from './engine'
import { OFFERS, RETRAIN_GAP, availableSectorOptions, canBuy, familyTripParticipants, getOffer, isClosedByShipState, retrainOptions } from './offers'
import type { FamilyParticipantOption, OfferId, PurchaseTarget, SectorOption } from './offers'
import { PERSONAL_TIME, personalTimeView, timeRegimeOf, timeUnits } from './personalTime'
import type { PersonalTimeView } from './personalTime'
import type { GameState, Job, SectorId, Skill } from './types'
import { skillLabels, years } from '../ui/format'

/**
 * Модель окна «Траты и карьера» (docs/ECONOMY_DESIGN.md, §8.2–8.4).
 * Чистая функция: правила доступности берутся только из `canBuy()`, ничего не меняется.
 */
export type SpendTab = 'offers' | 'work' | 'mine' | 'history'

/** Порядок показа: все предложения каталога OFFERS; карьерные — первыми. */
export const SPEND_OFFER_ORDER: OfferId[] = ['course-pro', 'retrain', 'own-cabin', 'dome-pass', 'sector-trip', 'family-trip']

/** Сколько экскурсий допускает каталог (используется только для подписи «N из 4»). */
export const MAX_SECTOR_VISITS = 4
const MAX_PARTICIPANTS = 3
const FAMILY_TRIP_GAP = 5

/** Курс от четверти баланса и вход в H1 подтверждаются вторым нажатием (§8.3). */
export const CONFIRM_SHARE = .25

/** Локальный выбор игрока в окне: цель для экскурсии, участники поездки и новая специальность. */
export interface SpendSelection { sectorId?: SectorId | null; participantIds?: readonly string[]; job?: Job | null }
type Selection = { sectorId: SectorId | null; participantIds: string[]; job: Job | null }

/**
 * Состояние предложения с параметрами:
 * `unavailable` — недоступно в принципе; `needs-choice` — нужно выбрать цель;
 * `invalid` — цель выбрана, но `canBuy()` её не принимает; `ready` — можно покупать.
 */
export type OfferStage = 'unavailable' | 'needs-choice' | 'invalid' | 'ready'

/** Специальность в выборе переобучения: только факты, которые действительно есть в движке. */
export interface ProfessionOption {
  job: Job
  skillName: string
  /** Профильный навык новой специальности сейчас и после перехода (+9). */
  skillNow: number
  skillAfter: number
  /** Тариф новой специальности в разряде после перехода (ступень ниже нынешней). */
  tariffText: string
  note: string
}

export interface CompareRow { label: string; now: string; after: string }

/** Сравнение «сейчас / после перехода» строится на purchase() и projectYears() по копии игры. */
export interface RetrainForecast {
  from: Job
  to: Job
  rows: CompareRow[]
  /** Немедленная цена: взнос и личное время. */
  costText: string
  /** Когда начинается и заканчивается стажировка. */
  timeline: string[]
  /** Разница в оплате ближайшего года против нынешнего прогноза. */
  payGapText: string
  /** Путь к следующему разряду уже на новой специальности. */
  pathText: string | null
  notes: string[]
  /** Средств или личного времени пока не хватает: прогноз показан так, будто взнос оплачен. */
  hypothetical: boolean
  caption: string
}

export interface OfferView {
  id: OfferId
  kind: 'plain' | 'sector' | 'family' | 'profession'
  title: string
  description: string
  oneTimeText: string | null
  annualText: string | null
  attentionText: string | null
  resultText: string | null
  opens: string[]
  available: boolean
  active: boolean
  stage: OfferStage
  statusText: string
  reason: string | null
  /** Подсказка о недостающем выборе: «Выберите направление». */
  hint: string | null
  /** «Следующая поездка — в 35 лет»: конкретный срок паузы. */
  cooldownText: string | null
  warnings: string[]
  buttonLabel: string
  /** Цель, с которой проверена доступность; именно она уйдёт в покупку. */
  target: PurchaseTarget | null
  sectorOptions: SectorOption[]
  participantOptions: FamilyParticipantOption[]
  /** Подпись второго нажатия; `null` — подтверждение не нужно. */
  confirmLabel: string | null
  /** Подтверждение привязано к предложению, цели и фактической стоимости. */
  confirmKey: string | null
  /** Фактическая разовая стоимость для героя (со скидкой профессии); нужна цели накопления. */
  cost: number
  /** Позиция выбрана целью накопления. */
  isGoal: boolean
  /** Последствия, которые нужно знать до решения (переобучение). */
  consequences: string[]
  jobOptions: ProfessionOption[]
  retrain: RetrainForecast | null
}

export interface GoalView {
  id: OfferId
  title: string
  /** «Нужно 400 кр разово»; `null` у позиции без разового взноса. */
  costText: string | null
  savedText: string
  /** 0–100; `null`, если разового взноса нет — процент не имеет смысла. */
  percent: number | null
  enough: boolean
  /** Оценка срока по прогнозу года; `null`, когда она не нужна. */
  etaText: string | null
  /** Условия доступности помимо денег. */
  conditionText: string | null
}

export interface CareerRequirementView { label: string; value: string; met: boolean }

export interface CareerView {
  profession: string
  /** «III разряд · мастер»; `null` у общих служб. */
  gradeTitle: string | null
  facts: { label: string; value: string }[]
  /** Требования к следующему разряду; `null` — разрядов нет или достигнут IV. */
  next: { title: string; items: CareerRequirementView[] } | null
  status: { tone: 'ready' | 'info' | 'max'; text: string } | null
  post: { state: Work['post']; text: string }
  /** Переход на новую специальность: оформлен или идёт стажировка. */
  transition: { title: string; lines: string[] } | null
  /** Переобучение (выбор — во вкладке «Возможности»): доступность одной строкой. */
  retrainText: string
  retrainAvailable: boolean
}

export interface RetirementView {
  title: string
  rows: { label: string; value: string }[]
  notes: string[]
}

export interface ServiceView {
  id: string
  title: string
  annualText: string
  running: boolean
  statusText: string
}

export interface LoadCompareRow { label: string; full: string; reduced: string }

export interface LoadView {
  current: 1 | 0.6
  title: string
  explanation: string
  /** Новая нагрузка выбрана, но начнёт действовать с ближайшего расчёта: что будет с личным временем. */
  timeNote: string | null
  compare: LoadCompareRow[] | null
  reserve: string | null
  retirementNote: string | null
  action: { label: string; nextLoad: 1 | 0.6; available: boolean; reason: string | null }
}

export interface SpendView {
  balanceText: string
  /** Остаток личного времени года (внутреннее поле `attention`). */
  attention: number
  /** Счётчик «Личное время: 2/4», основание лимита и лимит следующего года. */
  time: PersonalTimeView
  /** Выбор после отсева устаревших или недопустимых значений. */
  selection: Selection
  offers: OfferView[]
  goal: GoalView | null
  work: { rows: { label: string; value: string }[]; career: CareerView; retirement: RetirementView | null; load: LoadView }
  mine: {
    visited: { id: string; name: string; deck: string; text: string }[]
    visitedLine: string
    familyTripText: string | null
    housing: { tier: number; name: string; costText: string; rightText: string | null }
    services: ServiceView[]
    owned: { id: string; title: string; text: string }[]
  }
  history: { years: YearRow[]; ledger: (Txn & { signed: string })[] }
}

const HOUSING_NAMES = ['H0 · общий отсек', 'H1 · собственная каюта', 'H2 · расширенная каюта']
const KIND_NAMES: Record<string, string> = { start: 'Стартовый капитал', purchase: 'Покупка', 'story-expense': 'Оплата по решению', aid: 'Помощь фонда', estate: 'Наследство', gift: 'Передача', help: 'Помощь близким', windfall: 'Поступление', shock: 'Непредвиденный расход' }
const INCOME_KINDS = new Set(['start', 'aid', 'windfall'])
const STATUS_LABEL: Record<string, string> = { working: 'работает', trainee: 'стажировка', between: 'между назначениями', sick: 'больничный', retired: 'на пенсии', child: 'учится' }

/** Причина из `canBuy()` для денег приводится к формулировке из спецификации. */
export function reasonText(reason: string | null): string | null {
  const money = reason?.match(/^Не хватает (\d+) кр\.$/)
  return money ? `Недостаточно средств: не хватает ${money[1]} кр.` : reason
}

/** Выбор приводится к тому, что сейчас допустимо: ушедшие из списка цели молча снимаются. */
export function sanitizeSelection(g: GameState, sel: SpendSelection = {}): Selection {
  const sectorId = sel.sectorId && availableSectorOptions(g).some(o => o.id === sel.sectorId) ? sel.sectorId : null
  const known = new Set(familyTripParticipants(g).map(p => p.id))
  const participantIds = [...new Set(sel.participantIds ?? [])].filter(id => known.has(id)).slice(0, MAX_PARTICIPANTS)
  // Специальность, ставшая нынешней (переход состоялся), из выбора снимается.
  const job = sel.job && retrainOptions(g).includes(sel.job) ? sel.job : null
  return { sectorId, participantIds, job }
}

function targetOf(id: string, sel: Selection): PurchaseTarget | undefined {
  if (id === 'sector-trip') return sel.sectorId ? { sectorId: sel.sectorId } : undefined
  if (id === 'family-trip') return sel.participantIds.length ? { participantIds: [...sel.participantIds] } : undefined
  if (id === 'retrain') return sel.job ? { job: sel.job } : undefined
  return undefined
}

/** Нужно ли второе нажатие. Решение принимает только состояние игры, а не компонент. */
export function needsConfirmation(g: GameState, offerId: string, target?: PurchaseTarget): boolean {
  const a = canBuy(g, offerId, target)
  if (!a.available) return false
  if (offerId === 'own-cabin') return a.action === 'purchase'
  // Переобучение — необратимое карьерное решение: второе нажатие нужно всегда, при любой доле накоплений.
  if (offerId === 'retrain') return true
  if (offerId === 'course-pro' || offerId === 'sector-trip' || offerId === 'family-trip') return a.oneTimeCost > 0 && a.oneTimeCost >= g.economy.balance * CONFIRM_SHARE
  return false
}

function buttonLabelOf(id: OfferId, action: 'purchase' | 'restore', cost: number) {
  if (action === 'restore') return 'Восстановить бесплатно'
  if (id === 'course-pro') return `Записаться · ${formatCredits(cost)}`
  if (id === 'own-cabin') return `Оформить · ${formatCredits(cost)}`
  if (id === 'sector-trip') return `Отправиться · ${formatCredits(cost)}`
  if (id === 'family-trip') return `Провести неделю · ${formatCredits(cost)}`
  if (id === 'retrain') return `Начать переобучение · ${formatCredits(cost)}`
  return 'Подключить'
}

const sectorName = (id: SectorId) => sectors.find(s => s.id === id)?.name ?? id

function confirmationOf(g: GameState, id: OfferId, target: PurchaseTarget | undefined, cost: number): { key: string; label: string } | null {
  if (!needsConfirmation(g, id, target)) return null
  const price = formatCredits(cost)
  const who = target?.participantIds ? [...target.participantIds].sort().join(',') : target?.sectorId ?? target?.job ?? ''
  const key = `${id}|${who}|${cost}`
  // Нейтральная форма: названия профессий не склоняются.
  if (id === 'retrain') return { key, label: `Подтвердить переобучение: ${g.protagonist.job} → ${target!.job!} · −${price}` }
  if (id === 'sector-trip') return { key, label: `Точно посетить: ${sectorName(target!.sectorId!)}? −${price}` }
  if (id === 'family-trip') {
    const names = target!.participantIds!.map(pid => g.people.find(p => p.id === pid)?.name ?? pid)
    return { key, label: `Провести неделю вместе: ${names.join(' и ')}? −${price}` }
  }
  return { key, label: `${id === 'own-cabin' ? 'Точно оформить' : 'Точно записаться'}? −${price}` }
}

function offerView(g: GameState, id: OfferId, sel: Selection): OfferView {
  const def: { title: string; description: string; freeFor?: Job } = OFFERS[id]
  const kind = id === 'sector-trip' ? 'sector' : id === 'family-trip' ? 'family' : id === 'retrain' ? 'profession' : 'plain'
  const sectorOptions = kind === 'sector' ? availableSectorOptions(g) : []
  const participantOptions = kind === 'family' ? familyTripParticipants(g) : []
  const jobs = kind === 'profession' ? retrainOptions(g) : []

  let target = targetOf(id, sel)
  let a = canBuy(g, id, target)
  let stage: OfferStage = a.available ? 'ready' : 'unavailable'
  let hint: string | null = null
  if (kind !== 'plain') {
    const complete = kind === 'family' ? sel.participantIds.length >= 2 : !!target
    if (complete) {
      // Выбор специальности очищается от недопустимых значений, поэтому у переобучения «неверный выбор» — только нехватка денег или личного времени.
      stage = a.available ? 'ready' : kind === 'profession' && !a.reason?.startsWith('Не хватает ') ? 'unavailable' : 'invalid'
    } else {
      // Цель не выбрана: пробная цель только выясняет, доступно ли предложение «в принципе»; она не показывается и не выбирается.
      const probeTarget: PurchaseTarget | undefined = kind === 'sector'
        ? sectorOptions[0] && { sectorId: sectorOptions[0].id }
        : kind === 'profession' ? jobs[0] && { job: jobs[0] }
        : participantOptions.length >= 2 ? { participantIds: participantOptions.slice(0, 2).map(p => p.id) } : undefined
      const probe = canBuy(g, id, probeTarget)
      a = probe
      target = undefined
      // Переобучение — решение, к которому копят: при нехватке только денег или личного времени выбор и прогноз всё равно открыты.
      const resourceOnly = kind === 'profession' && !!probe.reason?.startsWith('Не хватает ')
      if (probe.available || resourceOnly) {
        stage = 'needs-choice'
        hint = kind === 'sector' ? 'Выберите направление'
          : kind === 'profession' ? 'Выберите новую специальность'
          : sel.participantIds.length === 1 ? 'Выберите ещё одного близкого' : 'Выберите двух или трёх близких'
        a = { ...probe, available: false, reason: resourceOnly ? probe.reason : null }
      }
    }
  }

  const active = id === 'own-cabin' ? g.economy.housing >= 1 : id === 'dome-pass' ? g.economy.services[id] !== undefined : false
  const free = def.freeFor === g.protagonist.job
  const effects = OFFERS[id].effects as { stats?: { knowledge?: number }; familyTripBond?: number }
  const previousTrip = g.economy.lastBought['family-trip']
  const confirm = stage === 'ready' ? confirmationOf(g, id, target, a.oneTimeCost) : null
  return {
    id, kind, title: def.title, description: def.description,
    oneTimeText: a.oneTimeCost > 0 ? `${formatCredits(a.oneTimeCost)} разово` : a.action === 'restore' ? 'Без взноса (право возврата)' : null,
    annualText: a.annualCost > 0 ? `${formatCredits(a.annualCost)} в год`
      : free ? `${formatCredits(0)} в год · бесплатно для профессии «${def.freeFor!.toLowerCase()}»` : null,
    attentionText: a.attention > 0 ? `Личное время: ${timeUnits(a.attention)}` : null,
    resultText: kind === 'sector' ? `Результат: до +${effects.stats?.knowledge ?? 0} к знаниям, память о месте`
      : kind === 'family' ? `Результат: до +${effects.familyTripBond ?? 0} к связи каждого участника, память и запись в хронике` : null,
    opens: a.opens.map(line => line.replace(' при выполнении условий earnedGrade().', ' при выполнении условий.').replace('; флаг familyTrip для будущих отсылок.', '.')), available: stage === 'ready', active, stage,
    statusText: active ? 'Действует' : stage === 'ready' ? 'Доступно' : stage === 'needs-choice' ? 'Нужен выбор' : 'Недоступно',
    reason: reasonText(a.reason), hint,
    cooldownText: kind === 'family' && previousTrip !== undefined && g.age - previousTrip < FAMILY_TRIP_GAP ? `Следующая поездка — в ${previousTrip + FAMILY_TRIP_GAP} ${yearsWord(previousTrip + FAMILY_TRIP_GAP)}` : null,
    warnings: a.warnings,
    buttonLabel: active ? (id === 'own-cabin' ? 'Оформлено' : 'Подключено') : buttonLabelOf(id, a.action, a.oneTimeCost),
    target: target ?? null, sectorOptions, participantOptions,
    confirmLabel: confirm?.label ?? null, confirmKey: confirm?.key ?? null,
    cost: a.oneTimeCost, isGoal: g.economy.goal === id,
    consequences: kind === 'profession' ? retrainConsequences(g) : [],
    jobOptions: kind === 'profession' && stage !== 'unavailable' ? jobs.map(job => professionOption(g, job)) : [],
    // Прогноз нужен и когда пока не хватает только денег или личного времени: игрок видит, на что копить.
    retrain: kind === 'profession' && sel.job && stage !== 'unavailable' ? retrainForecast(g, sel.job) : null
  }
}

const GRADE_ROMAN = ['I', 'II', 'III', 'IV'] as const
const GRADE_NAME = ['допущенный', 'специалист', 'мастер', 'эксперт'] as const
const gradeTitle = (grade: Grade) => `${GRADE_ROMAN[grade - 1]} разряд · ${GRADE_NAME[grade - 1]}`
const credits = (n: number) => `${groupDigits(n)} кр`

/** Особенности специальностей, которые действительно работают в движке (§3.2), без обещаний будущих событий. */
const PROFESSION_NOTES: Partial<Record<Job, string>> = {
  Техник: 'Технический корпус: аварийные смены у самого сердца корабля. В год аварии — доплата 12% к тарифу.',
  Медик: 'Клинический блок: дежурства и люди, которые ждут помощи. На старших разрядах — один из самых высоких тарифов.',
  Агроном: 'Биокупол: сезоны, почва и свет. Абонемент в купол бесплатен, личные нужды на 60 кр в год меньше; тариф ниже остальных.',
  Координатор: 'Администрация: переговоры и ответственность за чужие решения. Самый высокий тариф; экскурсии в сектора на 25% дешевле.'
}

const postText: Record<Work['post'], string> = { held: 'действует (+10%)', ended: 'завершено', none: 'нет' }

function retrainConsequences(g: GameState): string[] {
  const w = g.economy.work
  return [
    'Год стажировки на 60% тарифа новой специальности, затем обычная работа по ней.',
    `Тарифный разряд на ступень ниже, но не ниже I; пройденные курсы (${w.courses}) обнуляются.`,
    w.post === 'held' ? 'Действующее назначение завершится вместе с надбавкой 10%.' : 'Назначение, если появится до стажировки, завершится вместе с надбавкой.',
    `Профильный навык новой специальности +${RETRAIN_SKILL_BONUS}; стаж, сбережения и близкие остаются с тобой.`,
    `Следующее переобучение — не раньше чем через ${RETRAIN_GAP} лет.`
  ]
}

function professionOption(g: GameState, job: Job): ProfessionOption {
  const key = professionSkillOf(job)!
  const grade = Math.max(1, g.economy.work.grade - 1) as Grade
  return {
    job, skillName: skillName(key),
    skillNow: Math.round(g.skills[key]),
    skillAfter: Math.round(Math.min(100, g.skills[key] + RETRAIN_SKILL_BONUS)),
    tariffText: `${GRADE_ROMAN[grade - 1]} разряд · ${credits(ECONOMY_TUNING.wages[job][grade - 1]!)} в год`,
    note: PROFESSION_NOTES[job] ?? ''
  }
}

/**
 * Сравнение «сейчас / после перехода». Ничего не считает вручную: переход выполняет настоящий purchase()
 * на копии игры, а годы — projectYears(). Если не хватает только денег или личного времени, копия получает
 * недостающее, чтобы показать последствия до того, как игрок накопит; это отмечено в `hypothetical`.
 */
export function retrainForecast(g: GameState, job: Job): RetrainForecast | null {
  const a = canBuy(g, 'retrain', { job })
  const resourceOnly = !a.available && !!a.reason?.startsWith('Не хватает ')
  if (!a.available && !resourceOnly) return null
  let base = g
  if (resourceOnly) {
    base = structuredClone(g)
    base.economy.balance = Math.max(base.economy.balance, a.oneTimeCost)
    base.attention = Math.max(base.attention, a.attention)
  }
  const after = purchase(base, 'retrain', { job })
  if (after === base) return null
  const [now] = projectYears(g, 1)
  const [internship, back] = projectYears(after, 2)
  if (!now || !internship) return null
  const w = g.economy.work
  const nw = internship.work
  const key = professionSkillOf(job)!
  const tariffAfter = wageOf({ ...after, economy: { ...after.economy, work: nw } })
  const gap = internship.row.wage - now.row.wage
  const progress = gradeProgress(after)
  const rows: CompareRow[] = [
    { label: 'Специальность', now: g.protagonist.job, after: job },
    { label: 'Тарифный разряд', now: gradeTitle(w.grade), after: gradeTitle(nw.grade) },
    { label: 'Оплата ближайшего года', now: `${credits(now.row.wage)} · работа`, after: `${credits(internship.row.wage)} · стажировка` },
    { label: 'Базовый тариф после стажировки', now: credits(wageOf(g)), after: credits(tariffAfter) },
    { label: 'Пройденные курсы', now: String(w.courses), after: String(nw.courses) },
    { label: 'Назначение', now: postText[w.post], after: postText[nw.post] },
    { label: `Навык: ${skillName(key).toLowerCase()}`, now: String(Math.round(g.skills[key])), after: String(Math.round(after.skills[key])) }
  ]
  const timeline = [`Стажировка — ближайший годовой расчёт, в ${years(internship.age)}: оплата 60% тарифа.`]
  if (back?.work.kind === 'working') timeline.push(`С ${back.age} ${yearsWord(back.age)} — обычная работа: ${job.toLowerCase()}, ${GRADE_ROMAN[back.work.grade - 1]} разряд.`)
  const notes: string[] = []
  if (w.load < 1) notes.push('Режим 0,6 ставки сохранится и после стажировки; вернуться на полную ставку можно будет обычным порядком.')
  if (internship.row.aid > 0) notes.push(`В год стажировки фонд покроет ≈ ${credits(internship.row.aid)} базовых нужд.`)
  return {
    from: g.protagonist.job, to: job, rows,
    costText: `Сразу: −${credits(a.oneTimeCost)} и ${timeUnits(a.attention)} личного времени.`,
    timeline,
    payGapText: gap < 0 ? `Год стажировки принесёт на ${credits(-gap)} меньше нынешнего прогноза.` : gap > 0 ? `Год стажировки принесёт на ${credits(gap)} больше нынешнего прогноза.` : 'Оплата ближайшего года не изменится.',
    pathText: progress.next && progress.requirements.length
      ? `Путь к ${GRADE_ROMAN[progress.next - 1]} разряду: ${progress.requirements.map(r => `${requirementLabel(r, progress.grade).toLowerCase()} ${requirementValue(r)}`).join(', ')}.`
      : null,
    notes,
    hypothetical: resourceOnly,
    caption: 'Оценка по нынешнему состоянию: будущие сюжеты, курсы, рост навыков и случайные события не учтены. Дальнейший заработок зависит от того, как пойдёт рост на новой специальности.'
  }
}

const requirementLabel = (r: { key: string; since?: 'job' | 'grade' }, grade: Grade) =>
  r.key === 'skill' ? 'Навык' : r.key === 'courses' ? 'Курсы' : r.since === 'grade' ? `Стаж в ${GRADE_ROMAN[grade - 1]} разряде` : 'Стаж на специальности'
const requirementValue = (r: { key: string; current: number; required: number }) =>
  r.key === 'years' ? `${r.current} / ${years(r.required)}` : `${Math.floor(r.current)} / ${r.required}`

const yearsWord = (n: number) => years(n).replace(/^\d+ /, '')

const skillName = (key: Skill) => skillLabels.find(s => s.key === key)?.name ?? key

function workRows(g: GameState) {
  const w = g.economy.work
  return [
    { label: 'Рабочий статус', value: STATUS_LABEL[w.kind] ?? w.kind },
    { label: 'Нагрузка', value: w.kind === 'retired' ? 'не работает' : w.load < 1 ? '0,6 ставки' : 'Полная ставка' },
    { label: 'Общий стаж, ставко-лет', value: decimal(w.service) }
  ]
}

/** Оформленная, но ещё не рассчитанная смена профессии: героем уже записана новая специальность. */
const retrainPending = (g: GameState) => hasProfession(g.economy.work.job) && g.economy.work.job !== g.protagonist.job
const adultTrainee = (g: GameState) => g.economy.work.kind === 'trainee' && g.age >= 18

/** «Профессиональный рост»: требования берутся из gradeProgress(), то есть из тех же правил, что earnedGrade(). */
export function careerView(g: GameState): CareerView {
  const w = g.economy.work
  const job = g.protagonist.job
  const profession = hasProfession(job)
  const progress = gradeProgress(g)
  const pending = retrainPending(g)
  const cw = progress.work
  const key = professionSkillOf(job)
  const facts: { label: string; value: string }[] = []
  if (key) facts.push({ label: `Навык: ${skillName(key).toLowerCase()}`, value: `${Math.floor(g.skills[key])}` })
  facts.push({ label: 'Пройдено курсов', value: `${cw.courses}` })
  if (profession && g.age >= 16) facts.push({ label: 'Стаж на специальности', value: years(Math.max(0, g.age - cw.jobSince)) })

  let status: CareerView['status'] = null
  let next: CareerView['next'] = null
  if (profession && progress.next !== null) {
    next = {
      title: `До ${GRADE_ROMAN[progress.next - 1]} разряда`,
      items: progress.requirements.map(r => ({ label: requirementLabel(r, progress.grade), value: requirementValue(r), met: r.met }))
    }
  }
  if (!profession) status = { tone: 'info', text: g.age < 18 ? 'Разряды появятся с допуском к работе по специальности.' : 'Общие службы: тарифных разрядов нет.' }
  else if (w.kind === 'retired') { status = { tone: 'info', text: 'На пенсии тарифный разряд больше не меняется.' }; next = null }
  else if (progress.next === null) status = { tone: 'max', text: 'IV разряд — высшая тарифная квалификация.' }
  else if (pending) status = { tone: 'info', text: 'Условия показаны для новой специальности: рост разряда начнётся после стажировки.' }
  else if (w.kind === 'trainee') status = { tone: 'info', text: g.age < 18 ? 'Разряд начнёт расти после допуска к работе в 18 лет.' : 'Идёт стажировка: рост разряда продолжится после неё.' }
  else if (w.kind !== 'working') status = { tone: 'info', text: 'Разряд растёт только в годы обычной работы.' }
  else if (progress.ready) status = { tone: 'ready', text: 'Условия выполнены. Разряд будет обновлён при следующем годовом расчёте.' }
  else {
    const projected = projectYear(g)
    if (projected.projectedAge !== null && projected.economy.work.grade > w.grade) status = { tone: 'ready', text: 'К следующему годовому расчёту нужный стаж будет набран — разряд обновится.' }
  }

  const post: CareerView['post'] = w.post === 'held'
    ? { state: 'held', text: pending ? 'Назначение действует до начала стажировки: с переходом оно завершится вместе с надбавкой 10%.' : 'Назначение действует: надбавка 10% к тарифу. В пенсию надбавка не входит.' }
    : w.post === 'ended' ? { state: 'ended', text: 'Прежнее назначение завершено.' }
    : { state: 'none', text: 'Назначения нет.' }

  let transition: CareerView['transition'] = null
  if (pending || adultTrainee(g)) {
    const [first, second] = projectYears(g, 2)
    const lines: string[] = []
    if (pending && first) {
      lines.push(`Стажировка — ближайший годовой расчёт, в ${years(first.age)}: оплата ≈ ${credits(first.row.wage)}, 60% тарифа.`)
      if (second?.work.kind === 'working') lines.push(`С ${second.age} ${yearsWord(second.age)} — работа по новой специальности, ${GRADE_ROMAN[second.work.grade - 1]} разряд, тариф ${credits(ECONOMY_TUNING.wages[job][second.work.grade - 1]!)}.`)
    } else if (first) {
      const paid = g.economy.years.at(-1)
      if (paid?.age === g.age) lines.push(`Год стажировки идёт: оплата ${credits(paid.wage)} начислена в ${years(g.age)}.`)
      if (first.work.kind === 'working') lines.push(`С ближайшего годового расчёта, в ${years(first.age)}, — обычная работа: ${GRADE_ROMAN[first.work.grade - 1]} разряд, тариф ${credits(wageOf(g))}.`)
    }
    transition = { title: pending ? `Переобучение оформлено: ${w.job} → ${job}` : `Стажировка: ${job}`, lines }
  }

  const retrain = canBuy(g, 'retrain', retrainOptions(g)[0] && { job: retrainOptions(g)[0]! })
  const last = g.economy.lastBought.retrain
  const resourceOnly = !retrain.available && !!retrain.reason?.startsWith('Не хватает ')
  const retrainText = retrain.available
    ? 'Можно перейти в другую службу: выбор специальности и сравнение — во вкладке «Возможности».'
    : resourceOnly ? `${reasonText(retrain.reason)} Сравнить специальности можно уже сейчас — во вкладке «Возможности».`
    // Во время перехода причина уже описана выше: говорим только, когда откроется следующий.
    : transition && last !== undefined ? `Следующее переобучение — не раньше ${years(last + RETRAIN_GAP)}.`
    : transition ? 'Новое переобучение — после завершения стажировки.'
    : `Сейчас недоступно. ${reasonText(retrain.reason) ?? 'Условия не выполнены.'}`
  return {
    profession: profession ? job : 'Без специальности',
    gradeTitle: profession ? gradeTitle(cw.grade) : null,
    facts, next, status, post, transition,
    // Кнопка ведёт к выбору, а не покупает: он открыт и тогда, когда пока не хватает только денег или личного времени.
    retrainAvailable: retrain.available || resourceOnly,
    retrainText
  }
}

const PATH_TITLE: Record<NonNullable<Work['path']>, string> = {
  left: 'Пенсия', mentor: 'Пенсия и наставничество', continue: 'Работа до предела 77 лет'
}

/**
 * Пенсионный путь. Суммы — из pensionOf() и projectYear(), без собственных формул; будущее не угадывается:
 * у работающего показана пенсия по нынешним тарифу и стажу.
 */
export function retirementView(g: GameState): RetirementView | null {
  const w = g.economy.work
  if (g.age < 45 || g.stopped || g.economy.estate !== null) return null
  const path = w.path ?? (g.flags.retirementPath === 'left' || g.flags.retirementPath === 'mentor' || g.flags.retirementPath === 'continue' ? g.flags.retirementPath : null)
  const bonus = Math.min(25, 4 * w.deferYears)
  const rows: { label: string; value: string }[] = []
  const notes: string[] = []
  if (w.kind === 'retired') {
    const projection = projectYear(g)
    const row = projection.projectedAge !== null ? projection.economy.years.at(-1) : undefined
    rows.push({ label: 'Пенсия', value: `${credits(row?.pension ?? pensionOf(w))} в год` })
    if (w.path === 'mentor') {
      const mentoring = row && projection.economy.work.mentor ? row.wage : 0
      rows.push({ label: 'Наставничество', value: mentoring > 0 ? `${credits(mentoring)} в год · до 80 лет`
        : w.mentor ? 'этот год — последний (до 80 лет)' : g.age >= 80 ? 'завершено в 80 лет' : 'нет' })
      notes.push('Наставничество — частичная занятость: 25% последнего тарифа до 80 лет, без нового стажа и разряда.')
    }
    if (bonus > 0) rows.push({ label: 'Надбавка за отсрочку', value: `+${bonus}%` })
    rows.push({ label: 'Стаж', value: decimal(w.service) })
    rows.push({ label: 'Личное время', value: `${timeUnits(PERSONAL_TIME.allowance[timeRegimeOf(w, g.age)])} в год` })
    return { title: PATH_TITLE[w.path ?? 'left'], rows, notes }
  }
  const decided = path === 'left' || path === 'mentor'
  rows.push({ label: 'Пенсия по нынешним тарифу и стажу', value: `${credits(pensionOf(w))} в год` })
  if (bonus > 0) rows.push({ label: 'Надбавка за отсрочку', value: `+${bonus}%` })
  const retiredTime = PERSONAL_TIME.allowance[path === 'mentor' ? 'mentor' : 'retired']
  const workTime = PERSONAL_TIME.allowance[timeRegimeOf(w, g.age)]
  if (decided) notes.push(`Решение принято (${PATH_TITLE[path].toLowerCase()}): пенсия начнётся с ближайшего годового расчёта, личного времени будет ${timeUnits(retiredTime)} в год.`)
  else if (retiredTime !== workTime) notes.push(`На пенсии смены больше нет: личного времени — ${timeUnits(retiredTime)} в год вместо нынешних ${timeUnits(workTime)}. Чем его занять, решаешь ты.`)
  else {
    if (path === 'continue') notes.push('Выбран путь: продолжать работу до 77 лет, затем пенсия.')
    else notes.push(g.age < 60 ? 'Решение о пенсии — с 60 лет: уйти на пенсию, стать наставником или продолжить работу.' : 'Если решение не принято, работа продолжается до 77 лет.')
    notes.push('После 62 лет каждый год работы прибавляет к будущей пенсии 4% (не больше 25%).')
    notes.push(g.age >= 65 ? 'С 65 лет год полной работы стоит здоровья и сил.' : 'С 65 лет полная работа начинает стоить здоровья и сил.')
  }
  notes.push('Надбавка за назначение в пенсию не входит.')
  return { title: path === 'continue' ? PATH_TITLE.continue : decided ? PATH_TITLE[path] : 'Пенсионные перспективы', rows, notes }
}

const isMoneyReason = (reason: string | null) => !!reason && /^Не хватает \d+ кр\.$/.test(reason)

/** Цель накопления (§6.4): только показ. Срок — по прогнозу projectYear(), без резервирования и бонусов. */
export function goalView(g: GameState, offers: OfferView[]): GoalView | null {
  const o = offers.find(x => x.id === g.economy.goal)
  if (!o) return null
  const balance = g.economy.balance
  const cost = o.cost
  const raw = canBuy(g, o.id, o.target ?? undefined).reason
  const conditionText = o.active ? 'Уже действует.'
    : o.stage === 'needs-choice' ? `При покупке: ${o.hint!.toLowerCase()}.`
    : raw && !isMoneyReason(raw) ? reasonText(raw) : null
  if (cost <= 0) {
    return {
      id: o.id, title: o.title, costText: null, savedText: `Накоплено ${formatCredits(balance)}`, percent: null, enough: true, etaText: null,
      conditionText: conditionText ?? `Разового взноса нет: доступность зависит от условий${o.annualText ? ` и ежегодной оплаты (${o.annualText})` : ''}.`
    }
  }
  const enough = balance >= cost
  let etaText: string | null = null
  if (!enough) {
    const projection = projectYear(g)
    const row = projection.projectedAge !== null ? projection.economy.years.at(-1) : undefined
    const delta = row ? row.balance - balance : 0
    etaText = delta > 0 ? `≈ ${years(Math.ceil((cost - balance) / delta))} при нынешнем прогнозе` : 'По нынешнему прогнозу накопления не растут: срок не оценить.'
  }
  return {
    id: o.id, title: o.title, costText: `Нужно ${formatCredits(cost)} разово`,
    savedText: `Накоплено ${groupDigits(Math.min(balance, cost))} из ${formatCredits(cost)}`,
    percent: Math.min(100, Math.floor(balance * 100 / cost)), enough,
    etaText: enough ? 'Хватает средств.' : etaText, conditionText
  }
}

/** Пояснение к выбору ставки: числа личного времени — из общей таблицы PERSONAL_TIME. */
function loadExplanation() {
  const { full, reduced } = PERSONAL_TIME.allowance
  return `Ты будешь получать меньше кредитов и медленнее накапливать стаж, зато смена станет легче, а личного времени — больше: ${timeUnits(reduced)} в год вместо ${full}. Его можно отдать близким, делу или себе.`
}
const NEUTRAL_BALANCE = Number.MAX_SAFE_INTEGER - 10_000

function withLoad(g: GameState, load: 1 | 0.6): GameState {
  const copy = structuredClone(g)
  copy.economy.work.load = load
  return copy
}

const decimal = (n: number) => `${Math.round(n * 10) / 10}`.replace('.', ',')
const signedText = (n: number) => n > 0 ? `+${decimal(n)}` : n < 0 ? `−${decimal(-n)}` : '0'

/** Годовые эффекты самой нагрузки: услуги и нехватка средств убраны, чтобы не смешиваться с ней. */
function loadEffectsText(g: GameState, load: 1 | 0.6): string {
  const copy = withLoad(g, load)
  copy.economy.services = {}
  copy.economy.balance = NEUTRAL_BALANCE
  const stats = projectYear(copy).effects.stats
  const parts: string[] = []
  if (stats.health) parts.push(`здоровье ${signedText(stats.health)}`)
  if (stats.stress) parts.push(`стресс ${signedText(stats.stress)}`)
  if (stats.bonds) parts.push(`связи ${signedText(stats.bonds)}`)
  const text = parts.join(', ')
  return text ? text[0]!.toUpperCase() + text.slice(1) : 'Обычные'
}

/** Режим работы: сравнение строится на тех же `projectYear()` и `canSetLoad()`, что и панель, без ручных коэффициентов. */
function loadView(g: GameState): LoadView {
  const current: 1 | 0.6 = g.economy.work.load < 1 ? 0.6 : 1
  const nextLoad: 1 | 0.6 = current === 1 ? 0.6 : 1
  const check = canSetLoad(g, nextLoad)
  const base = projectYear(g)
  const retirementNow = base.projectedAge !== null && base.economy.work.kind === 'retired' && g.economy.work.kind === 'working'

  let compare: LoadCompareRow[] | null = null
  if (g.economy.work.kind === 'working' && base.projectedAge !== null) {
    const rowOf = (load: 1 | 0.6) => {
      const p = projectYear(withLoad(g, load))
      const row = p.economy.years.at(-1)!
      return { income: row.wage + row.pension, bills: row.bills, delta: row.balance - g.economy.balance, service: p.economy.work.service - g.economy.work.service }
    }
    const full = rowOf(1)
    const reduced = rowOf(0.6)
    compare = [
      { label: 'Доход за год', full: `${groupDigits(full.income)} кр`, reduced: `${groupDigits(reduced.income)} кр` },
      { label: 'Обязательства', full: `${groupDigits(full.bills)} кр`, reduced: `${groupDigits(reduced.bills)} кр` },
      { label: 'Баланс за год', full: `${formatSigned(full.delta)} кр`, reduced: `${formatSigned(reduced.delta)} кр` },
      { label: 'Прирост стажа', full: signedText(full.service), reduced: signedText(reduced.service) },
      { label: 'Личное время за год', full: timeUnits(PERSONAL_TIME.allowance[timeRegimeOf(withLoad(g, 1).economy.work, g.age)]), reduced: timeUnits(PERSONAL_TIME.allowance[timeRegimeOf(withLoad(g, 0.6).economy.work, g.age)]) },
      { label: 'Эффекты нагрузки', full: loadEffectsText(g, 1), reduced: loadEffectsText(g, 0.6) }
    ]
  }

  // Поля резерва заполнены, только если расчёт дошёл до проверки накоплений.
  let reserve: string | null = null
  if (current === 1 && check.projectedBills > 0) {
    reserve = check.annualGap > 0
      ? `При сокращённой ставке ожидаемый дефицит — ${check.annualGap} кр./год. Для перехода нужен резерв ${check.requiredReserve} кр. Сейчас накоплено ${g.economy.balance} кр.`
      : 'При сокращённой ставке дефицита не ожидается: резерв не нужен.'
  }

  // Лимит этого года зафиксирован в его начале: новая ставка меняет личное время только со следующего расчёта.
  const time = personalTimeView(g)
  const yearLoad: 1 | 0.6 | null = time.basis === 'reduced' ? 0.6 : time.basis === 'full' ? 1 : null
  let timeNote: string | null = null
  if (g.economy.work.kind === 'working' && yearLoad !== null && yearLoad !== current) {
    const nextLimit = PERSONAL_TIME.allowance[current === 0.6 ? 'reduced' : 'full']
    timeNote = current === 0.6
      ? `Сокращённая ставка начнёт действовать со следующего игрового года — тогда же личного времени станет ${timeUnits(nextLimit)} в год. В этом году остаётся ${time.left} из ${time.limit}.`
      : `Полная ставка вернётся со следующего игрового года: личного времени будет ${timeUnits(nextLimit)} в год. Нынешний остаток (${time.left} из ${time.limit}) сохраняется до конца года.`
  }
  return {
    current,
    title: current === 1 ? 'Полная ставка' : '0,6 ставки',
    explanation: loadExplanation(),
    timeNote,
    compare, reserve,
    retirementNote: retirementNow
      ? 'Следующий расчёт — пенсионный переход: зарплата за этот год не начисляется, поэтому немедленной пользы от смены нагрузки может не быть.'
      : null,
    action: { label: current === 1 ? 'Перейти на 0,6 ставки' : 'Вернуться на полную ставку', nextLoad, available: check.available, reason: check.reason }
  }
}

function visitedSectors(g: GameState) {
  const prefix = 'visit-sector-'
  return Object.entries(g.economy.owned).flatMap(([key, age]) => {
    const sector = key.startsWith(prefix) ? sectors.find(s => s.id === key.slice(prefix.length)) : undefined
    return sector ? [{ id: sector.id, name: sector.name, deck: sector.deck, age }] : []
  }).sort((a, b) => a.age - b.age).map(v => ({ id: v.id, name: v.name, deck: `палуба ${v.deck}`, text: `посещён в ${years(v.age)}` }))
}

export function spendView(g: GameState, selection: SpendSelection = {}): SpendView {
  const sel = sanitizeSelection(g, selection)
  const e = g.economy
  const job = g.protagonist.job
  const services: ServiceView[] = Object.keys(e.services).sort().flatMap(id => {
    const def = getOffer(id)
    if (!def?.effects.service) return []
    const cost = def.freeFor === job ? 0 : def.annualCost
    const running = !isClosedByShipState(g)
    return [{ id, title: def.title, annualText: `${formatCredits(cost)} в год`, running, statusText: running ? 'работает' : 'временно закрыт' }]
  })
  const owned = Object.entries(e.owned).sort((a, b) => a[1] - b[1]).flatMap(([id, age]) => {
    const def = getOffer(id)
    return def ? [{ id, title: def.title, text: `приобретено в ${years(age)}` }] : []
  })
  const right = e.housingRight
  const visited = visitedSectors(g)
  const offers = SPEND_OFFER_ORDER.map(id => offerView(g, id, sel))
  return {
    balanceText: formatCredits(e.balance),
    attention: g.attention,
    time: personalTimeView(g),
    selection: sel,
    offers,
    goal: goalView(g, offers),
    work: { rows: workRows(g), career: careerView(g), retirement: retirementView(g), load: loadView(g) },
    mine: {
      visited,
      visitedLine: `Экскурсий: ${visited.length} из ${MAX_SECTOR_VISITS}`,
      familyTripText: e.lastBought['family-trip'] !== undefined ? `Последняя совместная поездка — в ${years(e.lastBought['family-trip'])}` : g.flags.familyTrip ? 'Совместная поездка была' : null,
      housing: {
        tier: e.housing, name: HOUSING_NAMES[e.housing]!,
        costText: `${formatCredits(ECONOMY_TUNING.rent[e.housing])} в год`,
        rightText: right ? `Право возврата на H${right.tier} без взноса — до ${years(right.until)}` : null
      },
      services, owned
    },
    history: {
      years: e.years.filter(r => r.age >= 16).slice(-10).reverse(),
      ledger: e.ledger.slice(-10).reverse().map(t => ({
        ...t,
        label: t.label && t.label !== t.kind ? t.label : (KIND_NAMES[t.kind] ?? t.kind),
        signed: t.kind === 'estate' || t.amount === 0 ? formatCredits(t.amount) : `${INCOME_KINDS.has(t.kind) ? '+' : '−'}${formatCredits(t.amount)}`
      }))
    }
  }
}
