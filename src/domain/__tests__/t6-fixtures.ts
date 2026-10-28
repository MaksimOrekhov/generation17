import { compileStorylet } from '../../content/load'
import { createGame } from '../engine'
import type { GameState, Storylet } from '../types'

/** Synthetic definitions only; never shipped in bundle.json or the production catalogue. */
export function moneyStory(): Storylet {
  const story = compileStorylet({
    id: 't6-money-fixture', category: 'Учёба', title: 'Решение о помощи',
    body: 'В тестовом сценарии можно оплатить помощь, получить средства или выбрать бесплатную альтернативу.',
    min: 18, max: 95, weight: 1,
    choices: [
      { text: 'Оплатить помощь', hint: 'Денежный расход', result: 'Помощь оплачена, запись сохранена в финансовом журнале.',
        effects: { money: -400, stats: { health: 2 }, flags: { t6Paid: true }, memory: 'Помощь была оплачена в тестовом сценарии.' } },
      { text: 'Отказаться', hint: 'Бесплатный выбор', result: 'Решение принято без каких-либо денежных расходов.', effects: { flags: { t6Free: true } } },
      { text: 'Получить средства', hint: 'Денежное поступление', result: 'Средства получены, запись сохранена в финансовом журнале.', effects: { money: 250 } },
      { text: 'Оплатить больше', hint: 'Крупный расход', result: 'Дополнительная помощь оплачена и записана в журнал.', effects: { money: -1000 } }
    ]
  })
  return { ...story, available: () => false }
}

export function moneyWorker(balance = 750, age = 30, seed = 102): GameState {
  const g = createGame(seed)
  g.age = age; g.economy.settledAge = age; g.economy.balance = balance
  g.protagonist.job = 'Техник'
  g.economy.work = { ...g.economy.work, kind: 'working', job: 'Техник', service: age - 17 }
  g.pending = 't6-money-fixture'; g.stats.health = 50
  g.ship.air = 100; g.ship.food = 100
  return g
}
