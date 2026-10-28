import { recordEconomicTransaction } from './economy'
import type { GameState } from './types'

export const STORY_MONEY_LIMIT = 1500
export const validStoryMoney = (money: unknown): money is number =>
  typeof money === 'number' && Number.isSafeInteger(money) && Math.abs(money) <= STORY_MONEY_LIMIT

/** Checks a complete possible path before any mutation or RNG. Missing effects preserve old behavior. */
export function storyMoneyReason(g: GameState, amounts: readonly (number | undefined)[], allowExpense = true): string | null {
  let balance = g.economy.balance, earned = g.economy.totals.earned, spent = g.economy.totals.spent, nextTxn = g.economy.nextTxn
  for (const amount of amounts) {
    if (amount === undefined) continue
    if (!validStoryMoney(amount)) return 'Некорректная сумма сюжетного эффекта.'
    if (amount === 0) continue
    if (amount < 0 && !allowExpense) return 'Денежные списания в этом эффекте запрещены.'
    if (amount < 0 && balance < -amount) return `Не хватает ${-amount - balance} кр.`
    if (!Number.isSafeInteger(balance + amount) || !Number.isSafeInteger(nextTxn + 1)
      || amount > 0 && !Number.isSafeInteger(earned + amount)
      || amount < 0 && !Number.isSafeInteger(spent - amount)) return 'Превышен предел безопасного финансового учёта.'
    balance += amount
    if (amount > 0) earned += amount
    else spent -= amount
    nextTxn++
  }
  return null
}

/** Mutates only the engine-owned copy after a successful full-path preflight. */
export function applyStoryMoney(g: GameState, amount: number | undefined, source: { id: string; title: string }) {
  if (amount === undefined || amount === 0) return
  const reason = storyMoneyReason(g, [amount])
  if (reason) throw Error(reason)
  const e = g.economy
  e.balance += amount
  if (amount > 0) e.totals.earned += amount
  else e.totals.spent -= amount
  recordEconomicTransaction(e, g.age, amount > 0 ? 'windfall' : 'story-expense', Math.abs(amount), source.id, `Сюжет: ${source.title}`)
}
