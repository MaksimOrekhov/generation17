import { beat, createGame, decide, setFocus, takeMoment, tick } from '../src/domain/engine'
import { storylets } from '../src/domain/storylets'
import { moments } from '../src/domain/moments'
import { toneOf } from '../src/domain/director'
import { findInconsistencies } from '../src/domain/invariants'
import type { Focus, GameState } from '../src/domain/types'

const strategies = ['first', 'last', 'cycling', 'study', 'rest', 'relationships', 'moments'] as const
const sampleCount = Number(process.argv[2] ?? 200)
if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 10000) throw Error('Usage: npm run sim -- 200')

/** Невозможные состояния мира (см. src/domain/invariants.ts): сколько раз каждое встретилось за все прогоны. */
const problems: Record<string, number> = {}
function audit(g: GameState) {
  for (const p of findInconsistencies(g)) {
    const key = p.slice(p.indexOf(': ') + 2)
    problems[key] = (problems[key] ?? 0) + 1
  }
}

function mean(values: number[]) {
  return Math.round(values.reduce((sum, n) => sum + n, 0) / values.length * 10) / 10
}

function quantile(values: number[], p: number) {
  const xs = values.slice().sort((a, b) => a - b)
  return xs[Math.round((xs.length - 1) * p)]
}

/** Один год по сезонам. Стратегия «moments» принимает каждый момент, пока хватает внимания. */
function playYear(g: GameState, acceptMoments: boolean) {
  while (!g.stopped && !g.pending && g.phase < 3) {
    g = beat(g)
    audit(g)
    if (acceptMoments && g.moment) g = takeMoment(g)
  }
  return tick(g)
}

const report: Record<string, unknown> = {}
for (const strategy of strategies) {
  const runs: { age: number; choices: number; delayed: number; memories: number; moments: number; wealth: number }[] = []
  const at40: GameState['stats'][] = []
  const gaps: number[] = []
  let tensePairs = 0
  let decisionsTotal = 0
  let crisisClose = 0
  const frequencies: Record<string, number> = {}
  const momentFrequencies: Record<string, number> = {}
  const outcomeFrequencies: Record<string, number> = {}
  const arcLives: Record<string, number> = {}
  const arcWithOutcome: Record<string, number> = {}
  for (let seed = 1; seed <= sampleCount; seed++) {
    let g = createGame(seed + 101)
    let choices = 0
    let lastDecision: { age: number; tone: string } | null = null
    for (let step = 0; step < 450 && !g.stopped; step++) {
      if (g.pending) {
        const event = storylets.find(e => e.id === g.pending)
        if (!event) throw Error(`Unknown event ${g.pending}`)
        if (lastDecision) {
          const gap = g.age - lastDecision.age
          gaps.push(gap)
          const hard = (t: string) => t === 'tense' || t === 'crisis'
          if (hard(toneOf(event)) && hard(lastDecision.tone) && gap <= 2) tensePairs++
          if (toneOf(event) === 'crisis' && lastDecision.tone === 'crisis' && gap <= 5) crisisClose++
        }
        lastDecision = { age: g.age, tone: toneOf(event) }
        decisionsTotal++
        frequencies[event.id] = (frequencies[event.id] ?? 0) + 1
        const index = strategy === 'last' ? event.choices.length - 1 : strategy === 'cycling' ? choices % event.choices.length : 0
        g = decide(g, index)
        choices += 1
      } else {
        g = playYear(g, strategy === 'moments')
        // фокус года появляется только с 6 лет
        if (g.age === 6 && ['rest', 'relationships'].includes(strategy)) g = setFocus(g, strategy as Focus)
        if (g.age === 40) at40.push({ ...g.stats })
      }
      audit(g)
      for (const value of [...Object.values(g.stats), ...Object.values(g.ship), ...Object.values(g.skills)]) {
        if (!Number.isFinite(value) || value < 0 || value > 100) throw Error(`Invalid stat in seed=${seed}`)
      }
    }
    if (!g.stopped) throw Error(`Life did not finish for ${seed}`)
    for (const f of g.forks) {
      arcLives[f.arc] = (arcLives[f.arc] ?? 0) + 1
      if (f.outcomes.length) arcWithOutcome[f.arc] = (arcWithOutcome[f.arc] ?? 0) + 1
    }
    for (const f of g.forks) for (const o of f.outcomes) outcomeFrequencies[o.title] = (outcomeFrequencies[o.title] ?? 0) + 1
    for (const h of g.history.filter(h => h.kind === 'moment')) momentFrequencies[h.title] = (momentFrequencies[h.title] ?? 0) + 1
    runs.push({
      age: g.age, choices, memories: g.memories.length, wealth: g.birth.wealth,
      moments: g.history.filter(h => h.kind === 'moment').length,
      delayed: g.forks.filter(f => f.outcomes.length > 0).length
    })
  }
  const byWealth = Object.fromEntries([1, 2, 3, 4, 5].map(w => [w, mean(runs.filter(r => r.wealth === w).map(r => r.age))]))
  report[strategy] = {
    count: runs.length,
    age: { mean: mean(runs.map(r => r.age)), p10: quantile(runs.map(r => r.age), .1), median: quantile(runs.map(r => r.age), .5), p90: quantile(runs.map(r => r.age), .9) },
    meanAgeByWealth: byWealth,
    diedBefore5: `${Math.round(runs.filter(r => r.age < 5).length / runs.length * 1000) / 10}%`,
    choices: { mean: mean(runs.map(r => r.choices)), min: Math.min(...runs.map(r => r.choices)), max: Math.max(...runs.map(r => r.choices)) },
    meanStatsAt40: Object.fromEntries((['health', 'morale', 'stress', 'knowledge', 'bonds', 'reputation'] as const).map(k => [k, mean(at40.map(x => x[k]))])),
    arcShareOfLives: Object.fromEntries(Object.entries(arcLives).map(([k, v]) => [k, `${Math.round(v / runs.length * 100)}% (с последствиями ${Math.round((arcWithOutcome[k] ?? 0) / runs.length * 100)}%)`])),
    forkOutcomes: Object.fromEntries(Object.entries(outcomeFrequencies).sort((a, b) => b[1] - a[1])),
    decisionRhythm: {
      meanGapYears: mean(gaps), p90Gap: quantile(gaps, .9), maxGap: Math.max(...gaps), gapsOver6: `${Math.round(gaps.filter(x => x > 6).length / Math.max(1, gaps.length) * 1000) / 10}%`,
      consecutiveYearDecisions: gaps.filter(x => x < 2).length, tenseInARowWithin2Years: `${Math.round(tensePairs / Math.max(1, decisionsTotal) * 1000) / 10}%`, crisisWithin5Years: crisisClose
    },
    momentsTakenPerLife: mean(runs.map(r => r.moments)),
    delayedPerLife: mean(runs.map(r => r.delayed)),
    memoriesPerLife: mean(runs.map(r => r.memories)),
    notEncountered: storylets.filter(e => !frequencies[e.id]).map(e => e.id),
    momentsNeverTaken: strategy === 'moments' ? moments.filter(m => !momentFrequencies[m.title]).map(m => m.id) : undefined
  }
}
if (Object.keys(problems).length) process.exitCode = 1
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), samplesPerStrategy: sampleCount, totalRuns: strategies.length * sampleCount, inconsistencies: problems, storylets: storylets.length, moments: moments.length, strategies: report }, null, 2))
