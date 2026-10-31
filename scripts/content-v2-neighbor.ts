/** Replays the frozen catalogue order; captures real states before any v2 engine edits. */
import { createHash } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { advanceYear, canChoose, createGame, decide, genderOf, setFocus } from '../src/domain/engine'
import { canFocus } from '../src/domain/focus'
import { hash32 } from '../src/domain/random'
import { storylets } from '../src/domain/storylets'
import type { GameState, Focus, Storylet } from '../src/domain/types'
import { legacyNeighbor } from '../src/domain/__tests__/fixtures/neighbor-v1'
import order from '../src/domain/__tests__/fixtures/catalog-v1.json'

/** Keep approved death-copy edits out of the frozen mechanical/catalogue digest. */
function legacyDeathCopy(state: GameState) {
  const clone = structuredClone(state)
  clone.history = clone.history.map(entry => {
    if (!entry.title.startsWith('Умерла ') && !entry.title.startsWith('Умер ')) return entry
    const name = entry.title.replace(/^Умер(?:ла)? /, '')
    const person = clone.people.find(candidate => candidate.name === name)
    if (!person) return entry
    return {
      ...entry,
      title: `Уход: ${name}`,
      text: `В возрасте ${person.age} лет ${name} уходит из жизни. На корабле продолжают работать двигатели, но привычный мир становится немного другим.`
    }
  })
  clone.memories = clone.memories.map(memory => {
    const match = memory.match(/^Умер(?:ла)? (.+?) — .+? \(\d+ (?:год|года|лет)\)\.$/)
    if (!match) return memory
    const name = match[1]!
    const verb = genderOf(clone, 'hero') === 'f' ? 'Пережила' : 'Пережил'
    return `${verb} уход человека, с которым была связана значительная часть жизни: ${name}.`
  })
  return clone
}

export async function neighborReplay(
  compare?: (g: GameState, old: Storylet) => void,
  compareOutcome?: (g: GameState, old: Storylet, index: number, expected: GameState) => void
) {
  const original = [...storylets], hash = createHash('sha256')
  const samples: Record<string, GameState> = {}, encountered: Record<string, number> = {}
  let lives = 0, states = 0, outcomes = 0
  const frozen = original.map(s => legacyNeighbor.find(o => o.id === s.id) ?? s)
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  storylets.splice(0, storylets.length, ...frozen)
  try {
    for (let seed = 3001; seed <= 3200; seed++) for (let strategy = 0; strategy < 4; strategy++) {
      let g = createGame(seed), guard = 0
      const checked = new Set<string>()
      while (!g.stopped && guard++ < 250) {
        states++
        for (const old of legacyNeighbor) {
          const eligible = g.age >= old.min && g.age <= old.max && old.available(g)
          hash.update(JSON.stringify([seed, strategy, g.age, old.id, eligible]))
          // Compare every eligibility state, including unavailable states and age boundaries.
          compare?.(g, old)
          if (eligible && !checked.has(old.id)) {
            checked.add(old.id)
            samples[old.id] ??= structuredClone(g)
            for (let index = 0; index < old.choices.length; index++) {
              const state = { ...g, pending: old.id }
              const next = decide(state, index)
              compareOutcome?.(state, old, index, next)
              // Journals are deliberately new; every pre-existing field must match.
              const { decisions: _journal, ...legacy } = legacyDeathCopy(next)
              hash.update(JSON.stringify(legacy))
              outcomes++
            }
          }
        }
        if (g.pending) {
          const s = storylets.find(s => s.id === g.pending)!
          encountered[s.id] = (encountered[s.id] ?? 0) + 1
          const wanted = strategy === 3 ? hash32(seed, s.id, g.age) % s.choices.length : Math.min(strategy, s.choices.length - 1)
          const index = canChoose(g, wanted).available ? wanted : s.choices.findIndex((_, i) => canChoose(g, i).available)
          if (index < 0) throw Error(`stuck ${s.id}`)
          g = decide(g, index)
        } else {
          const focus: Focus = (['study', 'relationships', 'work', 'rest'] as const)[strategy]!
          if (canFocus(g.age, focus)) g = setFocus(g, focus)
          g = advanceYear(g)
        }
      }
      if (!g.stopped) throw Error('nonterminating life')
      lives++
      if (lives % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0))
    }
  } finally { storylets.splice(0, storylets.length, ...original) }
  return { digest: hash.digest('hex'), lives, states, outcomes, encountered, samples }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { samples, ...report } = await neighborReplay()
  if (process.argv.includes('--capture')) {
    const base = 'src/domain/__tests__/fixtures/neighbor-v1-'
    if (existsSync(base + 'baseline.json') || existsSync(base + 'states.json')) throw Error('Refusing to overwrite the immutable pre-v2 baseline')
    writeFileSync(base + 'baseline.json', JSON.stringify(report, null, 2) + '\n')
    writeFileSync(base + 'states.json', JSON.stringify(samples, null, 2) + '\n')
  }
  console.log(report)
}
