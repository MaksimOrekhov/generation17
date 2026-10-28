import type { ChoiceDef, Effects, Job, SectorId, SpotId, Stat } from '../domain/types'

type FlagValue = string | number | boolean

/** Декларативное условие показа. Все заданные поля должны выполняться одновременно. */
export interface Requires {
  /** Флаги, которые должны быть заданы (не пустое значение). */
  flag?: string[]
  /** Флаги, которых быть не должно. */
  flagNot?: string[]
  /** Флаг равен значению (или одному из списка). Сравнение по строке, как в `is()` у кода. */
  flagIs?: Record<string, FlagValue | FlagValue[]>
  /** Числовой флаг (возраст, записанный через "@age") и прошло не меньше N лет. */
  since?: Record<string, number>
  /** Числовой флаг-возраст и прошло не более N лет (вместе с `since` задаёт окно «от и до»). */
  until?: Record<string, number>
  /** Возраст человека (id: parent, child, ...) в границах; человек должен существовать. */
  personAge?: Record<string, { min?: number; max?: number }>
  /** Профессия героя — одна из списка. */
  job?: Job[]
  /** Эти люди должны быть живы (id: parent, friend, neighbor, mentor, sibling). */
  alive?: string[]
  /** Герой сейчас живёт в одном из этих секторов. */
  sector?: SectorId[]
  /** Герой сейчас живёт не в этих секторах. */
  sectorNot?: SectorId[]
  /** Границы показателей героя. */
  stat?: Partial<Record<Stat, { min?: number; max?: number }>>
}

export type JsonChoice = ChoiceDef

export interface JsonStorylet {
  id: string
  category: string
  title: string
  body: string
  min: number
  max: number
  weight: number
  arc?: string
  fork?: boolean
  weird?: 1 | 2
  requires?: Requires
  choices: JsonChoice[]
}

export interface JsonMoment {
  id: string
  spot: SpotId
  title: string
  text: string
  min: number
  max: number
  weight: number
  /** Через сколько лет момент может повториться; `null` — только один раз. */
  cooldown: number | null
  weird?: 1 | 2
  needs?: string[]
  requires?: Requires
  accept: { label: string; result: string; effects: Effects }
  skip: { label: string; effects?: Effects }
}

export interface ContentBundle {
  storylets: JsonStorylet[]
  moments: JsonMoment[]
}
