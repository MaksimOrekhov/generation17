import catalogV1 from './fixtures/catalog-v1.json'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import baseline from './economy-t6-baseline.json'
import { advanceYear, beat, canChoose, canTakeMoment, createGame, decide, eligibleMoments, purchase, setGoal, setLoad, skipMoment, takeMoment, tick } from '../engine'
import { runClock } from '../clock'
import { findInconsistencies } from '../invariants'
import { moments } from '../moments'
import { canBuy, getOffer } from '../offers'
import { PERSONAL_TIME, canSpendPersonalTime, personalTimeAllowance, personalTimeOf, personalTimeView, repairPersonalTime, startPersonalTimeYear, timeRegimeOf } from '../personalTime'
import { hash32 } from '../random'
import { repairSave } from '../save'
import { storylets } from '../storylets'
import type { GameState } from '../types'
import { T7_MOMENT_IDS, T7_STORYLET_IDS, t7Worker, withPending } from './t7-fixtures'
import { T9_MOMENT_IDS } from './t9-fixtures'
import { GEN57_STORYLET_IDS } from './gen57-fixtures'
import { TIME_RULESETS, withTimeRules } from '../../../scripts/personal-time-rules'

/** Взрослый техник; год уже начат по действующему режиму, как после настоящего годового расчёта. */
function adult(age = 45, load: 1 | 0.6 = 1, balance = 5_000, seed = 4242): GameState {
  const g = createGame(seed)
  g.age = age; g.economy.settledAge = age; g.economy.balance = balance
  g.protagonist.job = 'Техник'
  g.economy.work = { ...g.economy.work, kind: 'working', job: 'Техник', load, service: age - 18, jobSince: 18, gradeSince: 18, lastWage: 1_100 }
  g.stats.health = 95; g.ship.air = 100; g.ship.food = 100
  startPersonalTimeYear(g)
  return g
}
function retired(age = 65, mentor = false): GameState {
  const g = adult(age)
  g.flags.retirement = true; g.flags.retirementPath = mentor ? 'mentor' : 'left'
  g.economy.work = { ...g.economy.work, kind: 'retired', path: mentor ? 'mentor' : 'left', mentor: mentor && age <= 80 }
  startPersonalTimeYear(g)
  return g
}
/** Настоящая смена года; сюжет, если выпал, снимается без выбора — тестам нужен только годовой расчёт. */
function nextYear(g: GameState): GameState {
  const next = tick(g)
  expect(next.age).toBe(g.age + 1)
  expect(next.stopped).toBe(false)
  return next.pending ? { ...next, pending: null } : next
}
const time = (g: GameState) => ({ left: g.attention, ...g.timeYear })
const roundTrip = (g: GameState) => repairSave(JSON.parse(JSON.stringify(g)) as GameState).game
const legacySave = (g: GameState, attention: unknown) => {
  const raw = JSON.parse(JSON.stringify(g)) as Record<string, unknown>
  delete raw.timeYear
  raw.attention = attention
  return raw as unknown as GameState
}
const clean = (g: GameState) => expect(findInconsistencies(g)).toEqual([])

describe('T9: годовой бюджет по фактически действующему режиму', () => {
  it('детство, учёба до 18, полная и сокращённая ставка, стажировка, переходный статус, пенсия и наставничество', () => {
    const child = createGame(7)
    expect(time(child)).toEqual({ left: 3, limit: 3, basis: 'childhood' })
    clean(child)
    const work = adult().economy.work
    expect(personalTimeAllowance(adult())).toEqual({ limit: 3, basis: 'full' })
    expect(personalTimeAllowance(adult(45, .6))).toEqual({ limit: 4, basis: 'reduced' })
    expect(timeRegimeOf({ ...work, kind: 'trainee' }, 17)).toBe('study')
    expect(timeRegimeOf({ ...work, kind: 'trainee' }, 33)).toBe('trainee')
    expect(timeRegimeOf({ ...work, kind: 'between' }, 40)).toBe('transition')
    expect(timeRegimeOf({ ...work, kind: 'sick' }, 40)).toBe('transition')
    expect(personalTimeAllowance(retired())).toEqual({ limit: 4, basis: 'retired' })
    expect(personalTimeAllowance(retired(70, true))).toEqual({ limit: 4, basis: 'mentor' })
    // Болезнь и переходный статус не штрафуют: столько же, сколько у работающего на полной ставке.
    for (const regime of ['study', 'trainee', 'transition', 'childhood'] as const) expect(PERSONAL_TIME.allowance[regime]).toBe(PERSONAL_TIME.allowance.full)
  })

  it('16 лет: годовой расчёт переводит в учёбу-стажировку, лимит по-прежнему 3', () => {
    const g = createGame(9)
    g.age = 15; g.economy.settledAge = 15; g.stats.health = 95
    const next = nextYear(g)
    expect(next.economy.work.kind).toBe('trainee')
    expect(time(next)).toEqual({ left: 3, limit: 3, basis: 'study' })
  })

  it('новый год восстанавливает лимит, остаток не переносится и не копится', () => {
    let g = adult(45, .6)
    g = purchase(g, 'sector-trip', { sectorId: canBuy(g, 'sector-trip').sectorOptions![0]!.id })
    expect(g.attention).toBe(3)
    g = nextYear(g)
    expect(time(g)).toEqual({ left: 4, limit: 4, basis: 'reduced' })
    clean(g)
  })

  it('смерть закрывает личное время: ноль, без покупок и моментов', () => {
    const g = adult(104)
    g.moment = 'm-window-evening'
    const dead = tick(g)
    expect(dead.stopped).toBe(true)
    expect(time(dead)).toEqual({ left: 0, limit: 0, basis: 'ended' })
    expect(personalTimeAllowance(dead)).toEqual({ limit: 0, basis: 'ended' })
    expect(takeMoment(dead)).toBe(dead)
    clean(dead)
  })
})

describe('T9: смена нагрузки посреди года не выдаёт время сразу', () => {
  it('1 → 0,6 после частичного расхода: в этом году остаётся 1, со следующего — 4', () => {
    let g = adult()
    g = purchase(g, 'course-pro')
    expect(time(g)).toEqual({ left: 1, limit: 3, basis: 'full' })
    const reduced = setLoad(g, .6)
    expect(reduced.economy.work.load).toBe(.6)
    expect(time(reduced)).toEqual({ left: 1, limit: 3, basis: 'full' })
    expect(reduced.rng).toBe(g.rng)
    clean(reduced)
    expect(time(nextYear(reduced))).toEqual({ left: 4, limit: 4, basis: 'reduced' })
  })

  it('после полного расхода смена ставки не возвращает ни одной единицы', () => {
    let g = adult()
    g = purchase(purchase(g, 'course-pro'), 'sector-trip', { sectorId: canBuy(g, 'sector-trip').sectorOptions![0]!.id })
    expect(g.attention).toBe(0)
    const reduced = setLoad(g, .6)
    expect(reduced.attention).toBe(0)
    expect(canTakeMoment({ ...reduced, moment: 'm-window-evening' })).toBe(false)
    expect(canSpendPersonalTime(reduced, 1).available).toBe(false)
  })

  it('0,6 → 1: нынешний год сохраняет 4, следующий получает 3 — повышенный лимит не уходит в новый год', () => {
    const g = adult(50, .6)
    const full = setLoad(g, 1)
    expect(time(full)).toEqual({ left: 4, limit: 4, basis: 'reduced' })
    clean(full)
    expect(time(nextYear(full))).toEqual({ left: 3, limit: 3, basis: 'full' })
  })

  it('смена прямо перед годовым расчётом: новый режим действует с этого расчёта — и время тоже', () => {
    const g = adult()
    expect(time(nextYear(setLoad(g, .6)))).toEqual({ left: 4, limit: 4, basis: 'reduced' })
  })

  it('переключение туда и обратно в одном году ничего не выдаёт и не тратит', () => {
    let g = adult(50, .6)
    g = purchase(g, 'course-pro')
    const toggled = setLoad(setLoad(g, 1), .6)
    expect(toggled.economy.balance).toBe(g.economy.balance)
    expect(time(toggled)).toEqual(time(g))
    expect(time(nextYear(toggled))).toEqual({ left: 4, limit: 4, basis: 'reduced' })
  })

  it('сохранение и загрузка после смены ставки не создают единиц', () => {
    const g = setLoad(purchase(adult(), 'course-pro'), .6)
    const loaded = roundTrip(g)
    expect(time(loaded)).toEqual(time(g))
    expect(roundTrip(loaded)).toEqual(loaded)
    expect(time(nextYear(loaded))).toEqual({ left: 4, limit: 4, basis: 'reduced' })
  })

  it('лимит выдаётся один раз: отметки года, проверки и прогнозы его не трогают', () => {
    let g = adult(45, .6)
    g = purchase(g, 'course-pro')
    for (let i = 0; i < 3; i++) { g = beat(g); if (g.moment) g = skipMoment(g) }
    personalTimeView(g)
    canBuy(g, 'family-trip')
    expect(time(g)).toEqual({ left: 2, limit: 4, basis: 'reduced' })
  })
})

describe('T9: пенсионные переходы определяются действующим статусом, а не возрастом', () => {
  it('решение о пенсии не тратит времени и не выдаёт его сразу; пенсия начинается с расчёта', () => {
    for (const [index, basis] of [[0, 'retired'], [1, 'mentor']] as const) {
      const g = adult(63)
      g.attention = 0
      g.pending = 'retirement'
      expect(canChoose(g, index).available).toBe(true)
      const decided = decide(g, index)
      expect(time(decided)).toEqual({ left: 0, limit: 3, basis: 'full' })
      const year = nextYear(decided)
      expect(year.economy.work.kind).toBe('retired')
      expect(time(year)).toEqual({ left: 4, limit: 4, basis })
      clean(year)
    }
  })

  it('продолжение работы до 77: полная ставка даёт 3, автоматическая пенсия в 77 — 4', () => {
    const g = adult(76)
    g.flags.retirement = true; g.flags.retirementPath = 'continue'; g.economy.work.path = 'continue'
    expect(time(g).limit).toBe(3)
    const pension = nextYear(g)
    expect(pension.economy.work.kind).toBe('retired')
    expect(time(pension)).toEqual({ left: 4, limit: 4, basis: 'retired' })
  })

  it('наставничество заканчивается после 80: основание меняется, лимит не падает', () => {
    const g = retired(80, true)
    expect(time(g).basis).toBe('mentor')
    const after = nextYear(g)
    expect(after.economy.work.mentor).toBe(false)
    expect(time(after)).toEqual({ left: 4, limit: 4, basis: 'retired' })
    clean(after)
  })

  it('пенсионный переход не выдаёт время дважды: повторная загрузка и расчёт на копии ничего не меняют', () => {
    const g = adult(63)
    g.flags.retirement = true; g.flags.retirementPath = 'left'
    const year = nextYear(g)
    const spent = takeMoment({ ...year, moment: 'm-window-evening' })
    expect(spent.attention).toBe(3)
    expect(roundTrip(spent).attention).toBe(3)
    personalTimeView(spent)
    expect(spent.attention).toBe(3)
  })

  it('переобучение: стоит 1, год стажировки — 3, затем по ставке (0,6 — снова 4)', () => {
    for (const load of [1, .6] as const) {
      const g = adult(45, load)
      const bought = purchase(g, 'retrain', { job: 'Медик' })
      expect(g.attention - bought.attention).toBe(1)
      const internship = nextYear(bought)
      expect(internship.economy.work.kind).toBe('trainee')
      expect(time(internship)).toEqual({ left: 3, limit: 3, basis: 'trainee' })
      const back = nextYear(internship)
      expect(back.economy.work.kind).toBe('working')
      expect(time(back).limit).toBe(load === 1 ? 3 : 4)
      clean(back)
    }
  })
})

describe('T9: стоимость действий в личном времени', () => {
  it('каталог: курс 2, переобучение, экскурсия и поездка 1, каюта и биокупол 0', () => {
    expect(Object.fromEntries(['course-pro', 'retrain', 'sector-trip', 'family-trip', 'own-cabin', 'dome-pass'].map(id => [id, getOffer(id)!.attention])))
      .toEqual({ 'course-pro': 2, retrain: 1, 'sector-trip': 1, 'family-trip': 1, 'own-cabin': 0, 'dome-pass': 0 })
    expect(PERSONAL_TIME.moment).toBe(1)
  })

  it('курс требует 2: при одной единице заблокирован, состояние не меняется, причина понятна', () => {
    const g = adult(); g.attention = 1
    const before = structuredClone(g)
    expect(canBuy(g, 'course-pro')).toMatchObject({ available: false, attention: 2, reason: 'Не хватает личного времени: нужно 2 ед., осталось 1.' })
    expect(purchase(g, 'course-pro')).toBe(g)
    expect(g).toEqual(before)
    g.attention = 2
    const bought = purchase(g, 'course-pro')
    expect(bought.attention).toBe(0)
    expect(bought.economy.ledger.at(-1)).toMatchObject({ kind: 'purchase', ref: 'course-pro', amount: 350 })
    expect(bought.rng).toBe(g.rng)
  })

  it('семейная поездка и экскурсия стоят по одной единице', () => {
    const g = t7Worker(5_000)
    const trip = purchase(g, 'family-trip', { participantIds: ['friend', 'sibling'] })
    expect(g.attention - trip.attention).toBe(1)
    const sector = canBuy(trip, 'sector-trip').sectorOptions![0]!.id
    const visit = purchase(trip, 'sector-trip', { sectorId: sector })
    expect(trip.attention - visit.attention).toBe(1)
    clean(visit)
  })

  it('бесплатные по времени действия доступны и при нуле: каюта, биокупол, цель накопления, нагрузка', () => {
    const g = adult(45); g.attention = 0
    const cabin = purchase(g, 'own-cabin')
    expect(cabin).not.toBe(g); expect(cabin.attention).toBe(0)
    const dome = purchase(cabin, 'dome-pass')
    expect(dome).not.toBe(cabin); expect(dome.attention).toBe(0)
    expect(setGoal(dome, 'course-pro').attention).toBe(0)
    expect(setLoad(dome, .6).attention).toBe(0)
  })

  it('при нуле: «в этом году оно закончилось»; бесплатная проверка не требует времени', () => {
    const g = adult(); g.attention = 0
    expect(canSpendPersonalTime(g, 1)).toEqual({ available: false, reason: 'Не хватает личного времени: в этом году оно закончилось.' })
    expect(canSpendPersonalTime(g, 0)).toEqual({ available: true, reason: null })
  })
})

describe('T9: сюжетные решения и сюжетные покупки', () => {
  const windowGame = (attention: number) => { const g = withPending(t7Worker(1_000), 'window-offer'); g.attention = attention; return g }

  it('скидочный курс T7 стоит столько же, сколько каталожный: 2 единицы', () => {
    const g = windowGame(2)
    expect(canChoose(g, 0).purchase?.attention).toBe(2)
    const next = decide(g, 0)
    expect(next.attention).toBe(0)
    expect(next.economy.balance).toBe(700)
  })

  it('при одной единице курс в сюжете заблокирован, бесплатная альтернатива и поездка доступны', () => {
    const g = windowGame(1)
    expect(canChoose(g, 0)).toMatchObject({ available: false, reason: 'Не хватает личного времени: нужно 2 ед., осталось 1.' })
    expect(decide(g, 0)).toBe(g)
    expect(canChoose(g, 2).available).toBe(true)
    const trip = decide(g, 1, { participantIds: ['friend', 'sibling'] })
    expect(trip.attention).toBe(0)
    expect(trip.pending).toBeNull()
  })

  it('обычное сюжетное решение при нуле доступно и ничего не тратит', () => {
    const g = windowGame(0)
    expect(canChoose(g, 2).available).toBe(true)
    const next = decide(g, 2)
    expect(next.pending).toBeNull()
    expect(next.attention).toBe(0)
    for (const story of storylets) for (const [i, choice] of story.choices.entries()) {
      if (choice.purchase) continue
      // Ни один вариант без каталожной покупки не проверяет и не тратит личное время.
      const probe = { ...windowGame(0), pending: story.id }
      const reason = canChoose(probe, i).reason
      expect(reason ?? '').not.toMatch(/личного времени/)
    }
  })

  it('повторное решение не списывает дважды', () => {
    const g = windowGame(3)
    const once = decide(g, 0)
    expect(decide(once, 0)).toBe(once)
    expect(once.attention).toBe(1)
  })
})

describe('T9: короткие моменты', () => {
  const withMoment = (g: GameState, id = 'm-window-evening') => ({ ...g, moment: id })

  it('принятие стоит 1 и не тратит RNG; повторное принятие невозможно', () => {
    const g = withMoment(adult())
    const taken = takeMoment(g)
    expect(taken.attention).toBe(2)
    expect(taken.rng).toBe(g.rng)
    expect(taken.economy).toEqual(g.economy)
    expect(takeMoment(taken)).toBe(taken)
  })

  it('отказ и истечение бесплатны; при нуле момент не принять', () => {
    const g = withMoment(adult())
    expect(skipMoment(g).attention).toBe(3)
    const expired = beat(g)
    expect(expired.attention).toBe(3)
    const empty = { ...g, attention: 0 }
    expect(canTakeMoment(empty)).toBe(false)
    expect(takeMoment(empty)).toBe(empty)
    expect(skipMoment(empty).moment).toBeNull()
  })

  it('при нулевом остатке новые моменты не выпадают, но год идёт как обычно', () => {
    let g = { ...adult(), attention: 0 }
    for (let i = 0; i < 3; i++) { g = beat(g); expect(g.moment).toBeNull() }
    expect(nextYear(g).attention).toBe(3)
  })

  it('условия новых моментов читают режим этого года, а не только что нажатую ставку', () => {
    const ids = (g: GameState) => eligibleMoments(g).map(m => m.id).filter(id => T9_MOMENT_IDS.has(id))
    expect(ids(adult(45))).toEqual([])
    expect(ids(setLoad(adult(45), .6))).toEqual([])
    expect(ids(adult(45, .6))).toEqual(expect.arrayContaining(['m-free-workshop', 'm-free-strings']))
    const reducedActive = { ...adult(45, .6), moment: 'm-free-workshop' }
    clean(setLoad(reducedActive, 1))
    expect(ids(retired(65))).toEqual(expect.arrayContaining(['m-retired-alarm', 'm-retired-archive']))
    expect(ids(retired(65))).not.toContain('m-mentor-question')
    expect(ids(retired(65, true))).toContain('m-mentor-question')
    expect(ids(retired(81, true))).not.toContain('m-mentor-question')
  })

  it('момент с родителем требует живого родителя', () => {
    const g = adult(45, .6)
    expect(eligibleMoments(g).some(m => m.id === 'm-free-parent-day')).toBe(true)
    g.people.find(p => p.id === 'parent')!.alive = false
    expect(eligibleMoments(g).some(m => m.id === 'm-free-parent-day')).toBe(false)
  })

  it('скорость времени не создаёт единиц: 0,5× и 16× дают те же годы, что и шаг по году', () => {
    const stepped = [adult(45, .6)]
    for (let i = 0; i < 3; i++) { const n = advanceYear(stepped.at(-1)!); stepped.push(n.pending ? { ...n, pending: null } : n) }
    for (const speed of [.5, 16]) {
      let g = adult(45, .6), progress = 0
      for (let guard = 0; guard < 100_000 && g.age < 48; guard++) {
        const r = runClock(g, progress, .25, speed, 22)
        g = r.game; progress = r.progress
        if (g.pending) g = { ...g, pending: null }
        expect(g.attention).toBeLessThanOrEqual(g.timeYear.limit)
      }
      expect(time(g)).toEqual(time(stepped.at(-1)!))
      expect(g.rng).toBe(stepped.at(-1)!.rng)
    }
  })
})

describe('T9: «свободный вечер» — дополнительный шанс только при времени сверх рабочей нормы', () => {
  const rolls = (g: GameState) => { let n = 0; let s: GameState = { ...g, phase: 0 }; for (let i = 0; i < 3; i++) { const before = s.rng; s = beat({ ...s, moment: null }); if (s.rng !== before) n++ } return n }
  it('полная ставка и стажировка: та же последовательность RNG, что и в режиме T8', () => {
    const g = adult()
    const t9 = beat(beat(beat(g)))
    const t8 = withTimeRules('T8', () => beat(beat(beat(g))))
    expect(t9.rng).toBe(t8.rng)
    expect(t9.moment).toBe(t8.moment)
  })
  it('0,6 ставки и пенсия: шанс 0,2 за лишнюю единицу; при нуле остатка — ни одного броска', () => {
    expect(PERSONAL_TIME.freeTimeChance).toBe(.2)
    const reduced = adult(45, .6)
    // Режим T8 в этом же состоянии бросает только обычный шанс; T9 — тот же бросок и, если мимо, ещё один.
    const byBeat = [0, 1, 2].map(i => { let s = reduced; for (let k = 0; k < i; k++) s = beat({ ...s, moment: null }); return s })
    for (const s of byBeat) {
      const t9 = beat({ ...s, moment: null }), t8 = withTimeRules('T8', () => beat({ ...s, moment: null }))
      if (t8.moment) expect(t9.moment).toBe(t8.moment)
      else expect(t9.rng).not.toBe(t8.rng)
    }
    expect(rolls({ ...reduced, attention: 0 })).toBe(0)
    expect(rolls({ ...retired(70), attention: 0 })).toBe(0)
  })
  it('год по прежним правилам и завершённая жизнь лишнего броска не получают', () => {
    const legacy = repairSave(legacySave(adult(45, .6), 3)).game
    const t9 = beat(legacy), t8 = withTimeRules('T8', () => beat(legacy))
    expect(t9.rng).toBe(t8.rng)
  })

  /** Отметки года подряд: какой RNG и какой момент дала каждая (момент перед отметкой снимается). */
  const beats = (g: GameState, n = 12) => {
    const out: { rng: number; moment: string | null }[] = []
    let s = g
    for (let i = 0; i < n; i++) { s = beat({ ...s, phase: 0, moment: null }); out.push({ rng: s.rng, moment: s.moment }) }
    return out
  }

  it('пустой пул: дополнительный бросок не тратит RNG — последовательность как у T8 и как у полной ставки', () => {
    const saved = [...moments]
    moments.splice(0, moments.length)
    try {
      for (const g of [adult(45, .6), retired(70), retired(70, true)]) {
        expect(eligibleMoments(g)).toEqual([])
        const t9 = beats(g)
        expect(t9).toEqual(withTimeRules('T8', () => beats(g)))
        expect(t9.every(b => b.moment === null)).toBe(true)
        // Ровно один бросок на отметку: тот же, что у полной ставки в этом состоянии.
        expect(t9.map(b => b.rng)).toEqual(beats({ ...g, timeYear: { limit: 3, basis: 'full' }, attention: 3 }).map(b => b.rng))
      }
    } finally {
      moments.splice(0, moments.length, ...saved)
    }
  })

  it('непустой пул: при промахе обычного шанса — ровно один дополнительный бросок, не больше одного момента', () => {
    const g = adult(45, .6)
    expect(eligibleMoments(g).length).toBeGreaterThan(0)
    let s = g, extra = 0, misses = 0
    for (let i = 0; i < 40; i++) {
      const prev = { ...s, phase: 0 as const, moment: null }
      const t8 = withTimeRules('T8', () => beat(prev)), t9 = beat(prev)
      if (t8.moment) {
        // Обычный шанс сработал: «свободный вечер» не бросается, исход тот же.
        expect(t9.rng).toBe(t8.rng); expect(t9.moment).toBe(t8.moment)
      } else {
        misses++
        expect(t9.rng).not.toBe(t8.rng)
        if (t9.moment) extra++
      }
      expect(typeof t9.moment === 'string' || t9.moment === null).toBe(true)
      s = t9
    }
    expect(misses).toBeGreaterThan(0)
    expect(extra).toBeGreaterThan(0)
    expect(extra).toBeLessThan(misses)
  })

  it('полная ставка: тот же RNG и те же моменты, что в T8, при любом пуле', () => {
    const g = adult()
    expect(beats(g, 30)).toEqual(withTimeRules('T8', () => beats(g, 30)))
  })

  it('одинаковые seed дают одинаковые жизни на 0,6 ставки и на пенсии', () => {
    const live = (seed: number) => {
      let g = adult(45, .6, 5_000, seed)
      for (let i = 0; i < 40 && !g.stopped; i++) {
        if (g.pending) { const e = storylets.find(x => x.id === g.pending)!; g = decide(g, e.choices.findIndex((_, k) => canChoose(g, k).available)); continue }
        g = advanceYear(g)
      }
      return g
    }
    for (const seed of [11, 4242]) expect(live(seed)).toEqual(live(seed))
  })
})

describe('T9: миграция сохранений до T9', () => {
  it.each([3, 1, 0])('старое сохранение с остатком %i: текущий год по прежним правилам, ничего не прибавлено', left => {
    const g = adult(50, .6)
    const loaded = repairSave(legacySave({ ...g, attention: left }, left))
    expect(time(loaded.game)).toEqual({ left, limit: 3, basis: 'legacy' })
    expect(loaded.notes.some(n => n.startsWith('Личное время'))).toBe(true)
    expect(loaded.game.economy).toEqual(g.economy)
    expect(loaded.game.stats).toEqual(g.stats)
    expect(loaded.game.people).toEqual(g.people)
    expect(loaded.game.history).toEqual(g.history)
    expect(loaded.game.rng).toBe(g.rng)
    clean(loaded.game)
    // Со следующего года — новые правила.
    expect(time(nextYear(loaded.game))).toEqual({ left: 4, limit: 4, basis: 'reduced' })
  })

  it.each([
    [Number.NaN, 0], ['3', 0], [null, 0], [-2, 0], [2.7, 2], [9, 3], [Number.POSITIVE_INFINITY, 0]
  ])('повреждённый остаток %s → %i, без лишнего времени', (raw, expected) => {
    const loaded = repairSave(legacySave(adult(), raw)).game
    expect(loaded.attention).toBe(expected)
    expect(loaded.timeYear).toEqual({ limit: 3, basis: 'legacy' })
    clean(loaded)
  })

  it('повреждённый лимит пересчитывается по режиму, остаток не растёт', () => {
    const g = adult(45, .6)
    g.attention = 2
    const broken = { ...g, timeYear: { limit: 9, basis: 'reduced' } } as unknown as GameState
    expect(repairPersonalTime(broken).game).toMatchObject({ attention: 2, timeYear: { limit: 4, basis: 'reduced' } })
    const unknownBasis = { ...g, attention: 4, timeYear: { limit: 4, basis: 'holiday' } } as unknown as GameState
    expect(repairPersonalTime(unknownBasis).game).toMatchObject({ attention: 4, timeYear: { limit: 4, basis: 'reduced' } })
    const overLimit = { ...adult(), attention: 4 }
    expect(repairPersonalTime(overLimit).game.attention).toBe(3)
  })

  it('частичный расход, загрузка после смены профессии и в пенсионном статусе', () => {
    const partial = takeMoment({ ...adult(45, .6), moment: 'm-window-evening' })
    expect(roundTrip(partial)).toEqual(partial)
    const retrained = purchase(adult(40), 'retrain', { job: 'Агроном' })
    const loaded = roundTrip(retrained)
    expect(time(loaded)).toEqual({ left: 2, limit: 3, basis: 'full' })
    expect(time(nextYear(loaded))).toEqual({ left: 3, limit: 3, basis: 'trainee' })
    const pension = repairSave(legacySave(retired(70), 2)).game
    expect(time(pension)).toEqual({ left: 2, limit: 3, basis: 'legacy' })
    expect(personalTimeView(pension).next?.text).toBe('Со следующего года: 4 ед. — пенсия.')
    expect(time(nextYear(pension))).toEqual({ left: 4, limit: 4, basis: 'retired' })
  })

  it('исправное сохранение T9 возвращается тем же объектом; мёртвый герой — ноль', () => {
    const g = adult()
    expect(repairPersonalTime(g).game).toBe(g)
    const dead = legacySave({ ...adult(), stopped: true }, 3)
    expect(repairPersonalTime(dead).game).toMatchObject({ attention: 0, timeYear: { limit: 0, basis: 'ended' } })
  })
})

describe('T9: инварианты, детерминизм, RNG и финансы', () => {
  it('отрицательный, дробный остаток и превышение лимита — нарушения', () => {
    expect(findInconsistencies({ ...adult(), attention: -1 }).join()).toMatch(/отрицательное или дробное/)
    expect(findInconsistencies({ ...adult(), attention: 1.5 }).join()).toMatch(/отрицательное или дробное/)
    expect(findInconsistencies({ ...adult(), attention: 4 }).join()).toMatch(/больше лимита/)
    expect(findInconsistencies({ ...adult(), timeYear: { limit: 4, basis: 'full' } }).join()).toMatch(/не соответствует основанию/)
    expect(personalTimeOf({ ...adult(), attention: -5 }).left).toBe(0)
  })

  it('операции с личным временем не тратят RNG и не трогают кредиты', () => {
    const g = { ...adult(45, 1, 5_000), moment: 'm-window-evening' }
    for (const next of [takeMoment(g), skipMoment(g), setLoad(g, .6), purchase(g, 'own-cabin')]) expect(next.rng).toBe(g.rng)
    const taken = takeMoment(g)
    expect(taken.economy.balance).toBe(g.economy.balance)
    expect(taken.economy.ledger).toEqual(g.economy.ledger)
    const course = purchase(g, 'course-pro')
    expect(course.economy.ledger.slice(g.economy.ledger.length)).toEqual([expect.objectContaining({ ref: 'course-pro', amount: 350 })])
  })

  it('одинаковый seed — одинаковая жизнь с покупками и моментами; инварианты чисты', () => {
    const live = (seed: number) => {
      let g = createGame(seed)
      for (let guard = 0; guard < 140 && !g.stopped; guard++) {
        if (g.pending) { const e = storylets.find(s => s.id === g.pending)!; const i = e.choices.findIndex((_, k) => canChoose(g, k).available); g = decide(g, i); continue }
        while (g.phase < 3 && !g.pending && !g.stopped) { g = beat(g); if (g.moment && canTakeMoment(g)) g = takeMoment(g) }
        if (g.age >= 40 && g.economy.work.kind === 'working' && g.economy.work.load === 1 && g.economy.balance > 4_000) g = setLoad(g, .6)
        const course = purchase(g, 'course-pro'); if (course !== g) g = course
        expect(findInconsistencies(g)).toEqual([])
        g = tick(g)
        expect(g.attention).toBeLessThanOrEqual(g.timeYear.limit)
      }
      return g
    }
    expect(live(31)).toEqual(live(31))
  })

  it('прежний режим T8 задан явно и восстанавливается: 3 на любой год, курс за 1', () => {
    withTimeRules('T8', () => {
      expect(personalTimeAllowance(adult(45, .6)).limit).toBe(3)
      expect(personalTimeAllowance(retired()).limit).toBe(3)
      expect(getOffer('course-pro')!.attention).toBe(1)
    })
    expect(personalTimeAllowance(adult(45, .6)).limit).toBe(4)
    expect(getOffer('course-pro')!.attention).toBe(TIME_RULESETS.T9.costs['course-pro'])
  })
})

describe('T9: жизни без покупок — те же эталоны T6 и при новых правилах, пока режим не даёт лишнего времени', () => {
  // Без покупок и с одним моментом на отметку года остаток никогда не доходит до нуля раньше третьей отметки,
  // поэтому новые лимиты не меняют ни RNG, ни решений. Расходятся только годы со временем сверх рабочей нормы
  // (пенсия): там работает «свободный вечер». Новые моменты T9 исключены: они меняют пул.
  const savedStorylets = [...storylets], savedMoments = [...moments]
  beforeAll(() => {
    storylets.splice(0, storylets.length, ...savedStorylets.filter(s => !T7_STORYLET_IDS.has(s.id) && !GEN57_STORYLET_IDS.has(s.id)).sort((a, b) => catalogV1.indexOf(a.id) - catalogV1.indexOf(b.id)))
    moments.splice(0, moments.length, ...savedMoments.filter(m => !T7_MOMENT_IDS.has(m.id) && !T9_MOMENT_IDS.has(m.id)))
  })
  afterAll(() => {
    storylets.splice(0, storylets.length, ...savedStorylets)
    moments.splice(0, moments.length, ...savedMoments)
  })
  it.each(baseline.runs)('seed=$seed, acceptMoments=$acceptMoments совпадает с T6 при правилах T9', expected => {
    const { seed, acceptMoments } = expected
    let g = createGame(seed)
    const trace: unknown[] = []
    while (!g.stopped && g.timeYear.limit <= PERSONAL_TIME.allowance.full) {
      if (g.pending) {
        const event = storylets.find(s => s.id === g.pending)!
        const choice = hash32('t6-baseline', seed, event.id, g.age) % event.choices.length
        trace.push(['choice', g.age, event.id, choice, g.rng])
        g = decide(g, choice)
      } else {
        while (g.phase < 3) {
          g = beat(g)
          if (acceptMoments && g.moment) { trace.push(['moment', g.age, g.moment]); g = takeMoment(g) }
        }
        g = tick(g)
        trace.push(['year', g.age, g.rng, g.economy.balance, g.pending])
      }
    }
    // Либо жизнь прожита целиком по эталону, либо остановились ровно на первом году со временем сверх нормы.
    if (g.stopped) expect(trace.length).toBe(expected.trace.length)
    else expect(g.timeYear.limit).toBeGreaterThan(PERSONAL_TIME.allowance.full)
    expect(trace).toEqual(expected.trace.slice(0, trace.length))
  })
})
