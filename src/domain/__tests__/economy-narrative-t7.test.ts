import { describe, expect, it } from 'vitest'
import { compileStorylet } from '../../content/load'
import { collectKnown, validateContent } from '../../content/validate'
import { canChoose, decide, eligibleMoments, familyTripFlag, purchase, resolveText, tick } from '../engine'
import { findInconsistencies } from '../invariants'
import { codeMoments, moments } from '../moments'
import { canBuy } from '../offers'
import { repairSave } from '../save'
import { codeStorylets, storylets } from '../storylets'
import type { GameState, Storylet } from '../types'
import { T7_MOMENT_IDS, T7_STORYLET_IDS, t7Worker, withPending } from './t7-fixtures'

const story = (id: string) => storylets.find(s => s.id === id)!
/** Как в tick(): возраст, условия и ещё не показанное событие. */
const eligible = (g: GameState, id: string) => {
  const s = story(id)
  return g.age >= s.min && g.age <= s.max && !g.seen.includes(id) && s.available(g)
}
const momentIds = (g: GameState) => eligibleMoments(g).map(m => m.id)
const trip = (ids: string[]) => ({ participantIds: ids })
const newTxns = (before: GameState, after: GameState) => after.economy.ledger.filter(t => t.n >= before.economy.nextTxn)

describe('T7 story money: tiers, conditions and free alternatives', () => {
  const tiers = ['family-need-cell-small', 'family-need-cell-medium', 'family-need-cell-large']
  it.each([
    [999, []], [1000, ['family-need-cell-small']], [4999, ['family-need-cell-small']], [5000, ['family-need-cell-medium']],
    [13999, ['family-need-cell-medium']], [14000, ['family-need-cell-large']], [80000, ['family-need-cell-large']]
  ])('balance %i opens exactly one non-overlapping tier', (balance, expected) => {
    const g = t7Worker(balance)
    expect(tiers.filter(id => eligible(g, id))).toEqual(expected)
  })
  it('the poor mirror is offered to the hero, not asked of them, and never overlaps the paid tiers', () => {
    // Below 1000 credits and at most three years of current obligations (350 a year; an agronomist pays 290).
    const poor = t7Worker(999)
    expect(eligible(poor, 'family-need-apples')).toBe(true)
    expect(eligible(t7Worker(1000), 'family-need-apples')).toBe(false)
    expect(eligible(t7Worker(870, 35, 'Агроном'), 'family-need-apples')).toBe(true)
    expect(eligible(t7Worker(871, 35, 'Агроном'), 'family-need-apples')).toBe(false)
    poor.economy.work.kind = 'retired'
    expect(eligible(poor, 'family-need-apples')).toBe(false)
  })
  it('one answered request closes every other tier for the rest of the life', () => {
    let g = withPending(t7Worker(5000), 'family-need-cell-medium')
    g = decide(g, 2)
    g.economy.balance = 20000
    expect(tiers.filter(id => eligible(g, id))).toEqual([])
  })
  it('a sibling who is dead or absent never asks', () => {
    const g = t7Worker(5000)
    g.people.find(p => p.id === 'sibling')!.alive = false
    expect(tiers.some(id => eligible(g, id))).toBe(false)
    g.people = g.people.filter(p => p.id !== 'sibling')
    expect(tiers.some(id => eligible(g, id))).toBe(false)
  })
  it('an unaffordable payment is refused with a reason while every free answer stays open', () => {
    const g = withPending(t7Worker(150), 'family-need-cell-small')
    expect(canChoose(g, 0)).toMatchObject({ available: false, reason: 'Не хватает 50 кр.', cost: 200 })
    expect(canChoose(g, 1).available).toBe(true)
    expect([2, 3].map(i => canChoose(g, i))).toEqual([
      { available: true, reason: null, cost: 0 }, { available: true, reason: null, cost: 0 }
    ])
    expect(decide(g, 0)).toBe(g)
  })
  it('records the payment once as a story expense with consistent totals and no RNG', () => {
    const g = withPending(t7Worker(5000), 'family-need-cell-medium')
    const next = decide(g, 0)
    expect(next.economy.balance).toBe(4600)
    expect(next.economy.totals.spent - g.economy.totals.spent).toBe(400)
    expect(newTxns(g, next)).toEqual([expect.objectContaining({ kind: 'story-expense', amount: 400, ref: 'family-need-cell-medium' })])
    expect(next.rng).toBe(g.rng)
    expect(next.flags).toMatchObject({ familyNeed: 'paid', familyNeedAge: 35 })
    expect(findInconsistencies(next)).toEqual([])
  })
  it('every shipped T7 decision with a cost keeps an answer without a cost', () => {
    const paid = storylets.filter(s => s.choices.some(c => c.purchase || (c.effects.money ?? 0) < 0))
    expect(paid.length).toBeGreaterThanOrEqual(5)
    for (const s of paid) expect(s.choices.some(c => !c.purchase && (c.effects.money ?? 0) >= 0)).toBe(true)
  })
  it('work status gates the training window; current housing, not old ownership, gates the cabin story', () => {
    const g = t7Worker(5000)
    expect(eligible(g, 'window-offer')).toBe(true)
    g.economy.work.kind = 'between'
    expect(eligible(g, 'window-offer')).toBe(false)
    const home = t7Worker(5000)
    expect(eligible(home, 'cabin-closed-door')).toBe(false)
    home.economy.owned['own-cabin'] = 26
    expect(eligible(home, 'cabin-closed-door')).toBe(false)
    home.economy.housing = 1
    expect(eligible(home, 'cabin-closed-door')).toBe(true)
  })
  it('the sector scene needs a real, not fresh, visit and an outsider hero', () => {
    const g = t7Worker(5000)
    expect(eligible(g, 'lower-deck-stranger')).toBe(false)
    g.economy.owned['visit-sector-lower'] = 33
    expect(eligible(g, 'lower-deck-stranger')).toBe(false)
    g.economy.owned['visit-sector-lower'] = 32
    expect(eligible(g, 'lower-deck-stranger')).toBe(true)
    g.residence = 'lower'
    expect(eligible(g, 'lower-deck-stranger')).toBe(false)
    expect(momentIds({ ...g, residence: 'atrium', economy: { ...g.economy, owned: { 'visit-sector-bio': 20 } } })).toContain('m-sector-bio')
    expect(momentIds(t7Worker(5000)).filter(id => id.startsWith('m-sector-'))).toEqual([])
  })
})

describe('T7 story purchases use the real catalogue', () => {
  const windowGame = (balance = 1000) => withPending(t7Worker(balance), 'window-offer')

  it('the discounted course raises the skill, the course count, lastBought and the ledger by exactly 300', () => {
    const g = windowGame()
    const skill = g.skills.engineering
    expect(canChoose(g, 0)).toMatchObject({ available: true, cost: 300, purchase: { oneTimeCost: 300, regularCost: 350 } })
    const next = decide(g, 0)
    expect(next.economy.balance).toBe(700)
    expect(next.skills.engineering).toBe(skill + 3)
    expect(next.economy.work.courses).toBe(g.economy.work.courses + 1)
    expect(next.economy.lastBought['course-pro']).toBe(35)
    // Тот же каталожный курс: две единицы личного времени, как и в окне трат (T9).
    expect(next.attention).toBe(1)
    expect(next.economy.totals.spent - g.economy.totals.spent).toBe(300)
    expect(newTxns(g, next)).toEqual([expect.objectContaining({ kind: 'purchase', ref: 'course-pro', amount: 300 })])
    expect(next.rng).toBe(g.rng)
    expect(next.pending).toBeNull()
    expect(next.flags.windowOffer).toBe('course')
    expect(findInconsistencies(next)).toEqual([])
  })
  it('the catalogue price outside the story is untouched', () => {
    const next = decide(windowGame(), 0)
    expect(canBuy({ ...next, age: 40 }, 'course-pro').oneTimeCost).toBe(350)
  })
  it('spends exactly the agreed amount at the boundary and refuses one credit less', () => {
    expect(decide(windowGame(300), 0).economy.balance).toBe(0)
    const short = windowGame(299)
    expect(canChoose(short, 0)).toMatchObject({ available: false, reason: 'Не хватает 1 кр.' })
    expect(decide(short, 0)).toBe(short)
  })
  it('keeps the domain cooldown, attention and work rules of the course', () => {
    const cooldown = windowGame(); cooldown.economy.lastBought['course-pro'] = 33
    expect(canChoose(cooldown, 0)).toMatchObject({ available: false, reason: 'Следующий курс доступен через 2 года.' })
    expect(decide(cooldown, 0)).toBe(cooldown)
    const tired = windowGame(); tired.attention = 0
    expect(canChoose(tired, 0).reason).toBe('Не хватает личного времени: в этом году оно закончилось.')
    const between = windowGame(); between.economy.work.kind = 'between'
    expect(canChoose(between, 0).reason).toBe('Для покупки курса нужно работать.')
    const older = withPending(t7Worker(1000, 59), 'window-offer')
    expect(canChoose(older, 0).reason).toBe('Доступно до 58 лет включительно.')
    expect(canChoose(older, 2).available).toBe(true)
  })
  it('a second course in the same story window is impossible: the last call sees the cooldown', () => {
    let g = withPending(t7Worker(1000), 'window-offer')
    g = decide(g, 0)
    const lastCall = { ...g, pending: 'window-last-call', flags: { ...g.flags, windowOffer: 'deferred' } }
    expect(canChoose(lastCall, 0).available).toBe(false)
    expect(decide(lastCall, 0)).toBe(lastCall)
  })
  it('the trip refuses missing, too few, too many, repeated, unknown, distant or dead participants', () => {
    const g = windowGame()
    const cases: (string[] | undefined)[] = [undefined, [], ['friend'], ['friend', 'sibling', 'parent', 'parent2'], ['friend', 'friend'], ['friend', 'ghost'], ['friend', 'neighbor']]
    for (const ids of cases) {
      expect(canChoose(g, 1, ids ? trip(ids) : undefined).available).toBe(false)
      expect(decide(g, 1, ids ? trip(ids) : undefined)).toBe(g)
    }
    const mourning = windowGame(); mourning.people.find(p => p.id === 'sibling')!.alive = false
    expect(canChoose(mourning, 1, trip(['friend', 'sibling'])).available).toBe(false)
    expect(canChoose(g, 1).reason).toBe('Выберите двух или трёх близких участников.')
  })
  it('a valid trip charges once, bonds each chosen person once and remembers who went', () => {
    const g = windowGame()
    const bond = (s: GameState, id: string) => s.people.find(p => p.id === id)!.bond
    const next = decide(g, 1, trip(['friend', 'sibling']))
    expect(next.economy.balance).toBe(680)
    expect(newTxns(g, next)).toEqual([expect.objectContaining({ kind: 'purchase', ref: 'family-trip', amount: 320 })])
    expect(bond(next, 'friend') - bond(g, 'friend')).toBe(2)
    expect(bond(next, 'sibling') - bond(g, 'sibling')).toBe(2)
    expect(bond(next, 'parent')).toBe(bond(g, 'parent'))
    expect(next.flags).toMatchObject({ familyTrip: true, familyTripFriend: 35, familyTripSibling: 35, windowOffer: 'trip' })
    expect(next.flags.familyTripParent).toBeUndefined()
    expect(next.economy.lastBought['family-trip']).toBe(35)
    expect(next.attention).toBe(2)
    expect(next.rng).toBe(g.rng)
    expect(findInconsistencies(next)).toEqual([])
  })
  it('the trip cooldown also binds the story', () => {
    const g = windowGame(); g.economy.lastBought['family-trip'] = 32
    expect(canChoose(g, 1, trip(['friend', 'sibling'])).reason).toBe('Следующая совместная поездка доступна через 2 года.')
  })
  it('the shop still refuses purchases while a decision is pending', () => {
    const g = windowGame()
    expect(purchase(g, 'course-pro')).toBe(g)
  })
  it('a dead hero cannot decide or buy through a story', () => {
    const g = { ...windowGame(), stopped: true }
    expect(canChoose(g, 0).available).toBe(false)
    expect(decide(g, 0)).toBe(g)
  })
})

describe('T7 consequences arrive late, by branch and only to the living', () => {
  const at = (flags: GameState['flags'], age = 45, mutate?: (g: GameState) => void) => {
    const g = t7Worker(5000, age); Object.assign(g.flags, flags); mutate?.(g); return g
  }
  it('the key comes only after paying, not too early and not too late', () => {
    for (const value of ['paid', 'forever']) {
      expect(eligible(at({ familyNeed: value, familyNeedAge: 40 }), 'family-need-key')).toBe(false)
      expect(eligible(at({ familyNeed: value, familyNeedAge: 39 }), 'family-need-key')).toBe(true)
      expect(eligible(at({ familyNeed: value, familyNeedAge: 30 }), 'family-need-key')).toBe(false)
    }
    for (const value of ['half', 'sorted', 'declined']) expect(eligible(at({ familyNeed: value, familyNeedAge: 37 }), 'family-need-key')).toBe(false)
  })
  it.each([
    ['half', 'm-need-radio'], ['sorted', 'm-need-letters'], ['declined', 'm-need-cup']
  ])('%s leads to its own echo and no other', (value, expected) => {
    const echoes = ['m-need-radio', 'm-need-letters', 'm-need-cup']
    expect(momentIds(at({ familyNeed: value, familyNeedAge: 38 })).filter(id => echoes.includes(id))).toEqual([expected])
    expect(momentIds(at({ familyNeed: value, familyNeedAge: 44 })).filter(id => echoes.includes(id))).toEqual([])
  })
  it('no sibling echo for a sibling who has died', () => {
    const dead = (g: GameState) => { g.people.find(p => p.id === 'sibling')!.alive = false }
    expect(eligible(at({ familyNeed: 'paid', familyNeedAge: 38 }, 45, dead), 'family-need-key')).toBe(false)
    expect(momentIds(at({ familyNeed: 'declined', familyNeedAge: 38 }, 45, dead))).not.toContain('m-need-cup')
  })
  it('cabin echoes follow the answer and stop after losing H1', () => {
    const home = (g: GameState) => { g.economy.housing = 1 }
    expect(momentIds(at({ cabinDoor: 'code', cabinDoorAge: 40 }, 45, home))).toContain('m-cabin-asleep')
    expect(momentIds(at({ cabinDoor: 'code', cabinDoorAge: 40 }))).not.toContain('m-cabin-asleep')
    expect(momentIds(at({ cabinDoor: 'dinners', cabinDoorAge: 40 }, 45, home))).toContain('m-cabin-thursday')
    expect(momentIds(at({ cabinDoor: 'dinners', cabinDoorAge: 44 }, 45, home))).not.toContain('m-cabin-thursday')
    expect(momentIds(at({ cabinDoor: 'kept', cabinDoorAge: 40 }))).toContain('m-cabin-curtain')
  })
  it('trip echoes need a real trip with that very person', () => {
    expect(eligible(at({ familyTrip: true }), 'trip-memory-friend')).toBe(false)
    expect(eligible(at({ familyTrip: true, [familyTripFlag('sibling')]: 36 }), 'trip-memory-friend')).toBe(false)
    expect(eligible(at({ familyTrip: true, familyTripFriend: 40 }), 'trip-memory-friend')).toBe(false)
    expect(eligible(at({ familyTrip: true, familyTripFriend: 39 }), 'trip-memory-friend')).toBe(true)
    expect(momentIds(at({ familyTrip: true, familyTripSibling: 39 }))).toContain('m-trip-photo')
    expect(momentIds(at({ familyTrip: true, familyTripSibling: 39 }))).not.toContain('m-trip-ticket')
  })
  it('the dome is never shown open when it is closed or not subscribed', () => {
    const subscribed = (g: GameState) => { g.economy.services['dome-pass'] = 40 }
    expect(momentIds(at({}, 45, subscribed))).toContain('m-dome-pruner')
    expect(momentIds(at({}, 45, subscribed))).not.toContain('m-dome-trays')
    const incident = at({}, 45, g => { subscribed(g); g.flags.shipIncidentAge = 45 })
    expect(momentIds(incident)).not.toContain('m-dome-pruner')
    expect(momentIds(incident)).toContain('m-dome-trays')
    const thinAir = at({}, 45, g => { subscribed(g); g.ship.air = 54 })
    expect(momentIds(thinAir)).not.toContain('m-dome-pruner')
    expect(momentIds(at({ shipIncidentAge: 45 })).filter(id => id.startsWith('m-dome-'))).toEqual([])
  })
  it('the training window closes on time: the last call lives one to two years after the notice', () => {
    expect(eligible(at({ windowOffer: 'deferred', windowOfferAge: 45 }), 'window-last-call')).toBe(false)
    expect(eligible(at({ windowOffer: 'deferred', windowOfferAge: 44 }), 'window-last-call')).toBe(true)
    expect(eligible(at({ windowOffer: 'deferred', windowOfferAge: 43 }), 'window-last-call')).toBe(true)
    expect(eligible(at({ windowOffer: 'deferred', windowOfferAge: 42 }), 'window-last-call')).toBe(false)
    expect(story('window-last-call').expiresIn!(at({ windowOffer: 'deferred', windowOfferAge: 43 }))).toBe(0)
  })
  it('save and load keep trip participants, visits, story purchases and flags', () => {
    let g = withPending(t7Worker(1000), 'window-offer')
    g = decide(g, 1, trip(['friend', 'parent']))
    g.economy.owned['visit-sector-lower'] = 30
    const loaded = repairSave(JSON.parse(JSON.stringify(g)) as GameState).game
    expect(loaded.flags).toMatchObject({ familyTripFriend: 35, familyTripParent: 35, windowOffer: 'trip' })
    expect(loaded.economy.owned['visit-sector-lower']).toBe(30)
    expect(loaded.economy.ledger).toEqual(g.economy.ledger)
    expect(loaded.economy.totals).toEqual(g.economy.totals)
    expect(findInconsistencies(loaded)).toEqual([])
  })
})

describe('T7 validator contract for story purchases', () => {
  const known = collectKnown(codeStorylets, codeMoments)
  const base = (choices: unknown[]) => [{
    id: 't7-probe', category: 'Профессия', title: 'Проверка покупки', min: 20, max: 40, weight: 2,
    body: 'Проверочный сюжет: здесь проверяется, как валидатор относится к настоящей покупке из сюжета.',
    choices
  }]
  const free = { text: 'Отказаться', hint: 'Без трат', result: 'Ничего не происходит, жизнь идёт своим чередом.', effects: {} }
  const buy = (purchase: unknown, extra: Record<string, unknown> = {}) => ({ text: 'Купить курс', hint: 'Навык ↑', result: 'Курс оплачен, занятия начинаются со следующей смены.', purchase, effects: {}, ...extra })
  const errors = (choices: unknown[]) => validateContent([{ path: 'probe.json', kind: 'storylets', data: base(choices) }], known).filter(i => i.level === 'error').map(i => i.message)

  it('accepts a discounted course next to a free answer', () => {
    expect(errors([buy({ offer: 'course-pro', price: 300 }), free])).toEqual([])
  })
  it.each([
    [[buy({ offer: 'own-cabin' }), free], 'позиция из'],
    [[buy({ offer: 'course-pro', price: 400 }), free], 'скидка не может поднять цену'],
    [[buy({ offer: 'course-pro', price: 0 }), free], 'скидка не может поднять цену'],
    [[buy({ offer: 'course-pro' }, { effects: { money: -50 } }), free], 'не списывает деньги отдельно'],
    [[buy({ offer: 'course-pro' }, { check: { skill: 'social', difficulty: 10, successText: 'Получилось, и все довольны итогом.', failureText: 'Не получилось, но жизнь продолжается.', success: {}, failure: {} } }), free], 'проверки навыка'],
    [[buy({ offer: 'course-pro' }), buy({ offer: 'family-trip' })], 'без обязательного денежного расхода'],
    [[buy({ offer: 'course-pro', extra: 1 }), free], 'неизвестное поле']
  ])('rejects %#', (choices, message) => {
    expect(errors(choices as unknown[]).join('\n')).toContain(message)
  })
  it('validates ownedYears and servicesOpen', () => {
    const probe = (requires: unknown) => validateContent([{ path: 'p.json', kind: 'storylets', data: [{ ...base([free, free])[0], requires }] }], known)
      .filter(i => i.level === 'error').map(i => i.message).join('\n')
    expect(probe({ ownedYears: { 'visit-sector-bio': { min: 2 } }, servicesOpen: true })).toBe('')
    expect(probe({ ownedYears: { 'visit-sector-moon': { min: 2 } } })).toContain('неизвестная позиция')
    expect(probe({ ownedYears: { 'dome-pass': {} } })).toContain('хотя бы одна граница')
    expect(probe({ servicesOpen: 'yes' })).toContain('true или false')
  })
})

describe('T7 invariants on a synthetic purchase-only story', () => {
  it('a purchase choice compiled from JSON keeps its contract through decide()', () => {
    const probe: Storylet = { ...compileStorylet({
      id: 't7-probe-story', category: 'Профессия', title: 'Проба', min: 18, max: 95, weight: 1,
      body: 'Синтетический сюжет для проверки контракта покупки; в каталог игры не входит.',
      choices: [
        { text: 'Купить курс', hint: 'Навык ↑', result: 'Курс оплачен по сюжетной цене.', purchase: { offer: 'course-pro', price: 100 }, effects: {} },
        { text: 'Отказаться', hint: 'Без трат', result: 'Ничего не меняется.', effects: {} }
      ]
    }), available: () => false }
    storylets.push(probe)
    try {
      const g = withPending(t7Worker(1000), probe.id)
      const next = decide(g, 0)
      expect(next.economy.balance).toBe(900)
      expect(findInconsistencies(next)).toEqual([])
    } finally {
      storylets.splice(storylets.indexOf(probe), 1)
    }
  })
  it('a year with a pending T7 decision cannot advance until it is answered', () => {
    const g = withPending(t7Worker(1000), 'window-offer')
    expect(tick(g)).toBe(g)
  })
})

describe('T7 texts resolve for every gender combination', () => {
  it.each([['m', 'm'], ['m', 'f'], ['f', 'm'], ['f', 'f']] as const)('hero %s, relatives %s', (hero, others) => {
    const g = t7Worker(5000)
    g.protagonist.gender = hero
    for (const p of g.people) if (p.id !== 'parent' && p.id !== 'parent2') p.gender = others
    const texts = [
      ...storylets.filter(s => T7_STORYLET_IDS.has(s.id)).flatMap(s => [s.body, ...s.choices.flatMap(c => [c.text, c.hint, c.result, c.effects.memory ?? ''])]),
      ...moments.filter(m => T7_MOMENT_IDS.has(m.id)).flatMap(m => [m.text, m.accept.label, m.accept.result, m.accept.effects.memory ?? '', m.skip.label])
    ]
    expect(texts.length).toBeGreaterThan(150)
    for (const text of texts) {
      const out = resolveText(g, text)
      expect(out).not.toMatch(/[{}|]/)
      expect(out).not.toMatch(/одина|самай|малая|былай/)
    }
  })
})
