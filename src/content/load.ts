import { isKnown, residenceOf } from '../domain/birth'
import { gYearPlaceholder } from '../domain/constants'
import { reserveYearsOf } from '../domain/economy'
import { isClosedByShipState } from '../domain/offers'
import { safePeople } from '../domain/contentPeople'
import { childLifeStage, personByRef, STORY_PERSON_SLOTS } from '../domain/people'
import type { ChoiceDef, Effects, GameState, MomentDef, Storylet, TextVariant } from '../domain/types'
import type { ContentBundle, JsonChoice, JsonMoment, JsonStorylet, JsonTextVariant, Requires } from './types'

/** В JSON возраст героя пишется как "@age"; движок знает его как gYearPlaceholder. */
export const AGE_TOKEN = '@age'

export const MAX_REQUIRES_DEPTH = 8

export function compileRequires(r?: Requires, depth = 0): (g: GameState) => boolean {
  if (depth > MAX_REQUIRES_DEPTH) throw new Error("requires depth exceeds 8")
  if (!r) return () => true
  const alternatives = r.any?.map(child => compileRequires(child, depth + 1))
  const inRange = (value: number, range: { min?: number; max?: number }) =>
    (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max)
  const fields = {
    personAge: Object.entries(r.personAge ?? {}),
    since: Object.entries(r.since ?? {}),
    until: Object.entries(r.until ?? {}),
    bond: Object.entries(r.bond ?? {}),
    skill: Object.entries(r.skill ?? {}),
    ship: Object.entries(r.ship ?? {}),
    stat: Object.entries(r.stat ?? {}),
    ownedYears: Object.entries(r.ownedYears ?? {}),
    flagIs: Object.entries(r.flagIs ?? {}).map(([key, value]) => [key, new Set((Array.isArray(value) ? value : [value]).map(String))] as const),
    flagNotIs: Object.entries(r.flagNotIs ?? {}).map(([key, value]) => [key, new Set((Array.isArray(value) ? value : [value]).map(String))] as const)
  }
  const decisions = new Set([...Object.keys(r.chose ?? {}), ...Object.keys(r.decisionYears ?? {})])
  return g => {
    if (r.focus && !r.focus.includes(g.focus)) return false
    for (const [ref, state] of Object.entries(r.person ?? {})) {
      const person = personByRef(g, ref)
      if (!person || !person.alive || person.since > g.age || Object.entries(state).some(([key, value]) => person.state?.[key as keyof typeof person.state] !== value)) return false
    }
    if (r.childStage) {
      const child = personByRef(g, 'child')
      if (!child || !child.alive || !r.childStage.includes(childLifeStage(child.age))) return false
    }
    if (alternatives && !alternatives.some(test => test(g))) return false
    if (r.seen?.some(id => !g.seen.includes(id))) return false
    if (r.notSeen?.some(id => g.seen.includes(id))) return false
    for (const id of decisions) {
      if (!(g.decisions ?? []).some(d => d.id === id
        && (!r.chose?.[id] || !d.legacy && r.chose[id]!.includes(d.choice))
        && (!r.decisionYears?.[id] || inRange(g.age - d.age, r.decisionYears[id]!)))) return false
    }
    for (const id of r.dead ?? []) { const p = personByRef(g, id); if (!p || p.alive || p.since > g.age) return false }
    for (const id of r.exists ?? []) { const p = personByRef(g, id); if (!p || p.since > g.age) return false }
    if (r.absent?.some(id => isKnown(g, id))) return false
    for (const [id, range] of fields.bond) {
      const person = personByRef(g, id)
      if (!person || person.since > g.age || !inRange(person.bond, range)) return false
    }
    for (const [id, range] of fields.skill) if (!inRange(g.skills[id as keyof GameState['skills']], range)) return false
    for (const [id, range] of fields.ship) if (!inRange(g.ship[id as keyof GameState['ship']], range)) return false
    if (r.birthWealth && !inRange(g.birth.wealth, r.birthWealth)) return false
    if (r.trait && !r.trait.includes(g.protagonist.trait)) return false
    for (const k of r.flag ?? []) if (!g.flags[k]) return false
    for (const k of r.flagNot ?? []) if (g.flags[k]) return false
    for (const [k, v] of fields.flagIs) {
      if (!v.has(String(g.flags[k]))) return false
    }
    for (const [k, v] of fields.flagNotIs) {
      if (g.flags[k] !== undefined && v.has(String(g.flags[k]))) return false
    }
    for (const [k, years] of fields.since) {
      const at = g.flags[k]
      if (typeof at !== 'number' || g.age < at + years) return false
    }
    for (const [k, years] of fields.until) {
      const at = g.flags[k]
      if (typeof at !== 'number' || g.age > at + years) return false
    }
    for (const [id, range] of fields.personAge) {
      const person = personByRef(g, id)
      if (!person) return false
      if (range.min !== undefined && person.age < range.min) return false
      if (range.max !== undefined && person.age > range.max) return false
    }
    if (r.job && !r.job.includes(g.protagonist.job)) return false
    const home = residenceOf(g)
    if (r.sector && !r.sector.includes(home)) return false
    if (r.sectorNot?.includes(home)) return false
    for (const id of r.alive ?? []) if (!personByRef(g, id)?.alive) return false
    for (const id of r.present ?? []) if (!isKnown(g, id)) return false
    for (const [stat, range] of fields.stat) {
      const value = g.stats[stat as keyof GameState['stats']]
      if (range.min !== undefined && value < range.min) return false
      if (range.max !== undefined && value > range.max) return false
    }
    if (r.money && !inRange(g.economy.balance, r.money)) return false
    if (r.work && !r.work.includes(g.economy.work.kind)) return false
    if (r.regime && !(r.regime as string[]).includes(g.timeYear?.basis)) return false
    if (r.grade && !inRange(g.economy.work.grade, r.grade)) return false
    if (r.housing && !inRange(g.economy.housing, r.housing)) return false
    const owns = (id: string) => Object.hasOwn(g.economy.owned, id) || Object.hasOwn(g.economy.services, id)
    if (r.owns?.some(id => !owns(id))) return false
    if (r.ownsNot?.some(owns)) return false
    for (const [id, range] of fields.ownedYears) {
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

/** Historical mentions must be explicitly guarded, including through every OR branch. */
export function historicalPeople(r?: Requires, depth = 0): string[] {
  if (depth > MAX_REQUIRES_DEPTH) throw new Error('requires depth exceeds 8')
  const own = [...(r?.exists ?? []), ...(r?.dead ?? [])]
  const branches = r?.any?.map(child => historicalPeople(child, depth + 1))
  return [...new Set([...own, ...(branches?.length ? branches[0]!.filter(id => branches.every(b => b.includes(id))) : [])])]
}

export function compileVariants(variants?: JsonTextVariant[], inherited: string[] = []): TextVariant[] | undefined {
  return variants?.map(v => {
    const test = compileRequires(v.requires), historical = [...inherited, ...historicalPeople(v.requires)]
    return { text: v.text, available: g => test(g) && safePeople(g, v.text, historical) }
  })
}

export function variantText(g: GameState, fallback: string, variants?: TextVariant[]): string {
  return variants?.find(v => v.available(g))?.text ?? fallback
}

export function textSafe(g: GameState, fallback: string, variants?: TextVariant[], historical: string[] = []): boolean {
  return !!variants?.some(v => v.available(g)) || safePeople(g, fallback, historical)
}

function compileChoice(c: JsonChoice, inherited: string[] = []): ChoiceDef {
  const { requires, resultVariants, check, ...rest } = c
  const historical = [...inherited, ...historicalPeople(requires)]
  const condition = compileRequires(requires)
  const compiledResult = compileVariants(resultVariants, historical)
  // The created person's name is rendered after addPerson; variant selection remains pre-effect.
  const added = c.effects.addPerson === 'child' ? 'child' : typeof c.effects.addPerson === 'object' && STORY_PERSON_SLOTS.includes(c.effects.addPerson.slot) ? c.effects.addPerson.slot : undefined
  const resultBase = added ? c.result.replace(new RegExp(`\\{\\{${added}(?::[^{}]*)?\\}\\}`, 'g'), '') : c.result
  const references = [c.text, c.hint, c.epilogue ?? '']
  return {
    ...rest,
    historicalPeople: historical,
    available: g => condition(g) && references.every(text => safePeople(g, text, historical)) && textSafe(g, resultBase, compiledResult, historical),
    ...(resultVariants ? { resultVariants: compiledResult } : {}),
    effects: compileEffects(c.effects)!,
    ...(check ? { check: { ...check,
      successVariants: compileVariants(check.successVariants, historical), failureVariants: compileVariants(check.failureVariants, historical),
      success: compileEffects(check.success)!, failure: compileEffects(check.failure)! } } : {})
  }
}

/** Years until an active flag/decision window closes; AND takes min, active OR takes max. */
export function compileExpiry(r?: Requires, depth = 0): ((g: GameState) => number) | undefined {
  if (depth > MAX_REQUIRES_DEPTH) throw new Error('requires depth exceeds 8')
  const entries = Object.entries(r?.until ?? {})
  const decisionWindows = Object.entries(r?.decisionYears ?? {}).filter(([, range]) => range.max !== undefined)
  const alternatives = r?.any?.map(branch => ({ test: compileRequires(branch), expiry: compileExpiry(branch, depth + 1) }))
  if (!entries.length && !decisionWindows.length && !alternatives?.some(branch => branch.expiry)) return undefined
  return g => {
    let left = Infinity
    for (const [key, years] of entries) if (typeof g.flags[key] === 'number') left = Math.min(left, (g.flags[key] as number) + years - g.age)
    for (const [id, range] of decisionWindows) {
      const record = g.decisions?.find(d => d.id === id && (!r?.chose?.[id] || !d.legacy && r.chose[id]!.includes(d.choice)))
      if (record) left = Math.min(left, record.age + range.max! - g.age)
    }
    if (alternatives) {
      const active = alternatives.filter(branch => branch.test(g))
      if (active.length) left = Math.min(left, Math.max(...active.map(branch => branch.expiry?.(g) ?? Infinity)))
    }
    return left
  }
}

export function compileStorylet(s: JsonStorylet): Storylet {
  const { requires, choices, bodyVariants, ...rest } = s
  const expiresIn = compileExpiry(requires)
  const historical = historicalPeople(requires)
  return { ...rest, historicalPeople: historical, bodyVariants: compileVariants(bodyVariants, historical), available: compileRequires(requires), ...(expiresIn ? { expiresIn } : {}), choices: choices.map(c => compileChoice(c, historical)) }
}

export function compileMoment(m: JsonMoment): MomentDef {
  const { requires, cooldown, accept, skip, textVariants, ...rest } = m
  return {
    ...rest,
    historicalPeople: historicalPeople(requires),
    cooldown: cooldown ?? Infinity,
    textVariants: compileVariants(textVariants, historicalPeople(requires)),
    ...(requires ? { available: compileRequires(requires) } : {}),
    accept: { ...accept, resultVariants: compileVariants(accept.resultVariants, historicalPeople(requires)), effects: compileEffects(accept.effects)! },
    skip: { ...skip, ...(skip.effects ? { effects: compileEffects(skip.effects) } : {}) }
  }
}

export function compileBundle(b: ContentBundle) {
  return { storylets: b.storylets.map(compileStorylet), moments: b.moments.map(compileMoment) }
}
