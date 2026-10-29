import { describe, expect, it } from 'vitest'
import { beat, canChoose, createGame, decide, decideById, setFocus, tick } from '../engine'
import { findInconsistencies } from '../invariants'
import { beginRelationship, createStoryPerson, currentPartner, endRelationship } from '../people'
import { repairSave } from '../save'
import { storylets } from '../storylets'
import type { GameState } from '../types'
import baseline from './fixtures/love-v2-baseline.json'

const event = (id: string) => storylets.find(s => s.id === id)!
function adult(): GameState {
  const game = createGame(90210)
  game.age = 30
  const friend = game.people.find(p => p.id === 'friend')!
  friend.age = 30; friend.alive = true; friend.bond = 70
  return game
}
function newPartner(): GameState {
  const game = adult()
  const person = createStoryPerson(game, 'acquaintance', 'colleague')
  expect(beginRelationship(game, person.id)).toBe(true)
  return game
}
function choose(g: GameState, id: string, index: number): GameState {
  expect(event(id).available(g)).toBe(true)
  return decide({ ...g, pending: id }, index)
}

describe('friend love and explicit relationship compatibility', () => {
  it('preserves the former partner when a friend becomes the current partner and moves together', () => {
    const game = newPartner()
    const former = currentPartner(game)!.id
    expect(endRelationship(game)).toBe(true)
    const friend = game.people.find(p => p.id === 'friend')!
    let g = choose(game, 'relationship', 0)
    expect(g.flags.lovePath).toBe('confessed')
    expect(currentPartner(g)).toBeUndefined()
    expect(beginRelationship(structuredClone(g), former)).toBe(false)
    g = choose(g, 'relationship-followup', 0)
    expect(g.relationships).toEqual({ partnerId: 'friend', formerPartnerIds: [former] })
    expect(g.flags.livingTogether).toBe(true)
    g.age += 5
    const moved = choose(g, 'love-home-offer', 0)
    expect(moved.flags).toMatchObject({ loveStage: 'moved-together', livingTogether: true })
    expect(moved.residence).toBeDefined()
    expect(currentPartner(moved)?.state?.sectorId).toBe(moved.residence)
    expect(currentPartner(moved)?.id).toBe(friend.id)
    expect(moved.people.filter(p => p.id === friend.id)).toHaveLength(1)
    expect(moved.relationships?.formerPartnerIds).toContain(former)
  })

  it('does not offer the initial scene or allow a stale continuation to replace an active partner', () => {
    const game = newPartner()
    expect(event('relationship').available(game)).toBe(false)
    const stale = { ...game, flags: { ...game.flags, lovePath: 'confessed' }, pending: 'relationship-followup' }
    expect(event('relationship-followup').available(stale)).toBe(false)
    expect(canChoose(stale, 0).available).toBe(false)
    expect(decide(stale, 0)).toEqual(stale)
    expect(currentPartner(stale)?.id).toBe('story-acquaintance')
  })

  it('keeps the friend as one historical person after an explicit breakup', () => {
    let g = adult()
    g.relationships = { partnerId: null, formerPartnerIds: [] }
    g = choose(g, 'relationship', 0)
    g = choose(g, 'relationship-followup', 0)
    expect(currentPartner(g)?.id).toBe('friend')
    expect(endRelationship(g)).toBe(true)
    expect(g.flags.livingTogether).toBe(false)
    expect(g.relationships?.formerPartnerIds).toEqual(['friend'])
    g.age += 5
    expect(event('love-home-offer').available(g)).toBe(false)
    expect(g.people.filter(p => p.id === 'friend')).toHaveLength(1)
    expect(findInconsistencies(g).some(p => p.includes('партнёр'))).toBe(false)
  })

  it('keeps the friend through time apart and records a breakup from the old continuation', () => {
    let g = adult()
    g.relationships = { partnerId: null, formerPartnerIds: ['story-acquaintance'] }
    createStoryPerson(g, 'acquaintance', 'colleague')
    g = choose(g, 'relationship', 0)
    g = choose(g, 'relationship-followup', 0)
    g.age += 5
    g = choose(g, 'love-home-offer', 2)
    expect(g.flags.livingTogether).toBe(false)
    expect(currentPartner(g)?.id).toBe('friend')
    g.age++
    g = choose(g, 'love-apart-return', 2)
    expect(currentPartner(g)).toBeUndefined()
    expect(g.relationships?.formerPartnerIds).toEqual(['story-acquaintance', 'friend'])
    expect(g.flags).toMatchObject({ lovePath: 'confessed', loveStage: 'parted', livingTogether: false })
    expect(g.people.filter(p => p.id === 'friend')).toHaveLength(1)
  })

  it('does not revive old apart or open continuations over another partner', () => {
    const g = newPartner()
    for (const [id, stage] of [['love-home-offer', 'together'], ['love-apart-return', 'apart'], ['love-drift', 'open']] as const) {
      const stale = { ...g, age: 50, flags: { ...g.flags, lovePath: 'confessed', loveStage: stage, loveStageAge: 30 }, pending: id }
      expect(event(id).available(stale)).toBe(false)
      expect(canChoose(stale, 0).available).toBe(false)
      expect(decide(stale, 0)).toEqual(stale)
    }
  })

  it('does not offer a move to an unavailable friend', () => {
    let g = adult()
    g.relationships = { partnerId: null, formerPartnerIds: [] }
    g = choose(g, 'relationship', 0)
    g = choose(g, 'relationship-followup', 0)
    g.age += 5
    g.people.find(p => p.id === 'friend')!.state = { availability: 'distant' }
    g.pending = 'love-home-offer'
    expect(event('love-home-offer').available(g)).toBe(false)
    expect(canChoose(g, 0).available).toBe(false)
  })

  it('does not narrate a move to a different sector when the recorded friend home is already shared', () => {
    let g = adult()
    g.residence = 'clinic'
    g.people.find(p => p.id === 'friend')!.state = { sectorId: 'bio' }
    g.relationships = { partnerId: null, formerPartnerIds: [] }
    g = choose(g, 'relationship', 0)
    g = choose(g, 'relationship-followup', 0)
    expect(currentPartner(g)?.state?.sectorId).toBe('clinic')
    g.age += 5
    g.pending = 'love-home-offer'
    expect(canChoose(g, 0).available).toBe(false)
    expect(canChoose(g, 1).available).toBe(true)
  })

  it('does not replay an unresolved old conversation when the friend is already a partner', () => {
    const g = adult()
    expect(beginRelationship(g, 'friend')).toBe(true)
    for (const [id, path] of [['relationship-followup', 'confessed'], ['love-missed', 'skipped']] as const) {
      const stale = { ...g, age: 45, flags: { ...g.flags, lovePath: path, loveAge: 20 }, pending: id }
      expect(event(id).available(stale)).toBe(false)
      expect(canChoose(stale, 0).available).toBe(false)
    }
  })

  it('allows a fresh open storyline even when the friend was a former partner earlier', () => {
    let g = adult()
    expect(beginRelationship(g, 'friend')).toBe(true)
    expect(endRelationship(g)).toBe(true)
    g = choose(g, 'relationship', 0)
    const probe = structuredClone(g)
    const other = createStoryPerson(probe, 'acquaintance', 'friend')
    expect(beginRelationship(probe, other.id)).toBe(false)
    g = choose(g, 'relationship-followup', 1)
    g.age += 6
    expect(event('love-drift').available(g)).toBe(true)
    expect(g.relationships?.formerPartnerIds).toEqual(['friend'])
  })

  it('does not revive an explicitly ended open friend relationship', () => {
    let g = adult()
    g.relationships = { partnerId: null, formerPartnerIds: [] }
    g = choose(g, 'relationship', 0)
    g = choose(g, 'relationship-followup', 0)
    g.age += 5
    g = choose(g, 'love-home-offer', 2)
    g.age++
    g = choose(g, 'love-apart-return', 1)
    expect(g.flags.loveStage).toBe('open')
    expect(endRelationship(g)).toBe(true)
    expect(g.relationships?.friendLoveClosed).toBe(true)
    g.age += 6
    expect(event('love-drift').available(g)).toBe(false)
    const other = createStoryPerson(g, 'acquaintance', 'colleague')
    expect(beginRelationship(g, other.id)).toBe(true)
    expect(repairSave(g).game.relationships?.friendLoveClosed).toBe(true)
  })

  it('allows friendship without inventing romance or deleting former history', () => {
    const g = newPartner()
    expect(endRelationship(g)).toBe(true)
    const friends = choose(g, 'relationship', 1)
    expect(friends.flags.lovePath).toBe('friends')
    expect(currentPartner(friends)).toBeUndefined()
    expect(friends.relationships?.formerPartnerIds).toEqual(['story-acquaintance'])
    friends.age += 6
    expect(event('love-friends-union').available(friends)).toBe(true)
  })

  it('keeps the dead partner in history and permits a later friend story', () => {
    const g = newPartner()
    g.flags.livingTogether = true
    g.people.find(p => p.id === 'story-acquaintance')!.alive = false
    const repaired = repairSave(g).game
    expect(repaired.flags.livingTogether).toBe(false)
    expect(repaired.relationships?.formerPartnerIds).toEqual(['story-acquaintance'])
    expect(event('relationship').available(repaired)).toBe(true)
    const next = choose(repaired, 'relationship', 0)
    expect(next.people.find(p => p.id === 'story-acquaintance')?.alive).toBe(false)
    expect(next.relationships?.formerPartnerIds).toEqual(['story-acquaintance'])
  })

  it('retains old in-progress and parted saves without inventing new decisions', () => {
    for (const id of ['relationship-followup', 'love-parted-meeting'] as const) {
      const old = structuredClone(baseline.states[id].state) as unknown as GameState
      const restored = repairSave(old).game
      expect(restored.flags).toEqual(old.flags)
      expect(restored.decisions).toEqual(old.decisions)
      expect(restored.people).toEqual(old.people)
      expect(event(id).available(restored)).toBe(true)
      expect(restored.relationships).toBeUndefined()
    }
  })

  it('does not reserve an unresolved old romance when the friend is dead', () => {
    const g = adult()
    g.flags.lovePath = 'confessed'
    g.people.find(p => p.id === 'friend')!.alive = false
    const person = createStoryPerson(g, 'acquaintance', 'colleague')
    expect(beginRelationship(g, person.id)).toBe(true)
    expect(event('relationship-followup').available(g)).toBe(false)
  })
})

/** The meeting is an explicit test choice at age 20; all years and later outcomes use the real engine. */
function fullLife(seed: number) {
  let g = createGame(seed), met = false, saw65 = false
  for (let step = 0; step < 450 && !g.stopped; step++) {
    if (g.age >= 6) g = setFocus(g, 'relationships')
    if (!met && g.age >= 20 && !g.pending) {
      g = decideById({ ...g, pending: 'people-new-encounter' }, 'meet')
      met = g.people.some(p => p.id === 'story-acquaintance')
    }
    const person = g.people.find(p => p.id === 'story-acquaintance')
    saw65 ||= !!person && person.age >= 65
    if (g.pending) {
      const def = event(g.pending)
      const index = def.choices.findIndex((_, i) => canChoose(g, i).available)
      if (index < 0) throw new Error(`No available choice: ${g.pending}`)
      g = decide(g, index)
    } else {
      while (!g.stopped && !g.pending && g.phase < 3) g = beat(g)
      g = tick(g)
    }
  }
  return { game: g, met, saw65 }
}

it('replays complete lives deterministically with a new person reaching age 65', () => {
  const seeds = [7001, 7002, 7003, 7004, 7005]
  const lives = seeds.map(seed => fullLife(seed))
  expect(lives.every(life => life.game.stopped && life.met)).toBe(true)
  expect(lives.some(life => life.saw65)).toBe(true)
  for (let i = 0; i < seeds.length; i++) expect(fullLife(seeds[i]!)).toEqual(lives[i])
})
