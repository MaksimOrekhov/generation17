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

  const economy = g.economy
  if (!economy || !Number.isSafeInteger(economy.balance) || economy.balance < 0) bad('недопустимый баланс экономики')
  if (economy) {
    const work = economy.work
    if (!Number.isInteger(economy.settledAge) || economy.settledAge < 0 || economy.settledAge > g.age) bad('недопустимый годовой маркер экономики')
    if (![1, 2, 3, 4].includes(work.grade) || !Number.isInteger(work.grade)) bad('недопустимый тарифный разряд')
    if (!Number.isInteger(work.jobSince) || !Number.isInteger(work.gradeSince) || work.jobSince < 0 || work.gradeSince < work.jobSince || work.gradeSince > g.age && g.age >= 18) bad('несогласованы даты специальности и разряда')
    if (!Number.isFinite(work.service) || work.service < 0 || work.service > g.age) bad('недопустимый стаж экономики')
    if (!Number.isSafeInteger(work.lastWage) || work.lastWage < 0) bad('недопустимый последний тариф')
    if (g.age < 16 && work.kind !== 'child') bad('рабочий статус до 16 лет')
    if (g.age >= 16 && g.age < 18 && work.kind !== 'trainee') bad('статус вне стажировки в 16–17 лет')
    if (g.age >= 18 && work.kind === 'child' && economy.settledAge >= 18) bad('статус ребёнка после 18 лет')
    if (g.age >= 77 && work.kind !== 'retired') bad('полная занятость после предела 77 лет')
    if (work.kind === 'retired' && g.age < 60) bad('пенсионный статус до доступного возраста')
    if ((work.kind === 'between' || work.kind === 'sick') && (g.age < 18 || g.age >= 77)) bad('статус временной нетрудоспособности вне рабочего возраста')
    if ((work.kind === 'working' || work.kind === 'between' || work.kind === 'sick') && (work.path === 'left' || work.path === 'mentor')) bad('рабочий статус противоречит пути выхода на пенсию')
    if (work.kind === 'retired' && work.path === 'continue' && g.age < 77) bad('путь продолжения работы завершён раньше 77 лет')
    if (work.mentor !== (work.kind === 'retired' && work.path === 'mentor' && g.age <= 80)) bad('состояние наставничества не согласовано с выходом на пенсию и возрастом')
    if (economy.housingRight && (economy.housingRight.tier <= economy.housing || economy.housingRight.until < g.age || economy.housingRight.until > g.age + 3)) bad('недействительное право возврата жилья')
    if (economy.years.length > 80 || economy.ledger.length > 40) bad('превышен предел финансовой истории')
    for (const row of economy.years) if (!Number.isInteger(row.age) || row.age < 0 || row.age > economy.settledAge || [row.wage,row.pension,row.bills,row.aid,row.balance].some(n => !Number.isSafeInteger(n) || n < 0)) bad('повреждённая строка годовой истории')
    const txnIds = new Set<number>()
    for (const txn of economy.ledger) {
      if (!Number.isSafeInteger(txn.n) || txn.n < 1 || txnIds.has(txn.n) || !Number.isInteger(txn.age) || txn.age < 0 || txn.age > g.age || !Number.isSafeInteger(txn.amount) || txn.amount < 0) bad('повреждённая запись финансового журнала')
      txnIds.add(txn.n)
    }
    if (Object.values(economy.totals).some(n => !Number.isSafeInteger(n) || n < 0)) bad('недопустимые итоги финансовой истории')
    if (g.stopped && economy.estate !== economy.balance) bad('остаток наследства не совпадает с балансом после смерти')
    if (!g.stopped && economy.estate !== null) bad('наследство закрыто при жизни')
  }
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
