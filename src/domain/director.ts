import { clamp, random, weighted } from './random'
import type { GameState, Storylet } from './types'

/**
 * Директор повествования решает, КОГДА и КАКОЕ сюжетное решение показать в этом году.
 * Он не пишет события, а следит за ритмом:
 *  1. интервалы: решения не идут подряд, а долгой тишины не бывает (не дольше MAX_GAP лет при наличии сюжетов);
 *  2. бюджет драмы: тяжёлые события накапливают напряжение, и пока оно не спадёт, подряд их не показывают;
 *  3. приоритет начатых линий: продолжения прошлых решений идут раньше новых случайных событий;
 *  4. разнообразие: та же категория подряд встречается реже.
 */

export type Tone = 'calm' | 'warm' | 'tense' | 'crisis'

export interface Director {
  /** Возраст героя на последнем показанном решении. */
  lastAge: number
  /** Накопленное напряжение: растёт от тяжёлых событий, спадает со временем. */
  tension: number
  lastCategory: string | null
  lastTone: Tone
}

/** Минимум лет между решениями. Школьное распределение в 16 лет обходит правило. */
export const MIN_GAP = 2
/** После стольких лет без решения показывается любое доступное. */
export const MAX_GAP = 5
/** Потолок напряжения: событие, превышающее его, откладывается. */
export const TENSION_CAP = 3
/** Насколько напряжение спадает за год. */
export const TENSION_DECAY = .5

export const TONE_COST: Record<Tone, number> = { calm: 0, warm: -.5, tense: 1.5, crisis: 3 }

const CATEGORY_TONE: Record<string, Tone> = {
  Тайна: 'tense', Общество: 'tense', Корабль: 'tense', Здоровье: 'tense', Юность: 'warm', Отношения: 'warm', Семья: 'warm'
}

/** Оценка тона для тех сюжетов, где он отличается от тона категории. */
const TONE_OVERRIDES: Record<string, Tone> = {
  'parent-illness': 'crisis', 'crack-worsened': 'crisis', 'crack-silent-accident': 'crisis',
  'microcrack': 'tense', 'friend-accusation': 'tense', 'clinic': 'tense', 'crack-failed-leak': 'tense',
  'crack-report-hearing': 'tense', 'crack-recurrence': 'tense', 'crack-denied-after': 'tense', 'crack-blamed-after': 'tense',
  'friend-return-abandoned': 'tense', 'friend-crisis-close': 'tense', 'friend-crisis-distant': 'tense',
  'deck-lottery': 'tense', 'promotion': 'tense', 'annual-exam': 'tense', 'signal-result': 'tense', 'water-shortage': 'tense',
  festival: 'warm', 'parent-illness-followup': 'warm', 'neighbor-followup': 'warm', 'old-friend': 'warm', 'last-window': 'warm',
  'garden-plot': 'warm', 'school-play': 'warm', 'friend-return-stood': 'warm', 'friend-return-quiet': 'warm',
  'crack-student-return': 'warm', 'crack-confessed-after': 'warm', 'nursery-day': 'warm', mentor: 'warm', 'curfew-night': 'warm',
  'signal-public-debate': 'tense', 'signal-secret-visitor': 'tense', 'signal-circle-warned': 'tense', 'signal-rumor-circle': 'warm',
  'signal-report': 'warm', 'signal-circle-joined': 'warm', 'signal-archive-opened': 'calm', 'signal-ignored-echo': 'calm',
  'parent-treatment': 'crisis', 'parent-regret': 'tense', 'parent-last-call': 'tense', 'parent-letter': 'warm', 'parent-keepsake': 'warm',
  'neighbor-cold-leak': 'tense', 'neighbor-weekend': 'warm', 'neighbor-reconcile': 'warm', 'neighbor-kid-moved': 'warm', 'neighbor-kid-passed': 'warm', 'neighbor-kid-stayed': 'warm',
  'love-home-offer': 'tense', 'love-drift': 'tense', 'love-parted-meeting': 'warm', 'love-friends-union': 'warm', 'love-missed': 'warm',
  'census-extra': 'tense', 'census-sealed-cabin': 'tense', 'census-keeper-night': 'tense', 'census-exposed': 'tense',
  'census-watched': 'tense', 'census-registry-answer': 'tense', 'census-counting-voice': 'tense', 'census-petition-answer': 'tense',
  'census-new-citizens': 'warm', 'census-hidden-garden': 'warm', 'census-someone-answers': 'warm', 'census-correspondence': 'warm',
  'census-recording': 'tense', 'census-quota-letter': 'tense', 'census-echo': 'calm',
  midlife: 'calm', legacy: 'calm', retirement: 'calm', 'first-pay': 'calm', 'school-track': 'calm'
}

export const toneOf = (s: Storylet): Tone => TONE_OVERRIDES[s.id] ?? CATEGORY_TONE[s.category] ?? 'calm'

export const initialDirector = (): Director => ({ lastAge: 0, tension: 0, lastCategory: null, lastTone: 'calm' })

/** Раз в год напряжение немного спадает. */
export const cool = (d: Director): Director => ({ ...d, tension: Math.max(0, d.tension - TENSION_DECAY) })

export function afterDecision(d: Director, s: Storylet, age: number): Director {
  const tone = toneOf(s)
  return { lastAge: age, tension: clamp(d.tension + TONE_COST[tone], 0, TENSION_CAP + 1), lastCategory: s.category, lastTone: tone }
}

const fits = (d: Director, s: Storylet) => d.tension + Math.max(0, TONE_COST[toneOf(s)]) <= TENSION_CAP

/**
 * Выбирает сюжетное решение года из доступных или возвращает null (тихий год).
 * Расходует RNG только при выборе из пула, поэтому порядок случайных чисел остаётся детерминированным.
 */
export function pickStorylet(g: GameState, options: Storylet[]): Storylet | null {
  if (!options.length) return null
  const d = g.director
  const gap = g.age - d.lastAge
  // Распределение по специальностям обязательно: в 16 лет, а если прошлое решение было год назад, — в 17
  const forced = options.find(s => s.id === 'school-track' && (g.age >= 17 || (g.age === 16 && gap >= MIN_GAP)))
  if (forced) return forced
  if (g.age < 3) return null
  if (gap < MIN_GAP) return null

  // 1) продолжения прошлых решений идут первыми, но не сразу после тяжёлого события
  const started = options.filter(s => s.weight >= 10)
  if (started.length) {
    const ready = started.filter(s => fits(d, s))
    const pool = ready.length ? ready : gap >= MAX_GAP ? started : []
    if (pool.length) return pool.sort((a, b) => b.weight - a.weight)[0]!
    return null
  }

  // 2) обычные события: вероятность растёт с тишиной, на MAX_GAP — гарантированно
  const rest = options.filter(s => fits(d, s))
  const candidates = rest.length ? rest : gap >= MAX_GAP ? options : []
  if (!candidates.length) return null
  const chance = clamp(.25 + (gap - MIN_GAP) * .25, 0, 1) * (g.age < 6 ? .6 : 1)
  if (random(g) >= chance) return null

  const heavy = d.tension >= 2
  const quiet = d.tension < .5 && d.lastTone !== 'tense' && d.lastTone !== 'crisis'
  return weighted(g, candidates.map(s => {
    const tone = toneOf(s)
    const hard = tone === 'tense' || tone === 'crisis'
    let w = s.weight
    if (heavy && hard) w *= .2
    if (heavy && !hard) w *= 1.5
    if (quiet && hard) w *= 1.3
    if (s.category === d.lastCategory) w *= .4
    if (s.arc && g.forks.some(f => f.arc === s.arc)) w *= 2.5
    return [s, w] as const
  }))
}
