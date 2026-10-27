import { describe, expect, it } from 'vitest'
import { advanceYear, createGame, decide } from '../engine'
import { MAX_GAP, TENSION_CAP, afterDecision, cool, initialDirector, pickStorylet, toneOf } from '../director'
import { storylets } from '../storylets'
import type { GameState, Storylet } from '../types'

const fake = (id: string, category: string, weight: number): Storylet => ({
  id, category, title: id, body: '', min: 0, max: 100, weight, available: () => true,
  choices: [{ text: 'a', hint: '', result: '', effects: {} }]
})
const byId = (id: string) => storylets.find(s => s.id === id)!

function at(age: number, d = initialDirector()): GameState {
  const g = createGame(3)
  g.age = age
  g.director = d
  return g
}

/** Возраст каждого показанного решения за жизнь, выбирая первый вариант. */
function decisionAges(seed: number) {
  let g = createGame(seed)
  const ages: { age: number; id: string }[] = []
  for (let i = 0; i < 400 && !g.stopped; i++) {
    if (g.pending) {
      ages.push({ age: g.age, id: g.pending })
      g = decide(g, 0)
    } else g = advanceYear(g)
  }
  return ages
}

describe('директор повествования', () => {
  it('тяжёлые события копят напряжение, оно спадает со временем', () => {
    const crisis = byId('parent-illness')
    expect(toneOf(crisis)).toBe('crisis')
    const d = afterDecision(initialDirector(), crisis, 30)
    expect(d.tension).toBe(3)
    expect(cool(cool(d)).tension).toBe(2)
    expect(afterDecision(initialDirector(), byId('festival'), 30).tension).toBe(0)
  })

  it('не показывает решение раньше чем через 2 года после предыдущего', () => {
    const g = at(31, { lastAge: 30, tension: 0, lastCategory: null, lastTone: 'calm' })
    expect(pickStorylet(g, [fake('x', 'Личное', 3)])).toBeNull()
  })

  it('после кризиса откладывает тяжёлое, но на MAX_GAP показывает любое', () => {
    const d = { lastAge: 30, tension: TENSION_CAP, lastCategory: null, lastTone: 'crisis' as const }
    const options = [byId('strike'), byId('council')]
    expect(pickStorylet(at(33, d), options)).toBeNull()
    expect(pickStorylet(at(30 + MAX_GAP, d), options)).not.toBeNull()
  })

  it('продолжение начатой линии идёт раньше случайных событий', () => {
    const g = at(40, { lastAge: 35, tension: 0, lastCategory: null, lastTone: 'calm' })
    const started = fake('follow', 'Последствие', 20)
    for (let i = 0; i < 20; i++) expect(pickStorylet({ ...g, rng: i }, [fake('a', 'Личное', 3), started, fake('b', 'Быт', 3)])).toBe(started)
  })

  it('тяжёлое продолжение ждёт, пока напряжение спадёт, и не уступает место случайному событию', () => {
    const d = { lastAge: 30, tension: 2.5, lastCategory: null, lastTone: 'crisis' as const }
    const g = at(33, d)
    expect(pickStorylet(g, [byId('crack-worsened'), fake('a', 'Личное', 3)])).toBeNull()
  })

  it('за жизнь решения идут не чаще раза в 2 года и не реже раза в 6 лет (при первом варианте)', () => {
    let longest = 0
    for (let seed = 1; seed <= 40; seed++) {
      const ages = decisionAges(seed)
      for (let i = 1; i < ages.length; i++) {
        const gap = ages[i]!.age - ages[i - 1]!.age
        expect(gap).toBeGreaterThanOrEqual(2)
        longest = Math.max(longest, gap)
      }
    }
    expect(longest).toBeLessThanOrEqual(7)
  }, 60000)

  it('два кризиса подряд не происходят в пределах 5 лет', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const crises = decisionAges(seed).filter(d => toneOf(byId(d.id)) === 'crisis')
      for (let i = 1; i < crises.length; i++) expect(crises[i]!.age - crises[i - 1]!.age).toBeGreaterThan(5)
    }
  }, 60000)

  it('одинаковый seed даёт один и тот же ритм', () => {
    expect(decisionAges(11)).toEqual(decisionAges(11))
  })
})
