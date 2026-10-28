import { sectors } from './birth'
import { ECONOMY_TUNING, earnedGrade, projectYear } from './economy'
import type { Txn, YearRow } from './economy'
import { formatCredits, formatSigned, groupDigits, hasProfession, workFinanceView } from './economyView'
import { canSetLoad } from './engine'
import { OFFERS, availableSectorOptions, canBuy, familyTripParticipants, getOffer, isClosedByShipState } from './offers'
import type { FamilyParticipantOption, OfferId, PurchaseTarget, SectorOption } from './offers'
import type { GameState, Job, SectorId, Skill } from './types'
import { skillLabels, years } from '../ui/format'

/**
 * Модель окна «Траты и карьера» (docs/ECONOMY_DESIGN.md, §8.2–8.4).
 * Чистая функция: правила доступности берутся только из `canBuy()`, ничего не меняется.
 */
export type SpendTab = 'offers' | 'work' | 'mine' | 'history'

/** Порядок показа: те же три предложения, что реализованы в OFFERS. */
export const SPEND_OFFER_ORDER: OfferId[] = ['course-pro', 'own-cabin', 'dome-pass', 'sector-trip', 'family-trip']

/** Сколько экскурсий допускает каталог (используется только для подписи «N из 4»). */
export const MAX_SECTOR_VISITS = 4
const MAX_PARTICIPANTS = 3
const FAMILY_TRIP_GAP = 5

/** Курс от четверти баланса и вход в H1 подтверждаются вторым нажатием (§8.3). */
export const CONFIRM_SHARE = .25

/** Локальный выбор игрока в окне: цель для экскурсии и участники поездки. */
export interface SpendSelection { sectorId?: SectorId | null; participantIds?: readonly string[] }

/**
 * Состояние предложения с параметрами:
 * `unavailable` — недоступно в принципе; `needs-choice` — нужно выбрать цель;
 * `invalid` — цель выбрана, но `canBuy()` её не принимает; `ready` — можно покупать.
 */
export type OfferStage = 'unavailable' | 'needs-choice' | 'invalid' | 'ready'

export interface OfferView {
  id: OfferId
  kind: 'plain' | 'sector' | 'family'
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
  compare: LoadCompareRow[] | null
  reserve: string | null
  retirementNote: string | null
  action: { label: string; nextLoad: 1 | 0.6; available: boolean; reason: string | null }
}

export interface SpendView {
  balanceText: string
  attention: number
  /** Выбор после отсева устаревших или недопустимых значений. */
  selection: { sectorId: SectorId | null; participantIds: string[] }
  offers: OfferView[]
  work: { rows: { label: string; value: string }[]; hint: string | null; load: LoadView }
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
const MAIN_SKILL: Partial<Record<Job, Skill>> = { Техник: 'engineering', Медик: 'medicine', Агроном: 'ecology', Координатор: 'social' }

/** Причина из `canBuy()` для денег приводится к формулировке из спецификации. */
export function reasonText(reason: string | null): string | null {
  const money = reason?.match(/^Не хватает (\d+) кр\.$/)
  return money ? `Недостаточно средств: не хватает ${money[1]} кр.` : reason
}

/** Выбор приводится к тому, что сейчас допустимо: ушедшие из списка цели молча снимаются. */
export function sanitizeSelection(g: GameState, sel: SpendSelection = {}): { sectorId: SectorId | null; participantIds: string[] } {
  const sectorId = sel.sectorId && availableSectorOptions(g).some(o => o.id === sel.sectorId) ? sel.sectorId : null
  const known = new Set(familyTripParticipants(g).map(p => p.id))
  const participantIds = [...new Set(sel.participantIds ?? [])].filter(id => known.has(id)).slice(0, MAX_PARTICIPANTS)
  return { sectorId, participantIds }
}

function targetOf(id: string, sel: { sectorId: SectorId | null; participantIds: string[] }): PurchaseTarget | undefined {
  if (id === 'sector-trip') return sel.sectorId ? { sectorId: sel.sectorId } : undefined
  if (id === 'family-trip') return sel.participantIds.length ? { participantIds: [...sel.participantIds] } : undefined
  return undefined
}

/** Нужно ли второе нажатие. Решение принимает только состояние игры, а не компонент. */
export function needsConfirmation(g: GameState, offerId: string, target?: PurchaseTarget): boolean {
  const a = canBuy(g, offerId, target)
  if (!a.available) return false
  if (offerId === 'own-cabin') return a.action === 'purchase'
  if (offerId === 'course-pro' || offerId === 'sector-trip' || offerId === 'family-trip') return a.oneTimeCost > 0 && a.oneTimeCost >= g.economy.balance * CONFIRM_SHARE
  return false
}

function buttonLabelOf(id: OfferId, action: 'purchase' | 'restore', cost: number) {
  if (action === 'restore') return 'Восстановить бесплатно'
  if (id === 'course-pro') return `Записаться · ${formatCredits(cost)}`
  if (id === 'own-cabin') return `Оформить · ${formatCredits(cost)}`
  if (id === 'sector-trip') return `Отправиться · ${formatCredits(cost)}`
  if (id === 'family-trip') return `Провести неделю · ${formatCredits(cost)}`
  return 'Подключить'
}

const sectorName = (id: SectorId) => sectors.find(s => s.id === id)?.name ?? id

function confirmationOf(g: GameState, id: OfferId, target: PurchaseTarget | undefined, cost: number): { key: string; label: string } | null {
  if (!needsConfirmation(g, id, target)) return null
  const price = formatCredits(cost)
  const who = target?.participantIds ? [...target.participantIds].sort().join(',') : target?.sectorId ?? ''
  const key = `${id}|${who}|${cost}`
  if (id === 'sector-trip') return { key, label: `Точно посетить: ${sectorName(target!.sectorId!)}? −${price}` }
  if (id === 'family-trip') {
    const names = target!.participantIds!.map(pid => g.people.find(p => p.id === pid)?.name ?? pid)
    return { key, label: `Провести неделю вместе: ${names.join(' и ')}? −${price}` }
  }
  return { key, label: `${id === 'own-cabin' ? 'Точно оформить' : 'Точно записаться'}? −${price}` }
}

function offerView(g: GameState, id: OfferId, sel: { sectorId: SectorId | null; participantIds: string[] }): OfferView {
  const def: { title: string; description: string; freeFor?: Job } = OFFERS[id]
  const kind = id === 'sector-trip' ? 'sector' : id === 'family-trip' ? 'family' : 'plain'
  const sectorOptions = kind === 'sector' ? availableSectorOptions(g) : []
  const participantOptions = kind === 'family' ? familyTripParticipants(g) : []

  let target = targetOf(id, sel)
  let a = canBuy(g, id, target)
  let stage: OfferStage = a.available ? 'ready' : 'unavailable'
  let hint: string | null = null
  if (kind !== 'plain') {
    const complete = kind === 'sector' ? !!target : sel.participantIds.length >= 2
    if (complete) {
      stage = a.available ? 'ready' : 'invalid'
    } else {
      // Цель не выбрана: пробная цель только выясняет, доступно ли предложение «в принципе»; она не показывается и не выбирается.
      const probeTarget: PurchaseTarget | undefined = kind === 'sector'
        ? sectorOptions[0] && { sectorId: sectorOptions[0].id }
        : participantOptions.length >= 2 ? { participantIds: participantOptions.slice(0, 2).map(p => p.id) } : undefined
      const probe = canBuy(g, id, probeTarget)
      a = probe
      target = undefined
      if (probe.available) {
        stage = 'needs-choice'
        hint = kind === 'sector' ? 'Выберите направление' : sel.participantIds.length === 1 ? 'Выберите ещё одного близкого' : 'Выберите двух или трёх близких'
        a = { ...probe, available: false, reason: null }
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
    attentionText: a.attention > 0 ? `Внимание: ${a.attention}` : null,
    resultText: kind === 'sector' ? `Результат: до +${effects.stats?.knowledge ?? 0} к знаниям, память о месте`
      : kind === 'family' ? `Результат: до +${effects.familyTripBond ?? 0} к связи каждого участника, память и запись в хронике` : null,
    opens: a.opens.map(line => line.replace(' при выполнении условий earnedGrade().', ' при выполнении условий.').replace('; флаг familyTrip для будущих отсылок.', '.')), available: stage === 'ready', active, stage,
    statusText: active ? 'Действует' : stage === 'ready' ? 'Доступно' : stage === 'needs-choice' ? 'Нужен выбор' : 'Недоступно',
    reason: reasonText(a.reason), hint,
    cooldownText: kind === 'family' && previousTrip !== undefined && g.age - previousTrip < FAMILY_TRIP_GAP ? `Следующая поездка — в ${previousTrip + FAMILY_TRIP_GAP} ${yearsWord(previousTrip + FAMILY_TRIP_GAP)}` : null,
    warnings: a.warnings,
    buttonLabel: active ? (id === 'own-cabin' ? 'Оформлено' : 'Подключено') : buttonLabelOf(id, a.action, a.oneTimeCost),
    target: target ?? null, sectorOptions, participantOptions,
    confirmLabel: confirm?.label ?? null, confirmKey: confirm?.key ?? null
  }
}

const yearsWord = (n: number) => years(n).replace(/^\d+ /, '')

const skillName = (key: Skill) => skillLabels.find(s => s.key === key)?.name ?? key

function workRows(g: GameState) {
  const w = g.economy.work
  const job = g.protagonist.job
  const rows: { label: string; value: string }[] = []
  rows.push({ label: 'Профессия', value: hasProfession(job) ? job : 'Без специальности' })
  rows.push({ label: 'Рабочий статус', value: STATUS_LABEL[w.kind] ?? w.kind })
  if (hasProfession(job)) {
    rows.push({ label: 'Тарифный разряд', value: `${w.grade}` })
    const key = MAIN_SKILL[job]
    if (key) rows.push({ label: `Навык: ${skillName(key).toLowerCase()}`, value: `${Math.round(g.skills[key])}` })
  }
  rows.push({ label: 'Пройдено курсов', value: `${w.courses}` })
  rows.push({ label: 'Стаж, ставко-лет', value: `${Math.round(w.service * 10) / 10}`.replace('.', ',') })
  rows.push({ label: 'Нагрузка', value: w.load < 1 ? '0,6 ставки' : 'Полная ставка' })
  if (w.kind === 'retired') {
    const pension = workFinanceView(g).income?.parts.find(p => p.key === 'pension')
    if (pension) rows.push({ label: 'Пенсия', value: `${formatCredits(pension.amount)} в год` })
    rows.push({ label: 'Наставничество', value: w.mentor ? 'продолжается' : 'нет' })
  }
  return rows
}

function workHint(g: GameState): string | null {
  if (g.economy.work.kind !== 'working' || !hasProfession(g.protagonist.job)) return null
  return earnedGrade(g) > g.economy.work.grade
    ? 'Условия повышения выполнены: разряд обновится на ближайшей отметке года.'
    : 'Рост разряда зависит от профильного навыка, стажа и пройденных курсов.'
}

const LOAD_EXPLANATION = 'Ты будешь получать меньше кредитов и медленнее накапливать стаж, зато работа станет менее напряжённой и появится больше времени для близких.'
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

  return {
    current,
    title: current === 1 ? 'Полная ставка' : '0,6 ставки',
    explanation: LOAD_EXPLANATION,
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
  return {
    balanceText: formatCredits(e.balance),
    attention: g.attention,
    selection: sel,
    offers: SPEND_OFFER_ORDER.map(id => offerView(g, id, sel)),
    work: { rows: workRows(g), hint: workHint(g), load: loadView(g) },
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
