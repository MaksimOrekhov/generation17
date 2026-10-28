import { isKnown } from './birth'
import { getMomentDef } from './moments'
import { storylets } from './storylets'
import type { GameState } from './types'

/** Стадии линии «Любовь», при которых герой и близкий человек живут в одной каюте. */
export const COHABITING_STAGES = ['together', 'moved-together', 'held', 'reunited']

/** Флаг совместной жизни согласован: близкий человек жив и отношения этого не отменили. */
export const cohabitationOk = (g: GameState) =>
  g.flags.livingTogether !== true || (isKnown(g, 'friend') && COHABITING_STAGES.includes(String(g.flags.loveStage)))

/**
 * Невозможные состояния мира. Пустой список — состояние допустимо.
 * Проверяется в тестах и в массовом прогоне `npm run sim`; движок эти проверки не использует.
 */
export function findInconsistencies(g: GameState): string[] {
  const problems: string[] = []
  const bad = (text: string) => problems.push(`возраст ${g.age}: ${text}`)

  if (!g.economy || !Number.isInteger(g.economy.balance) || g.economy.balance < 0) bad('недопустимый баланс экономики')
  if (g.economy && g.economy.settledAge > g.age) bad('экономика рассчитана за будущий возраст')
  if (g.economy && g.economy.estate !== null && !g.stopped) bad('наследство закрыто при жизни')
  if (g.pending && !storylets.some(s => s.id === g.pending)) bad(`ожидается решение «${g.pending}», которого нет в каталоге`)
  const moment = g.moment ? getMomentDef(g.moment) : null
  if (g.moment && !moment) bad(`активен неизвестный момент «${g.moment}»`)
  if (moment) {
    for (const id of moment.needs ?? []) if (!isKnown(g, id)) bad(`момент «${moment.id}» требует человека «${id}», которого нет рядом`)
    if (g.age < moment.min || g.age > moment.max) bad(`момент «${moment.id}» вне своего возраста`)
    if (moment.available && !moment.available(g)) bad(`момент «${moment.id}» активен, хотя его условия не выполняются`)
  }

  if (g.flags.livingTogether === true) {
    if (!isKnown(g, 'friend')) bad('герой «живёт вместе» с тем, кого нет в живых или кто ещё не появился')
    else if (!COHABITING_STAGES.includes(String(g.flags.loveStage))) bad(`совместная жизнь при стадии отношений «${String(g.flags.loveStage)}»`)
  }
  if (g.flags.loveStage === 'moved-together' && g.residence === undefined) bad('переезд к близкому человеку не изменил место жительства')

  const child = g.people.find(p => p.id === 'child')
  if (g.flags.familyChild === 'born' && !child) bad('ребёнок «родился», но его нет среди людей')
  if (child && g.flags.familyChild !== 'born') bad(`есть ребёнок, а флаг рождения «${String(g.flags.familyChild)}»`)
  if (child?.alive && child.age !== g.age - child.since) bad(`возраст ребёнка ${child.age} не сходится с годом рождения`)
  for (const p of g.people) if (!p.alive && p.age < 0) bad(`у «${p.id}» отрицательный возраст`)
  return problems
}
