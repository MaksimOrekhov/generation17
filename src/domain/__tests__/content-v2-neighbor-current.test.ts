// GEN-102: the CURRENT editorial text of «Сосед» is checked here, separately from the frozen v1
// replay in content-v2-neighbor.test.ts (which overlays historical prose via fixtures/neighbor-v1-text.ts).
import { afterEach, describe, expect, it } from 'vitest'
import samples from './fixtures/neighbor-v1-states.json'
import { legacyNeighbor } from './fixtures/neighbor-v1'
import { withHistoricalNeighborText } from './fixtures/neighbor-v1-text'
import { createGame, decide, resolveText } from '../engine'
import { repairSave } from '../save'
import { storylets, contentStorylets } from '../storylets'
import { safePeople } from '../contentPeople'
import type { GameState, Storylet } from '../types'

const original = [...storylets]
afterEach(() => storylets.splice(0, storylets.length, ...original))
const current = new Map(contentStorylets.filter(s => s.arc === 'neighbor').map(s => [s.id, s]))
const frozen = new Map([...current].map(([id, s]) => [id, withHistoricalNeighborText(s)]))
const normalize = (v: unknown) => JSON.parse(JSON.stringify(v))
const stateOf = (id: string) => repairSave(structuredClone(samples[id as keyof typeof samples]) as unknown as GameState).game

function run(g: GameState, s: Storylet, index: number) {
  const at = storylets.findIndex(event => event.id === s.id)
  const previous = storylets[at]!
  storylets[at] = s
  try { return decide({ ...g, pending: s.id }, index) } finally { storylets[at] = previous }
}
// Text-bearing state is excluded; everything mechanical (stats, flags, bonds, residence, decisions...) is compared.
const withoutProse = (g: GameState) => {
  const clone = normalize(g)
  for (const key of ['history', 'memories', 'forks', 'log']) delete clone[key]
  return clone
}
const mechanics = (s: Storylet) => ({
  id: s.id, arc: s.arc, fork: s.fork, category: s.category, title: s.title, min: s.min, max: s.max, weight: s.weight, priority: s.priority,
  choices: s.choices.map(c => ({ hasMemory: c.effects?.memory !== undefined, effects: { ...c.effects, memory: undefined }, check: c.check }))
})
const fieldsOf = (id: string) => {
  const s = current.get(id)!
  return [s.body, ...s.choices.flatMap(c => [c.text, c.hint, c.result, c.effects?.memory ?? ''])]
}
const withGenders = (hero: 'm' | 'f', neighbor: 'm' | 'f') => {
  const g = createGame(7)
  g.protagonist.gender = hero
  const person = g.people.find(p => p.id === 'neighbor')
  if (person) person.gender = neighbor
  return g
}

describe('Сосед GEN-102: current edition keeps v1 mechanics', () => {
  it('still has the eight existing events', () => {
    expect([...current.keys()].sort()).toEqual(legacyNeighbor.map(s => s.id).sort())
  })
  it('keeps the approved choice IDs and their order', () => {
    const ids = Object.fromEntries([...current].map(([id, s]) => [id, s.choices.map(c => c.id)]))
    expect(ids).toEqual({
      'neighbor-medical': ['help', 'find-substitute', 'refuse'],
      'neighbor-followup': ['move', 'pass-on', 'stay'],
      'neighbor-kid-moved': ['visit', 'teach', 'decline'],
      'neighbor-kid-passed': ['thank', 'leave-jam', 'ignore'],
      'neighbor-kid-stayed': ['invite', 'fix-alone', 'learn'],
      'neighbor-weekend': ['accept', 'rota', 'refuse'],
      'neighbor-cold-leak': ['help', 'call-service', 'ignore'],
      'neighbor-reconcile': ['thank', 'bake']
    })
  })
  it.each(legacyNeighbor)('$id differs from v1 only in body and choice text/hint/result/memory prose', old => {
    expect(normalize(mechanics(current.get(old.id)!))).toEqual(normalize(mechanics(old)))
  })
  it.each(legacyNeighbor)('$id keeps {{neighbor}} in the body where v1 had it (safePeople gating)', old => {
    const next = current.get(old.id)!
    expect(next.body.includes('{{neighbor}}')).toBe(old.body.includes('{{neighbor}}'))
    const g = stateOf(old.id)
    const dead = { ...g, people: g.people.map(p => (p.id === 'neighbor' ? { ...p, alive: false } : p)) }
    for (const state of [g, dead]) expect(safePeople(state, next.body)).toBe(safePeople(state, old.body))
  })
  it.each(legacyNeighbor)('$id yields the same mechanical outcome as frozen v1 prose on the same real state', old => {
    const g = stateOf(old.id)
    for (let i = 0; i < old.choices.length; i++)
      expect(withoutProse(run(g, current.get(old.id)!, i))).toEqual(withoutProse(run(g, frozen.get(old.id)!, i)))
  })
  it('really edits prose, and the frozen adapter restores v1 text exactly', () => {
    for (const old of legacyNeighbor) {
      const next = current.get(old.id)!, back = frozen.get(old.id)!
      expect(next.body).not.toBe(old.body)
      expect(back.body).toBe(old.body)
      expect(back.choices.map(c => [c.text, c.hint, c.result, c.effects?.memory])).toEqual(old.choices.map(c => [c.text, c.hint, c.result, c.effects?.memory]))
    }
  })
})

describe('Сосед GEN-102: MOVE A and no unproven biography', () => {
  it('keeps the technical move id and legacy moved flag, but only applies for a cabin', () => {
    const followup = current.get('neighbor-followup')!
    expect(followup.choices.map(c => c.id)).toEqual(['move', 'pass-on', 'stay'])
    expect(followup.choices[0]!.text).toBe('Подать заявку на каюту')
    const g = stateOf('neighbor-followup')
    const next = run(g, followup, 0)
    expect(next.flags.neighborStage).toBe('moved')
    expect(next.residence).toEqual(g.residence)
  })
  it('does not claim a completed move, a new address, common walls or a cabin owner', () => {
    const claimed = /переех|переезд|в новом коридоре|поближе к саду|за стеной|через стену|хозяин|твоей стене|новая каюта/i
    for (const id of current.keys()) for (const text of fieldsOf(id)) expect(text, `${id}: ${text}`).not.toMatch(claimed)
  })
  it('does not assert an unproven child, profession, reading, illness or workplace', () => {
    const unproven = /читали вслух|помню слова|вырос|работает в биокуполе|техник|яблон|ученик|садовой|нянч|учил(?:ся|ась)? читать|слёг|традиция/i
    for (const id of ['neighbor-kid-moved', 'neighbor-kid-passed', 'neighbor-kid-stayed', 'neighbor-reconcile'])
      for (const text of fieldsOf(id)) expect(text, `${id}: ${text}`).not.toMatch(unproven)
  })
  it('keeps the late request and the leak plausible for an older neighbour', () => {
    const weekend = current.get('neighbor-weekend')!
    expect(weekend.body).not.toContain('присмотреть за детьми')
    expect(weekend.choices[1]!.result).toContain('никто не обещает годы вперёд')
    expect(weekend.choices[1]!.result).not.toContain('один вечер в неделю')
    const leak = current.get('neighbor-cold-leak')!
    expect(leak.body).toContain('теперь речь не о присмотре за детьми')
    expect(leak.body).not.toMatch(/ночная смена|хозяин/)
  })
})

describe('Сосед GEN-102: rendered gender forms', () => {
  const same = (m: string, f: string) => ({ 'm/m': m, 'm/f': m, 'f/m': f, 'f/f': f })
  const byNeighbor = (m: string, f: string) => ({ 'm/m': m, 'm/f': f, 'f/m': m, 'f/f': f })
  const cases: [string, string, (s: Storylet) => string | undefined, Record<string, string>][] = [
    ['neighbor-medical', 'body', s => s.body, byNeighbor('уже спрашивал знакомых', 'уже спрашивала знакомых')],
    ['neighbor-followup', 'move memory', s => s.choices[0]!.effects?.memory, same('Подал заявку на каюту', 'Подала заявку на каюту')],
    ['neighbor-weekend', 'body', s => s.body, same('ты нашёл согласного', 'ты нашла согласного')],
    ['neighbor-cold-leak', 'help result', s => s.choices[0]!.result, byNeighbor('«Не знал, откликнешься', '«Не знала, откликнешься')],
    ['neighbor-cold-leak', 'ignore memory', s => s.choices[2]!.effects?.memory, same('не откликнулся на сообщение', 'не откликнулась на сообщение')],
    ['neighbor-kid-stayed', 'invite result', s => s.choices[0]!.result, same('ты остался с детьми', 'ты осталась с детьми')]
  ]
  it.each(cases)('%s %s renders for hero m/f × neighbor m/f', (id, _label, pick, expected) => {
    for (const hero of ['m', 'f'] as const) for (const neighbor of ['m', 'f'] as const)
      expect(resolveText(withGenders(hero, neighbor), pick(current.get(id)!)!)).toContain(expected[`${hero}/${neighbor}`]!)
  })
  it('leaves no unresolved markup in any text for any gender pair', () => {
    for (const hero of ['m', 'f'] as const) for (const neighbor of ['m', 'f'] as const) {
      const g = withGenders(hero, neighbor)
      for (const id of current.keys()) for (const text of fieldsOf(id)) expect(resolveText(g, text), text).not.toMatch(/\{\{|\}\}/)
    }
  })
})
