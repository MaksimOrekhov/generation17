import { afterEach, describe, expect, it, vi } from 'vitest'
import baseline from './fixtures/neighbor-v1-baseline.json'
import samples from './fixtures/neighbor-v1-states.json'
import { legacyNeighbor } from './fixtures/neighbor-v1'
import { friendshipV1Text } from './fixtures/friendship-v1-text'
import { neighborReplay } from '../../../scripts/content-v2-neighbor'
import { canChoose, createGame, decide, tick } from '../engine'
import { npcMilestonePlan, NPC_MILESTONE_FLAGS } from '../npcMilestones'
import { repairSave } from '../save'
import { storylets, codeStorylets, contentStorylets } from '../storylets'
import type { GameState, Storylet } from '../types'
import { safePeople } from '../contentPeople'
import { GEN57_STORYLET_IDS } from './gen57-fixtures'
import * as npcMilestones from '../npcMilestones'

const original = [...storylets]
afterEach(() => storylets.splice(0, storylets.length, ...original))
const migrated = new Map(contentStorylets.filter(s => s.arc === 'neighbor').map(s => [s.id, s]))
const normalize = (v: unknown) => JSON.parse(JSON.stringify(v))
const withoutJournal = ({ decisions: _decisions, ...g }: GameState) => g
function withHistoricalFriendText(storylet: Storylet): Storylet {
  const historical = friendshipV1Text[storylet.id as keyof typeof friendshipV1Text]
  if (!historical) return storylet
  const checks = 'checks' in historical ? historical.checks as Record<number, { successText: string; failureText: string }> : {}
  return {
    ...storylet,
    body: historical.body,
    choices: storylet.choices.map((choice, index) => {
      const frozen = { ...choice, result: historical.results[index]! }
      const checkText = checks[index]
      if (!checkText || !choice.check) return frozen
      return { ...frozen, check: { ...choice.check, ...checkText } }
    })
  }
}
function run(g: GameState, s: Storylet, index: number) {
  const at = storylets.findIndex(event => event.id === s.id)
  const previous = storylets[at]!
  storylets[at] = s
  try { return decide({ ...g, pending: s.id }, index) } finally { storylets[at] = previous }
}

describe('Сосед: frozen pre-v2 behaviour and JSON equivalence', () => {
  it('can isolate the frozen replay from the new annual NPC milestones', () => {
    const disableNewMilestones = vi.spyOn(npcMilestones, 'npcMilestonesTick').mockImplementation(() => { disableNewMilestones.mockClear() })
    try {
      const g = createGame(17)
      const friend = g.people.find(person => person.id === 'friend')!
      const targetAge = npcMilestonePlan(g.seed, 'friend').jobAge
      g.age = targetAge - 1
      friend.age = targetAge - 1
      friend.since = 0
      const next = tick(g)
      expect(next.age).toBe(targetAge)
      expect(next.flags[NPC_MILESTONE_FLAGS[0]]).toBeUndefined()
    } finally { disableNewMilestones.mockRestore() }
  })
  it('migrates exactly eight unique events, with no active TypeScript copy', () => {
    expect(migrated.size).toBe(8)
    expect(codeStorylets.filter(s => s.arc === 'neighbor')).toHaveLength(0)
    for (const old of legacyNeighbor) expect(storylets.filter(s => s.id === old.id)).toHaveLength(1)
  })
  it.each(legacyNeighbor)('$id preserves windows, priority, text, choices and all effects', old => {
    const next = migrated.get(old.id)!
    for (const key of ['id', 'arc', 'fork', 'category', 'title', 'body', 'min', 'max', 'weight', 'priority'] as const) expect(next[key]).toEqual(old[key])
    expect(normalize(next.choices.map(({ id: _id, historicalPeople: _people, ...c }) => c))).toEqual(normalize(old.choices))
    expect(new Set(next.choices.map(c => c.id)).size).toBe(next.choices.length)
  })
  it.each(legacyNeighbor)('$id preserves every immediate outcome on the same real state', old => {
    const state = samples[old.id as keyof typeof samples] as unknown as GameState
    expect(state).toBeDefined()
    const g = repairSave(state).game
    for (let i = 0; i < old.choices.length; i++) {
      const before = structuredClone(g), a = run(g, old, i), b = run(g, migrated.get(old.id)!, i)
      expect(normalize(withoutJournal(b))).toEqual(normalize(withoutJournal(a)))
      expect(g).toEqual(before)
      expect(b.decisions.at(-1)).toMatchObject({ id: old.id, choice: migrated.get(old.id)!.choices[i]!.id, age: g.age })
    }
  })
  it.each(legacyNeighbor)('$id preserves eligibility at every age boundary and flag stage', old => {
    const g = repairSave(samples[old.id as keyof typeof samples] as unknown as GameState).game
    for (const age of [old.min - 1, old.min, old.max, old.max + 1]) {
      const state = { ...g, age }
      expect(migrated.get(old.id)!.available(state)).toBe(old.available(state))
    }
    for (const key of ['neighborAge', 'neighborStageAge']) for (const years of [4, 5, 6, 7, 8, 9]) {
      const state = { ...g, flags: { ...g.flags, [key]: g.age - years } }
      expect(migrated.get(old.id)!.available(state)).toBe(old.available(state))
    }
  })
  it('replays 200 seeds × 4 strategies against the immutable pre-edit digest', async () => {
    // Replay the historical catalog used to capture the digest. New, unrelated
    // storylets deliberately alter full-life scheduling and RNG consumption.
    // Restore GEN-22 strings from the same historical main revision: the digest
    // includes narrative log/fork text as well as mechanical state.
    storylets.splice(0, storylets.length, ...storylets.filter(s => !s.id.startsWith('people-') && !GEN57_STORYLET_IDS.has(s.id)).map(withHistoricalFriendText))
    let comparisons = 0, comparedOutcomes = 0
    let report: Awaited<ReturnType<typeof neighborReplay>>
    const disableNewMilestones = vi.spyOn(npcMilestones, 'npcMilestonesTick').mockImplementation(() => { disableNewMilestones.mockClear() })
    try {
      report = await neighborReplay((g, old) => {
        if (migrated.get(old.id)!.available(g) !== old.available(g)) throw Error(`eligibility ${old.id} at ${g.age}`)
        comparisons++
      }, (g, old, index, expected) => {
        // The original tick guards active body mentions too. A forced call on a dead
        // neighbour is not a playable pre-v2 scene and is excluded from outcome parity.
        if (!safePeople(g, old.body)) return
        const actual = run(g, migrated.get(old.id)!, index)
        if (JSON.stringify(withoutJournal(actual)) !== JSON.stringify(withoutJournal(expected))) throw Error(`outcome ${old.id}/${index}, seed ${g.seed}, age ${g.age}`)
        comparedOutcomes++
      })
    } finally { disableNewMilestones.mockRestore() }
    expect(report.digest).toBe(baseline.digest)
    expect(report.encountered).toEqual(baseline.encountered)
    expect(report.encountered['crack-worsened']).toBeGreaterThan(0)
    expect(report.lives).toBe(800); expect(report.states).toBe(83288); expect(report.outcomes).toBe(4018)
    expect(comparisons).toBe(report.states * 8)
    expect(comparedOutcomes).toBeGreaterThan(3500)
    console.info(`Neighbour parity: ${comparisons} eligibility comparisons, ${comparedOutcomes} playable immediate outcomes; frozen pre-v2 digest ${report.digest}`)
  }, 240000)
})

describe('v2: old neighbour saves and fork snapshots', () => {
  it.each(['neighbor-medical', 'neighbor-followup', 'neighbor-kid-moved'])('loads a pending %s without inventing old choices', id => {
    const raw = structuredClone(samples[id as keyof typeof samples]) as unknown as GameState
    raw.pending = id
    delete (raw as Partial<GameState>).decisions
    const g = repairSave(raw).game
    expect(g.pending).toBe(id); expect(g.decisions).toEqual([])
    expect(g.economy).toEqual(raw.economy); expect(g.timeYear).toEqual(raw.timeYear)
    expect(g.forks).toEqual(raw.forks); expect(g.flags).toEqual(raw.flags)
    const answer = migrated.get(id)!.choices.findIndex((_, i) => canChoose(g, i).available)
    const next = decide(g, answer)
    expect(next.decisions).toHaveLength(1)
    expect(repairSave(repairSave(next).game).game.decisions).toEqual(next.decisions)
  })
  it('continues a started line solely through old flags, with an empty new journal', () => {
    let g = repairSave(structuredClone(samples['neighbor-followup']) as unknown as GameState).game
    g.pending = null
    g.seen = storylets.filter(s => s.id !== 'neighbor-followup').map(s => s.id)
    g.decisions = []
    g.director = { lastAge: g.age - 10, tension: 0, lastCategory: null, lastTone: 'calm' }
    g = tick(g)
    expect(g.pending).toBe('neighbor-followup')
    const next = decide(g, 1)
    expect(next.decisions).toHaveLength(1)
    expect(next.flags.neighborStage).toBe('passed')
    expect(next.forks.find(f => f.arc === 'neighbor')!.outcomes.at(-1)!.title).toBe('Соседняя дверь')
  })
  it('preserves a removed line and its historical fork display', () => {
    const g = createGame(1)
    g.forks.push({ arc: 'removed', title: 'Старая линия', age: 0, chosen: 'Остаться', others: ['Уйти'], outcomes: [] })
    g.decisions.push({ id: 'removed-story', choice: 'stay', age: 0 })
    expect(repairSave(g).game.forks).toEqual(g.forks)
    expect(repairSave(g).game.decisions).toEqual(g.decisions)
  })
})
