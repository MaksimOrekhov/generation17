/** npx tsx scripts/economy-t8.ts -- 100 --json docs/audit/economy-t8-baseline.json */
import { writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { ENGINE_BASE, MAIN_POLICIES, playT8, policyFor } from './economy-t8-core'
import type { Policy, T8Life } from './economy-t8-core'
import { comparePolicies, exampleLife, retrainingReport, summarizeT8 } from './economy-t8-metrics'
import { SCENARIOS, rulesSnapshot, withScenario } from './economy-t8-scenarios'
import type { Scenario } from './economy-t8-scenarios'

const args = process.argv.slice(2).filter(a => a !== '--')
const value = (key: string, fallback?: string) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1] }
const count = Number(args[0] && /^\d+$/.test(args[0]) ? args[0] : 100), start = Number(value('--start', '102'))
const scenario = value('--scenario', 'S0') as Scenario, mainOnly = args.includes('--main-only'), jsonPath = value('--json')
if (!Number.isInteger(count) || count < 1 || count > 5000 || !Number.isInteger(start) || start < 1 || !Object.hasOwn(SCENARIOS, scenario)) throw Error('Usage: [1..5000] --start seed --scenario S0..S3 --main-only --json file')
const sources = readdirSync('src/domain').filter(f => f.endsWith('.ts')).sort().map(f => `src/domain/${f}`)
sources.push('src/content/load.ts', 'src/content/types.ts')
const fingerprint = createHash('sha256').update(sources.map(p => p + '\n' + readFileSync(p, 'utf8').replace(/\r\n/g, '\n')).join('\n') + readFileSync('src/content/bundle.json', 'utf8').replace(/\r\n/g, '\n')).digest('hex')

const report = withScenario(scenario, () => {
  const groups: Record<string, ReturnType<typeof summarizeT8>> = {}, diagnostics: Record<string, unknown> = {}, examples: ReturnType<typeof exampleLife>[] = []
  const integrity = { completedLives: 0, checks: 0, violations: 0, accountingErrors: [] as string[], firstReproduction: null as unknown }
  function batch(policy: Policy, mode: boolean) {
    console.error(`T8 ${scenario} ${mode ? 'B' : 'A'} ${policy.name}: ${count} seeds ${start}..${start + count - 1}`)
    const lives = Array.from({ length: count }, (_, i) => {
      const life = playT8(start + i, policy, mode)
      if ((i + 1) % 25 === 0) console.error(`  ${policy.name}: ${i + 1}/${count}`)
      return life
    })
    integrity.completedLives += lives.length; integrity.checks += lives.reduce((n, l) => n + l.invariantChecks, 0)
    integrity.violations += lives.reduce((n, l) => n + l.violations.length, 0); integrity.accountingErrors.push(...lives.flatMap(l => l.accountingErrors))
    const bad = lives.find(l => l.violations.length)
    if (bad && !integrity.firstReproduction) integrity.firstReproduction = { seed: bad.seed, policy, mode, violation: bad.violations[0] }
    return lives
  }
  for (const mode of [false, true]) {
    const key = mode ? 'B' : 'A', cache = new Map<string, T8Life[]>()
    for (const name of MAIN_POLICIES) {
      const lives = batch(policyFor(name), mode)
      groups[`${key}/${name}`] = summarizeT8(lives)
      if (['Careerist', 'Moderate', 'TimeBuyer', 'Switcher', 'StoryHelper'].includes(name)) cache.set(name, lives)
      if (mode && ['Careerist', 'Family', 'Switcher', 'TimeBuyer'].includes(name)) {
        const chosen = lives.find(l => l.purchases.length > 0 && l.checkpoints.some(c => c.age === 80)) ?? lives[0]!
        examples.push(exampleLife(chosen))
      }
      if (mode) {
        const hard = lives.find(l => l.years.some(y => y.tight))
        if (hard && !examples.some(e => e.hardship.length)) examples.push(exampleLife(hard))
      }
    }
    if (mainOnly) continue
    diagnostics[`${key}/Switcher35-0`] = retrainingReport(cache.get('Switcher')!, cache.get('Careerist')!)
    for (const age of [25, 35, 45]) for (const offset of [0, 1, 2]) {
      if (age === 35 && offset === 0) continue
      const policy = { ...policyFor('Switcher'), name: `Switcher${age}-${offset}`, switchAge: age, targetOffset: offset }
      const lives = batch(policy, mode)
      diagnostics[`${key}/${policy.name}`] = { summary: summarizeT8(lives), retraining: retrainingReport(lives, cache.get('Careerist')!) }
    }
    const timeFull = batch({ ...policyFor('TimeBuyer'), name: 'TimeBuyerFull', fullLoad: true }, mode)
    diagnostics[`${key}/TimeBuyerReducedVsFull`] = { full: summarizeT8(timeFull), paired: comparePolicies(cache.get('TimeBuyer')!, timeFull) }
    const helperControl = cache.get('Moderate')!
    diagnostics[`${key}/StoryHelperVsModerate`] = comparePolicies(cache.get('StoryHelper')!, helperControl)
    const retired = Object.fromEntries((['left', 'mentor', 'continue'] as const).map(path => {
      const lives = batch({ ...policyFor('Moderate'), name: `Retirement-${path}`, retirement: path }, mode)
      diagnostics[`${key}/Retirement-${path}`] = summarizeT8(lives)
      return [path, lives]
    }))
    diagnostics[`${key}/RetirementPaired`] = { mentorVsLeft: comparePolicies(retired.mentor!, retired.left!), continueVsLeft: comparePolicies(retired.continue!, retired.left!) }
  }
  return { schemaVersion: 1, engineBaseRevision: ENGINE_BASE, rulesSourceFingerprint: fingerprint, scenario, scenarioDescription: SCENARIOS[scenario], rules: rulesSnapshot(),
    seeds: { first: start, last: start + count - 1, count }, modes: ['A: let moments expire', 'B: accept available moments'], diagnosticsIncluded: !mainOnly,
    methodology: { cohort: start === 102 ? 'development' : start === 1002 ? 'holdout' : 'custom',
      clock: 'Resolve mandatory choices; set allowed focus; three real beats, accept moments only in B; one shared shop window before tick. No RNG for policies. All real states checked after each action.',
      choices: 'Same economy-t8a hash, explicit legal targets and first-available fallback. Strict Saver excludes paid story choices/purchases; StoryHelper alters only family-need-cell-* using predeclared reserve/context rules.',
      timing: 'Living checkpoints after settlement, before the new pending choice. Terminal settlement belongs to lifetime accounting, never to surviving-age distributions.',
      conflicts: 'Historical T8a five-offer metric retained; full catalogue supplies retraining target. Full financial/attention pairs use distinct expense categories, actual purchase sequences. Narrative mutual exclusivity and three-year projected commitment risk are separate.',
      narrative: 'T7 real event IDs, content conditions, age, presence and moment cooldown/attention. Offered != accepted. Purchase records/diary lines do not count as narrative. Eligible-not-selected aggregates rhythm, selection RNG and competing events; not a causal Director diagnosis.',
      forecast: 'Three projectYear calls with known child ageing; no hypothetical stories, world shocks, skill growth or mortality. New risk requires previously safe baseline plus aid/cancellation/housing loss or <one-year buffer with negative flow.',
      limits: ['Formal availability is not human attractiveness.', 'T7 has no direct retraining hook; profession-specific content is measured separately.', 'Course echo requires the story-window purchase, not every ordinary course.', 'Delayed definitions use since/ownedYears; deaths before age/lag floor are only a necessary timing bound.', 'Counts of blocked years can overlap within a year; no exclusive causal decomposition is claimed.', 'All lifetime means include infant deaths; paired survivor counts are explicit.'] },
    groups, diagnostics, examples, integrity }
})
const output = JSON.stringify(report, null, 2) + '\n'
if (jsonPath) writeFileSync(jsonPath, output)
else console.log(output)
console.error(`Completed ${report.integrity.completedLives}; invariants=${report.integrity.violations}; accounting=${report.integrity.accountingErrors.length}`)
if (report.integrity.violations || report.integrity.accountingErrors.length) process.exitCode = 1
