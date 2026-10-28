/** npx tsx scripts/economy-career-t5.ts -- 100 --json docs/audit/economy-t5.json */
import { writeFileSync } from 'node:fs'
import { assertProfessionStoriesExist, pairedRetraining, summarizeRetraining } from './economy-career-t5-core'
import { pairedComparison, playLife, summarizeLives } from './economy-pilot-core'
import type { Life, PilotOptions, Strategy } from './economy-pilot-core'

const args = process.argv.slice(2).filter(a => a !== '--')
const count = Number(args.find(a => /^\d+$/.test(a)) ?? 100)
const jsonAt = args.indexOf('--json')
const jsonPath = jsonAt >= 0 ? args[jsonAt + 1] : undefined
if (!Number.isInteger(count) || count < 1 || count > 5000 || jsonAt >= 0 && !jsonPath) {
  throw Error('Usage: npx tsx scripts/economy-career-t5.ts -- [1..5000] [--json file]')
}
assertProfessionStoriesExist()

const SWITCH_AGE = 35
function batch(label: string, strategy: Strategy, options: PilotOptions = {}) {
  console.error(`T5: ${label} — ${count} lives`)
  // Те же входные seed, что у T8a (102…), чтобы пары можно было сопоставить.
  return Array.from({ length: count }, (_, i) => playLife(i + 102, strategy, options))
}
const groups = {
  Careerist: batch('Careerist', 'Careerist'),
  Switcher: batch('Switcher', 'Careerist', { retrainAt: SWITCH_AGE }),
  Saver: batch('Saver', 'Saver'),
  SwitcherSaver: batch('SwitcherSaver', 'Saver', { retrainAt: SWITCH_AGE }),
} satisfies Record<string, Life[]>
const all = Object.values(groups).flat()

const report = {
  schemaVersion: 1,
  task: 'T5 career audit (diagnostic, no rebalancing)',
  baseRevision: 'e47e9a869b3fa149b6baef4643c4c530f0a8f500',
  samplesPerGroup: count, inputSeeds: { first: 102, last: count + 101 },
  methodology: {
    runner: 'T8a playLife/financialDecisions unchanged; the only addition is PilotOptions.retrainAt. Decisions: hash32(economy-t8a, seed, storylet, age) as in T8a; no simulation RNG is consumed by policies.',
    switcher: `From age ${SWITCH_AGE}, before other purchases of the year, attempt canBuy/purchase('retrain') to hash32('economy-t5', seed, 'retrain-target') % 3 among the three other professions. On refusal retry every year up to age ${SWITCH_AGE + 4}.`,
    groups: 'Switcher = Careerist policy (work focus, course whenever available) + retraining. SwitcherSaver = Saver policy (study focus, no purchases) + retraining. Controls use identical seeds and policies without retraining.',
    attribution: 'Paired differences isolate the retraining policy for the same seed, but downstream stories, checks and mortality may diverge after the switch. Joint-survivor checkpoints and joint-age wage sums are reported separately from lifetime totals.',
    narrative: 'Profession-gated storylets: microcrack/late-tech-handbook (Техник), clinic/late-medic-routine (Медик), seed-vault (Агроном), council (Координатор); moments m-job-*. Moments are offered via beat even when bots let them expire.',
    limitations: [
      'Bots are not players: the retraining target is a hash, not a preference for a profession.',
      'Story mentor retraining (free, cyclic) still happens in some control and switcher lives; counted separately.',
      'No rebalancing was performed; ECONOMY_TUNING and catalogue prices are unchanged.',
      'Lifetime means include early deaths; switched-only statistics condition on reaching the switch.'
    ]
  },
  groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, summarizeLives(v)])),
  retraining: { Switcher: summarizeRetraining(groups.Switcher), SwitcherSaver: summarizeRetraining(groups.SwitcherSaver),
    controlsStoryRetrain: { Careerist: summarizeRetraining(groups.Careerist).narrative.storyMentorRetrainLives, Saver: summarizeRetraining(groups.Saver).narrative.storyMentorRetrainLives } },
  comparisons: {
    switcherVsCareerist: { ...pairedComparison(groups.Switcher, groups.Careerist), retraining: pairedRetraining(groups.Switcher, groups.Careerist) },
    switcherSaverVsSaver: { ...pairedComparison(groups.SwitcherSaver, groups.Saver), retraining: pairedRetraining(groups.SwitcherSaver, groups.Saver) },
  },
  integrity: { invariantChecks: all.reduce((n, l) => n + l.invariantChecks, 0),
    violationCount: all.reduce((n, l) => n + l.violations.length, 0), accountingErrors: all.flatMap(l => l.accountingErrors),
    firstReproduction: all.find(l => l.violations.length)?.violations[0] ?? null },
}
const json = JSON.stringify(report, null, 2) + '\n'
if (jsonPath) writeFileSync(jsonPath, json)
else console.log(json)
console.error(`Completed ${all.length} lives; invariants=${report.integrity.violationCount}; accounting=${report.integrity.accountingErrors.length}`)
if (report.integrity.violationCount || report.integrity.accountingErrors.length) process.exitCode = 1
