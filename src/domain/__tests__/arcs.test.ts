import { describe, expect, it } from 'vitest'
import { advanceYear, createGame, decide } from '../engine'
import { storylets } from '../storylets'
import type { GameState } from '../types'

/** Что сейчас доступно из продолжений линии (без учёта случайного выбора года). */
function ready(g: GameState, arc: string) {
  return storylets
    .filter(s => s.arc === arc && !s.fork && g.age >= s.min && g.age <= s.max && !g.seen.includes(s.id) && s.available(g))
    .map(s => s.id)
}

function techAt(age: number, flags: GameState['flags']): GameState {
  const g = createGame(1)
  g.age = age
  g.protagonist.job = 'Техник'
  g.flags = { trackChosen: true, leakAge: 20, ...flags }
  g.people.forEach(p => { p.alive = true })
  return g
}

describe('линия «Трещина»: ветки ведут в разные сцены', () => {
  const first: [string, GameState['flags'], string][] = [
    ['рапорт', { leakChoice: 'report' }, 'crack-report-hearing'],
    ['удачный ремонт', { leakChoice: 'repair', leakRepaired: true }, 'crack-secret-hero'],
    ['неудачный ремонт', { leakChoice: 'repair', leakRepaired: false }, 'crack-failed-leak'],
    ['молчание', { leakChoice: 'silent' }, 'crack-silent-accident']
  ]
  it.each(first)('%s открывает своё продолжение и только его', (_n, flags, id) => {
    expect(ready(techAt(35, flags), 'crack')).toEqual([id])
  })

  it('до положенного срока продолжение не наступает', () => {
    expect(ready(techAt(22, { leakChoice: 'report' }), 'crack')).toEqual([])
    expect(ready(techAt(22, { leakChoice: 'silent' }), 'crack')).toEqual([])
  })

  const second: [string, string | null][] = [
    ['reported-open', 'crack-inspector-offer'],
    ['reported-quiet', null],
    ['reported-silent', 'crack-recurrence'],
    ['confessed-repair', null],
    ['anonymous-repair', null],
    ['taught', 'crack-student-return'],
    ['confessed-failure', null],
    ['patched', null],
    ['worsened', 'crack-worsened'],
    ['silent-confessed', 'crack-confessed-after'],
    ['silent-denied', 'crack-denied-after'],
    ['silent-blamed', 'crack-blamed-after']
  ]
  it.each(second)('стадия %s → %s', (st, id) => {
    const g = techAt(45, { leakChoice: 'x', crackStage: st })
    expect(ready(g, 'crack')).toEqual(id ? [id] : [])
  })

  it('у ветки с молчанием и у ветки с рапортом разные тексты и разные варианты ответа', () => {
    const ids = first.map(f => f[2])
    const items = ids.map(id => storylets.find(s => s.id === id)!)
    expect(new Set(items.map(s => s.body)).size).toBe(items.length)
    const choices = items.flatMap(s => s.choices.map(c => c.text))
    expect(new Set(choices).size).toBe(choices.length)
  })
})

describe('линия «Дружба»: прошлое определяет встречу', () => {
  const base = (flags: GameState['flags']) => {
    const g = createGame(2)
    g.age = 40
    g.flags = { ...flags }
    return g
  }
  it.each([
    ['заступился', { stoodForFriend: true }, 'friend-return-stood'],
    ['сказал учителю тайно', { quietWitness: true }, 'friend-return-quiet'],
    ['промолчал', { abandonedFriend: true }, 'friend-return-abandoned']
  ])('%s → %s', (_n, flags, id) => {
    expect(ready(base(flags), 'friend')).toEqual([id])
  })
  it('после встречи разные состояния дружбы дают разные сцены или не дают их вовсе', () => {
    expect(ready(base({ friendReturn: true, friendState: 'close' }), 'friend')).toEqual(['friend-crisis-close'])
    expect(ready(base({ friendReturn: true, friendState: 'distant' }), 'friend')).toEqual(['friend-crisis-distant'])
    expect(ready(base({ friendReturn: true, friendState: 'estranged' }), 'friend')).toEqual([])
  })
  it('рассорившийся друг закрывает сцены близости и письма', () => {
    const g = base({ friendState: 'estranged', friendReturn: true })
    g.people.find(p => p.id === 'friend')!.bond = 80
    const romance = storylets.find(s => s.id === 'relationship')!
    const letter = storylets.find(s => s.id === 'old-friend')!
    g.age = 30
    expect(romance.available(g)).toBe(false)
    g.age = 55
    expect(letter.available(g)).toBe(false)
    g.flags.friendState = 'close'
    expect(letter.available(g)).toBe(true)
  })
})

describe('развилки', () => {
  function playPicking(seed: number, arcChoice: Record<string, number>) {
    let g = createGame(seed)
    for (let i = 0; i < 400 && !g.stopped; i++) {
      if (g.pending) {
        const ev = storylets.find(s => s.id === g.pending)!
        g = decide(g, Math.min(arcChoice[ev.id] ?? 0, ev.choices.length - 1))
      } else {
        g = advanceYear(g)
      }
    }
    return g
  }

  it('выбор в начале линии записывается вместе с невыбранными путями', () => {
    let g = createGame(5)
    g.age = 30
    g.protagonist.job = 'Техник'
    g.pending = 'microcrack'
    g = decide(g, 2)
    expect(g.forks).toHaveLength(1)
    expect(g.forks[0]!.arc).toBe('crack')
    expect(g.forks[0]!.others).toHaveLength(2)
    expect(g.forks[0]!.outcomes).toEqual([])
    expect(g.flags.leakChoice).toBe('silent')
  })

  it('последствия попадают в ту же развилку, а выбор «рапорт» и «молчание» дают разные цепочки', () => {
    const outcomeTitles = (choice: number) => {
      const titles = new Set<string>()
      let withOutcome = 0
      for (let seed = 1; seed <= 70; seed++) {
        const g = playPicking(seed, { microcrack: choice })
        const fork = g.forks.find(f => f.arc === 'crack')
        if (!fork) continue
        fork.outcomes.forEach(o => titles.add(o.title))
        if (fork.outcomes.length) withOutcome++
      }
      return { titles, withOutcome }
    }
    const report = outcomeTitles(0)
    const silent = outcomeTitles(2)
    expect(report.withOutcome).toBeGreaterThan(0)
    expect(silent.withOutcome).toBeGreaterThan(0)
    for (const t of report.titles) expect(silent.titles.has(t)).toBe(false)
  }, 120000)
})
