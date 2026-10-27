import { describe, expect, it } from 'vitest'
import { runClock, secondsPerYearFor } from '../clock'
import { advanceYear, createGame, decide } from '../engine'
import type { GameState } from '../types'

const SPY = secondsPerYearFor(60)

function runUntilStop(seed: number, dt: number, speed: number, limit = 100000) {
  let g = createGame(seed)
  let p = 0
  for (let i = 0; i < limit && !g.pending && !g.stopped; i++) ({ game: g, progress: p } = runClock(g, p, dt, speed, SPY))
  return { g, p }
}

describe('ход времени', () => {
  it('49 секунд на год при 1×', () => {
    expect(SPY).toBe(49)
    const { game, progress } = runClock(createGame(8), 0, 24.5, 1, SPY)
    expect(game.phase).toBeGreaterThanOrEqual(1)
    expect(progress).toBeCloseTo(.5, 5)
  })
  it('на паузе (ожидание решения) возраст, год и RNG не меняются', () => {
    const { g } = runUntilStop(11, .05, 16)
    if (!g.pending) return
    const r = runClock(g, .3, 50, 16, SPY)
    expect(r.game).toBe(g)
    expect(r.game.age).toBe(g.age)
    expect(r.game.rng).toBe(g.rng)
  })
  it('шаг кадра не влияет на историю: 16× и 1× проходят одну и ту же жизнь до первого решения', () => {
    const a = runUntilStop(21, .016, 1).g
    const b = runUntilStop(21, 2, 16).g
    expect(b.age).toBe(a.age)
    expect(b.pending).toBe(a.pending)
    expect(b.rng).toBe(a.rng)
    expect(b.history.map(h => h.title)).toEqual(a.history.map(h => h.title))
  })
  it('большой скачок времени не перепрыгивает решение', () => {
    let g = createGame(33)
    let p = 0
    let decisions = 0
    for (let i = 0; i < 3000 && !g.stopped; i++) {
      if (g.pending) {
        g = decide(g, 0)
        decisions++
        continue
      }
      ;({ game: g, progress: p } = runClock(g, p, 100, 16, SPY))
    }
    expect(decisions).toBeGreaterThan(5)
    expect(g.history.filter(h => h.kind === 'notice' && h.title === 'Требуется решение')).toHaveLength(decisions)
  })
  it('момент замедляет время до 1×', () => {
    let g: GameState = createGame(3)
    let p = 0
    for (let i = 0; i < 20000 && !g.moment && !g.stopped; i++) {
      if (g.pending) g = decide(g, 0)
      else ({ game: g, progress: p } = runClock(g, p, .05, 16, SPY))
    }
    if (!g.moment) return
    const r = runClock(g, p, 1, 16, SPY)
    expect(r.progress - p).toBeCloseTo(1 / SPY, 5)
  })
  it('ручной год даёт то же состояние, что и ход по часам', () => {
    let a = createGame(5)
    let b = createGame(5)
    let p = 0
    a = advanceYear(a)
    for (let i = 0; i < 100000 && b.age === 0; i++) ({ game: b, progress: p } = runClock(b, p, .5, 1, SPY))
    expect(b.age).toBe(a.age)
    expect(b.stats).toEqual(a.stats)
  })
})
