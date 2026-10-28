/** npx tsx scripts/economy-pilot.ts -- 100 --json docs/audit/economy-t8a.json */
import { writeFileSync } from 'node:fs'
import { pairedComparison, playLife, STRATEGIES, summarizeAvailability, summarizeLives } from './economy-pilot-core'
import type { Life, PilotOptions, Strategy } from './economy-pilot-core'

const args = process.argv.slice(2).filter(a => a !== '--')
const count = Number(args.find(a => /^\d+$/.test(a)) ?? 100)
const jsonAt = args.indexOf('--json')
const jsonPath = jsonAt >= 0 ? args[jsonAt + 1] : undefined
if (!Number.isInteger(count) || count < 1 || count > 5000 || jsonAt >= 0 && !jsonPath) {
  throw Error('Usage: npx tsx scripts/economy-pilot.ts -- [1..5000] [--json file]')
}

function batch(strategy: Strategy, options: PilotOptions = {}) {
  console.error(`T8a: ${strategy} ${JSON.stringify(options)} — ${count} lives`)
  return Array.from({ length: count }, (_, i) => playLife(i + 102, strategy, options))
}
const main = Object.fromEntries(STRATEGIES.map(s => [s, batch(s)])) as Record<Strategy, Life[]>
const moments = Object.fromEntries(STRATEGIES.map(s => [s, batch(s, { acceptMoments: true })])) as Record<Strategy, Life[]>
const diagnostic = {
  courseOnlyStudy: batch('Saver', { courseOnly: true }),
  careeristNoCourses: batch('Careerist', { noCourses: true }),
  familyFullLoad: batch('Family', { noReducedLoad: true }),
  familyNoPurchases: batch('Family', { noPurchases: true }),
}
const all = [...Object.values(main), ...Object.values(moments), ...Object.values(diagnostic)].flat()
const report = {
  schemaVersion: 1,
  baseRevision: 'e2840970143be70d1a6732536848588d4658e9a3',
  samplesPerStrategy: count, inputSeeds: { first: 102, last: count + 101 },
  completedLives: all.filter(l => l.completed).length, mainCompletedLives: Object.values(main).flat().filter(l => l.completed).length,
  methodology: {
    decisions: 'hash32(economy-t8a, inputSeed, storyletId, age) modulo choice count; no simulation RNG consumption. All mandatory choices resolved.',
    window: 'Once per year at phase 3 after mandatory decisions and all beats, before tick. Purchases from 16; choice-quality denominator is living ages >=18. Checkpoints immediately after tick, only if still alive, before pending choice/purchases.',
    moments: 'Main: let moments expire through beat/tick without skip effects. Sensitivity: take every available moment immediately, up to three attention per year, before shopping.',
    focus: 'Saver/Moderate/Explorer/Spender: study; Careerist: work; Family: relationships. setFocus every year when allowed; engine fallback when unavailable.',
    policies: {
      Saver: 'No purchases, no load changes.',
      Moderate: 'Priority: courses until two current-profession courses; cabin from26; dome from30; family on ages divisible by10; sector on ages divisible by8. At most one purchase per year, retain two forecast annual bills and reject projected tight year.',
      Careerist: 'Course whenever eligible, no reserve, no reduced load; work focus. Not a course-only comparison.',
      Family: 'Priority: family whenever eligible; cabin from26; dome from30; first course. Retain one forecast annual bill, reject projected tight year. Reduce from40 if canSetLoad and balance >=max(domain reserve,3 projected annual bills); return full if balance falls below one projected annual bill and canSetLoad.',
      Explorer: 'One sector per year in lexicographic sector-ID order; dome; cabin from26. Retain one forecast annual bill, reject projected tight year. No course or family purchases.',
      Spender: 'Priority: course,cabin,dome,family,sector x4. Finite eight checks, real resource limits only, no reserve or load changes.',
    },
    targets: 'Sectors sorted by ID, exclude current/visited, domain maximum4. Family: eligible real known living people sorted by descending bond then ID; first up to3; domain minimum2 and cooldown5.',
    choiceQuality: 'One representative deterministic target per offer/category. Nonfinancial eligibility inferred only from canBuy success or its final money/attention refusal. Every pair of individually available different categories is tried in both real purchase orders. All-category feasibility uses exhaustive real purchase sequences, once per category, not every possible repeat/sector. Empty catalogue is reported separately; it is not can-buy-all or nothing-affordable. Annual obligations are not charged up front in this metric; future commitments are reported in spending and forecasts.',
    spending: 'Full lifetime actions and annual observations are captured as they occur, not reconstructed from capped ledger/years. H1 restoration excluded from purchase counts. Entry fees and real annual rent/service bills reported separately. Zero-price dome activation counts as use, not as a positive-cost purchase.',
    survivorBias: 'No dead-life imputation. Exact-age living checkpoints; terminal-year settlement contributes lifetime accounting but not surviving checkpoint counts. Annual tariffs only for working checkpoints; pension shown separately.',
    attribution: 'Paired main strategies are descriptive policy comparisons; focus and ensuing narratives differ. CourseOnlyStudy/Saver and Careerist/noCourses isolate the course policy within this model; Family/fullLoad isolates load policy including downstream changes. Checkpoint deltas use joint survivors. Immediate-effect share measures direct stats/skills/person bonds or a used dome year, not human value.',
    reproducibility: 'No timestamps, random IDs, RNG calls or modified character inputs in pilot. Primary runs and sensitivity use exactly the same input seeds. Base revision identifies domain rules, not a self-referential output commit.',
    limitations: ['T5 not complete; paid retraining not assessed.', 'T6/T7 purchase stories and reactions absent.', 'T8a does not replace T8.', 'Bots are not players; technical conflict is not emotional attractiveness.', 'No voluntary service cancellation in these fixed policies.', 'Population/lifetime means include infant deaths; conditional counts and joint-survivor results are explicit.'],
  },
  strategies: Object.fromEntries(STRATEGIES.map(s => [s, summarizeLives(main[s])])),
  acceptMomentsSensitivity: Object.fromEntries(STRATEGIES.map(s => [s, summarizeLives(moments[s])])),
  diagnostics: Object.fromEntries(Object.entries(diagnostic).map(([k, v]) => [k, summarizeLives(v)])),
  comparisons: {
    vsSaver: Object.fromEntries(STRATEGIES.filter(s => s !== 'Saver').map(s => [s, pairedComparison(main[s], main.Saver)])),
    courseOnlyStudyVsSaver: pairedComparison(diagnostic.courseOnlyStudy, main.Saver),
    careeristCoursesVsNoCourses: pairedComparison(main.Careerist, diagnostic.careeristNoCourses),
    familyReducedVsFullLoad: pairedComparison(main.Family, diagnostic.familyFullLoad),
    familyPurchasesVsNoPurchases: pairedComparison(main.Family, diagnostic.familyNoPurchases),
  },
  familyCatalogueAvailability: summarizeAvailability(main.Family),
  integrity: { invariantChecks: all.reduce((n, l) => n + l.invariantChecks, 0),
    violationCount: all.reduce((n, l) => n + l.violations.length, 0), accountingErrors: all.flatMap(l => l.accountingErrors),
    firstReproduction: all.find(l => l.violations.length) ? { seed: all.find(l => l.violations.length)!.seed,
      strategy: all.find(l => l.violations.length)!.strategy, violation: all.find(l => l.violations.length)!.violations[0] } : null },
}
const json = JSON.stringify(report, null, 2) + '\n'
if (jsonPath) writeFileSync(jsonPath, json)
else console.log(json)
console.error(`Completed ${report.completedLives} lives; invariants=${report.integrity.violationCount}; accounting=${report.integrity.accountingErrors.length}`)
if (report.integrity.violationCount || report.integrity.accountingErrors.length) process.exitCode = 1
