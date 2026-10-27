import { describe, expect, it } from 'vitest'
import { beat, createGame, decide, tick } from '../engine'
import { moments } from '../moments'
import { storylets } from '../storylets'
import { ATMOSPHERE_LEVEL } from '../constants'
import { buildReport, PLAYTEST_QUESTIONS } from '../../ui/report'
import type { Atmosphere, GameState } from '../types'

function ready(g: GameState, arc: string) {
  return storylets
    .filter(s => s.arc === arc && !s.fork && ATMOSPHERE_LEVEL[g.atmosphere] >= (s.weird ?? 0) && g.age >= s.min && g.age <= s.max && !g.seen.includes(s.id) && s.available(g))
    .map(s => s.id)
}

function at(age: number, flags: GameState['flags'], atmosphere: Atmosphere = 'mystery'): GameState {
  const g = createGame(8, atmosphere)
  g.age = age
  g.flags = { ...flags }
  g.people.forEach(p => { p.alive = true })
  return g
}

function lifeLog(seed: number, atmosphere: Atmosphere) {
  let g = createGame(seed, atmosphere)
  const seen: string[] = []
  const momentsSeen = new Set<string>()
  for (let i = 0; i < 500 && !g.stopped; i++) {
    if (g.pending) {
      seen.push(g.pending)
      g = decide(g, 0)
    } else if (g.phase < 3) {
      g = beat(g)
      if (g.moment) momentsSeen.add(g.moment)
    } else g = tick(g)
  }
  return { seen, momentsSeen, g }
}

describe('атмосфера', () => {
  it('в спокойной жизни нет ни сюжетов, ни моментов, ни фоновых строк с пометкой weird', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { seen, momentsSeen, g } = lifeLog(seed, 'calm')
      for (const id of seen) expect(storylets.find(s => s.id === id)!.weird).toBeUndefined()
      for (const id of momentsSeen) expect(moments.find(m => m.id === id)!.weird).toBeUndefined()
      expect(g.history.some(h => h.text.includes('8421') || h.text.includes('8 420'))).toBe(false)
    }
  }, 60000)

  it('«Тайны» показывают линию «Лишний человек», но не тревожные сцены', () => {
    let census = 0
    for (let seed = 1; seed <= 60; seed++) {
      const { seen, momentsSeen } = lifeLog(seed, 'mystery')
      if (seen.includes('census-extra')) census++
      for (const id of seen) expect(storylets.find(s => s.id === id)!.weird ?? 1).toBeLessThanOrEqual(1)
      for (const id of momentsSeen) expect(moments.find(m => m.id === id)!.weird ?? 1).toBeLessThanOrEqual(1)
    }
    expect(census).toBeGreaterThan(0)
  }, 60000)

  it('«Тревожная» атмосфера может показать сцену со счётом в вентиляции', () => {
    const g = at(40, { census: 'ignore', censusAge: 30 }, 'uncanny')
    expect(ready(g, 'census')).toContain('census-counting-voice')
    expect(ready({ ...g, atmosphere: 'mystery' }, 'census')).not.toContain('census-counting-voice')
    expect(ready({ ...g, atmosphere: 'calm' }, 'census')).toEqual([])
  })
})

describe('линия «Лишний человек»', () => {
  const cases: [string, number, GameState['flags'], string[]][] = [
    ['проверить блок', 35, { census: 'dig', censusAge: 30 }, ['census-sealed-cabin']],
    ['сообщить в реестр', 35, { census: 'report', censusAge: 30 }, ['census-registry-answer']],
    ['постучал', 38, { census: 'dig', censusStage: 'knocked', censusStageAge: 36 }, ['census-someone-answers']],
    ['записка', 40, { census: 'dig', censusStage: 'note', censusStageAge: 36 }, ['census-correspondence']],
    ['следил', 38, { census: 'dig', censusStage: 'watched', censusStageAge: 36 }, ['census-watched']],
    ['пошёл следом', 38, { census: 'dig', censusStage: 'followed', censusStageAge: 36 }, ['census-hidden-garden']],
    ['внесли в реестр', 42, { census: 'dig', censusStage: 'registered', censusStageAge: 36 }, ['census-new-citizens']],
    ['хранитель тайны', 45, { census: 'dig', censusStage: 'keeper', censusStageAge: 36 }, ['census-keeper-night']],
    ['рассказал совету', 42, { census: 'dig', censusStage: 'exposed', censusStageAge: 36 }, ['census-exposed']],
    ['обращение в совет', 40, { census: 'dig', censusStage: 'petition', censusStageAge: 36 }, ['census-petition-answer']],
    ['запись разговора', 45, { census: 'report', censusStage: 'recorded', censusStageAge: 36 }, ['census-recording']],
    ['письменный ответ', 40, { census: 'report', censusStage: 'pressed', censusStageAge: 36 }, ['census-quota-letter']],
    ['сделал вид, что не заметил', 45, { census: 'ignore', censusAge: 34 }, ['census-echo']],
    ['сжёг записки', 45, { census: 'dig', censusStage: 'burned', censusStageAge: 36 }, []],
    ['делится пайком', 45, { census: 'dig', censusStage: 'sharing', censusStageAge: 36 }, []]
  ]
  it.each(cases)('%s (%#)', (_name, age, flags, expected) => {
    expect(ready(at(age, flags), 'census')).toEqual(expected)
  })

  it('разные пути рассказывают разное', () => {
    const ids = [...new Set(cases.flatMap(c => c[3]))]
    const items = ids.map(id => storylets.find(s => s.id === id)!)
    expect(new Set(items.map(s => s.body)).size).toBe(items.length)
    expect(new Set(items.map(s => s.title)).size).toBe(items.length)
  })
})

describe('отчёт тестера', () => {
  it('содержит жребий, решения, развилки и вопросы', () => {
    const { g } = lifeLog(21, 'mystery')
    const text = buildReport(g, 754, 60, new Date('2026-10-27T12:00:00Z'))
    expect(text).toContain('ОТЧЁТ О ЖИЗНИ')
    expect(text).toContain(String(g.seed))
    expect(text).toContain('РЕШЕНИЯ')
    expect(text).toContain('РАЗВИЛКИ')
    expect(text).toContain('12 мин 34 с')
    for (const q of PLAYTEST_QUESTIONS) expect(text).toContain(q)
  })
})
