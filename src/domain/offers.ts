import { ECONOMY_TUNING, projectYear, type Housing } from './economy'
import { isKnown, residenceOf, sectors } from './birth'
import type { GameState, Job, SectorId, Skill, Stat } from './types'

export type OfferType = 'repeatable' | 'unique' | 'regular'
export type OfferCategory = 'career' | 'housing' | 'service' | 'travel' | 'family'

export interface OfferEffects {
  stats?: Partial<Record<Stat, number>>
  professionalSkill?: { byJob: Partial<Record<Job, Skill>>; amount: number; cap: number }
  courses?: number
  housing?: Housing
  recordOwnership?: boolean
  service?: boolean
  sectorVisit?: boolean
  familyTripBond?: number
}

export interface OfferDefinition {
  id: string
  title: string
  description: string
  category: OfferCategory
  oneTimeCost: number
  annualCost: number
  freeFor?: Job
  discount?: { job: Job; percent: number }
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
  },
  'sector-trip': {
    id: 'sector-trip', title: 'Экскурсия в дальний сектор',
    description: 'Знакомство с другой частью корабля.',
    category: 'travel', oneTimeCost: 240, annualCost: 0,
    discount: { job: 'Координатор', percent: 25 },
    minAge: 18, attention: 1, type: 'unique',
    opens: ['Факт посещения выбранного сектора и память о нём.'],
    effects: { stats: { knowledge: 1 }, sectorVisit: true },
    requirements: (g: GameState) => availableSectorOptions(g).length === 0
      ? 'Нет доступных для посещения секторов.'
      : null
  },
  'family-trip': {
    id: 'family-trip', title: 'Неделя вместе на обзорной палубе',
    description: 'Совместная поездка с близкими людьми.',
    category: 'family', oneTimeCost: 320, annualCost: 0,
    minAge: 20, attention: 1, type: 'repeatable',
    opens: ['Общая память о неделе вместе; флаг familyTrip для будущих отсылок.'],
    effects: { familyTripBond: 2 },
    requirements: (g: GameState) => {
      if (familyTripParticipants(g).length < 2) return 'Нужно не менее двух известных близких людей.'
      const previous = g.economy.lastBought['family-trip']
      if (previous !== undefined && g.age - previous < 5) {
        const remaining = 5 - (g.age - previous)
        return `Следующая совместная поездка доступна через ${remaining} ${remaining === 1 ? 'год' : remaining < 5 ? 'года' : 'лет'}.`
      }
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
  /** Только для сюжетной покупки: обычная цена героя без сюжетной скидки. */
  regularCost?: number
  sectorOptions?: SectorOption[]
  familyParticipants?: FamilyParticipantOption[]
}

export interface PurchaseTarget {
  sectorId?: SectorId
  participantIds?: string[]
}

export interface SectorOption {
  id: SectorId
  name: string
  deck: string
}

export interface FamilyParticipantOption {
  id: string
  name: string
  role: string
  bond: number
}

const sectorVisitPrefix = 'visit-sector-'
const sectorVisitKey = (id: SectorId) => `${sectorVisitPrefix}${id}`

export function availableSectorOptions(g: GameState): SectorOption[] {
  const visitedCount = Object.keys(g.economy.owned).filter(id => id.startsWith(sectorVisitPrefix)).length
  if (visitedCount >= 4) return []

  const home = residenceOf(g)
  return sectors
    .filter(sector => sector.id !== home && g.economy.owned[sectorVisitKey(sector.id)] === undefined)
    .map(({ id, name, deck }) => ({ id, name, deck }))
}

export function familyTripParticipants(g: GameState): FamilyParticipantOption[] {
  return g.people
    .filter(person => isKnown(g, person.id) && person.bond >= 50)
    .map(({ id, name, role, bond }) => ({ id, name, role, bond }))
}

const sectorIds = new Set<SectorId>(sectors.map(sector => sector.id))

export const getOffer = (id: string): OfferDefinition | undefined =>
  Object.prototype.hasOwnProperty.call(OFFERS, id) ? OFFERS[id as OfferId] : undefined

const validHousingReturn = (g: GameState) =>
  g.economy.housing === 0 && g.economy.housingRight?.tier === 1 && g.economy.housingRight.until >= g.age

/** Applies catalogued state mutations to a caller-owned copy; stat effects use engine.applyEffects(). */
export function applyOfferChanges(g: GameState, offer: OfferDefinition, target?: PurchaseTarget) {
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
  if (effects.sectorVisit && target?.sectorId) {
    // Keep visit facts in the kebab-case economic collection so they survive repair/save.
    g.economy.owned[sectorVisitKey(target.sectorId)] = g.age
  }
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

/**
 * Покупка из сюжетного решения (T7): проверяется внутри ожидающего решения, поэтому запрет «сначала завершите
 * решение» к ней не относится. `price` — сюжетная цена; она действует, только если ниже обычной цены героя.
 */
export interface StoryPurchaseContext {
  story: true
  price?: number
}

/** Сюжетная цена не может поднять цену и не меняет каталог: берётся меньшая из двух. */
export const storyPriceOf = (regular: number, price?: number) =>
  price !== undefined && Number.isSafeInteger(price) && price >= 0 ? Math.min(regular, price) : regular

/** Pure availability check. The hypothetical next-year settlement runs on a clone and consumes no RNG. */
export function canBuy(g: GameState, offerId: string, target?: PurchaseTarget, story?: StoryPurchaseContext): PurchaseAvailability {
  const offer = getOffer(offerId)
  if (!offer) return { offerId, available: false, oneTimeCost: 0, annualCost: 0, attention: 0, reason: 'Такого предложения нет.', warnings: [], opens: [], action: 'purchase' }

  const restore = offer.id === 'own-cabin' && validHousingReturn(g)
  const action = restore ? 'restore' : 'purchase'
  const regularCost = restore ? 0 : offer.discount?.job === g.protagonist.job
    ? Math.round(offer.oneTimeCost * (100 - offer.discount.percent) / 100)
    : offer.oneTimeCost
  const oneTimeCost = story ? storyPriceOf(regularCost, story.price) : regularCost
  const annualCost = offer.freeFor === g.protagonist.job ? 0 : offer.annualCost
  const sectorOptions = offer.id === 'sector-trip' ? availableSectorOptions(g) : undefined
  const familyParticipants = offer.id === 'family-trip' ? familyTripParticipants(g) : undefined
  let reason: string | null = null

  if (g.stopped || g.economy.estate !== null) reason = 'Персонаж умер.'
  else if (g.pending && !story) reason = 'Сначала завершите ожидающее сюжетное решение.'
  else if (g.age < offer.minAge) reason = `Доступно с ${offer.minAge} лет.`
  else if (offer.maxAge !== undefined && g.age > offer.maxAge) reason = `Доступно до ${offer.maxAge} лет включительно.`
  else {
    reason = offer.requirements(g)
    if (!reason && offer.id === 'sector-trip') {
      const sectorId = target?.sectorId
      if (!sectorId) reason = sectorOptions!.length ? 'Выберите сектор для экскурсии.' : 'Нет доступных для посещения секторов.'
      else if (!sectorIds.has(sectorId)) reason = 'Выбран неизвестный сектор.'
      else if (sectorId === residenceOf(g)) reason = 'Нельзя посетить собственный текущий сектор.'
      else if (g.economy.owned[sectorVisitKey(sectorId)] !== undefined) reason = 'Этот сектор уже посещён.'
    }
    if (!reason && offer.id === 'family-trip') {
      const participantIds = target?.participantIds
      if (!Array.isArray(participantIds)) reason = 'Выберите двух или трёх близких участников.'
      else if (participantIds.length < 2) reason = 'Для поездки нужно выбрать не менее двух участников.'
      else if (participantIds.length > 3) reason = 'В поездку можно взять не более трёх участников.'
      else if (new Set(participantIds).size !== participantIds.length) reason = 'Список участников содержит повторы.'
      else {
        for (const id of participantIds) {
          const person = g.people.find(candidate => candidate.id === id)
          if (!person) { reason = `Человек «${id}» не известен герою.`; break }
          if (!isKnown(g, id)) { reason = `${person.name} не жив или ещё не знаком герою.`; break }
          if (person.bond < 50) { reason = `${person.name} пока не считается близким человеком.`; break }
        }
      }
    }
  }

  if (!reason && g.attention < offer.attention) reason = `Не хватает ${offer.attention - g.attention} единицы внимания.`
  if (!reason && g.economy.balance < oneTimeCost) reason = `Не хватает ${oneTimeCost - g.economy.balance} кр.`

  return {
    offerId, available: reason === null, oneTimeCost, annualCost, attention: offer.attention,
    reason, warnings: reason === null ? projectedWarnings(g, offer, oneTimeCost, action) : [],
    opens: [...offer.opens], action,
    ...(story ? { regularCost } : {}),
    ...(sectorOptions ? { sectorOptions } : {}),
    ...(familyParticipants ? { familyParticipants } : {})
  }
}

export const isClosedByShipState = closedByShipState
