import { ECONOMY_TUNING, earnedGrade } from './economy'
import type { Txn, YearRow } from './economy'
import { formatCredits, hasProfession, workFinanceView } from './economyView'
import { OFFERS, canBuy, getOffer, isClosedByShipState } from './offers'
import type { OfferId } from './offers'
import type { GameState, Job, Skill } from './types'
import { skillLabels, years } from '../ui/format'

/**
 * Модель окна «Траты и карьера» (docs/ECONOMY_DESIGN.md, §8.2–8.4).
 * Чистая функция: правила доступности берутся только из `canBuy()`, ничего не меняется.
 */
export type SpendTab = 'offers' | 'work' | 'mine' | 'history'

/** Порядок показа: те же три предложения, что реализованы в OFFERS. */
export const SPEND_OFFER_ORDER: OfferId[] = ['course-pro', 'own-cabin', 'dome-pass']

/** Курс от четверти баланса и вход в H1 подтверждаются вторым нажатием (§8.3). */
export const CONFIRM_SHARE = .25

export interface OfferView {
  id: OfferId
  title: string
  description: string
  oneTimeText: string | null
  annualText: string | null
  attentionText: string | null
  opens: string[]
  available: boolean
  active: boolean
  statusText: string
  reason: string | null
  warnings: string[]
  buttonLabel: string
  /** Подпись второго нажатия; `null` — подтверждение не нужно. */
  confirmLabel: string | null
}

export interface ServiceView {
  id: string
  title: string
  annualText: string
  running: boolean
  statusText: string
}

export interface SpendView {
  balanceText: string
  attention: number
  offers: OfferView[]
  work: { rows: { label: string; value: string }[]; hint: string | null }
  mine: {
    housing: { tier: number; name: string; costText: string; rightText: string | null }
    services: ServiceView[]
    owned: { id: string; title: string; text: string }[]
  }
  history: { years: YearRow[]; ledger: (Txn & { signed: string })[] }
}

const HOUSING_NAMES = ['H0 · общий отсек', 'H1 · собственная каюта', 'H2 · расширенная каюта']
const KIND_NAMES: Record<string, string> = { start: 'Стартовый капитал', purchase: 'Покупка', aid: 'Помощь фонда', estate: 'Наследство', gift: 'Передача', help: 'Помощь близким', windfall: 'Поступление', shock: 'Непредвиденный расход' }
const INCOME_KINDS = new Set(['start', 'aid', 'windfall'])
const STATUS_LABEL: Record<string, string> = { working: 'работает', trainee: 'стажировка', between: 'между назначениями', sick: 'больничный', retired: 'на пенсии', child: 'учится' }
const MAIN_SKILL: Partial<Record<Job, Skill>> = { Техник: 'engineering', Медик: 'medicine', Агроном: 'ecology', Координатор: 'social' }

/** Причина из `canBuy()` для денег приводится к формулировке из спецификации. */
export function reasonText(reason: string | null): string | null {
  const money = reason?.match(/^Не хватает (\d+) кр\.$/)
  return money ? `Недостаточно средств: не хватает ${money[1]} кр.` : reason
}

/** Нужно ли второе нажатие. Решение принимает только состояние игры, а не компонент. */
export function needsConfirmation(g: GameState, offerId: string): boolean {
  const a = canBuy(g, offerId)
  if (!a.available) return false
  if (offerId === 'own-cabin') return a.action === 'purchase'
  if (offerId === 'course-pro') return a.oneTimeCost > 0 && a.oneTimeCost >= g.economy.balance * CONFIRM_SHARE
  return false
}

function buttonLabelOf(id: OfferId, action: 'purchase' | 'restore', cost: number) {
  if (action === 'restore') return 'Восстановить бесплатно'
  if (id === 'course-pro') return `Записаться · ${formatCredits(cost)}`
  if (id === 'own-cabin') return `Оформить · ${formatCredits(cost)}`
  return 'Подключить'
}

function offerView(g: GameState, id: OfferId): OfferView {
  const def: { title: string; description: string; freeFor?: Job } = OFFERS[id]
  const a = canBuy(g, id)
  const active = id === 'own-cabin' ? g.economy.housing >= 1 : id === 'dome-pass' ? g.economy.services[id] !== undefined : false
  const free = def.freeFor === g.protagonist.job
  return {
    id, title: def.title, description: def.description,
    oneTimeText: a.oneTimeCost > 0 ? `${formatCredits(a.oneTimeCost)} разово` : a.action === 'restore' ? 'Без взноса (право возврата)' : null,
    annualText: a.annualCost > 0 ? `${formatCredits(a.annualCost)} в год`
      : free ? `${formatCredits(0)} в год · бесплатно для профессии «${def.freeFor!.toLowerCase()}»` : null,
    attentionText: a.attention > 0 ? `Внимание: ${a.attention}` : null,
    opens: a.opens.map(line => line.replace(' при выполнении условий earnedGrade().', ' при выполнении условий.')), available: a.available, active,
    statusText: active ? 'Действует' : a.available ? 'Доступно' : 'Недоступно',
    reason: reasonText(a.reason), warnings: a.warnings,
    buttonLabel: active ? (id === 'own-cabin' ? 'Оформлено' : 'Подключено') : buttonLabelOf(id, a.action, a.oneTimeCost),
    confirmLabel: needsConfirmation(g, id) ? `${id === 'own-cabin' ? 'Точно оформить' : 'Точно записаться'}? −${formatCredits(a.oneTimeCost)}` : null
  }
}

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

export function spendView(g: GameState): SpendView {
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
  return {
    balanceText: formatCredits(e.balance),
    attention: g.attention,
    offers: SPEND_OFFER_ORDER.map(id => offerView(g, id)),
    work: { rows: workRows(g), hint: workHint(g) },
    mine: {
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
