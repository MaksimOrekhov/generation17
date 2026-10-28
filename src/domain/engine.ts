import { initEconomy, projectYear, recordEconomicTransaction, settleYear, closeEstate } from './economy'
import type { Atmosphere, Effects, Focus, Gender, GameState, Job, LogKind, NewPersonId, Phase, SectorId, ShipStat, Skill, Stat, Storylet } from './types'
import { chance, clamp, pick, random, weighted } from './random'
import { gYearPlaceholder, storylets } from './storylets'
import { moments, getMomentDef } from './moments'
import { ambientLine } from './ambient'
import { childGender, genderOfName, heroGender, isKnown, partnerSector, peerJob, pickChildName, residenceOf, rollBirth, sectorById } from './birth'
import { ATMOSPHERE_LEVEL } from './constants'
import { canFocus, FOCUS_FROM_AGE } from './focus'
import { afterDecision, cool, initialDirector, pickStorylet } from './director'
import { elderDeathChance, infantRiskFor, infantYearlyChance } from './mortality'
import { applyOfferChanges, canBuy, getOffer, type PurchaseTarget } from './offers'

export const ATTENTION_PER_YEAR = 3
const HISTORY_LIMIT = 1500
const MOMENT_CHANCE = .3
const focusNames: Record<Focus, string> = { study: 'Саморазвитие', relationships: 'Близкие люди', work: 'Работа', rest: 'Отдых', civic: 'Общество' }

function addLog(g: GameState, kind: LogKind, title: string, text: string) {
  g.history.unshift({ id: g.nextLogId++, age: g.age, shipYear: g.shipYear, kind, title, text })
  // Ограничиваем рост сохранения. Фоновые строки вытесняются первыми.
  if (g.history.length > HISTORY_LIMIT) {
    let drop = g.history.length - 1
    while (drop > 0 && g.history[drop]!.kind !== 'ambient') drop--
    g.history.splice(g.history[drop]!.kind === 'ambient' ? drop : g.history.length - 1, 1)
  }
}

const allowedHere = (g: GameState, weird?: 1 | 2) => !weird || ATMOSPHERE_LEVEL[g.atmosphere] >= weird

export function createGame(seed: number, atmosphere: Atmosphere = 'mystery'): GameState {
  const g: GameState = {
    schemaVersion: 2,
    economy: initEconomy(),
    atmosphere,
    seed: seed >>> 0,
    rng: seed >>> 0,
    age: 0,
    shipYear: 190,
    phase: 0,
    attention: ATTENTION_PER_YEAR,
    moment: null,
    momentLog: {},
    moodByAge: [],
    stopped: false,
    causeOfDeath: null,
    protagonist: { name: '', origin: '', trait: '', job: 'Ученик' },
    birth: undefined as never,
    stats: { health: 87, morale: 72, stress: 8, knowledge: 8, bonds: 68, reputation: 35 },
    skills: { engineering: 0, medicine: 0, ecology: 0, social: 0 },
    ship: { air: 92, food: 88, cohesion: 72, hull: 89 },
    focus: 'study',
    people: [],
    peers: [],
    flags: {},
    memories: [],
    seen: [],
    pending: null,
    history: [],
    forks: [],
    director: initialDirector(),
    nextLogId: 1
  }

  const roll = rollBirth(g)
  g.birth = roll.birth
  g.protagonist.name = roll.name
  g.protagonist.origin = roll.origin
  g.protagonist.trait = roll.trait
  g.protagonist.gender = heroGender(seed)
  g.people = roll.people
  g.peers = roll.peers
  g.flags.familyHealthRisk = random(g) < .67

  const w = roll.birth.wealth
  const traitEffect: Record<string, Partial<Record<Stat, number>>> = {
    Наблюдательный: { knowledge: 4 }, Осторожный: { stress: -4 },
    Любознательный: { knowledge: 6 }, Упрямый: { reputation: 3 }, Добросердечный: { bonds: 5 }
  }
  applyEffects(g, {
    stats: {
      health: (w - 3) * 2 + roll.healthMod, stress: (3 - w) * 2, reputation: (w - 3) * 4,
    }
  })
  applyEffects(g, { stats: traitEffect[roll.trait] })
  addLog(g, 'memory', 'Рождение', `${g.protagonist.name} рождается на корабле «Пилигрим», ${g.protagonist.origin}. За внешней обшивкой — 190-й год путешествия.`)
  return g
}

/** Род героя или человека. Для старых сохранений без `gender` выводится из seed или имени. */
export function genderOf(g: GameState, who: string): Gender {
  if (who === 'hero') return g.protagonist.gender ?? heroGender(g.seed)
  const person = g.people.find(p => p.id === who)
  if (person?.gender) return person.gender
  if (who === 'parent') return 'f'
  return person ? genderOfName(person.name) : 'm'
}

/** Формы по роду: `{{hero:ся|ась}}` — первая форма мужская, вторая женская (любая может быть пустой). */
const GENDER_FORM = /\{\{(\w+):([^|{}]*)\|([^|{}]*)\}\}/g

export function resolveText(g: GameState, value: string) {
  const who = (id: string, fallback: string) => g.people.find(p => p.id === id)?.name.split(' ')[0] ?? fallback
  return value
    .replace(GENDER_FORM, (_, subject: string, masculine: string, feminine: string) => (genderOf(g, subject) === 'f' ? feminine : masculine))
    .replaceAll('{{name}}', g.protagonist.name)
    .replaceAll('{{friend}}', who('friend', 'друг'))
    .replaceAll('{{parent}}', who('parent', 'родитель'))
    .replaceAll('{{neighbor}}', who('neighbor', 'сосед'))
    .replaceAll('{{mentor}}', who('mentor', 'наставник'))
    .replaceAll('{{sibling}}', who('sibling', 'брат или сестра'))
    .replaceAll('{{child}}', who('child', 'ребёнок'))
    .replaceAll('{{job}}', g.protagonist.job.toLowerCase())
}

/**
 * Убывающая отдача: чем ближе показатель к «идеальному» краю, тем труднее его улучшать.
 * Это не даёт одной стратегии упираться в 100 и заставляет искать другие способы жить.
 */
function diminish(stat: Stat, current: number, delta: number) {
  const good = stat === 'stress' ? 100 - current : current
  const improving = stat === 'stress' ? delta < 0 : delta > 0
  if (!improving || good <= 55) return delta
  return delta * clamp(1 - (good - 55) / 40, .1, 1)
}

function applyEffects(g: GameState, effects: Effects) {
  for (const [key, value] of Object.entries(effects.stats ?? {})) {
    const k = key as Stat
    g.stats[k] = clamp(g.stats[k] + diminish(k, g.stats[k], value))
  }
  for (const [key, value] of Object.entries(effects.ship ?? {})) {
    const k = key as ShipStat
    g.ship[k] = clamp(g.ship[k] + value)
  }
  for (const [key, value] of Object.entries(effects.skills ?? {})) {
    const k = key as Skill
    g.skills[k] = clamp(g.skills[k] + value)
  }
  if (effects.addPerson) addPerson(g, effects.addPerson)
  for (const [key, value] of Object.entries(effects.bonds ?? {})) {
    const person = g.people.find(p => p.id === key)
    if (person?.alive) person.bond = clamp(person.bond + value)
  }
  for (const [key, value] of Object.entries(effects.flags ?? {})) {
    g.flags[key] = value === gYearPlaceholder ? g.age : value
  }
  if (effects.job === 'Переобучение') {
    const next: Record<Job, Job> = {
      Ученик: 'Техник', Техник: 'Медик', Медик: 'Агроном',
      Агроном: 'Координатор', Координатор: 'Техник', 'Без специальности': 'Техник'
    }
    g.protagonist.job = next[g.protagonist.job]
    const skills: Partial<Record<Job, Skill>> = { Техник: 'engineering', Медик: 'medicine', Агроном: 'ecology', Координатор: 'social' }
    const skill = skills[g.protagonist.job]
    if (skill) g.skills[skill] = clamp(g.skills[skill] + 9)
  } else if (effects.job) g.protagonist.job = effects.job
  if (effects.memory) {
    const memory = resolveText(g, effects.memory)
    if (!g.memories.includes(memory)) g.memories.push(memory)
  }
  if (effects.moveTo) moveTo(g, effects.moveTo)
}

function addPerson(g: GameState, id: NewPersonId) {
  if (g.people.some(p => p.id === id)) return
  const surname = g.protagonist.name.split(' ').slice(1).join(' ')
  const name = pickChildName(g, surname, g.people.map(p => p.name.split(' ')[0]!))
  const gender = childGender(g.seed, g.age)
  g.people.push({ id, name, gender, role: gender === 'f' ? 'Дочь' : 'Сын', bond: 70, age: 0, alive: true, since: g.age })
  addLog(g, 'life', 'В семье пополнение', `В твоей жизни появляется ${name}.`)
}

function moveTo(g: GameState, target: SectorId | 'partner') {
  const sector = target === 'partner' ? partnerSector(g) : target
  if (residenceOf(g) === sector) return
  g.residence = sector
  const s = sectorById(sector)
  addLog(g, 'life', 'Переезд', `Теперь твой дом — ${s.name}, ${s.deck}.`)
}

/** Шанс успеха проверки: +1,5% за каждый пункт навыка выше сложности, от 10 до 90%. */
export function checkChance(g: GameState, check: { skill: Skill; difficulty: number }) {
  return Math.max(.1, Math.min(.9, .48 + (g.skills[check.skill] - check.difficulty) * .015))
}

/** Запоминает выбор в «Развилках»: начало линии или её продолжение годы спустя. */
function recordFork(g: GameState, event: Storylet, index: number) {
  const chosen = resolveText(g, event.choices[index]!.text)
  if (event.fork) {
    const others = event.choices.filter((_, i) => i !== index).map(c => resolveText(g, c.text))
    g.forks.push({ arc: event.arc!, title: event.title, age: g.age, chosen, others, outcomes: [] })
  } else {
    g.forks.find(f => f.arc === event.arc)?.outcomes.push({ age: g.age, title: event.title, chosen })
  }
}

/** Ожидание решения, которого нет в каталоге (удалён или переименован): снимается с записью в хронике. */
export function dropMissingPending(state: GameState): GameState {
  if (!state.pending || storylets.some(e => e.id === state.pending)) return state
  const g = structuredClone(state)
  addLog(g, 'notice', 'Старая запись', 'Событие, которое ждало ответа, больше не существует в каталоге. Жизнь продолжается без него.')
  g.pending = null
  return g
}

export function decide(state: GameState, choiceIndex: number): GameState {
  if (state.stopped || !state.pending) return state
  const event = storylets.find(e => e.id === state.pending)
  // Сюжет из сохранения мог исчезнуть из каталога: снимаем ожидание, чтобы жизнь не застряла.
  if (!event) return dropMissingPending(state)
  const choice = event.choices[choiceIndex]
  if (!choice) return state

  const g = structuredClone(state)
  applyEffects(g, choice.effects)
  addLog(g, 'choice', `Решение: ${resolveText(g, choice.text)}`, resolveText(g, choice.result))
  if (event.arc) {
    recordFork(g, event, choiceIndex)
    // каждое решение линии остаётся в памяти, даже если у варианта нет собственной записи
    if (!choice.effects.memory) {
      const note = `${event.title}: ${resolveText(g, choice.text)}`
      if (!g.memories.includes(note)) g.memories.push(note)
    }
  }

  if (choice.check) {
    const { check } = choice
    if (random(g) < checkChance(g, check)) {
      applyEffects(g, check.success)
      addLog(g, 'life', 'Получилось', resolveText(g, check.successText))
    } else {
      applyEffects(g, check.failure)
      addLog(g, 'life', 'Неудача', resolveText(g, check.failureText))
    }
  }

  g.pending = null
  return g
}

// ───────────────────────── моменты ─────────────────────────

export const getMoment = (g: GameState) => getMomentDef(g.moment)

/** Упоминает ли текст человека меткой {{id}} или формой {{id:м|ж}}. */
const mentions = (text: string, id: string) => text.includes(`{{${id}}}`) || text.includes(`{{${id}:`)

export { isKnown }

function peopleAlive(g: GameState, ids: string[] = []) {
  return ids.every(id => isKnown(g, id))
}

export function eligibleMoments(g: GameState) {
  return moments.filter(m => {
    if (g.age < m.min || g.age > m.max) return false
    const last = g.momentLog[m.id]
    if (!allowedHere(g, m.weird)) return false
    if (last !== undefined && g.age - last < m.cooldown) return false
    return peopleAlive(g, m.needs) && (!m.available || m.available(g))
  })
}

/**
 * Момент истёк: следующая отметка года или смена года. Это не отказ героя, поэтому последствий нет.
 * Последствия отказа (`skip.effects`) применяет только `skipMoment`: кнопка — осознанный поступок.
 */
function expireMoment(g: GameState) {
  g.moment = null
}

export function takeMoment(state: GameState): GameState {
  const def = getMoment(state)
  if (!def || state.stopped || state.pending || state.attention < 1) return state
  const g = structuredClone(state)
  g.attention -= 1
  g.moment = null
  applyEffects(g, def.accept.effects)
  addLog(g, 'moment', def.title, resolveText(g, def.accept.result))
  return g
}

/** Applies an available catalog purchase without mutating state or consuming RNG. */
export function purchase(state: GameState, offerId: string, target?: PurchaseTarget): GameState {
  const availability = canBuy(state, offerId, target)
  if (!availability.available) return state
  const offer = getOffer(offerId)
  if (!offer) return state

  const g = structuredClone(state)
  const e = g.economy
  if (availability.action === 'restore') {
    applyOfferChanges(g, offer)
    e.housingRight = null
    addLog(g, 'life', 'Возврат жилья', 'Восстановлена прежняя ступень H1 по праву возврата без вступительного взноса.')
    return g
  }

  const previouslyOwned = offer.effects.recordOwnership && e.owned[offer.id] !== undefined
  e.balance -= availability.oneTimeCost
  e.totals.spent += availability.oneTimeCost
  recordEconomicTransaction(e, g.age, 'purchase', availability.oneTimeCost, offer.id, offer.title)
  applyOfferChanges(g, offer, target)
  if (offer.effects.stats && !previouslyOwned) applyEffects(g, { stats: offer.effects.stats })
  let logTitle = 'Личные средства'
  let logText = `Приобретено: ${offer.title}. ${offer.description}`
  if (offer.effects.sectorVisit && target?.sectorId) {
    const sector = sectorById(target.sectorId)
    applyEffects(g, { memory: `Увидел сектор «${sector.name}».` })
    logTitle = 'Экскурсия в дальний сектор'
    logText = `Ты побывал в секторе «${sector.name}», ${sector.deck}.`
  }
  if (offer.effects.familyTripBond && target?.participantIds) {
    const bonds = Object.fromEntries(target.participantIds.map(id => [id, offer.effects.familyTripBond!]))
    const names = target.participantIds.map(id => g.people.find(person => person.id === id)!.name)
    const guests = names.length === 2 ? names.join(' и ') : `${names.slice(0, -1).join(', ')} и ${names.at(-1)}`
    const yearPart = g.age % 100 >= 11 && g.age % 100 <= 14
      ? 'лет'
      : g.age % 10 === 1 ? 'год' : g.age % 10 >= 2 && g.age % 10 <= 4 ? 'года' : 'лет'
    applyEffects(g, {
      bonds,
      flags: { familyTrip: true },
      memory: `В ${g.age} ${yearPart} провёл неделю на обзорной палубе вместе с ${guests}.`
    })
    logTitle = 'Неделя на обзорной палубе'
    logText = `Ты провёл неделю вместе с ${guests}.`
  }
  if (offer.attention > 0) g.attention -= offer.attention
  e.lastBought[offer.id] = g.age
  // An expired H1 right no longer applies after paying the ordinary entry fee.
  if (e.housingRight?.tier === 1 && e.housingRight.until < g.age) e.housingRight = null
  addLog(g, 'life', logTitle, logText)
  return g
}

export interface LoadAvailability {
  available: boolean
  currentLoad: number
  nextLoad: number
  annualGap: number
  requiredReserve: number
  projectedBills: number
  projectedIncomeAtReducedLoad: number
  reason: string | null
}

const hasChosenRetirement = (g: GameState) => {
  const path = g.flags.retirementPath
  return path === 'left' || path === 'mentor'
    || g.economy.work.path === 'left' || g.economy.work.path === 'mentor'
    || g.flags.retirement === true && g.age >= 60 && path !== 'continue'
}

/** Pure load-change eligibility and reserve projection for the next year. */
export function canSetLoad(state: GameState, nextLoad: number): LoadAvailability {
  const work = state.economy.work
  let reason: string | null = null
  let projectedBills = 0
  let projectedIncomeAtReducedLoad = 0
  let annualGap = 0
  let requiredReserve = 0

  if (nextLoad !== 1 && nextLoad !== 0.6) reason = 'Нагрузка должна быть равна 1 или 0,6.'
  else if (state.stopped || state.economy.estate !== null) reason = 'Изменить нагрузку после смерти нельзя.'
  else if (state.pending === 'retirement') reason = 'Сначала завершите решение о выходе на пенсию.'
  else if (state.pending) reason = 'Сначала завершите ожидающее сюжетное решение.'
  else if (hasChosenRetirement(state)) reason = 'Сначала завершите решение о выходе на пенсию.'
  else if (work.kind !== 'working') reason = 'Изменение нагрузки доступно только при обычной работе.'
  else if (work.job !== state.protagonist.job) reason = 'Сначала завершите переобучение.'
  else if (work.load === nextLoad) reason = 'Такая нагрузка уже установлена.'
  else if (nextLoad === 0.6 && state.age < 40) reason = 'Сократить нагрузку можно с 40 лет.'
  else if (nextLoad === 0.6 && work.load !== 1) reason = 'Сокращение доступно только с полной ставки.'
  else if (nextLoad === 1 && work.load !== 0.6) reason = 'Вернуться на полную ставку можно с нагрузки 0,6.'

  if (!reason && nextLoad === 0.6) {
    const forecastState = structuredClone(state)
    forecastState.economy.work.load = 0.6
    // Prevent affordability-driven housing/service cancellations from hiding the obligations being assessed.
    forecastState.economy.balance = Number.MAX_SAFE_INTEGER - 10_000
    const forecast = projectYear(forecastState)
    const row = forecast.economy.years.at(-1)
    projectedBills = row?.bills ?? 0
    projectedIncomeAtReducedLoad = (row?.wage ?? 0) + (row?.pension ?? 0)
    annualGap = Math.max(0, projectedBills - projectedIncomeAtReducedLoad)
    requiredReserve = annualGap * 3
    if (state.economy.balance < requiredReserve) {
      reason = `Для сокращения нагрузки нужен резерв ${requiredReserve} кр.; сейчас ${state.economy.balance} кр.`
    }
  }

  return {
    available: reason === null,
    currentLoad: work.load,
    nextLoad,
    annualGap,
    requiredReserve,
    projectedBills,
    projectedIncomeAtReducedLoad,
    reason
  }
}

/** Changes only the next annual settlement's workload; it neither pays nor consumes attention/RNG. */
export function setLoad(state: GameState, nextLoad: number): GameState {
  if (!canSetLoad(state, nextLoad).available) return state
  const g = structuredClone(state)
  g.economy.work.load = nextLoad as 0.6 | 1
  addLog(g, 'life', 'Рабочий режим', nextLoad === 0.6
    ? 'Рабочая нагрузка сокращена до 0,6 ставки.'
    : 'Рабочая нагрузка возвращена на полную ставку.')
  return g
}

/** Cancels a recurring service; previously paid years and their effects are not refunded. */
export function cancelService(state: GameState, serviceId: string): GameState {
  const offer = getOffer(serviceId)
  if (state.stopped || state.economy.estate !== null || state.pending || !offer?.effects.service || state.economy.services[serviceId] === undefined) return state

  const g = structuredClone(state)
  delete g.economy.services[serviceId]
  addLog(g, 'life', 'Личные средства', `Отменён абонемент «${offer.title}». Оплата за прошедший год не возвращается.`)
  return g
}

export function skipMoment(state: GameState): GameState {
  const def = getMoment(state)
  if (!def || state.stopped) return state
  const g = structuredClone(state)
  if (def.skip.effects) applyEffects(g, def.skip.effects)
  g.moment = null
  return g
}

// ───────────────────────── ход года ─────────────────────────

/**
 * Отметка года (после неё осталось на четверть года меньше). Выдаёт фоновую строку и, возможно, момент.
 * Прошлый неиспользованный момент считается пропущенным.
 */
export function beat(state: GameState): GameState {
  if (state.stopped || state.pending || state.phase >= 3) return state
  const g = structuredClone(state)
  expireMoment(g)
  g.phase = (g.phase + 1) as Phase
  const line = ambientLine(g, g.phase)
  addLog(g, 'ambient', line.title, resolveText(g, line.text))
  // после тяжёлого события тихие моменты приходят чаще
  if (g.attention > 0 && chance(g, MOMENT_CHANCE + (g.director.tension >= 2 ? .15 : 0))) {
    const pool = eligibleMoments(g)
    if (pool.length) {
      const next = weighted(g, pool.map(m => [m, m.weight] as const))
      g.moment = next.id
      g.momentLog[next.id] = g.age
    }
  }
  return g
}

/** Проживает остаток текущего года (моменты пропускаются) и начинает следующий. */
export function advanceYear(state: GameState): GameState {
  let g = state
  while (!g.stopped && !g.pending && g.phase < 3) g = beat(g)
  return tick(g)
}

function focusTick(g: GameState) {
  if (g.age < FOCUS_FROM_AGE) {
    // Первые годы: развитие идёт само, за ребёнка решают взрослые.
    applyEffects(g, { stats: { knowledge: 2, morale: 1, bonds: 1, stress: -1 } })
    return
  }
  const changes: Record<Focus, Partial<Record<Stat, number>>> = {
    study: { knowledge: 3, stress: 1, morale: -1 },
    relationships: { bonds: 3, morale: 2, stress: -1 },
    work: { reputation: 2, stress: 3, morale: -1 },
    rest: { health: 2, stress: -4, morale: 2 },
    civic: { reputation: 1, bonds: 1, stress: 1, knowledge: 1 }
  }
  applyEffects(g, { stats: changes[g.focus] })

  const mainSkill: Record<string, Skill> = {
    Техник: 'engineering', Медик: 'medicine', Агроном: 'ecology', Координатор: 'social'
  }
  const skill = mainSkill[g.protagonist.job]
  if (skill && g.focus === 'work') g.skills[skill] = clamp(g.skills[skill] + 2)
  if (g.focus === 'study' && g.age >= 16 && skill) g.skills[skill] = clamp(g.skills[skill] + 1)

  g.stats.health = clamp(g.stats.health - (g.age > 57 ? 1.2 : g.age > 35 ? .35 : 0) - Math.max(0, g.stats.stress - 65) * .018)
  g.stats.stress = clamp(g.stats.stress - 1)
  // Естественный дрейф: настроение возвращается к привычному, связи требуют внимания, слава тает.
  g.stats.morale = clamp(g.stats.morale + (65 - g.stats.morale) * .08)
  if (g.focus !== 'relationships') g.stats.bonds = clamp(g.stats.bonds - 1.2)
  if (g.focus !== 'study') g.stats.knowledge = clamp(g.stats.knowledge - .5) // знания без практики забываются
  if (g.stats.reputation > 40) g.stats.reputation = clamp(g.stats.reputation - .3)
  if (g.age > 15 && g.age % 8 === 0) {
    addLog(g, 'notice', `Годовой приоритет: ${focusNames[g.focus]}`, 'Небольшие привычки постепенно меняют навыки, состояние и отношения.')
  }
}

function worldTick(g: GameState) {
  // Агентная симуляция всех 8 420 граждан НЕ реализована в MVP.
  // Это независимый от героя макрослой со стохастической динамикой и событиями.
  for (const k of ['air', 'food', 'cohesion', 'hull'] as ShipStat[]) {
    const bias = k === 'hull' ? -.35 : k === 'cohesion' ? -.1 : -.12
    g.ship[k] = clamp(g.ship[k] + bias + (random(g) - .5) * 3.3)
  }
  if (g.age > 0 && g.age % 7 === 0) {
    const reports = [
      { title: 'Перестройка жилого сектора', text: 'На нижней палубе завершили реконструкцию. Не всем досталось новое жильё.', change: { cohesion: -2 } },
      { title: 'Обновление теплиц', text: 'Ботаники заменили часть осветительных систем. Урожайность постепенно растёт.', change: { food: 5 } },
      { title: 'Выборы совета', text: 'Прошли выборы в совет корабля. Впереди — непростые переговоры о бюджете.', change: { cohesion: -3 } },
      { title: 'Профилактика реактора', text: 'Инженерный корпус завершил проверку энергоузла и устранил несколько дефектов.', change: { hull: 4 } },
      { title: 'Память об отправлении', text: 'В архиве открылась выставка о Земле, которую никто из посетителей не видел.', change: { cohesion: 3 } },
      { title: 'Авария водоочистки', text: 'На одном из уровней переработки воды произошёл сбой. Резервов хватит, но ограничения возможны.', change: { food: -7, cohesion: -3 } },
      { title: 'Перегрузка вентиляции', text: 'Несколько инженерных отсеков временно перевели на резервный воздухообмен.', change: { air: -6, hull: -1 } }
    ] as const
    const item = pick(g, reports)
    if (item.title === 'Авария водоочистки' || item.title === 'Перегрузка вентиляции') g.flags.shipIncidentAge = g.age
    applyEffects(g, { ship: { ...item.change } })
    addLog(g, 'ship', item.title, item.text)
  }
}

function peopleTick(g: GameState) {
  for (const person of g.people) {
    if (!person.alive) continue
    person.age += 1
    if (person.age < 65) continue
    const probability = Math.min(.58, Math.pow((person.age - 62) / 42, 2.2) * .24)
    if (random(g) < probability || person.age > 103) {
      person.alive = false
      if (person.id === 'friend') g.flags.livingTogether = false
      addLog(g, 'memory', `Уход: ${person.name}`, `В возрасте ${person.age} лет ${person.name} уходит из жизни. На корабле продолжают работать двигатели, но привычный мир становится немного другим.`)
      g.memories.push(resolveText(g, `Пережил{{hero:|а}} уход человека, с которым была связана значительная часть жизни: ${person.name}.`))
      g.stats.morale = clamp(g.stats.morale - Math.min(13, Math.round(person.bond / 8)))
      g.stats.stress = clamp(g.stats.stress + 6)
    }
  }
}

/** Ровесники живут упрощённой жизнью: профессия в 16 лет и смертность, зависящая от достатка. */
function peersTick(g: GameState) {
  for (const peer of g.peers) {
    if (!peer.alive) continue
    if (g.age === 16 && !peer.job) peer.job = peerJob(g, peer)
    const dies = g.age < 5
      ? chance(g, infantYearlyChance(infantRiskFor(peer.wealth)))
      : chance(g, elderDeathChance(g.age, 70, peer.wealth))
    if (dies || g.age > 105) {
      peer.alive = false
      peer.diedAt = g.age
      if (g.age >= 5) addLog(g, 'notice', `Ушёл ровесник: ${peer.name}`, `${peer.name}, родившийся(-аяся) в тот же год, что и ты, умирает в возрасте ${g.age} лет.`)
    }
  }
}

function introScene(g: GameState) {
  if (g.age === 1) addLog(g, 'life', 'Первые шаги', 'Твой мир ограничивается несколькими комнатами, голосом родителя и мягким гулом вентиляции.')
  if (g.age === 4) addLog(g, 'life', 'Первые воспоминания', 'Ты узнаёшь улицы своего жилого сектора и впервые самостоятельно добираешься до общественного сада.')
}

function deathTick(g: GameState) {
  const infant = g.age < 5
  const p = infant
    ? infantYearlyChance(g.birth.infantRisk)
    : elderDeathChance(g.age, g.stats.health, g.birth.wealth)
  if (g.age < 105 && random(g) >= p) return
  g.stopped = true
  closeEstate(g)
  g.pending = null
  g.moment = null
  g.causeOfDeath = infant ? 'болезни раннего детства' : g.stats.health < 30 ? 'осложнений хронического заболевания' : 'естественных причин'
  const left = Math.max(0, 340 - g.shipYear)
  addLog(g, 'memory', 'Последняя запись', infant
    ? `${g.protagonist.name} уходит из жизни в возрасте ${g.age}. Жизнь на корабле была слишком короткой, чтобы оставить много следов. «Пилигрим» продолжает путь.`
    : `${g.protagonist.name} завершает свою жизнь в возрасте ${g.age} лет. «Пилигрим» продолжает путь. До прибытия остаётся ${left} лет.`)
}

export function tick(state: GameState): GameState {
  if (state.stopped || state.pending) return state
  const g = structuredClone(state)
  expireMoment(g)
  g.moodByAge[g.age] = Math.round(g.stats.morale)
  g.age += 1
  g.shipYear += 1
  g.phase = 0
  g.attention = ATTENTION_PER_YEAR
  g.director = cool(g.director)
  if (!canFocus(g.age, g.focus) && g.age >= FOCUS_FROM_AGE) g.focus = 'study'
  worldTick(g)
  peopleTick(g)
  peersTick(g)
  focusTick(g)
  const economyResult = settleYear(g)
  applyEffects(g, { stats: economyResult.stats })
  for (const message of economyResult.logs) addLog(g, 'notice', 'Личные средства', message)
  introScene(g)
  deathTick(g)
  if (g.stopped) {
    g.moodByAge[g.age] = Math.round(g.stats.morale)
    return g
  }
  const line = ambientLine(g, 0)
  addLog(g, 'ambient', line.title, resolveText(g, line.text))

  const options = storylets.filter(s =>
    !g.seen.includes(s.id)
    && g.age >= s.min
    && g.age <= s.max
    && s.available(g)
    && allowedHere(g, s.weird)
    && (!mentions(s.body, 'friend') || isKnown(g, 'friend'))
    && (!mentions(s.body, 'parent') || isKnown(g, 'parent'))
    && (!mentions(s.body, 'neighbor') || isKnown(g, 'neighbor'))
    && (!mentions(s.body, 'mentor') || isKnown(g, 'mentor'))
    && (!mentions(s.body, 'child') || isKnown(g, 'child'))
  )
  const selected = pickStorylet(g, options)
  if (selected) {
    g.pending = selected.id
    g.seen.push(selected.id)
    g.director = afterDecision(g.director, selected, g.age)
    addLog(g, 'notice', 'Требуется решение', `Год ${g.shipYear}: ${selected.title}. Время остановлено до выбора действия.`)
  }
  return g
}

export function setFocus(state: GameState, focus: Focus): GameState {
  if (state.stopped || state.focus === focus || !canFocus(state.age, focus)) return state
  return { ...state, focus }
}

export function getStorylet(g: GameState) {
  return storylets.find(s => s.id === g.pending) ?? null
}

export function epitaph(g: GameState) {
  const decisions = g.history.filter(h => h.kind === 'choice').length
  if (g.age < 5) {
    return `Эта жизнь продлилась ${g.age} ${g.age === 1 ? 'год' : 'года'}. «Пилигрим» этого не заметил, но в одном секторе стало тише. Каждая жизнь на корабле начинается с лотереи, и не всем в ней везёт.`
  }
  return [
    `Жизнь ${g.protagonist.name} продолжалась ${g.age} лет на корабле, который так и не увидел своего пункта назначения.`,
    `В этой жизни осталось ${g.memories.length} особенных воспоминаний и ${decisions} важных решений.`,
    '«Пилигрим» продолжает путешествие. История каждого человека — часть его пути.'
  ].join(' ')
}
