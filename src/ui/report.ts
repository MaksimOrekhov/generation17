import { LIFE_PRESETS } from '../domain/clock'
import { residenceOf, sectorById } from '../domain/birth'
import type { GameState } from '../domain/types'
import type { LifePreset } from '../domain/clock'

const atmosphereNames = { calm: 'спокойная', mystery: 'с тайнами', uncanny: 'тревожная' } as const

/** Вопросы для интервью после жизни (план плейтеста из docs/GAME_DESIGN.md §11). */
export const PLAYTEST_QUESTIONS = [
  'Где вы хотели ускорить время ради пропуска текста? Что именно было скучным?',
  'Какие два события вы запомнили лучше всего?',
  'Какое решение, по-вашему, реально что-то изменило спустя годы? Объясните связь.',
  'О каком человеке из своей жизни вы думали в конце?',
  'Что показалось странным, нелогичным или лишним?',
  'Хочется ли прожить ещё одну жизнь? Почему?',
  'Оцените интерес от 1 до 10.'
]

function minutes(seconds: number) {
  return `${Math.floor(seconds / 60)} мин ${Math.round(seconds % 60)} с`
}

/** Текстовый отчёт о жизни: тестер копирует его и присылает вместе с ответами на вопросы. */
export function buildReport(g: GameState, playedSeconds: number, preset: LifePreset, now = new Date()): string {
  const spy = LIFE_PRESETS.find(p => p.minutes === preset)!.secondsPerYear
  const choices = g.history.filter(h => h.kind === 'choice').slice().reverse()
  const moments = g.history.filter(h => h.kind === 'moment').length
  const lines: string[] = []
  const push = (...t: string[]) => lines.push(...t)

  push('ПОКОЛЕНИЕ 17 — ОТЧЁТ О ЖИЗНИ', `Дата: ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`)
  push(`Жребий (seed): ${g.seed} · атмосфера: ${atmosphereNames[g.atmosphere]} · пресет: ${preset} мин (1 год ≈ ${spy} с)`)
  push(`Реальное время в игре: ${minutes(playedSeconds)}`)
  push('')
  push(`Герой: ${g.protagonist.name}, ${g.birth.sectorName} ${g.birth.deck}, достаток ${g.birth.wealth}/5`)
  if (residenceOf(g) !== g.birth.sectorId) push(`Живёт в секторе: ${sectorById(residenceOf(g)).name} ${sectorById(residenceOf(g)).deck}`)
  push(g.stopped ? `Жизнь завершена в ${g.age} лет (${g.causeOfDeath ?? 'причина не указана'}).` : `Жизнь продолжается, возраст ${g.age}.`)
  push(`Решений: ${choices.length} · моментов принято: ${moments} · воспоминаний: ${g.memories.length} · развилок: ${g.forks.length}`)
  push('')
  push('РЕШЕНИЯ')
  for (const c of choices) push(`  ${String(c.age).padStart(2)} л · ${c.title.replace('Решение: ', '')}`)
  push('')
  push('РАЗВИЛКИ И ИХ ПОСЛЕДСТВИЯ')
  if (!g.forks.length) push('  нет')
  for (const f of g.forks) {
    push(`  ${f.age} л · ${f.title}: выбрано «${f.chosen}»`)
    if (f.outcomes.length) for (const o of f.outcomes) push(`      → ${o.age} л · ${o.title}: «${o.chosen}»`)
    else push('      → последствий не было')
  }
  push('')
  push('ВОСПОМИНАНИЯ')
  for (const m of g.memories) push(`  • ${m}`)
  push('')
  push('ВОПРОСЫ (ответьте в свободной форме)')
  PLAYTEST_QUESTIONS.forEach((q, i) => push(`${i + 1}. ${q}`, '   Ответ:'))
  return lines.join('\n')
}
