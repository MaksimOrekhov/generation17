import { describe, expect, it } from 'vitest'
import { beat, createGame, decide, tick } from '../engine'
import { hash32 } from '../random'
import { getMomentDef, moments } from '../moments'
import { storylets } from '../storylets'
import { priorityOf } from '../director'

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

describe('поздние истории: согласованность и доступность', () => {
  const lateStories = storylets.filter(s => s.id.startsWith('late-'))
  const lateMoments = moments.filter(m => m.id.startsWith('m-late-'))

  it('все новые сюжеты и моменты на месте и без особой очерёдности', () => {
    expect(lateStories).toHaveLength(8)
    expect(lateMoments).toHaveLength(7)
    lateStories.forEach(s => expect(priorityOf(s), s.id).toBe('normal'))
  })
  it('с утраченной дружбой друг не приходит ни сюжетом, ни моментом', () => {
    const g = state(); g.flags.friendState = 'estranged'
    expect(story('late-friend-bench').available(g)).toBe(false)
    expect(getMomentDef('m-late-friend')!.available!(g)).toBe(false)
    g.flags.friendState = 'distant'
    expect(story('late-friend-bench').available(g)).toBe(true)
    expect(getMomentDef('m-late-friend')!.available!(g)).toBe(true)
    delete g.flags.friendState
    expect(story('late-friend-bench').available(g)).toBe(true)
  })
  it('сюжеты не показываются раньше 65 лет и позже 95', () => {
    lateStories.forEach(s => { expect(s.min, s.id).toBe(65); expect(s.max, s.id).toBeLessThanOrEqual(95) })
    lateMoments.forEach(m => { expect(m.min, m.id).toBe(65); expect(m.max, m.id).toBeLessThanOrEqual(95) })
  })
  it('в живых жизнях условия соблюдаются, решения не повторяются, а каждый момент выпадает не больше раза', () => {
    const shown = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      let g = createGame(seed + 101); let step = 0
      const momentsSeen: string[] = []
      for (let guard = 0; guard < 1200 && !g.stopped; guard++) {
        if (g.pending) {
          const id = g.pending
          if (id.startsWith('late-')) {
            shown.add(id)
            expect(g.age, id).toBeGreaterThanOrEqual(65)
            if (id === 'late-tech-handbook') expect(g.protagonist.job).toBe('Техник')
            if (id === 'late-medic-routine') expect(g.protagonist.job).toBe('Медик')
            if (id === 'late-friend-bench') { expect(g.people.find(p => p.id === 'friend')!.alive).toBe(true); expect(g.flags.friendState).not.toBe('estranged') }
            if (id === 'late-adult-child-route') { const c = g.people.find(p => p.id === 'child')!; expect(c.alive).toBe(true); expect(c.age).toBeGreaterThanOrEqual(18) }
            if (id === 'late-crack-record') expect(g.flags.leakChoice).toBe('report')
          }
          g = decide(g, hash32('late', seed, step++) % 2)
          continue
        }
        while (!g.stopped && !g.pending && g.phase < 3) {
          g = beat(g)
          if (g.moment?.startsWith('m-late-')) momentsSeen.push(g.moment)
        }
        g = tick(g)
      }
      expect(new Set(g.seen).size, `seed ${seed}`).toBe(g.seen.length)
      expect(new Set(momentsSeen).size, `seed ${seed}`).toBe(momentsSeen.length)
    }
    expect(shown.size).toBeGreaterThan(0)
  })
})

