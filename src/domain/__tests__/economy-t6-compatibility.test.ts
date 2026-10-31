import catalogV1 from './fixtures/catalog-v1.json'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import baseline from './economy-t6-baseline.json'
import { beat, createGame, decide, takeMoment, tick } from '../engine'
import { moments } from '../moments'
import { hash32 } from '../random'
import { storylets } from '../storylets'
import { T7_MOMENT_IDS, T7_STORYLET_IDS } from './t7-fixtures'
import { T9_MOMENT_IDS } from './t9-fixtures'
import { GEN57_STORYLET_IDS } from './gen57-fixtures'
import { NPC_MILESTONE_FLAGS } from '../npcMilestones'
import { applyTimeRules } from '../../../scripts/personal-time-rules'

// T7 and GEN-57 add real stories, so whole lives legitimately diverge. The legacy catalogue is replayed
// without them: this proves feature engine changes did not alter decisions, RNG or finances of old content.
// T9 changes the personal-time rules and adds free-time moments: the baseline is replayed explicitly
// in the T8 compatibility mode (3 units every year, course costs 1) and without the T9 moments.
const savedStorylets = [...storylets], savedMoments = [...moments]
let restoreTimeRules = () => {}
beforeAll(() => {
  storylets.splice(0, storylets.length, ...savedStorylets.filter(s => !T7_STORYLET_IDS.has(s.id) && !GEN57_STORYLET_IDS.has(s.id)).sort((a, b) => catalogV1.indexOf(a.id) - catalogV1.indexOf(b.id)))
  moments.splice(0, moments.length, ...savedMoments.filter(m => !T7_MOMENT_IDS.has(m.id) && !T9_MOMENT_IDS.has(m.id)))
  restoreTimeRules = applyTimeRules('T8')
})
afterAll(() => {
  storylets.splice(0, storylets.length, ...savedStorylets)
  moments.splice(0, moments.length, ...savedMoments)
  restoreTimeRules()
})

describe(`T6 unchanged existing lives, captured at ${baseline.base}`, () => {
  it('excludes exactly the T7 content and nothing else', () => {
    expect(savedStorylets.length - storylets.length).toBe(T7_STORYLET_IDS.size + GEN57_STORYLET_IDS.size)
    expect(savedMoments.length - moments.length).toBe(T7_MOMENT_IDS.size + T9_MOMENT_IDS.size)
  })
  it.each(baseline.runs)('seed=$seed, acceptMoments=$acceptMoments matches decisions, RNG and finances', expected => {
    const { seed, acceptMoments } = expected
    let g = createGame(seed)
    const trace: unknown[] = []
    while (!g.stopped) {
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
    expect(trace).toEqual(expected.trace)
    const legacyFlags = { ...g.flags }
    for (const flag of NPC_MILESTONE_FLAGS) delete legacyFlags[flag]
    expect({ age: g.age, rng: g.rng, economy: g.economy, stats: g.stats, flags: legacyFlags }).toEqual(expected.final)
  })
})
