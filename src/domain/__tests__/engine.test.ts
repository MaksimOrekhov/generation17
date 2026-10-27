import { describe, expect, it } from 'vitest'
import { advanceYear, beat, createGame, decide, setFocus, skipMoment, takeMoment, tick } from '../engine'
import { storylets } from '../storylets'
import { getMomentDef, moments } from '../moments'
import { isKnown } from '../engine'
import { canFocus } from '../focus'
import type { GameState } from '../types'

function simulate(seed: number, choices: number[] = [], max = 115) {
  let g = createGame(seed)
  let index = 0
  for (let i = 0; i < max && !g.stopped; i++) {
    if (g.pending) {
      g = decide(g, choices[index++] ?? 0)
    } else {
      g = advanceYear(g)
    }
  }
  return g
}

function untilMoment(seed: number): GameState {
  let g = createGame(seed)
  for (let i = 0; i < 600 && !g.moment && !g.stopped; i++) {
    g = g.pending ? decide(g, 0) : g.phase < 3 ? beat(g) : tick(g)
  }
  return g
}

describe('generation ship engine', () => {
  it('возвращает один и тот же мир для одного seed и тех же решений', () => {
    expect(simulate(12345)).toEqual(simulate(12345))
  })
  it('останавливает время до выбора и не совершает двойных шагов', () => {
    let g = createGame(42)
    while (!g.pending && !g.stopped) g = advanceYear(g)
    const blocked = tick(g)
    expect(blocked).toBe(g)
    expect(beat(g)).toBe(g)
    const advanced = decide(g, 0)
    expect(advanced.pending).toBeNull()
    expect(advanced.age).toBe(g.age)
    expect(advanced.history.some(e => e.kind === 'choice')).toBe(true)
  })
  it('предлагает выбрать специальность в 16 или 17 лет', () => {
    let g = createGame(1)
    while (g.pending !== 'school-track' && g.age < 20 && !g.stopped) {
      if (g.pending) g = decide(g, 0)
      else g = advanceYear(g)
    }
    if (g.stopped) return // редкая ранняя смерть в лотерее рождения
    expect(g.pending).toBe('school-track')
    expect(g.age === 16 || g.age === 17).toBe(true)
    g = decide(g, 1)
    expect(g.protagonist.job).toBe('Медик')
  })
  it('позволяет менять годовой приоритет, когда герой достаточно взрослый', () => {
    const g = { ...createGame(20), age: 8 }
    const x = setFocus(g, 'rest')
    expect(x.focus).toBe('rest')
    expect(g.focus).toBe('study')
  })
  it('не выходит за допустимые пределы показателей во множестве жизней', () => {
    for (let seed = 1; seed <= 100; seed++) {
      let g = createGame(seed)
      for (let j = 0; j < 230 && !g.stopped; j++) {
        g = g.pending ? decide(g, (seed + j) % (storylets.find(e => e.id === g.pending)?.choices.length || 1)) : advanceYear(g)
        expect(g.age).toBeLessThanOrEqual(105)
        for (const n of [...Object.values(g.stats), ...Object.values(g.ship), ...Object.values(g.skills)]) {
          expect(n).toBeGreaterThanOrEqual(0)
          expect(n).toBeLessThanOrEqual(100)
        }
      }
    }
  }, 60000)
  it('выполнение решения не разрушает JSON-сохранение', () => {
    const g = simulate(9, Array(60).fill(0), 90)
    expect(JSON.parse(JSON.stringify(g))).toEqual(g)
  })
  it('сохраняет независимость разных seed', () => {
    expect(createGame(101).protagonist).not.toEqual(createGame(202).protagonist)
  })
})

describe('рождение', () => {
  it('детерминировано и согласовано', () => {
    const a = createGame(777)
    expect(createGame(777).birth).toEqual(a.birth)
    expect(a.birth.wealth).toBeGreaterThanOrEqual(1)
    expect(a.birth.wealth).toBeLessThanOrEqual(5)
    expect(a.people.find(p => p.id === 'parent')).toBeTruthy()
    expect(a.peers).toHaveLength(5)
    const total = Object.values(a.birth.births).reduce((s, n) => s + n, 0)
    expect(Math.abs(total - a.birth.birthsThisYear)).toBeLessThan(4)
  })
  it('даёт разные сектора и достатки на разных seed', () => {
    const sectors = new Set<string>()
    const wealth = new Set<number>()
    for (let s = 1; s <= 200; s++) {
      const g = createGame(s)
      sectors.add(g.birth.sectorId)
      wealth.add(g.birth.wealth)
    }
    expect(sectors.size).toBe(5)
    expect(wealth.size).toBe(5)
  })
  it('в ранние годы смерть возможна, но редка', () => {
    let early = 0
    const N = 600
    for (let s = 1; s <= N; s++) {
      let g = createGame(s)
      while (g.age < 5 && !g.stopped) g = g.pending ? decide(g, 0) : advanceYear(g)
      if (g.stopped && g.age < 5) early++
    }
    expect(early).toBeGreaterThan(0)
    expect(early / N).toBeLessThan(.08)
  })
})

describe('отметки года и моменты', () => {
  it('год состоит из четырёх отметок и не выходит за отметку 3', () => {
    let g = createGame(5)
    expect(g.phase).toBe(0)
    for (let i = 0; i < 5; i++) g = beat(g)
    expect(g.phase).toBe(3)
    expect(tick(g).phase).toBe(0)
  })
  it('внимание ограничено, момент можно принять один раз', () => {
    const g = untilMoment(3)
    expect(g.moment).toBeTruthy()
    const before = g.attention
    const taken = takeMoment(g)
    expect(taken.moment).toBeNull()
    expect(taken.attention).toBe(before - 1)
    expect(taken.history.some(h => h.kind === 'moment')).toBe(true)
    expect(takeMoment(taken)).toBe(taken)
  })
  it('пропущенный момент не тратит внимание', () => {
    const g = untilMoment(3)
    const skipped = skipMoment(g)
    expect(skipped.moment).toBeNull()
    expect(skipped.attention).toBe(g.attention)
  })
  it('момент без внимания принять нельзя', () => {
    const g = untilMoment(3)
    expect(takeMoment({ ...g, attention: 0 })).toEqual({ ...g, attention: 0 })
  })
  it('моменты не упоминают умерших людей', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let g = createGame(seed)
      for (let i = 0; i < 400 && !g.stopped; i++) {
        g = g.pending ? decide(g, 0) : g.phase < 3 ? beat(g) : tick(g)
        const def = getMomentDef(g.moment)
        if (def) {
          expect(g.age).toBeGreaterThanOrEqual(def.min)
          expect(g.age).toBeLessThanOrEqual(def.max)
          for (const id of def.needs ?? []) expect(g.people.find(p => p.id === id)?.alive).toBe(true)
        }
      }
    }
  }, 60000)
})

describe('возраст героя', () => {
  it('младенец не выбирает фокус; работа и общество открываются с 14 лет', () => {
    const baby = createGame(7)
    expect(setFocus(baby, 'rest')).toBe(baby)
    expect(canFocus(8, 'work')).toBe(false)
    expect(canFocus(14, 'civic')).toBe(true)
    const child = { ...baby, age: 9 }
    expect(setFocus(child, 'work')).toBe(child)
  })
  it('друг появляется в жизни героя не раньше детского сада, наставник — к 16 годам', () => {
    const g = createGame(9)
    expect(isKnown(g, 'friend')).toBe(false)
    expect(isKnown({ ...g, age: 4 }, 'friend')).toBe(true)
    expect(isKnown({ ...g, age: 10 }, 'mentor')).toBe(false)
    expect(isKnown({ ...g, age: 16 }, 'mentor')).toBe(true)
    expect(isKnown(g, 'parent')).toBe(true)
  })
  it('в первые годы не бывает моментов и решений с людьми, которых герой ещё не знает', () => {
    for (let seed = 1; seed <= 80; seed++) {
      let g = createGame(seed)
      for (let i = 0; i < 40 && !g.stopped && g.age < 6; i++) {
        g = g.pending ? decide(g, 0) : g.phase < 3 ? beat(g) : tick(g)
        const def = getMomentDef(g.moment)
        for (const id of def?.needs ?? []) expect(isKnown(g, id)).toBe(true)
        expect(g.pending === 'curfew-night' || g.pending === 'school-play').toBe(false)
      }
    }
  })
  it('каталоги без дублей, у каждого момента есть подпись и исход', () => {
    const ids = moments.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    const sids = storylets.map(s => s.id)
    expect(new Set(sids).size).toBe(sids.length)
    for (const m of moments) {
      expect(m.max).toBeGreaterThanOrEqual(m.min)
      expect(m.accept.label.length).toBeGreaterThan(0)
    }
  })
  it('убывающая отдача не даёт показателям залипать на 100 при стратегии «принимать всё»', () => {
    let saturated = 0
    for (let seed = 1; seed <= 30; seed++) {
      let g = createGame(seed)
      while (!g.stopped && g.age < 45) {
        if (g.pending) { g = decide(g, 0); continue }
        while (g.phase < 3 && !g.pending) {
          g = beat(g)
          if (g.moment) g = takeMoment(g)
        }
        g = tick(g)
      }
      if (g.stopped) continue
      if (g.stats.knowledge >= 99 && g.stats.bonds >= 99) saturated++
    }
    expect(saturated).toBeLessThanOrEqual(3)
  })
})
