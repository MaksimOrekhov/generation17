import type { ChildLifeStage, GameState, Person, Relationships } from './types'
import { hash32 } from './random'
import slots from '../../content/people.json'
import roles from '../../content/person-roles.json'

export const STORY_PERSON_SLOTS: readonly string[] = slots.map(slot => slot.id)
export const STORY_PERSON_ROLES: Readonly<Record<string, string>> = roles

/** Границы применимы и к историческому возрасту умершего человека. */
export function childLifeStage(age: number): ChildLifeStage {
  if (!Number.isInteger(age) || age < 0) throw new RangeError('Invalid child age')
  if (age < 7) return 'early-childhood'
  if (age < 15) return 'school-age'
  if (age < 26) return 'youth'
  return 'adult'
}

const legacyActive = new Set(['together', 'moved-together', 'held', 'reunited', 'apart'])
const legacyEnded = new Set(['parted'])

/** Старые флаги остаются источником истины до явного перехода на новую модель. */
export function relationshipState(g: GameState): Relationships {
  if (g.relationships) return g.relationships
  const friend = g.people.find(p => p.id === 'friend' && p.since <= g.age)
  const stage = String(g.flags.loveStage ?? '')
  const establishedCohabitation = g.flags.livingTogether === true && ['together', 'moved-together', 'held', 'reunited'].includes(stage)
  if (!friend || g.flags.lovePath !== 'confessed' && !establishedCohabitation) return { partnerId: null, formerPartnerIds: [] }
  if (legacyActive.has(stage)) return friend.alive
    ? { partnerId: friend.id, formerPartnerIds: [] }
    : { partnerId: null, formerPartnerIds: [friend.id] }
  return { partnerId: null, formerPartnerIds: legacyEnded.has(stage) ? [friend.id] : [] }
}

export function currentPartner(g: GameState): Person | undefined {
  const id = relationshipState(g).partnerId
  return id ? g.people.find(p => p.id === id && p.alive && p.since <= g.age) : undefined
}

/** Незавершённая старая линия не резервирует отношения после смерти или разрыва. */
export function friendRomancePending(g: GameState): boolean {
  const friend = g.people.find(p => p.id === 'friend' && p.alive && p.since <= g.age)
  return !!friend && g.flags.lovePath === 'confessed' && (!g.flags.loveStage
    || g.flags.loveStage === 'open' && !g.relationships?.friendLoveClosed)
}

/** Различаем активное продолжение, неопределённую романтику и историческую встречу. */
export function friendLoveCompatible(g: GameState, eventId: string): boolean {
  const partnerId = relationshipState(g).partnerId
  if (['relationship', 'relationship-followup', 'love-home-offer', 'love-apart-return', 'love-drift', 'love-missed', 'love-friends-union'].includes(eventId)
      && !g.people.some(p => p.id === 'friend' && p.alive && p.state?.availability !== 'distant' && p.since <= g.age)) return false
  if (eventId === 'relationship') return !partnerId
  if (eventId === 'love-home-offer' || eventId === 'love-apart-return') return !g.relationships || partnerId === 'friend'
  if (eventId === 'relationship-followup' || eventId === 'love-missed') return !partnerId
  if (eventId === 'love-drift') return (!partnerId || partnerId === 'friend') && !g.relationships?.friendLoveClosed
  if (eventId === 'love-friends-union') return partnerId !== 'friend'
  return true
}

/** Контент использует имена слотов, а состояние хранит ID конкретного человека. */
export function personByRef(g: Pick<GameState, 'people' | 'age' | 'flags' | 'relationships'>, ref: string): Person | undefined {
  if (ref === 'partner') return currentPartner(g as GameState)
  if (ref === 'formerPartner') {
    const id = relationshipState(g as GameState).formerPartnerIds.at(-1)
    return g.people.find(p => p.id === id)
  }
  return g.people.find(p => p.id === (STORY_PERSON_SLOTS.includes(ref) ? `story-${ref}` : ref))
}

/** Один объявленный слот; свойства выбираются независимо от общего RNG. */
export function createStoryPerson(g: GameState, slot: string, role: string): Person {
  if (!STORY_PERSON_SLOTS.includes(slot) || !Object.hasOwn(STORY_PERSON_ROLES, role)) throw new Error('Unknown person slot or role')
  const existing = personByRef(g, slot)
  if (existing) return existing
  const names = [{ name: 'Ника', gender: 'f' }, { name: 'Эмма', gender: 'f' }, { name: 'Марк', gender: 'm' }, { name: 'Тео', gender: 'm' }] as const
  const unused = names.filter(n => !g.people.some(p => p.name.split(' ')[0] === n.name))
  const pool = unused.length ? unused : names
  const selected = pool[hash32('story-person-name', g.seed, slot) % pool.length]!
  const sectors = ['atrium', 'bio', 'engineering', 'clinic', 'lower'] as const
  const person: Person = {
    id: `story-${slot}`, name: selected.name, gender: selected.gender,
    role: STORY_PERSON_ROLES[role]!, age: g.age, since: g.age,
    alive: true, bond: 45, state: { sectorId: sectors[hash32('story-person-sector', g.seed, slot) % sectors.length], availability: 'available' }
  }
  g.people.push(person)
  return person
}

/** Начало отношений требует живого известного человека и не заменяет действующего партнёра. */
export function beginRelationship(g: GameState, id: string): boolean {
  const person = g.people.find(p => p.id === id && p.alive && p.since <= g.age)
  const previous = relationshipState(g)
  if (!person || person.state?.availability === 'distant' || g.age < 18 || person.age < 18 || previous.partnerId && previous.partnerId !== id || id !== 'friend' && friendRomancePending(g)) return false
  g.relationships = { ...previous, partnerId: id, formerPartnerIds: previous.formerPartnerIds.filter(old => old !== id) }
  return true
}

/** Разрыв сохраняет личность и прошлые отношения. */
export function endRelationship(g: GameState): boolean {
  const previous = relationshipState(g)
  if (!previous.partnerId) return false
  g.relationships = { ...previous, partnerId: null, formerPartnerIds: [...new Set([...previous.formerPartnerIds, previous.partnerId])],
    ...(previous.partnerId === 'friend' && g.flags.lovePath === 'confessed' && g.flags.loveStage === 'open' ? { friendLoveClosed: true } : {}) }
  g.flags.livingTogether = false
  return true
}
