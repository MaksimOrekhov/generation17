import { describe, expect, it } from 'vitest'
import { canChoose, createGame, decide, decideById, familyTripFlag, purchase, resolveText, storyBody } from '../engine'
import { findInconsistencies } from '../invariants'
import { beginRelationship, childLifeStage, currentPartner, endRelationship, relationshipState } from '../people'
import { compileRequires } from '../../content/load'
import { repairSave } from '../save'
import { isKnown, residenceOf } from '../birth'
import { storylets } from '../storylets'
import { familyTripParticipants } from '../offers'
import { moneyWorker } from './t6-fixtures'

describe('child life stage', () => {
  it.each([
    [0, 'early-childhood'], [6, 'early-childhood'], [7, 'school-age'],
    [14, 'school-age'], [15, 'youth'], [25, 'youth'], [26, 'adult']
  ] as const)('maps age %i to %s', (age, stage) => {
    expect(childLifeStage(age)).toBe(stage)
  })

  it.each([-1, 1.5, NaN])('rejects invalid age %s', age => {
    expect(() => childLifeStage(age)).toThrow(RangeError)
  })
})

describe('new acquaintance story', () => {
  it('creates one deterministic person without advancing the RNG, and preserves identity after a breakup', () => {
    const start = createGame(9123)
    start.age = 25
    start.focus = 'relationships'
    start.pending = 'people-new-encounter'
    const met = decideById(start, 'meet')
    const again = decideById(start, 'meet')
    const person = met.people.find(p => p.id === 'story-acquaintance')!
    expect(person).toEqual(again.people.find(p => p.id === person.id))
    expect(met.rng).toBe(start.rng)
    expect(resolveText(met, '{{acquaintance}}')).toBe(person.name)
    expect(met.history[0]?.text).toContain(person.name)
    met.age++
    met.pending = 'people-new-choice'
    const together = decideById(met, 'romance')
    expect(currentPartner(together)?.id).toBe(person.id)
    expect(together.people.find(p => p.id === 'friend')).toBeDefined()
    together.age++
    together.pending = 'people-new-home'
    const home = decideById(together, 'partner-home')
    expect(home.flags.livingTogether).toBe(true)
    expect(residenceOf(home)).toBe(currentPartner(home)?.state?.sectorId)
    home.age += 3
    home.pending = 'people-new-crossroads'
    const parted = decideById(home, 'part')
    expect(currentPartner(parted)).toBeUndefined()
    expect(parted.relationships?.formerPartnerIds).toEqual([person.id])
    expect(resolveText(parted, '{{formerPartner}}')).toBe(person.name)
    expect(parted.people.filter(p => p.id === person.id)).toHaveLength(1)
    expect(repairSave(repairSave(parted).game).game).toEqual(repairSave(parted).game)
  })

  it('offers friendship and rejects a second partner', () => {
    const game = createGame(53)
    game.age = 30
    game.pending = 'people-new-encounter'
    const met = decideById(game, 'meet')
    met.people.find(p => p.id === 'friend')!.age = 30
    expect(beginRelationship(met, 'friend')).toBe(true)
    met.age++
    met.pending = 'people-new-choice'
    expect(canChoose(met, 0).available).toBe(false)
    const friends = decideById(met, 'friendship')
    expect(currentPartner(friends)?.id).toBe('friend')
  })

  it('checks known person state and rejects missing or dead people', () => {
    const game = createGame(53)
    game.age = 30
    const check = compileRequires({ person: { acquaintance: { availability: 'available' } } })
    expect(check(game)).toBe(false)
    game.pending = 'people-new-encounter'
    const met = decideById(game, 'meet')
    expect(check(met)).toBe(true)
    met.people.find(p => p.id === 'story-acquaintance')!.alive = false
    expect(check(met)).toBe(false)
  })

  it('ends cohabitation when an independent move leaves the partner behind', () => {
    const game = createGame(53)
    game.age = 30
    game.residence = 'clinic'
    game.pending = 'people-new-encounter'
    const met = decideById(game, 'meet')
    const person = met.people.find(p => p.id === 'story-acquaintance')!
    person.state!.sectorId = 'clinic'
    expect(beginRelationship(met, person.id)).toBe(true)
    met.flags.livingTogether = true
    met.pending = 'family-crossing-decks'
    const moved = decide(met, 0)
    expect(residenceOf(moved)).toBe('bio')
    expect(currentPartner(moved)?.state?.sectorId).toBe('clinic')
    expect(moved.flags.livingTogether).toBe(false)
  })

  it('repairs a deceased partner and offers a memory without treating the loss as a breakup', () => {
    const game = createGame(53)
    game.age = 30
    game.pending = 'people-new-encounter'
    const met = decideById(game, 'meet')
    met.age++
    met.pending = 'people-new-choice'
    const partnered = decideById(met, 'romance')
    partnered.flags.livingTogether = true
    partnered.people.find(p => p.id === 'story-acquaintance')!.alive = false
    const repaired = repairSave(partnered).game
    expect(repaired.flags.livingTogether).toBe(false)
    expect(repaired.relationships).toEqual({ partnerId: null, formerPartnerIds: ['story-acquaintance'] })
    repaired.age++
    const scene = storylets.find(s => s.id === 'people-new-crossroads')!
    expect(scene.available(repaired)).toBe(true)
    expect(storyBody(repaired, scene)).toContain('После ухода')
    repaired.pending = scene.id
    const remembered = decideById(repaired, 'remember')
    expect(remembered.flags.peopleCrossroads).toBe('lost')
    expect(remembered.people.find(p => p.id === 'story-acquaintance')?.alive).toBe(false)
  })

  it('uses actual child age and preserves a move for the later scene', () => {
    const game = createGame(1234)
    game.age = 34
    game.pending = 'family-a-life-ahead'
    const born = decide(game, 0)
    born.age = 60
    born.people.find(p => p.id === 'child')!.age = 26
    expect(compileRequires({ present: ['child'], childStage: ['adult'] })(born)).toBe(true)
    born.pending = 'people-child-independence'
    const dead = structuredClone(born)
    dead.people.find(p => p.id === 'child')!.alive = false
    expect(canChoose(dead, 0).available).toBe(false)
    expect(decideById(dead, 'move')).toEqual(dead)
    const moved = decideById(born, 'move')
    expect(moved.people.find(p => p.id === 'child')?.state?.sectorId).toBe('bio')
    const loaded = repairSave(moved).game
    loaded.age += 2
    const later = storylets.find(s => s.id === 'people-child-visit')!
    expect(later.available(loaded)).toBe(true)
    expect(storyBody(loaded, later)).toContain('в биокуполах')
  })

  it('includes the new person in family trips by stable identity', () => {
    const game = moneyWorker(10000)
    game.age = 35
    game.pending = 'people-new-encounter'
    const met = decideById(game, 'meet')
    const person = met.people.find(p => p.id === 'story-acquaintance')!
    person.bond = 60
    const companion = met.people.find(p => p.id === 'parent')!
    companion.alive = true; companion.bond = 60; companion.since = 0
    expect(familyTripParticipants(met).some(p => p.id === person.id)).toBe(true)
    const traveled = purchase(met, 'family-trip', { participantIds: [person.id, companion.id] })
    expect(traveled.flags[familyTripFlag(person.id)]).toBe(35)
    expect(traveled.people.find(p => p.id === person.id)!.bond).toBeGreaterThan(person.bond)
    person.state!.availability = 'distant'
    expect(familyTripParticipants(met).some(p => p.id === person.id)).toBe(false)
    expect(isKnown(met, 'acquaintance')).toBe(false)
    expect(compileRequires({ alive: ['acquaintance'] })(met)).toBe(true)
  })
})

it('reports duplicate people without modifying them', () => {
  const game = createGame(123)
  game.people.push({ ...game.people[0]! })
  expect(findInconsistencies(game)).toContainEqual(expect.stringContaining('повторяется идентификатор человека'))
  expect(game.people.filter(p => p.id === game.people[0]!.id)).toHaveLength(2)
})

describe('relationship identity', () => {
  it('retains a friend as the same person through a relationship and breakup', () => {
    const game = createGame(123)
    game.age = 30
    const friend = game.people.find(p => p.id === 'friend')!
    friend.age = 30
    expect(beginRelationship(game, friend.id)).toBe(true)
    expect(currentPartner(game)).toBe(friend)
    expect(endRelationship(game)).toBe(true)
    expect(relationshipState(game)).toEqual({ partnerId: null, formerPartnerIds: ['friend'] })
    expect(game.people.filter(p => p.id === friend.id)).toEqual([friend])
  })

  it('does not replace a partner or infer one from a confession alone', () => {
    const game = createGame(123)
    game.age = 30
    game.flags.lovePath = 'confessed'
    game.people.find(p => p.id === 'friend')!.age = 30
    expect(currentPartner(game)).toBeUndefined()
    expect(beginRelationship(game, 'friend')).toBe(true)
    expect(beginRelationship(game, 'parent')).toBe(false)
    expect(currentPartner(game)?.id).toBe('friend')
  })

  it('interprets an established legacy relationship and preserves a deceased partner in history', () => {
    const game = createGame(123)
    game.age = 40
    game.flags = { lovePath: 'confessed', loveStage: 'together' }
    expect(currentPartner(game)?.id).toBe('friend')
    game.people.find(p => p.id === 'friend')!.alive = false
    expect(relationshipState(game)).toEqual({ partnerId: null, formerPartnerIds: ['friend'] })
  })

  it('recognizes a legacy cohabiting friend even when lovePath is absent', () => {
    const game = createGame(123)
    game.age = 40
    game.flags = { livingTogether: true, loveStage: 'together' }
    expect(currentPartner(game)?.id).toBe('friend')
    expect(repairSave(game).game.flags.livingTogether).toBe(true)
    game.people.find(p => p.id === 'friend')!.alive = false
    const restored = repairSave(game).game
    expect(restored.flags.livingTogether).toBe(false)
    expect(restored.relationships?.formerPartnerIds).toEqual(['friend'])
    expect(repairSave(restored).game).toEqual(restored)
  })
})
