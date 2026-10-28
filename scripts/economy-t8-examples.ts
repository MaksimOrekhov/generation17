/** Replay the preselected S0 examples and expose actual alternatives without full GameState dumps.
 * npx tsx scripts/economy-t8-examples.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { canBuy, getOffer } from '../src/domain/offers'
import { canSetLoad, resolveText } from '../src/domain/engine'
import { storylets } from '../src/domain/storylets'
import { moments } from '../src/domain/moments'
import { chooseStory, IDS, playT8, targetForOffer } from './economy-t8-core'
import type { Policy } from './economy-t8-core'
import { exampleLife } from './economy-t8-metrics'

const baseline = JSON.parse(readFileSync('docs/audit/economy-t8-baseline.json', 'utf8')) as { examples: { seed: number; policy: Policy; acceptMoments: boolean }[] }
const diagnostic = JSON.parse(readFileSync('docs/audit/economy-t8-diagnostics.json', 'utf8')) as typeof baseline
const selected = [...baseline.examples, ...diagnostic.examples]
  .filter((e, i, a) => a.findIndex(x => x.seed === e.seed && x.policy.name === e.policy.name && x.acceptMoments === e.acceptMoments) === i)
if (selected.length < 5) throw Error('Need at least five genuinely distinct selected trajectories')
const examples = selected.map(e => {
  const decisions: unknown[] = [], windows = new Map<number, unknown>()
  const life = playT8(e.seed, e.policy, e.acceptMoments, { observeChoiceQuality: false, onState: (g, action) => {
    if ((action === 'create' || action === 'tick') && g.pending && !g.stopped) {
      const choice = chooseStory(g, e.policy)
      decisions.push({ age: g.age, id: choice.event.id, title: resolveText(g, choice.event.title), selectedIndex: choice.selected.index,
        options: choice.options.map(o => ({ text: resolveText(g, o.choice.text), available: o.a.available, reason: o.a.reason,
          cost: o.a.cost, target: o.target })) })
    }
    if (g.age >= 18 && g.phase === 3 && !g.pending && !g.stopped && /^(beat:|moment:)/.test(action)) {
      windows.set(g.age, { age: g.age, balance: g.economy.balance, attention: g.attention, reducedLoad: canSetLoad(g, .6),
        offers: IDS.map(id => { const target = targetForOffer(g, id), a = canBuy(g, id, target); return { id, category: getOffer(id)!.category, target, available: a.available, reason: a.reason, cost: a.oneTimeCost, attention: a.attention } }) })
    }
  } })
  const selectedAges = new Set([18, 25, 35, 40, 60, 65, 70, 80, ...life.purchases.map(p => p.age), ...life.loadChanges.map(c => c.age), ...life.detail.storyWindows.map(w => w.age)])
  return { ...exampleLife(life), decisions, adultWindows: [...windows.entries()].filter(([age]) => selectedAges.has(age)).map(([, w]) => w),
    professionEvents: life.detail.professionEvents.filter(event => event.age >= 18 && event.kind !== 'offered').map(event => ({ ...event,
      title: (event.kind === 'story' ? storylets : moments).find(d => d.id === event.id)?.title })),
    integrity: { checks: life.invariantChecks, violations: life.violations.length, accountingErrors: life.accountingErrors } }
})
if (examples.some(e => e.integrity.violations || e.integrity.accountingErrors.length)) throw Error('Example integrity failed')
writeFileSync('docs/audit/economy-t8-trajectories.json', JSON.stringify({ schemaVersion: 1, scenario: 'S0',
  methodology: 'Actual deterministic replays of preselected development examples; on-state observers never alter the game or RNG. Actual offered alternatives; catalogue windows retained at milestone, purchase, load-change and economic-story ages. No invented prose or complete state dumps.', examples }, null, 2) + '\n')
console.error(`Replayed ${examples.length} examples; ${examples.reduce((n, e) => n + e.integrity.checks, 0)} checks; zero errors`)
