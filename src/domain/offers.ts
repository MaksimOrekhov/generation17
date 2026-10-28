import { ECONOMY_TUNING, projectYear, type Housing } from './economy'
import type { GameState, Job, Skill, Stat } from './types'

export type OfferType = 'repeatable' | 'unique' | 'regular'
export type OfferCategory = 'career' | 'housing' | 'service'

export interface OfferEffects {
  stats?: Partial<Record<Stat, number>>
  professionalSkill?: { byJob: Partial<Record<Job, Skill>>; amount: number; cap: number }
  courses?: number
  housing?: Housing
  recordOwnership?: boolean
  service?: boolean
}

export interface OfferDefinition {
  id: string
  title: string
  description: string
  category: OfferCategory
  oneTimeCost: number
  annualCost: number
  freeFor?: Job
  minAge: number
  maxAge?: number
  attention: number
  type: OfferType
  opens: string[]
  effects: OfferEffects
  requirements: (g: GameState) => string | null
}

const professionSkills: Partial<Record<Job, Skill>> = {
  Техник: 'engineering', Медик: 'medicine', Агроном: 'ecology', Координатор: 'social'
}

const closedByShipState = (g: GameState) =>
  g.flags.shipIncidentAge === g.age || g.ship.air < 55 || g.ship.food < 45

/**
 * Реализованный срез каталога. Стоимость ежегодной аренды/услуги берётся
 * из ECONOMY_TUNING, чтобы каталог и годовой расчёт не расходились.
 */
export const OFFERS = {
  'course-pro': {
    id: 'course-pro', title: 'Профессиональный курс',
    description: 'Развивает профильный навык и учитывается при последующем росте разряда.',
    category: 'career', oneTimeCost: 350, annualCost: 0,
    minAge: 18, maxAge: 58, attention: 1, type: 'repeatable',
    opens: ['Следующее повышение разряда при выполнении условий earnedGrade().'],
    effects: { professionalSkill: { byJob: professionSkills, amount: 3, cap: 60 }, courses: 1 },
    requirements: (g: GameState) => {
      if (g.economy.work.job !== g.protagonist.job) return 'Сначала завершите переобучение.'
      if (g.economy.work.kind !== 'working') return 'Для покупки курса нужно работать.'
      if (!professionSkills[g.protagonist.job]) return 'Курс доступен только по основной специальности.'
      const previous = g.economy.lastBought['course-pro']
      if (previous !== undefined && g.age - previous < 4) {
        const remaining = 4 - (g.age - previous)
        return `Следующий курс доступен через ${remaining} ${remaining === 1 ? 'год' : 'года'}.`
      }
      return null
    }
  },
  'own-cabin': {
    id: 'own-cabin', title: 'Своя каюта',
    description: 'Повышает жильё до H1; право возврата можно использовать без повторного взноса.',
    category: 'housing', oneTimeCost: 400, annualCost: ECONOMY_TUNING.rent[1],
    minAge: 18, attention: 0, type: 'regular',
    opens: ['Жильё H1 и связанные с ним возможности.'],
    effects: { housing: 1, recordOwnership: true, stats: { morale: 2 } },
    requirements: (g: GameState) => g.economy.housing >= 1
      ? 'Уже есть собственная каюта.'
      : null
  },
  'dome-pass': {
    id: 'dome-pass', title: 'Абонемент в биокупол',
    description: 'Даёт ежегодный эффект отдыха, пока биокупол открыт и абонемент оплачен.',
    category: 'service', oneTimeCost: 0, annualCost: ECONOMY_TUNING.services.domePass,
    freeFor: 'Агроном', minAge: 16, attention: 0, type: 'regular',
    opens: ['Доступ к ежегодной услуге биокупола.'],
    effects: { service: true },
    requirements: (g: GameState) => {
      if (g.economy.services['dome-pass'] !== undefined) return 'Абонемент уже подключён.'
      if (closedByShipState(g)) return 'Биокупол временно закрыт.'
      return null
    }
  }
} satisfies Record<string, OfferDefinition>

export type OfferId = keyof typeof OFFERS

export interface PurchaseAvailability {
  offerId: string
  available: boolean
  oneTimeCost: number
  annualCost: number
  attention: number
  reason: string | null
  warnings: string[]
  opens: string[]
  action: 'purchase' | 'restore'
}

export const getOffer = (id: string): OfferDefinition | undefined =>
  Object.prototype.hasOwnProperty.call(OFFERS, id) ? OFFERS[id as OfferId] : undefined

const validHousingReturn = (g: GameState) =>
  g.economy.housing === 0 && g.economy.housingRight?.tier === 1 && g.economy.housingRight.until >= g.age

/** Applies catalogued state mutations to a caller-owned copy; stat effects use engine.applyEffects(). */
export function applyOfferChanges(g: GameState, offer: OfferDefinition) {
  const effects = offer.effects
  if (effects.professionalSkill) {
    const key = effects.professionalSkill.byJob[g.protagonist.job]
    if (key) {
      const current = g.skills[key]
      if (current < effects.professionalSkill.cap) g.skills[key] = Math.min(effects.professionalSkill.cap, current + effects.professionalSkill.amount)
    }
  }
  if (effects.courses) g.economy.work.courses += effects.courses
  if (effects.housing !== undefined) g.economy.housing = effects.housing
  if (effects.recordOwnership) g.economy.owned[offer.id] = g.age
  if (effects.service) g.economy.services[offer.id] = g.age
}

function projectedWarnings(g: GameState, offer: OfferDefinition, cost: number, action: 'purchase' | 'restore'): string[] {
  if (offer.annualCost === 0) return []
  const hypothetical = structuredClone(g)
  hypothetical.economy.balance -= cost
  if (action === 'restore') hypothetical.economy.housingRight = null
  applyOfferChanges(hypothetical, offer)
  hypothetical.economy.lastBought[offer.id] = hypothetical.age
  const projection = projectYear(hypothetical)
  if (projection.projectedAge === null) return []

  const warnings: string[] = []
  const projectedRow = projection.economy.years.at(-1)
  if (offer.effects.housing !== undefined && projection.economy.housing < offer.effects.housing) {
    warnings.push('По текущему прогнозу средств может не хватить на аренду H1 в следующем году; жильё будет понижено.')
  }
  if (offer.effects.service && projection.economy.services[offer.id] === undefined) {
    warnings.push('По текущему прогнозу средств может не хватить на годовой платёж; абонемент будет отменён.')
  }
  if (projectedRow?.aid) warnings.push(`По прогнозу фонд покроет ${projectedRow.aid} кр. базовых нужд в следующем году.`)
  return warnings
}

/** Pure availability check. The hypothetical next-year settlement runs on a clone and consumes no RNG. */
export function canBuy(g: GameState, offerId: string): PurchaseAvailability {
  const offer = getOffer(offerId)
  if (!offer) return { offerId, available: false, oneTimeCost: 0, annualCost: 0, attention: 0, reason: 'Такого предложения нет.', warnings: [], opens: [], action: 'purchase' }

  const restore = offer.id === 'own-cabin' && validHousingReturn(g)
  const action = restore ? 'restore' : 'purchase'
  const oneTimeCost = restore ? 0 : offer.oneTimeCost
  const annualCost = offer.freeFor === g.protagonist.job ? 0 : offer.annualCost
  let reason: string | null = null

  if (g.stopped || g.economy.estate !== null) reason = 'Персонаж умер.'
  else if (g.pending) reason = 'Сначала завершите ожидающее сюжетное решение.'
  else if (g.age < offer.minAge) reason = `Доступно с ${offer.minAge} лет.`
  else if (offer.maxAge !== undefined && g.age > offer.maxAge) reason = `Доступно до ${offer.maxAge} лет включительно.`
  else reason = offer.requirements(g)

  if (!reason && g.attention < offer.attention) reason = `Не хватает ${offer.attention - g.attention} единицы внимания.`
  if (!reason && g.economy.balance < oneTimeCost) reason = `Не хватает ${oneTimeCost - g.economy.balance} кр.`

  return {
    offerId, available: reason === null, oneTimeCost, annualCost, attention: offer.attention,
    reason, warnings: reason === null ? projectedWarnings(g, offer, oneTimeCost, action) : [],
    opens: [...offer.opens], action
  }
}

export const isClosedByShipState = closedByShipState
