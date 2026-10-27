import type { Director } from './director'

export type Focus = 'study' | 'relationships' | 'work' | 'rest' | 'civic'
export type Stat = 'health' | 'morale' | 'stress' | 'knowledge' | 'bonds' | 'reputation'
export type ShipStat = 'air' | 'food' | 'cohesion' | 'hull'
export type Skill = 'engineering' | 'medicine' | 'ecology' | 'social'
export type LogKind = 'life' | 'ship' | 'choice' | 'moment' | 'memory' | 'notice' | 'ambient'
export type Job = 'Ученик' | 'Техник' | 'Медик' | 'Агроном' | 'Координатор' | 'Без специальности'
export type Season = 0 | 1 | 2 | 3
/** Атмосфера жизни: спокойная НФ, НФ с тайнами или тревожная НФ с жутковатыми сценами (без насилия). */
export type Atmosphere = 'calm' | 'mystery' | 'uncanny'
export type Wealth = 1 | 2 | 3 | 4 | 5
/** Объект в каюте, на который указывает момент (подсвечивается в сцене). */
export type SpotId = 'window' | 'door' | 'terminal' | 'parent' | 'table' | 'plant'
export type SectorId = 'atrium' | 'bio' | 'engineering' | 'clinic' | 'lower'

export interface Person {
  id: string
  name: string
  role: string
  bond: number
  age: number
  alive: boolean
  /** Возраст героя, с которого этот человек появляется в его жизни. */
  since: number
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
  stats?: Partial<Record<Stat, number>>
  ship?: Partial<Record<ShipStat, number>>
  skills?: Partial<Record<Skill, number>>
  bonds?: Record<string, number>
  flags?: Record<string, string | number | boolean>
  job?: Job | 'Переобучение'
  memory?: string
}

export interface ChoiceDef {
  text: string
  hint: string
  result: string
  effects: Effects
  check?: {
    skill: Skill
    difficulty: number
    successText: string
    failureText: string
    success: Effects
    failure: Effects
  }
}

export interface Storylet {
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
  weight: number
  available: (g: GameState) => boolean
  choices: ChoiceDef[]
}

/** Небольшая возможность внутри года: не останавливает время, стоит единицу внимания. */
export interface MomentDef {
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
  accept: { label: string; result: string; effects: Effects }
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
  schemaVersion: 2
  atmosphere: Atmosphere
  seed: number
  rng: number
  age: number
  shipYear: number
  /** Сколько «сезонных» отметок года уже прошло (0–3). */
  season: Season
  /** Свободное внимание на текущий год. */
  attention: number
  /** id активного момента или null. */
  moment: string | null
  /** Возраст, в котором момент появлялся в последний раз. */
  momentLog: Record<string, number>
  /** Настроение по годам жизни (индекс — возраст), для карты жизни. */
  moodByAge: number[]
  stopped: boolean
  causeOfDeath: string | null
  protagonist: { name: string; origin: string; trait: string; job: Job }
  birth: Birth
  stats: Record<Stat, number>
  skills: Record<Skill, number>
  ship: Record<ShipStat, number>
  focus: Focus
  people: Person[]
  peers: Peer[]
  flags: Record<string, string | number | boolean>
  memories: string[]
  seen: string[]
  pending: string | null
  history: LogEntry[]
  forks: Fork[]
  /** Состояние директора повествования: ритм решений и напряжение. */
  director: Director
  nextLogId: number
}
