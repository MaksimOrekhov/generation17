import { describe, expect, it } from 'vitest'
import { createGame, decide, genderOf, resolveText } from '../engine'
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
    expect(child).toMatchObject({ age: 0, alive: true, since: 30 })
    expect(child.role).toBe(child.gender === 'f' ? 'Дочь' : 'Сын')
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

describe('род в текстах', () => {
  const seeds = Array.from({ length: 40 }, (_, i) => i + 1)

  it('у героя и ребёнка выпадают оба пола, при этом пол зависит только от seed', () => {
    const heroes = seeds.map(seed => genderOf(createGame(seed), 'hero'))
    expect(new Set(heroes)).toEqual(new Set(['m', 'f']))
    expect(genderOf(createGame(7), 'hero')).toBe(genderOf(createGame(7), 'hero'))
    const kids = seeds.map(seed => {
      const start = createGame(seed)
      start.age = 30
      return decideWith(start, { addPerson: 'child' }).people.find(p => p.id === 'child')!.gender
    })
    expect(new Set(kids)).toEqual(new Set(['m', 'f']))
  })

  it('формы по роду выбираются по герою и по людям', () => {
    for (const seed of seeds) {
      const g = createGame(seed)
      const hero = genderOf(g, 'hero')
      expect(resolveText(g, 'Заступил{{hero:ся|ась}}')).toBe(hero === 'f' ? 'Заступилась' : 'Заступился')
      expect(resolveText(g, '{{hero:Он|Она}} {{parent:сын|дочь}}')).toBe(`${hero === 'f' ? 'Она' : 'Он'} дочь`)
      const friend = g.people.find(p => p.id === 'friend')!
      expect(resolveText(g, '{{friend:он|она}}')).toBe(friend.gender === 'f' ? 'она' : 'он')
      expect(friend.role).toBe(friend.gender === 'f' ? 'Подруга детства' : 'Друг детства')
    }
  })

  it('родители и брат или сестра согласованы с ролью', () => {
    for (const seed of seeds) {
      const g = createGame(seed)
      expect(g.people.find(p => p.id === 'parent')).toMatchObject({ gender: 'f', role: 'Мать' })
      expect(g.people.find(p => p.id === 'parent2')).toMatchObject({ gender: 'm', role: 'Отец' })
      const sibling = g.people.find(p => p.id === 'sibling')
      if (sibling) expect(sibling.gender).toBe(sibling.role.includes('брат') ? 'm' : 'f')
    }
  })

  it('старое сохранение без gender читается: род берётся из seed и имени', () => {
    const g = createGame(5)
    const hero = genderOf(g, 'hero')
    delete g.protagonist.gender
    g.people.forEach(p => { delete p.gender })
    expect(genderOf(g, 'hero')).toBe(hero)
    expect(genderOf(g, 'parent')).toBe('f')
    expect(genderOf(g, 'parent2')).toBe('m')
  })

  it('память разворачивает формы при записи', () => {
    const g = decideWith(createGame(3), { memory: 'Выбрал{{hero:|а}} дело.' })
    const hero = genderOf(g, 'hero')
    expect(g.memories).toContain(hero === 'f' ? 'Выбрала дело.' : 'Выбрал дело.')
  })
})
