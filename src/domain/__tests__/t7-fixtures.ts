import storyletsJson from '../../../content/storylets/economy-t7.json'
import momentsJson from '../../../content/moments/economy-t7.json'
import { createGame } from '../engine'
import type { GameState, Job } from '../types'

/** ID всего содержимого T7: им тесты совместимости отделяют старый каталог от нового. */
export const T7_STORYLET_IDS = new Set((storyletsJson as { id: string }[]).map(s => s.id))
export const T7_MOMENT_IDS = new Set((momentsJson as { id: string }[]).map(m => m.id))

/**
 * Взрослый работающий герой с известной семьёй: мать, отец, старший брат или сестра, друг.
 * Связи и возрасты заданы явно, чтобы условия сюжетов T7 проверялись без расхода RNG.
 */
export function t7Worker(balance = 5_000, age = 35, job: Job = 'Техник'): GameState {
  const g = createGame(4242)
  g.age = age
  g.economy.settledAge = age
  g.economy.balance = balance
  g.protagonist.job = job
  g.economy.work = { ...g.economy.work, kind: 'working', job, service: age - 18, jobSince: 18, gradeSince: 18 }
  g.attention = 3
  g.ship.air = 100; g.ship.food = 100
  g.residence = 'atrium'
  const ages: Record<string, number> = { parent: age + 27, parent2: age + 29, sibling: age + 4, friend: age, neighbor: age + 5, mentor: age + 28 }
  if (!g.people.some(p => p.id === 'sibling')) {
    g.people.push({ id: 'sibling', name: 'Ян Тест', gender: 'm', role: 'Старший брат', bond: 60, age: age + 4, alive: true, since: 0 })
  }
  for (const p of g.people) {
    p.alive = true
    p.age = ages[p.id] ?? p.age
    p.bond = p.id === 'neighbor' || p.id === 'mentor' ? 30 : 60
  }
  return g
}

export const withPending = (g: GameState, id: string): GameState => ({ ...g, pending: id })
