import { describe, expect, it } from 'vitest'
import { MAX_GAP, MIN_GAP, TENSION_CAP, isLastChance, pickStorylet, priorityOf } from '../director'
import type { Director } from '../director'
import { advanceYear, createGame, decide } from '../engine'
import { compileExpiry, compileStorylet } from '../../content/load'
import { collectKnown, validateContent } from '../../content/validate'
import { codeMoments } from '../moments'
import { codeStorylets, storylets } from '../storylets'
import type { JsonStorylet } from '../../content/types'
import type { GameState, Priority, Storylet } from '../types'

const fake = (id: string, weight: number, priority?: Priority, extra: Partial<Storylet> = {}): Storylet => ({
  id, category: 'Личное', title: id, body: '', min: 0, max: 100, weight, available: () => true,
  ...(priority ? { priority } : {}),
  choices: [{ text: 'a', hint: '', result: '', effects: {} }],
  ...extra
})

const calm = (lastAge: number): Director => ({ lastAge, tension: 0, lastCategory: null, lastTone: 'calm' })
function at(age: number, director: Director = calm(age - 3), rng = 1): GameState {
  const g = createGame(3)
  g.age = age
  g.director = director
  g.rng = rng
  return g
}
const wins = (build: (seed: number) => Storylet | null, runs = 600) => {
  const counts = new Map<string, number>()
  for (let i = 0; i < runs; i++) {
    const s = build(i * 7919 + 1)
    counts.set(s?.id ?? 'null', (counts.get(s?.id ?? 'null') ?? 0) + 1)
  }
  return counts
}

describe('очерёдность сюжетов', () => {
  it('большой weight больше не делает сюжет продолжением', () => {
    const heavyNormal = fake('heavy', 26)
    const follow = fake('follow', 1, 'followup')
    for (let seed = 1; seed < 40; seed++) expect(pickStorylet(at(40, calm(37), seed), [heavyNormal, follow])).toBe(follow)
  })

  it('продолжение с малым весом идёт раньше обычного с большим', () => {
    const follow = fake('follow', 1, 'followup')
    for (let seed = 1; seed < 40; seed++) expect(pickStorylet(at(40, calm(37), seed), [fake('a', 8), follow, fake('b', 8)])).toBe(follow)
  })

  it('weight — вероятность среди продолжений, а не «побеждает самый тяжёлый»', () => {
    const a = fake('a', 3, 'followup')
    const b = fake('b', 1, 'followup')
    const counts = wins(seed => pickStorylet(at(40, calm(37), seed), [a, b]))
    expect(counts.get('b') ?? 0).toBeGreaterThan(80)
    expect(counts.get('a')!).toBeGreaterThan((counts.get('b') ?? 0) * 2)
    expect(counts.get('null')).toBeUndefined()
  })

  it('единственное продолжение выбирается без бросков RNG', () => {
    const g = at(40, calm(37), 12345)
    pickStorylet(g, [fake('only', 3, 'followup')])
    expect(g.rng).toBe(12345)
  })

  it('спокойные годы сохраняются: без продолжений обычные события бывают не каждый год', () => {
    const counts = wins(seed => pickStorylet(at(MIN_GAP + 30, calm(30), seed), [fake('a', 3), fake('b', 3)]))
    expect(counts.get('null')!).toBeGreaterThan(100)
    expect((counts.get('a') ?? 0) + (counts.get('b') ?? 0)).toBeGreaterThan(100)
  })

  it('продолжение после тяжёлого события ждёт, но к MAX_GAP показывается', () => {
    const d = { lastAge: 30, tension: TENSION_CAP, lastCategory: null, lastTone: 'crisis' as const }
    const hard = fake('hard', 5, 'followup', { category: 'Тайна' })
    expect(pickStorylet(at(33, d), [hard, fake('quiet', 3)])).toBeNull()
    expect(pickStorylet(at(30 + MAX_GAP, d), [hard, fake('quiet', 3)])).toBe(hard)
  })

  it('критическое не ждёт бюджета напряжения и «тихого года», но уважает минимальный интервал', () => {
    const d = { lastAge: 30, tension: TENSION_CAP, lastCategory: null, lastTone: 'crisis' as const }
    const critical = fake('critical', 1, 'critical', { category: 'Тайна' })
    for (let seed = 1; seed < 30; seed++) {
      expect(pickStorylet(at(32, d, seed), [critical, fake('a', 8)])).toBe(critical)
      expect(pickStorylet(at(31, d, seed), [critical, fake('a', 8)])).toBeNull()
    }
  })

  it('последний год окна поднимает продолжение до критического и снимает интервал и напряжение', () => {
    const d = { lastAge: 30, tension: TENSION_CAP, lastCategory: null, lastTone: 'crisis' as const }
    const dying = fake('dying', 1, 'followup', { category: 'Тайна', expiresIn: () => 0 })
    const later = fake('later', 1, 'followup', { category: 'Тайна', expiresIn: () => 2 })
    expect(pickStorylet(at(31, d), [dying])).toBe(dying)
    expect(pickStorylet(at(31, d), [later])).toBeNull()
    expect(pickStorylet(at(33, d), [later])).toBeNull()
    expect(isLastChance(at(31), dying)).toBe(true)
    expect(isLastChance(at(31), fake('age', 1, 'followup', { max: 31 }))).toBe(true)
    expect(isLastChance(at(31), later)).toBe(false)
  })

  it('обычный сюжет на последнем году не получает привилегий', () => {
    const d = { lastAge: 30, tension: 0, lastCategory: null, lastTone: 'calm' as const }
    expect(pickStorylet(at(31, d), [fake('plain', 8, undefined, { expiresIn: () => 0 })])).toBeNull()
  })

  it('priorityOf: без поля — normal', () => {
    expect(priorityOf(fake('x', 3))).toBe('normal')
    expect(priorityOf(fake('x', 3, 'critical'))).toBe('critical')
  })
})

describe('каталог: очерёдность', () => {
  it('ни у кого из обычных сюжетов нет веса продолжения по умолчанию', () => {
    const heavyNormal = storylets.filter(s => priorityOf(s) === 'normal' && s.weight >= 10)
    expect(heavyNormal.map(s => s.id)).toEqual([])
  })

  it('все продолжения линий из кода размечены явно', () => {
    const follow = storylets.filter(s => priorityOf(s) !== 'normal')
    expect(follow.length).toBeGreaterThan(60)
    expect(storylets.find(s => s.id === 'school-track')!.priority).toBe('critical')
    expect(storylets.find(s => s.id === 'love-apart-return')!.priority).toBe('critical')
  })

  it('школьное распределение сохраняет прежнее поведение: в 16, а если прошлое решение было год назад, в 17', () => {
    const track = storylets.find(s => s.id === 'school-track')!
    const g16 = at(16, calm(14))
    expect(pickStorylet(g16, [track])).toBe(track)
    const recent = at(16, calm(15))
    expect(pickStorylet(recent, [track])).toBeNull()
    expect(pickStorylet({ ...recent, age: 17 }, [track])).toBe(track)
  })
})

describe('обещанные встречи не теряются из-за ритма', () => {
  const apart = (age: number, tension = 0, lastAge = age - 3) => {
    const g = at(age, { lastAge, tension, lastCategory: null, lastTone: tension ? 'crisis' : 'calm' })
    g.flags = { lovePath: 'confessed', loveStage: 'apart', loveStageAge: 33, livingTogether: false }
    return g
  }
  const story = () => storylets.find(s => s.id === 'love-apart-return')!

  it('«через год»: встреча идёт сразу после срока, если интервал позволяет', () => {
    expect(pickStorylet(apart(34), [story()])).toBe(story())
  })

  it('если решение было в прошлом году, встреча сдвигается на год, а не пропадает', () => {
    expect(pickStorylet(apart(34, 0, 33), [story(), ...codeStorylets.filter(s => s.id === 'festival')])).toBeNull()
    expect(pickStorylet(apart(35, 0, 33), [story()])).toBe(story())
  })

  it('высокое напряжение не откладывает обещанную встречу', () => {
    expect(pickStorylet(apart(36, 3, 33), [story()])).toBe(story())
  })

  it('на последнем году окна она показывается, даже сразу после другого решения', () => {
    const g = apart(36, 3, 35)
    expect(story().expiresIn!(g)).toBe(0)
    expect(pickStorylet(g, [story()])).toBe(story())
  })
})

describe('JSON: очерёдность и окно продолжения', () => {
  const known = collectKnown(codeStorylets, codeMoments)
  const base = (): JsonStorylet => ({
    id: 'probe', category: 'Личное', title: 'Проба', body: 'Достаточно длинный текст для пробного сюжета, чтобы пройти проверку длины текста в валидаторе без предупреждений о краткости.', min: 20, max: 50, weight: 3,
    requires: { flagIs: { adultFamilyPlan: 'deferred' }, since: { adultFamilyPlanAge: 2 }, until: { adultFamilyPlanAge: 6 } },
    choices: [
      { text: 'Да', hint: 'Связи ↑', result: 'Ты соглашаешься, и разговор получается спокойным и честным.', effects: { stats: { bonds: 1 } } },
      { text: 'Нет', hint: 'Связи ↓', result: 'Ты отказываешься, и разговор получается коротким и ясным.', effects: { stats: { bonds: -1 } } }
    ]
  })
  const errors = (s: unknown) => validateContent([
    { path: 't.json', kind: 'storylets', data: [s] },
    { path: 'a.json', kind: 'storylets', data: [] }
  ], known).filter(i => i.level === 'error').map(i => `${i.where} ${i.message}`).join('\n')

  it('priority принимается только как followup или critical и только у продолжения', () => {
    const ok = { ...base(), priority: 'followup' }
    expect(errors(ok)).not.toContain('priority')
    expect(errors({ ...base(), priority: 'urgent' })).toContain('priority')
    expect(errors({ ...base(), priority: 'followup', requires: undefined })).toContain('priority')
  })

  it('окно until превращается в expiresIn: сколько лет осталось', () => {
    const compiled = compileStorylet({ ...base(), priority: 'followup' })
    const g = createGame(1)
    g.flags = { adultFamilyPlanAge: 30 }
    g.age = 33
    expect(compiled.expiresIn!(g)).toBe(3)
    g.age = 36
    expect(compiled.expiresIn!(g)).toBe(0)
    expect(compiled.priority).toBe('followup')
    expect(compileExpiry(undefined)).toBeUndefined()
    expect(compileExpiry({ flag: ['x'] })).toBeUndefined()
  })

  it('продолжения семейных сюжетов размечены как followup', () => {
    for (const id of ['family-a-life-ahead', 'family-child-question', 'adult-family-return', 'family-life-ahead-again']) {
      expect(storylets.find(s => s.id === id)!.priority, id).toBe('followup')
    }
  })
})

describe('старые линии после смены механизма', () => {
  it('в живых жизнях продолжения линий выпадают и не зацикливаются; детерминизм сохранён', () => {
    const life = (seed: number) => {
      let g = createGame(seed)
      for (let i = 0; i < 400 && !g.stopped; i++) g = g.pending ? decide(g, (seed + i) % 2) : advanceYear(g)
      return g
    }
    const arcs: Record<string, number> = {}
    for (let seed = 1; seed <= 40; seed++) {
      const g = life(seed)
      expect(new Set(g.seen).size).toBe(g.seen.length)
      for (const f of g.forks) if (f.outcomes.length) arcs[f.arc] = (arcs[f.arc] ?? 0) + 1
    }
    for (const arc of ['friend', 'crack', 'neighbor', 'love']) expect(arcs[arc] ?? 0, `линия ${arc}`).toBeGreaterThan(0)
    expect(JSON.stringify(life(7))).toBe(JSON.stringify(life(7)))
  }, 120000)
})
