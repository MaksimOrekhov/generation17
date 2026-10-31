import { describe, expect, it } from 'vitest'
import { collectDeathNotices, deathNoticeText, repairDeathNotices } from '../deathNotices'
import { createGame, epitaph } from '../engine'

describe('известия о смерти близких', () => {
  it('собирает несколько новых смертей, но не знакомого без отношений', () => {
    const before = createGame(173)
    before.age = 40
    before.relationships = { partnerId: 'friend', formerPartnerIds: [] }
    const after = structuredClone(before)
    after.age += 1
    after.shipYear += 1
    for (const id of ['parent', 'parent2', 'friend', 'neighbor']) {
      const person = after.people.find(candidate => candidate.id === id)!
      person.alive = false
      person.age += 1
    }

    const notices = collectDeathNotices(before, after, [])

    expect(notices.map(notice => notice.personId)).toEqual(['parent', 'parent2', 'friend'])
    expect(notices.every(notice => notice.shipYear === after.shipYear)).toBe(true)
    expect(notices.find(notice => notice.personId === 'friend')?.wasCurrentPartner).toBe(true)
    expect(collectDeathNotices(after, after, notices)).toBe(notices)
  })

  it('не создаёт retro-notice и удаляет повреждённые или несогласованные записи', () => {
    const game = createGame(174)
    game.people.find(person => person.id === 'parent')!.alive = false
    const notice = {
      personId: 'parent', personName: game.people.find(person => person.id === 'parent')!.name,
      role: 'Мать', personAge: game.people.find(person => person.id === 'parent')!.age,
      shipYear: game.shipYear, wasCurrentPartner: false
    }
    expect(repairDeathNotices(undefined, game)).toEqual([])
    expect(repairDeathNotices([notice, notice, { ...notice, personAge: -1 }, { ...notice, personId: 'stranger' }], game)).toEqual([notice])
    expect(repairDeathNotices([notice], createGame(174))).toEqual([])
  })

  it('использует утверждённые формулировки, русское склонение и младенческую эпитафию', () => {
    const game = createGame(175)
    const parent = game.people.find(person => person.id === 'parent')!
    const sibling = { ...parent, id: 'sibling', name: 'Аня', age: 81 }
    expect(deathNoticeText({ personId: 'parent', personName: parent.name, role: parent.role, personAge: 81, shipYear: 191, wasCurrentPartner: false }, 'm'))
      .toBe(`Умерла мама — ${parent.name} (81 год).`)
    expect(deathNoticeText({ personId: 'sibling', personName: sibling.name, role: 'Старшая сестра', personAge: 82, shipYear: 191, wasCurrentPartner: false }, 'f'))
      .toBe('Умерла твоя старшая сестра — Аня (82 года).')
    game.age = 2
    expect(epitaph(game)).toBe('Эта жизнь оказалась короткой. В одном из жилых секторов «Пилигрима» стало тише. Корабль продолжает путь.')
  })
})
