import { describe, expect, it } from 'vitest'
import { createGame, decide, resolveText } from '../engine'
import { residenceOf } from '../birth'
import type { Effects, GameState, Storylet } from '../types'
import { storylets } from '../storylets'

/** Применяет эффекты как решение и возвращает новое состояние (decide работает с копией). */
function decideWith(g: GameState, effects: Effects) {
  const probe: Storylet = {
    id: 'probe', category: 'Личное', title: 'Проба', body: 'Проба.', min: 0, max: 99, weight: 1, available: () => true,
    choices: [{ text: 'Да', hint: '', result: 'Готово.', effects }]
  }
  storylets.push(probe)
  try {
    return decide({ ...g, pending: 'probe' }, 0)
  } finally {
    storylets.pop()
  }
}

describe('addPerson и moveTo', () => {
  it('ребёнок появляется один раз, с фамилией героя и именем без повторов', () => {
    const start = createGame(3)
    start.age = 30
    const g = decideWith(start, { addPerson: 'child' })
    const child = g.people.find(p => p.id === 'child')!
    expect(child).toMatchObject({ role: 'Ребёнок', age: 0, alive: true, since: 30 })
    expect(child.name.split(' ').slice(1).join(' ')).toBe(g.protagonist.name.split(' ').slice(1).join(' '))
    const names = g.people.map(p => p.name.split(' ')[0])
    expect(new Set(names).size).toBe(names.length)
    expect(decideWith(g, { addPerson: 'child' }).people.length).toBe(g.people.length)
  })

  it('связь с ребёнком из того же эффекта применяется сразу', () => {
    const start = createGame(3)
    start.age = 30
    const g = decideWith(start, { addPerson: 'child', bonds: { child: 10 } })
    expect(g.people.find(p => p.id === 'child')!.bond).toBe(80)
  })

  it('{{child}} подставляется именем ребёнка', () => {
    const start = createGame(3)
    start.age = 30
    expect(resolveText(start, '{{child}}')).toBe('ребёнок')
    const g = decideWith(start, { addPerson: 'child' })
    expect(resolveText(g, '{{child}}')).toBe(g.people.find(p => p.id === 'child')!.name.split(' ')[0])
  })

  it('переезд меняет сектор жизни, но не сектор рождения', () => {
    const start = createGame(3)
    start.age = 30
    const birth = start.birth.sectorId
    const target = birth === 'bio' ? 'lower' : 'bio'
    const g = decideWith(start, { moveTo: target })
    expect(residenceOf(g)).toBe(target)
    expect(g.birth.sectorId).toBe(birth)
    expect(decideWith(g, { moveTo: target }).history.filter(h => h.title === 'Переезд').length).toBe(1)
  })
})
