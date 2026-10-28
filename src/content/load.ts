import { isKnown, residenceOf } from '../domain/birth'
import { gYearPlaceholder } from '../domain/constants'
import { reserveYearsOf } from '../domain/economy'
import { isClosedByShipState } from '../domain/offers'
import type { Effects, GameState, MomentDef, Storylet } from '../domain/types'
import type { ContentBundle, JsonChoice, JsonMoment, JsonStorylet, Requires } from './types'

/** В JSON возраст героя пишется как "@age"; движок знает его как gYearPlaceholder. */
export const AGE_TOKEN = '@age'

export function compileRequires(r?: Requires): (g: GameState) => boolean {
  if (!r) return () => true
  return g => {
    for (const k of r.flag ?? []) if (!g.flags[k]) return false
    for (const k of r.flagNot ?? []) if (g.flags[k]) return false
    for (const [k, v] of Object.entries(r.flagIs ?? {})) {
      const allowed = (Array.isArray(v) ? v : [v]).map(String)
      if (!allowed.includes(String(g.flags[k]))) return false
    }
    for (const [k, v] of Object.entries(r.flagNotIs ?? {})) {
      const banned = (Array.isArray(v) ? v : [v]).map(String)
      if (g.flags[k] !== undefined && banned.includes(String(g.flags[k]))) return false
    }
    for (const [k, years] of Object.entries(r.since ?? {})) {
      const at = g.flags[k]
      if (typeof at !== 'number' || g.age < at + years) return false
    }
    for (const [k, years] of Object.entries(r.until ?? {})) {
      const at = g.flags[k]
      if (typeof at !== 'number' || g.age > at + years) return false
    }
    for (const [id, range] of Object.entries(r.personAge ?? {})) {
      const person = g.people.find(p => p.id === id)
      if (!person) return false
      if (range.min !== undefined && person.age < range.min) return false
      if (range.max !== undefined && person.age > range.max) return false
    }
    if (r.job && !r.job.includes(g.protagonist.job)) return false
    const home = residenceOf(g)
    if (r.sector && !r.sector.includes(home)) return false
    if (r.sectorNot?.includes(home)) return false
    for (const id of r.alive ?? []) if (!g.people.find(p => p.id === id)?.alive) return false
    for (const id of r.present ?? []) if (!isKnown(g, id)) return false
    for (const [stat, range] of Object.entries(r.stat ?? {})) {
      const value = g.stats[stat as keyof GameState['stats']]
      if (range.min !== undefined && value < range.min) return false
      if (range.max !== undefined && value > range.max) return false
    }
    const inRange = (value: number, range: { min?: number; max?: number }) =>
      (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max)
    if (r.money && !inRange(g.economy.balance, r.money)) return false
    if (r.work && !r.work.includes(g.economy.work.kind)) return false
    if (r.grade && !inRange(g.economy.work.grade, r.grade)) return false
    if (r.housing && !inRange(g.economy.housing, r.housing)) return false
    const owns = (id: string) => Object.hasOwn(g.economy.owned, id) || Object.hasOwn(g.economy.services, id)
    if (r.owns?.some(id => !owns(id))) return false
    if (r.ownsNot?.some(owns)) return false
    for (const [id, range] of Object.entries(r.ownedYears ?? {})) {
      const at = Object.hasOwn(g.economy.owned, id) ? g.economy.owned[id] : Object.hasOwn(g.economy.services, id) ? g.economy.services[id] : undefined
      if (at === undefined || !inRange(g.age - at, range)) return false
    }
    if (r.servicesOpen !== undefined && r.servicesOpen === isClosedByShipState(g)) return false
    if (r.reserveYears) {
      const years = reserveYearsOf(g)
      if (years === null ? r.reserveYears.max !== undefined : !inRange(years, r.reserveYears)) return false
    }
    return true
  }
}

function compileEffects(e?: Effects): Effects | undefined {
  if (!e?.flags) return e
  const flags = Object.fromEntries(Object.entries(e.flags).map(([k, v]) => [k, v === AGE_TOKEN ? gYearPlaceholder : v]))
  return { ...e, flags }
}

function compileChoice(c: JsonChoice): JsonChoice {
  return {
    ...c,
    effects: compileEffects(c.effects)!,
    ...(c.check ? { check: { ...c.check, success: compileEffects(c.check.success)!, failure: compileEffects(c.check.failure)! } } : {})
  }
}

/** Сколько лет осталось до закрытия окна `until` (минимум по всем `until`); без `until` окна нет. */
export function compileExpiry(r?: Requires): ((g: GameState) => number) | undefined {
  const entries = Object.entries(r?.until ?? {})
  if (!entries.length) return undefined
  return g => Math.min(...entries.map(([k, years]) => (typeof g.flags[k] === 'number' ? (g.flags[k] as number) + years - g.age : Infinity)))
}

export function compileStorylet(s: JsonStorylet): Storylet {
  const { requires, choices, ...rest } = s
  const expiresIn = compileExpiry(requires)
  return { ...rest, available: compileRequires(requires), ...(expiresIn ? { expiresIn } : {}), choices: choices.map(compileChoice) }
}

export function compileMoment(m: JsonMoment): MomentDef {
  const { requires, cooldown, accept, skip, ...rest } = m
  return {
    ...rest,
    cooldown: cooldown ?? Infinity,
    ...(requires ? { available: compileRequires(requires) } : {}),
    accept: { ...accept, effects: compileEffects(accept.effects)! },
    skip: { ...skip, ...(skip.effects ? { effects: compileEffects(skip.effects) } : {}) }
  }
}

export function compileBundle(b: ContentBundle) {
  return { storylets: b.storylets.map(compileStorylet), moments: b.moments.map(compileMoment) }
}
