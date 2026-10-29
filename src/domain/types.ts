import type { Economy } from './economy'
import type { Director, Tone } from './director'
import type { PersonalTimeYear } from './personalTime'

export type Focus = 'study' | 'relationships' | 'work' | 'rest' | 'civic'
export type Stat = 'health' | 'morale' | 'stress' | 'knowledge' | 'bonds' | 'reputation'
export type ShipStat = 'air' | 'food' | 'cohesion' | 'hull'
export type Skill = 'engineering' | 'medicine' | 'ecology' | 'social'
export type LogKind = 'life' | 'ship' | 'choice' | 'moment' | 'memory' | 'notice' | 'ambient'
/** Грамматический род: по нему подбираются формы слов в текстах. */
export type Gender = 'm' | 'f'
export type Job = 'Ученик' | 'Техник' | 'Медик' | 'Агроном' | 'Координатор' | 'Без специальности'
export type Phase = 0 | 1 | 2 | 3
/** Атмосфера жизни: спокойная НФ, НФ с тайнами или тревожная НФ с жутковатыми сценами (без насилия). */
export type Atmosphere = 'calm' | 'mystery' | 'uncanny'
export type Wealth = 1 | 2 | 3 | 4 | 5
/** Объект в каюте, на который указывает момент (подсвечивается в сцене). */
export type SpotId = 'window' | 'door' | 'terminal' | 'parent' | 'table' | 'plant'
export type SectorId = 'atrium' | 'bio' | 'engineering' | 'clinic' | 'lower'
/** Люди, которых сюжеты могут добавить в жизнь героя. */
export type NewPersonId = 'child'

/** Жизненный этап ребёнка вычисляется по возрасту, а не хранится в сохранении. */
export type ChildLifeStage = 'early-childhood' | 'school-age' | 'youth' | 'adult'
export type PersonAvailability = 'available' | 'distant'
export type PersonFamilyStatus = 'unknown' | 'single' | 'family'
export interface PersonState {
  sectorId?: SectorId
  job?: Job
  availability?: PersonAvailability
  familyStatus?: PersonFamilyStatus
}

/** Присутствует только после явного перехода к новой модели отношений. */
export interface Relationships {
  partnerId: string | null
  formerPartnerIds: string[]
  /** Явный разрыв завершил старую открытую линию, не меняя её исторические флаги. */
  friendLoveClosed?: boolean
}

export interface Person {
  id: string
  name: string
  role: string
  /** Нет поля (старое сохранение) — определяется по имени. */
  gender?: Gender
  bond: number
  age: number
  alive: boolean
  /** Возраст героя, с которого этот человек появляется в его жизни. */
  since: number
  state?: PersonState
}

/** Ровесник: родился в тот же год, живёт упрощённой параллельной жизнью. */
export interface Peer {
  id: string
  name: string
  sectorId: SectorId
  wealth: Wealth
  job: Job | null
  alive: boolean
  diedAt: number | null
}

export interface Birth {
  certNo: string
  sectorId: SectorId
  sectorName: string
  deck: string
  wealth: Wealth
  parentJobs: [string, string]
  parentAges: [number, number]
  healthNote: string
  lifeExpectancy: number
  infantRisk: number
  birthsThisYear: number
  sectorBirths: number
  sectorShare: number
  wealthShare: number
  births: Record<SectorId, number>
}

export interface LogEntry {
  id: number
  age: number
  shipYear: number
  kind: LogKind
  title: string
  text: string
}

export interface Effects {
  /** Signed story money effect, integer credits in [-1500, 1500]. */
  money?: number
  stats?: Partial<Record<Stat, number>>
  ship?: Partial<Record<ShipStat, number>>
  skills?: Partial<Record<Skill, number>>
  bonds?: Record<string, number>
  flags?: Record<string, string | number | boolean>
  job?: Job | 'Переобучение'
  memory?: string
  /** В жизни героя появляется человек: сейчас только ребёнок (`child`). Повторный эффект ничего не меняет. */
  addPerson?: NewPersonId | { slot: string; role: string }
  person?: Record<string, PersonState>
  relationship?: { action: 'start'; person: string } | { action: 'end' }
  cohabit?: 'hero' | 'partner' | 'apart'
  /** Герой переезжает в другой сектор. */
  /** Сектор или 'partner' — сектор близкого человека (не совпадает с нынешним домом). */
  moveTo?: SectorId | 'partner'
}

/** Каталожные позиции, которые сюжетный выбор может купить по-настоящему (T7). */
export type StoryPurchaseOffer = 'course-pro' | 'family-trip'

/**
 * Сюжетный выбор совершает настоящую покупку каталога: те же проверки и последствия, что в `purchase()`.
 * `price` — сюжетная цена (скидка): применяется, только если она ниже обычной цены для героя; каталог не меняется.
 */
export interface StoryPurchase {
  offer: StoryPurchaseOffer
  price?: number
}

export interface ChoiceDef {
  historicalPeople?: string[]
  /** Stable semantic ID. Omitted only by legacy content. */
  id?: string
  available?: (g: GameState) => boolean
  resultVariants?: TextVariant[]
  epilogue?: string
  text: string
  hint: string
  result: string
  effects: Effects
  purchase?: StoryPurchase
  check?: {
    skill: Skill
    difficulty: number
    successText: string
    failureText: string
    successVariants?: TextVariant[]
    failureVariants?: TextVariant[]
    success: Effects
    failure: Effects
  }
}

/**
 * Очерёдность сюжета в выборе директора (не путать с `weight`: вес — вероятность среди равных по очерёдности).
 *  - normal: обычное событие, выбирается по весу после проверок ритма;
 *  - followup: продолжение начатой линии, идёт раньше обычных, но уважает ритм (интервал и бюджет напряжения);
 *  - critical: обязательное и по сроку «обещанное»: не ждёт бюджета напряжения и не бросает кубик «тихого года».
 * Последний год окна (см. `expiresIn`, `max`) поднимает followup до critical и снимает даже минимальный интервал.
 */
export type Priority = 'normal' | 'followup' | 'critical'

export interface TextVariant {
  text: string
  available: (g: GameState) => boolean
}

export interface DecisionRecord {
  id: string
  choice: string
  age: number
  /** Rendered snapshot at decision time, never regenerated from later NPC state. */
  epilogue?: string
  /** Explicitly positional compatibility record, forbidden as a chose reference. */
  legacy?: true
}

export interface Storylet {
  historicalPeople?: string[]
  bodyVariants?: TextVariant[]
  tone?: Tone
  tags?: string[]
  group?: string
  id: string
  /** Сюжетная линия: решения одной линии собираются в «развилку». */
  arc?: string
  /** Решение открывает линию (в «Развилках» это начало). */
  fork?: boolean
  /** Нужна атмосфера: 1 — тайны, 2 — тревожные сцены. Без поля показывается всегда. */
  weird?: 1 | 2
  category: string
  title: string
  body: string
  min: number
  max: number
  /** Вероятность выбора среди событий с той же очерёдностью. */
  weight: number
  /** Нет поля — normal. */
  priority?: Priority
  /** Сколько лет ещё можно показать сюжет (0 — это последний год). Нет поля — ограничен только `max`. */
  expiresIn?: (g: GameState) => number
  available: (g: GameState) => boolean
  choices: ChoiceDef[]
}

/** Небольшая возможность внутри года: не останавливает время, принять её стоит единицу личного времени. */
export interface MomentDef {
  historicalPeople?: string[]
  textVariants?: TextVariant[]
  id: string
  spot: SpotId
  title: string
  text: string
  min: number
  max: number
  weight: number
  weird?: 1 | 2
  /** Через сколько лет момент может повториться; `Infinity` — только один раз. */
  cooldown: number
  /** id людей, которые должны быть живы. */
  needs?: string[]
  available?: (g: GameState) => boolean
  accept: { label: string; result: string; resultVariants?: TextVariant[]; effects: Effects }
  skip: { label: string; effects?: Effects }
}

/** Развилка жизни: что выбрал герой и к чему это привело годы спустя. */
export interface Fork {
  arc: string
  title: string
  age: number
  chosen: string
  others: string[]
  outcomes: { age: number; title: string; chosen: string }[]
}

export interface GameState {
  economy: Economy
  schemaVersion: 2
  atmosphere: Atmosphere
  seed: number
  rng: number
  age: number
  shipYear: number
  /** Сколько отметок года уже прошло (0–3): год делится на четыре равные части. */
  phase: Phase
  /** Остаток личного времени на текущий год (имя поля сохранено для совместимости сохранений). */
  attention: number
  /** Лимит личного времени этого года и его основание: фиксируются при смене года (T9). */
  timeYear: PersonalTimeYear
  /** id активного момента или null. */
  moment: string | null
  /** Возраст, в котором момент появлялся в последний раз. */
  momentLog: Record<string, number>
  /** Настроение по годам жизни (индекс — возраст), для карты жизни. */
  moodByAge: number[]
  stopped: boolean
  causeOfDeath: string | null
  /** `gender` может отсутствовать в старых сохранениях: тогда он выводится из seed. */
  protagonist: { name: string; origin: string; trait: string; job: Job; gender?: Gender }
  birth: Birth
  /** Сектор, где герой живёт сейчас. Нет поля — всё ещё сектор рождения. */
  residence?: SectorId
  stats: Record<Stat, number>
  skills: Record<Skill, number>
  ship: Record<ShipStat, number>
  focus: Focus
  people: Person[]
  relationships?: Relationships
  peers: Peer[]
  flags: Record<string, string | number | boolean>
  memories: string[]
  seen: string[]
  decisions: DecisionRecord[]
  pending: string | null
  history: LogEntry[]
  forks: Fork[]
  /** Состояние директора повествования: ритм решений и напряжение. */
  director: Director
  nextLogId: number
}
