import { describe, expect, it } from 'vitest'
import { createGame } from '../engine'
import { storylets } from '../storylets'

const story = (id: string) => storylets.find(s => s.id === id)!
const state = () => { const g = createGame(123); g.age = 70; return g }

describe('поздние истории: условия', () => {
  it('встреча с другом требует живого известного человека', () => {
    const g = state(); const friend = g.people.find(p => p.id === 'friend')!
    expect(story('late-friend-bench').available(g)).toBe(true)
    friend.alive = false
    expect(story('late-friend-bench').available(g)).toBe(false)
    friend.alive = true; friend.since = 71
    expect(story('late-friend-bench').available(g)).toBe(false)
  })
  it('сцена с ребёнком требует присутствия и совершеннолетия', () => {
    const g = state(); const s = story('late-adult-child-route')
    expect(s.available(g)).toBe(false)
    g.people.push({ id: 'child', name: 'Ким Орлов', gender: 'm', role: 'Сын', bond: 70, age: 17, alive: true, since: 53 })
    const child = g.people.find(p => p.id === 'child')!
    expect(s.available(g)).toBe(false)
    child.age = 18; child.since = 52
    expect(s.available(g)).toBe(true)
    child.alive = false
    expect(s.available(g)).toBe(false)
  })
  it.each([
    ['late-crack-record', 'leakChoice', 'report', 'leakAge'],
    ['late-signal-record', 'signalInvestigated', 55, 'signalAge'],
    ['late-neighbor-night', 'neighborPath', 'helped', 'neighborAge']
  ] as const)('%s требует подходящего решения и 15 лет', (id, key, value, ageFlag) => {
    const g = state(); const s = story(id)
    g.flags[key] = value; g.flags[ageFlag] = 56
    expect(s.available(g)).toBe(false)
    g.flags[ageFlag] = 55
    expect(s.available(g)).toBe(true)
    delete g.flags[key]
    expect(s.available(g)).toBe(false)
  })
  it('профессиональные сцены различают специальности', () => {
    const g = state()
    g.protagonist.job = 'Техник'
    expect(story('late-tech-handbook').available(g)).toBe(true)
    expect(story('late-medic-routine').available(g)).toBe(false)
    g.protagonist.job = 'Медик'
    expect(story('late-tech-handbook').available(g)).toBe(false)
    expect(story('late-medic-routine').available(g)).toBe(true)
  })
})
