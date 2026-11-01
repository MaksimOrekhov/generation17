// GEN-102 NARRATIVE delta: complete rendered prose of the six corrected fields, hero m/f × neighbor m/f.
import { describe, expect, it } from 'vitest'
import { createGame, resolveText } from '../engine'
import { safePeople } from '../contentPeople'
import { contentStorylets } from '../storylets'

const story = (id: string) => contentStorylets.find(s => s.id === id)!
const choice = (id: string, choiceIndex: number) => story(id).choices[choiceIndex]!
const setup = (hero: 'm' | 'f', neighbor: 'm' | 'f') => {
  const g = createGame(7)
  g.protagonist.gender = hero
  const person = g.people.find(p => p.id === 'neighbor')!
  person.gender = neighbor
  return { g, name: person.name.split(' ')[0]! }
}
const pairs = [['m', 'm'], ['m', 'f'], ['f', 'm'], ['f', 'f']] as const

describe('Сосед GEN-102 NARRATIVE delta: six corrected fields render in full', () => {
  it('followup / move memory', () => {
    for (const [hero, neighbor] of pairs) {
      const { g } = setup(hero, neighbor)
      expect(resolveText(g, choice('neighbor-followup', 0).effects!.memory!))
        .toBe(`${hero === 'f' ? 'Подала' : 'Подал'} заявку на каюту у биокупола после разговора о свободном жилье.`)
    }
  })
  it('followup / stay result has no nominative-case neighbour name', () => {
    expect(choice('neighbor-followup', 2).result).toBe('Ты говоришь спасибо за предложение и решаешь остаться. Дома всё ещё слышен знакомый гул вентиляции. Сегодня тебе этого достаточно.')
    expect(choice('neighbor-followup', 2).result).not.toContain('{{neighbor}}')
  })
  it('kid-moved / body keeps nominative {{neighbor}} and agrees with both genders', () => {
    const body = story('neighbor-kid-moved').body
    expect(body).toContain('{{neighbor}}')
    for (const [hero, neighbor] of pairs) {
      const { g, name } = setup(hero, neighbor)
      expect(resolveText(g, body)).toBe(
        `У входа в биокупол тебя окликает человек, за которым ты когда-то присматривал${hero === 'f' ? 'а' : ''}. ` +
        `Тогда ${name} попросил${neighbor === 'f' ? 'а' : ''} помочь с детьми перед ночной сменой. ` +
        'Вы вспоминаете ту ночь; тебе приходит на ум и давняя заявка на каюту. Тебя приглашают на чай.')
    }
  })
  it('kid-moved body is still gated by safePeople for a dead or missing neighbour', () => {
    const { g } = setup('m', 'f')
    const body = story('neighbor-kid-moved').body
    expect(safePeople(g, body)).toBe(true)
    const dead = { ...g, people: g.people.map(p => (p.id === 'neighbor' ? { ...p, alive: false } : p)) }
    expect(safePeople(dead, body)).toBe(false)
  })
  it('kid-moved / visit memory', () => {
    for (const [hero, neighbor] of pairs) {
      const { g } = setup(hero, neighbor)
      expect(resolveText(g, choice('neighbor-kid-moved', 0).effects!.memory!))
        .toBe(`Встреча с человеком, за которым когда-то присматривал${hero === 'f' ? 'а' : ''} во время ночной смены.`)
    }
  })
  it('medical / help memory', () => {
    for (const [hero, neighbor] of pairs) {
      const { g } = setup(hero, neighbor)
      expect(resolveText(g, choice('neighbor-medical', 0).effects!.memory!))
        .toBe(`Помог${hero === 'f' ? 'ла' : ''} семье по соседству в трудный момент, пожертвовав собственным отдыхом.`)
    }
  })
  it('cold-leak / help memory', () => {
    for (const [hero, neighbor] of pairs) {
      const { g } = setup(hero, neighbor)
      expect(resolveText(g, choice('neighbor-cold-leak', 0).effects!.memory!))
        .toBe(`Ночь, когда помог${hero === 'f' ? 'ла' : ''} справиться с затоплением, несмотря на давнюю размолвку.`)
    }
  })
})
