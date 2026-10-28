import { describe, expect, it } from 'vitest'
import { LIFE_PRESETS, MOMENT_MIN_SECONDS, SPEEDS, momentSpeedCap, runClock, secondsPerYearFor } from '../clock'
import { advanceYear, createGame, decide, takeMoment } from '../engine'
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
  it('открытый момент не держит время на 1×: скорость ограничена только минимальным окном чтения', () => {
    let g: GameState = createGame(3)
    let p = 0
    for (let i = 0; i < 20000 && !g.moment && !g.stopped; i++) {
      if (g.pending) g = decide(g, 0)
      else ({ game: g, progress: p } = runClock(g, p, .05, 16, SPY))
    }
    if (!g.moment) return
    const cap = momentSpeedCap(SPY)
    expect(cap).toBeGreaterThan(4)
    const r = runClock(g, p, 1, 16, SPY)
    expect(r.progress - p).toBeCloseTo(cap / SPY, 5)
    const slow = runClock(g, p, 1, 2, SPY)
    expect(slow.progress - p).toBeCloseTo(2 / SPY, 5)
  })
  it('момент остаётся на экране не меньше MOMENT_MIN_SECONDS на любой скорости и пресете', () => {
    for (const preset of LIFE_PRESETS) {
      for (const speed of SPEEDS) {
        const effective = Math.min(speed, momentSpeedCap(preset.secondsPerYear))
        const seconds = preset.secondsPerYear / 4 / effective
        expect(seconds, `${preset.secondsPerYear} с, ${speed}×`).toBeGreaterThanOrEqual(Math.min(MOMENT_MIN_SECONDS, preset.secondsPerYear / 4 / speed) - 1e-9)
      }
    }
  })
  it('жизнь по часам не зависит от скорости и состояния моментов: те же решения, возраст и мир', () => {
    const lifeAt = (speed: number, takeMoments: boolean) => {
      let g = createGame(17)
      let p = 0
      const decisions: string[] = []
      for (let i = 0; i < 5_000_000 && !g.stopped; i++) {
        if (g.pending) {
          decisions.push(`${g.age}:${g.pending}`)
          g = decide(g, 0)
          continue
        }
        if (takeMoments && g.moment) g = takeMoment(g)
        ;({ game: g, progress: p } = runClock(g, p, .1, speed, SPY))
      }
      return { g, decisions }
    }
    for (const takeMoments of [false, true]) {
      const reference = lifeAt(1, takeMoments)
      for (const speed of [.5, 2, 4, 8, 16]) {
        const run = lifeAt(speed, takeMoments)
        expect(run.decisions, `${speed}×, принимать моменты: ${takeMoments}`).toEqual(reference.decisions)
        expect(run.g.age).toBe(reference.g.age)
        expect(run.g.stats).toEqual(reference.g.stats)
        expect(run.g.history.map(h => h.title)).toEqual(reference.g.history.map(h => h.title))
      }
    }
  }, 240000)
  it('ни одно решение не пропускается на скоростях 0.5×–16×', () => {
    for (const speed of [.5, 1, 2, 4, 8, 16]) {
      let g = createGame(33)
      let p = 0
      let decisions = 0
      for (let i = 0; i < 2_000_000 && !g.stopped; i++) {
        if (g.pending) { g = decide(g, 0); decisions++; continue }
        ;({ game: g, progress: p } = runClock(g, p, .1, speed, SPY))
      }
      expect(g.history.filter(h => h.kind === 'notice' && h.title === 'Требуется решение'), `${speed}×`).toHaveLength(decisions)
    }
  }, 240000)
  it('высокие скорости действительно быстрее: 16× заметно короче 4× и 1× с открытыми моментами', () => {
    const secondsPerYear = (speed: number) => {
      let g = createGame(5)
      let p = 0
      let seconds = 0
      for (let i = 0; i < 2_000_000 && !g.stopped; i++) {
        if (g.pending) { g = decide(g, 0); continue }
        ;({ game: g, progress: p } = runClock(g, p, .1, speed, SPY))
        seconds += .1
      }
      return seconds / g.age
    }
    const s1 = secondsPerYear(1)
    const s4 = secondsPerYear(4)
    const s16 = secondsPerYear(16)
    expect(s1).toBeCloseTo(SPY, 0)
    expect(s4).toBeLessThan(s1 / 3.5)
    expect(s16).toBeLessThan(s4 * .6)
    expect(s16).toBeLessThan(SPY / 8)
  }, 120000)
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
