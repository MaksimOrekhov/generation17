import type { GameState } from './types'
import { beat, tick } from './engine'

/** Секунд на игровой год при скорости 1× для выбранной длины жизни (≈ 82 года). */
export const LIFE_PRESETS = [
  { minutes: 30, secondsPerYear: 22, label: 'Быстро' },
  { minutes: 60, secondsPerYear: 49, label: 'Рекомендуем' },
  { minutes: 90, secondsPerYear: 73, label: 'Неспешно' }
] as const
export type LifePreset = typeof LIFE_PRESETS[number]['minutes']
export const DEFAULT_PRESET: LifePreset = 60
export const SPEEDS = [.5, 1, 2, 4, 8, 16] as const

/**
 * Сколько реальных секунд момент остаётся на экране минимум, как бы быстро ни шло время.
 * Потолка «1× при открытом моменте» нет: скорость ограничена только так, чтобы четверть года,
 * в которую живёт момент, длилась не меньше этого. На 1×–4× (пресет 49 с) это ничего не меняет.
 */
export const MOMENT_MIN_SECONDS = 2.5

/** Наибольшая скорость, при которой момент ещё успевают прочитать. */
export const momentSpeedCap = (secondsPerYear: number) => secondsPerYear / 4 / MOMENT_MIN_SECONDS

export const secondsPerYearFor = (preset: LifePreset) => LIFE_PRESETS.find(p => p.minutes === preset)!.secondsPerYear

export interface ClockResult {
  game: GameState
  /** Доля текущего года, 0…1. */
  progress: number
}

/** Когда в году срабатывает отметка фазы `phase` (1…3): год делится на четыре равные части. */
export const beatAt = (phase: number) => phase / 4

/**
 * Чистая логика хода времени. Переводит секунды в долю года и вызывает отметки года и его смену
 * строго по очереди, поэтому ни одна отметка и ни одно решение не пропускаются на любой скорости.
 * Пока ждёт решение или жизнь окончена, время не идёт.
 * Пока открыт момент, скорость ограничена так, чтобы он оставался на экране не меньше `MOMENT_MIN_SECONDS`.
 */
export function runClock(game: GameState, progress: number, dtSeconds: number, speed: number, secondsPerYear: number, onYear?: (before: GameState, after: GameState) => void): ClockResult {
  if (game.stopped || game.pending) return { game, progress }
  const cap = momentSpeedCap(secondsPerYear)
  let g = game
  let p = progress
  let left = dtSeconds
  // Кадр режется по границам отметок: после каждой скорость пересчитывается. Момент, появившийся
  // посреди кадра, сразу получает свою скорость, поэтому окно чтения не зависит от размера кадра.
  for (let guard = 0; guard < 10000; guard++) {
    const effective = g.moment ? Math.min(speed, cap) : speed
    const boundary = g.phase < 3 ? beatAt(g.phase + 1) : 1
    const need = (Math.max(0, boundary - p) * secondsPerYear) / effective
    if (need > left) {
      p += (left * effective) / secondsPerYear
      break
    }
    left -= need
    if (g.phase < 3) {
      p = boundary
      g = beat(g)
    } else {
      p = 0
      const before = g
      g = tick(g)
      onYear?.(before, g)
    }
    if (g.stopped || g.pending) return { game: g, progress: p }
  }
  return { game: g, progress: p }
}
