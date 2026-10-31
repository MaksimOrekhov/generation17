import type { Job, LogKind, SpotId, Stat, ShipStat, Skill } from '../domain/types'

function yearForm(n: number) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'one'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few'
  return 'many'
}

/** «1 год», «2 года», «5 лет». */
export function years(n: number) {
  const form = yearForm(n)
  if (form === 'one') return `${n} год`
  if (form === 'few') return `${n} года`
  return `${n} лет`
}

/** Короткие возрастные метки: «1 г.», «2 г.», «5 л.». */
export function shortYears(n: number) {
  return `${n} ${yearForm(n) === 'many' ? 'л.' : 'г.'}`
}

export function lifeStage(age: number) {
  return age < 3 ? 'Младенчество' : age < 6 ? 'Раннее детство' : age < 16 ? 'Детство' : age < 24 ? 'Юность' : age < 40 ? 'Молодость' : age < 62 ? 'Зрелость' : 'Поздние годы'
}

/** Чем занят герой: до 16 лет это не специальность, а возрастной этап. */
export function occupation(age: number, job: Job) {
  if (job !== 'Ученик') return job.toLowerCase()
  return age < 1 ? 'младенец' : age < 3 ? 'малыш' : age < 6 ? 'дошкольник' : age < 16 ? 'школьник' : 'ученик'
}

export const statLabels: { key: Stat; name: string; color: string; negative?: boolean }[] = [
  { key: 'health', name: 'Здоровье', color: 'var(--good)' },
  { key: 'morale', name: 'Самочувствие', color: 'var(--amber)' },
  { key: 'knowledge', name: 'Знания', color: 'var(--cool)' },
  { key: 'bonds', name: 'Отношения', color: 'var(--rose)' },
  { key: 'reputation', name: 'Репутация', color: '#b9a8e8' },
  { key: 'stress', name: 'Стресс', color: 'var(--bad)', negative: true }
]

export const skillLabels: { key: Skill; name: string }[] = [
  { key: 'engineering', name: 'Инженерия' },
  { key: 'medicine', name: 'Медицина' },
  { key: 'ecology', name: 'Экология' },
  { key: 'social', name: 'Общение' }
]

export const shipLabels: { key: ShipStat; name: string; color: string }[] = [
  { key: 'air', name: 'Воздух', color: 'var(--cool)' },
  { key: 'food', name: 'Припасы', color: 'var(--good)' },
  { key: 'hull', name: 'Корпус', color: 'var(--amber)' },
  { key: 'cohesion', name: 'Единство', color: 'var(--rose)' }
]

export const logKindLabels: Record<LogKind, string> = {
  life: 'Личное', ship: 'Корабль', choice: 'Решение', moment: 'Момент', memory: 'Память', notice: 'Система', ambient: 'Фон'
}

export const spotLabels: Record<SpotId, string> = {
  window: 'У обзорного стекла', door: 'У двери', terminal: 'У терминала', parent: 'Рядом с близким', table: 'За столом', plant: 'У растения'
}
