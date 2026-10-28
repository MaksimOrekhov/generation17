/**
 * Аудит игрового ритма и каталога событий.
 *
 *   npm run audit                          200 жизней на стратегию, отчёт в консоль
 *   npm run audit -- 300 --json out.json   сохранить показатели
 *   npm run audit -- 300 --compare old.json   сравнить с сохранёнными показателями
 *
 * Ограничения (важно при чтении отчёта):
 *  - Условия большинства сюжетов написаны замыканиями на TypeScript, поэтому «неиспользуемые флаги»
 *    ищутся грубым разбором исходников (флаги в `flags: {…}` и обращения `flags.x`, `is(g, 'x')`, `since(g, 'x')`);
 *    флаг, прочитанный через динамическое имя, будет ошибочно назван неиспользуемым.
 *  - Достижимость и частота получены на ботах с механическими стратегиями, а не на людях.
 *    Сюжет, не встретившийся ни разу, не обязательно недостижим: он мог не подойти ботам.
 *  - Темп измерен моделью часов (`runClock`) при условии, что игрок моменты не открывает и решения принимает мгновенно.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { beat, createGame, decide, setFocus, takeMoment, tick } from '../src/domain/engine'
import { LIFE_PRESETS, SPEEDS, runClock } from '../src/domain/clock'
import { codeStorylets, storylets } from '../src/domain/storylets'
import { codeMoments, moments } from '../src/domain/moments'
import { hash32 } from '../src/domain/random'
import { findInconsistencies } from '../src/domain/invariants'
import { wageOf } from '../src/domain/economy'
import { describe as summarize } from './audit-stats'
import type { Focus, GameState, Job, Storylet } from '../src/domain/types'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const numberArg = args.find(a => /^[0-9]+$/.test(a))
const lives = numberArg ? Number(numberArg) : 200
const diffAt = args.indexOf('--diff')
const flagValue = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const jsonPath = flagValue('--json')
const comparePath = flagValue('--compare')
if (diffAt < 0 && (!Number.isInteger(lives) || lives < 10 || lives > 5000)) throw Error('Usage: npm run audit -- [10…5000] [--json file] [--compare file] | --diff old.json new.json')

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pct = (n: number, d: number) => round((n / Math.max(1, d)) * 100, 1)

function flatten(value: unknown, prefix = '', out: Record<string, number> = {}) {
  if (typeof value === 'number') out[prefix] = value
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out)
  return out
}

/** Таблица изменившихся числовых показателей (частоты отдельных сюжетов не печатаются). */
function printDiff(old: unknown, next: unknown) {
  const skip = (k: string) => k.startsWith('encounter.rates') || k.startsWith('lateLife.rates') || k === 'lives'
  const a = flatten(old), b = flatten(next)
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !skip(k)).sort()
  console.log('| показатель | было | стало | изменение |\n|---|---:|---:|---:|')
  for (const k of keys) {
    const x = a[k], y = b[k]
    if (x === y) continue
    console.log(`| ${k} | ${x ?? '—'} | ${y ?? '—'} | ${x !== undefined && y !== undefined ? round(y - x, 3) : '—'} |`)
  }
}

if (diffAt >= 0) {
  printDiff(JSON.parse(readFileSync(args[diffAt + 1]!, 'utf8')), JSON.parse(readFileSync(args[diffAt + 2]!, 'utf8')))
  process.exit(0)
}

// ───────────────────────── прогон одной жизни ─────────────────────────

const retrospective = new Set<string>(
  (JSON.parse(readFileSync(join(root, 'src/content/bundle.json'), 'utf8')) as { storylets: any[] }).storylets
    .filter(s => Object.values(s.requires?.since ?? {}).some(y => (y as number) >= 15)).map(s => s.id)
)

type Policy = (event: Storylet, step: number, seed: number) => number
const policies: Record<string, Policy> = {
  first: () => 0,
  last: ev => ev.choices.length - 1,
  cycling: (ev, step, seed) => (step + seed) % ev.choices.length,
  // «случайный» игрок: выбор из чистого хэша, не из RNG симуляции
  mixed: (ev, step, seed) => hash32('audit', seed, step) % ev.choices.length
}

interface Life {
  seed: number
  age: number
  job: string
  decisions: { age: number; id: string; old: boolean }[]
  momentsByAge: number[]
  momentIds: string[]
  seen: string[]
  memories: number
  delayed: number
  arcs: Record<string, boolean>
  stats40: GameState['stats'] | null
  economy: EconomyLife
}

type EconomyAge = 20 | 40 | 60 | 80
const economyAges: EconomyAge[] = [20, 40, 60, 80]
const professions: Job[] = ['Техник', 'Медик', 'Агроном', 'Координатор']

interface EconomyCheckpoint {
  balance: number
  tariffIncome: number
  tariffYears: number | null
  reserveYears: number | null
  job: Job
  grade: number
  kind: string
  pension: number
  bills: number
  aid: number
}

interface EconomyYear {
  age: number
  job: Job
  kind: string
  grade: number
  wage: number
  tariffIncome: number
  pension: number
  bills: number
  aid: number
  balance: number
  openingBalance: number
  tight: boolean
  housingDowngrade: boolean
  cancelledServices: number
  servicesClosed: boolean
  inconsistencyCount: number
  inconsistencies: string[]
}

interface EconomyLife {
  checkpoints: Partial<Record<EconomyAge, EconomyCheckpoint>>
  years: EconomyYear[]
  invariantChecks: number
  invariantViolations: number
  invariantMessages: Record<string, number>
}

function emptyEconomyLife(): EconomyLife {
  return { checkpoints: {}, years: [], invariantChecks: 0, invariantViolations: 0, invariantMessages: {} }
}

function playLife(seed: number, policy: Policy, opts: { focus?: Focus; acceptMoments?: boolean } = {}): Life {
  let g = createGame(seed + 101)
  const life: Life = { seed, age: 0, job: '', decisions: [], momentsByAge: new Array(120).fill(0), momentIds: [], seen: [], memories: 0, delayed: 0, arcs: {}, stats40: null, economy: emptyEconomyLife() }
  let step = 0
  for (let guard = 0; guard < 1200 && !g.stopped; guard++) {
    if (g.pending) {
      const event = storylets.find(e => e.id === g.pending)
      if (!event) throw Error(`Неизвестное решение ${g.pending}`)
      // «Отсылка к прошлому»: линия, начатая решением 15 и более лет назад, либо сюжет с окном since ≥ 15 в JSON
      const old = g.forks.some(f => f.arc === event.arc && f.age <= g.age - 15) || retrospective.has(event.id)
      life.decisions.push({ age: g.age, id: event.id, old })
      g = decide(g, policy(event, step++, seed))
      continue
    }
    while (!g.stopped && !g.pending && g.phase < 3) {
      g = beat(g)
      if (g.moment) {
        life.momentsByAge[g.age]!++
        life.momentIds.push(g.moment)
        if (opts.acceptMoments) g = takeMoment(g)
      }
    }
    // Capture a read-only observation around the existing tick; do not alter game/RNG flow.
    const beforeEconomy = {
      balance: g.economy.balance,
      housing: g.economy.housing,
      services: Object.keys(g.economy.services),
    }
    g = tick(g)
    const year = g.economy.years.at(-1)
    if (year?.age === g.age && g.economy.settledAge === g.age) {
      const work = g.economy.work
      const tariffIncome = wageOf(g)
      const inconsistencies = findInconsistencies(g)
      const observation: EconomyYear = {
        age: g.age,
        job: work.job,
        kind: work.kind,
        grade: work.grade,
        wage: year.wage,
        tariffIncome,
        pension: year.pension,
        bills: year.bills,
        aid: year.aid,
        balance: year.balance,
        openingBalance: beforeEconomy.balance,
        tight: g.economy.tightStreak > 0,
        housingDowngrade: g.economy.housing < beforeEconomy.housing,
        cancelledServices: beforeEconomy.services.filter(id => !(id in g.economy.services)).length,
        servicesClosed: g.flags.shipIncidentAge === g.age || g.ship.air < 55 || g.ship.food < 45,
        inconsistencyCount: inconsistencies.length,
        inconsistencies,
      }
      life.economy.years.push(observation)
      life.economy.invariantChecks++
      life.economy.invariantViolations += inconsistencies.length
      for (const issue of inconsistencies) life.economy.invariantMessages[issue] = (life.economy.invariantMessages[issue] ?? 0) + 1
      if (economyAges.includes(g.age as EconomyAge)) {
        life.economy.checkpoints[g.age as EconomyAge] = {
          balance: year.balance,
          tariffIncome,
          tariffYears: tariffIncome > 0 ? year.balance / tariffIncome : null,
          reserveYears: year.bills > 0 ? year.balance / year.bills : null,
          job: work.job,
          grade: work.grade,
          kind: work.kind,
          pension: year.pension,
          bills: year.bills,
          aid: year.aid,
        }
      }
    }
    if (opts.focus && g.age === 14) g = setFocus(g, opts.focus)
    if (g.age === 40) life.stats40 = { ...g.stats }
  }
  if (!g.stopped) throw Error(`Жизнь не завершилась для seed ${seed}`)
  life.age = g.age
  life.job = g.protagonist.job
  life.seen = [...g.seen]
  life.memories = g.memories.length
  life.delayed = g.forks.filter(f => f.outcomes.length > 0).length
  for (const f of g.forks) life.arcs[f.arc] = life.arcs[f.arc] || f.outcomes.length > 0
  return life
}

const batch = (policy: Policy, opts: { focus?: Focus; acceptMoments?: boolean } = {}) =>
  Array.from({ length: lives }, (_, i) => playLife(i + 1, policy, opts))

// ───────────────────────── показатели ─────────────────────────

const bands = [[0, 9], [10, 15], [16, 24], [25, 39], [40, 59], [60, 79], [80, 95]] as const
const priorityOf = (s: Storylet) => (s as { priority?: string }).priority ?? (s.weight >= 10 ? 'followup (по weight>=10)' : 'normal')

function catalogReport() {
  const byArc: Record<string, number> = {}
  const byPriority: Record<string, number> = {}
  for (const s of storylets) {
    byArc[s.arc ?? '—'] = (byArc[s.arc ?? '—'] ?? 0) + 1
    byPriority[priorityOf(s)] = (byPriority[priorityOf(s)] ?? 0) + 1
  }
  return {
    storylets: storylets.length, codeStorylets: codeStorylets.length, jsonStorylets: storylets.length - codeStorylets.length,
    moments: moments.length, codeMoments: codeMoments.length, jsonMoments: moments.length - codeMoments.length,
    byArc, byPriority,
    momentsWithSkipEffects: moments.filter(m => m.skip.effects).length,
    coverage: Object.fromEntries(bands.map(([a, b]) => [`${a}-${b}`, { storylets: storylets.filter(s => s.min <= b && s.max >= a).length, moments: moments.filter(m => m.min <= b && m.max >= a).length }]))
  }
}

function flagReport() {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? (d.name === '__tests__' ? [] : walk(join(dir, d.name))) : [join(dir, d.name)])
  const src = walk(join(root, 'src/domain')).filter(f => f.endsWith('.ts')).map(f => readFileSync(f, 'utf8')).join('\n')
  const bundle = JSON.parse(readFileSync(join(root, 'src/content/bundle.json'), 'utf8')) as { storylets: any[]; moments: any[] }
  const written = new Set<string>()
  for (const m of src.matchAll(/flags: \{([^}]*)\}/g)) for (const k of m[1]!.matchAll(/(\w+):/g)) written.add(k[1]!)
  const readSet = new Set<string>()
  for (const s of [...bundle.storylets, ...bundle.moments]) {
    const effects = s.choices ? s.choices.flatMap((c: any) => [c.effects, c.check?.success, c.check?.failure]) : [s.accept?.effects, s.skip?.effects]
    for (const e of effects) for (const k of Object.keys(e?.flags ?? {})) written.add(k)
    const r = s.requires
    if (!r) continue
    for (const k of [...(r.flag ?? []), ...(r.flagNot ?? []), ...Object.keys(r.flagIs ?? {}), ...Object.keys(r.since ?? {}), ...Object.keys(r.until ?? {})]) readSet.add(k)
  }
  for (const m of src.matchAll(/(?:flags\.|flags\['|is\(g, '|since\(g, '|has\(g, '|flag\(g, ')(\w+)/g)) readSet.add(m[1]!)
  const names = [...written].filter(k => !/Age$/.test(k))
  const unread = names.filter(k => !readSet.has(k))
  return { writtenWithoutAgeFlags: names.length, unreadCount: unread.length, unread }
}

function strategyReport(label: string, runs: Life[]) {
  const arcLives: Record<string, number> = {}
  const arcWithOutcome: Record<string, number> = {}
  for (const l of runs) for (const [arc, hit] of Object.entries(l.arcs)) { arcLives[arc] = (arcLives[arc] ?? 0) + 1; if (hit) arcWithOutcome[arc] = (arcWithOutcome[arc] ?? 0) + 1 }
  const at40 = runs.map(l => l.stats40).filter((s): s is GameState['stats'] => !!s)
  const stat = (k: keyof GameState['stats']) => round(mean(at40.map(s => s[k])), 1)
  return {
    label, lives: runs.length,
    meanAge: round(mean(runs.map(l => l.age)), 1),
    decisionsPerLife: round(mean(runs.map(l => l.decisions.length)), 1),
    memoriesPerLife: round(mean(runs.map(l => l.memories)), 1),
    delayedPerLife: round(mean(runs.map(l => l.delayed)), 2),
    momentsOpenedPerLife: round(mean(runs.map(l => l.momentIds.length)), 1),
    statsAt40: { health: stat('health'), morale: stat('morale'), stress: stat('stress'), knowledge: stat('knowledge'), bonds: stat('bonds'), reputation: stat('reputation') },
    arcShare: Object.fromEntries(Object.keys(arcLives).sort().map(a => [a, { lives: pct(arcLives[a]!, runs.length), withFollowup: pct(arcWithOutcome[a] ?? 0, runs.length) }]))
  }
}

function rhythmReport(runs: Life[]) {
  const decade = (a: number) => Math.min(8, Math.floor(a / 10))
  const dec = new Array(9).fill(0), mom = new Array(9).fill(0), years = new Array(9).fill(0)
  const gaps: number[] = []
  const silence: number[] = []
  for (const l of runs) {
    l.decisions.forEach(d => { dec[decade(d.age)]++ })
    l.momentsByAge.forEach((n, a) => { mom[decade(a)] += n })
    for (let a = 0; a < l.age; a++) years[decade(a)]++
    const ages = [0, ...l.decisions.map(d => d.age)]
    for (let i = 1; i < ages.length; i++) gaps.push(ages[i]! - ages[i - 1]!)
    silence.push(Math.max(l.age - (ages[ages.length - 1] ?? 0), 0))
  }
  const momentCounts: Record<string, number> = {}
  runs.forEach(l => l.momentIds.forEach(id => { momentCounts[id] = (momentCounts[id] ?? 0) + 1 }))
  const totalYears = runs.reduce((s, l) => s + l.age, 0)
  const totalMoments = runs.reduce((s, l) => s + l.momentIds.length, 0)
  return {
    lives: runs.length,
    decisionsPer10Years: Object.fromEntries(dec.map((n, d) => [`${d * 10}-${d * 10 + 9}`, round(n / Math.max(1, years[d]) * 10, 2)])),
    momentsPerYearByDecade: Object.fromEntries(mom.map((n, d) => [`${d * 10}-${d * 10 + 9}`, round(n / Math.max(1, years[d]), 2)])),
    momentsPerYear: round(totalMoments / totalYears, 3),
    momentsPerLife: round(totalMoments / runs.length, 1),
    gapBetweenDecisions: { mean: round(mean(gaps), 2), max: Math.max(...gaps), over5: pct(gaps.filter(g => g > 5).length, gaps.length) },
    yearsAfterLastDecision: { mean: round(mean(silence), 1), max: Math.max(...silence) },
    topMomentsPerLife: Object.fromEntries(Object.entries(momentCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => [id, round(n / runs.length, 2)])),
    momentsNeverOpened: moments.filter(m => !momentCounts[m.id]).map(m => m.id)
  }
}

/**
 * Поздняя жизнь. Окна считаются только по годам, которые герои действительно прожили:
 * в знаменатель идут прожитые годы внутри окна, в «дожили» — те, кто вошёл в окно.
 */
function lateLifeReport(runs: Life[], pooled: Life[]) {
  const windows = [[65, 74], [75, 84], [80, 95], [85, 95]] as const
  const win = Object.fromEntries(windows.map(([a, b]) => {
    const reached = runs.filter(l => l.age >= a)
    const years = reached.reduce((n, l) => n + Math.min(l.age, b + 1) - a, 0)
    const decisions = reached.reduce((n, l) => n + l.decisions.filter(d => d.age >= a && d.age <= b).length, 0)
    const withAny = reached.filter(l => l.decisions.some(d => d.age >= a && d.age <= b)).length
    return [`${a}-${b}`, { livesReached: reached.length, sharePct: pct(reached.length, runs.length), yearsLived: years, decisionsPer10Years: round(decisions / Math.max(1, years) * 10, 3), livesWithDecisionPct: pct(withAny, reached.length) }]
  }))
  const r65 = runs.filter(l => l.age >= 65)
  const late = r65.map(l => l.decisions.filter(d => d.age >= 65))
  const gaps: number[] = []
  const streaks: number[] = []
  late.forEach(ds => {
    ds.slice(1).forEach((d, i) => gaps.push(d.age - ds[i]!.age))
    let run = 1
    ds.slice(1).forEach((d, i) => { if (d.age - ds[i]!.age <= 2) run++; else { streaks.push(run); run = 1 } })
    if (ds.length) streaks.push(run)
  })
  const lastGap = r65.map(l => l.age - Math.max(0, ...l.decisions.map(d => d.age)))
  const lateIds = new Set(storylets.filter(s => s.id.startsWith('late-')).map(s => s.id))
  const lateMoments = new Set(moments.filter(m => m.id.startsWith('m-late-')).map(m => m.id))
  const share = (ids: Set<string>, get: (l: Life) => string[]) => Object.fromEntries([...ids].map(id => [id, pct(r65.filter(l => get(l).includes(id)).length, r65.length)]))
  const p65 = pooled.filter(l => l.age >= 65)
  const rate = (id: string) => round(p65.filter(l => l.seen.includes(id)).length / Math.max(1, p65.length), 3)
  return {
    windows: win,
    livesReaching65: r65.length,
    lateDecisionsPerLife65: round(mean(late.map(d => d.length)), 2),
    livesWithRetrospectivePct: pct(late.filter(ds => ds.some(d => d.old)).length, r65.length),
    retrospectiveShareOfLateDecisionsPct: pct(late.flat().filter(d => d.old).length, late.flat().length),
    gapBetweenLateDecisions: { mean: round(mean(gaps), 2), eqMinGapPct: pct(gaps.filter(g => g <= 2).length, gaps.length) },
    longestRunOfMinGapDecisions: { mean: round(mean(streaks), 2), max: Math.max(0, ...streaks) },
    yearsAfterLastDecision65: { mean: round(mean(lastGap), 2), over10Pct: pct(lastGap.filter(g => g > 10).length, lastGap.length), over5Pct: pct(lastGap.filter(g => g > 5).length, lastGap.length) },
    meanAge: round(mean(runs.map(l => l.age)), 2),
    lateStoryletsSeenPct: share(lateIds, l => l.seen),
    lateStoryletsAnyPct: pct(r65.filter(l => l.seen.some(id => lateIds.has(id))).length, r65.length),
    lateMomentsSeenPct: share(lateMoments, l => l.momentIds),
    momentsPerYear65: round(r65.reduce((n, l) => n + l.momentIds.length, 0) / Math.max(1, r65.reduce((n, l) => n + l.age, 0)), 3),
    lateMomentsPerLife: round(mean(r65.map(l => l.momentIds.filter(id => lateMoments.has(id)).length)), 2),
    rates: Object.fromEntries(storylets.filter(s => s.max >= 65).map(s => [s.id, rate(s.id)]))
  }
}

function encounterReport(pooled: Life[]) {
  const counts: Record<string, number> = {}
  pooled.forEach(l => new Set(l.seen).forEach(id => { counts[id] = (counts[id] ?? 0) + 1 }))
  const rates = Object.fromEntries(storylets.map(s => [s.id, round((counts[s.id] ?? 0) / pooled.length, 3)]))
  const values = Object.values(rates)
  const arcRates: Record<string, { stories: number; meanRate: number; neverSeen: number }> = {}
  for (const s of storylets) {
    const a = s.arc ?? '—'
    const entry = (arcRates[a] ??= { stories: 0, meanRate: 0, neverSeen: 0 })
    entry.stories++
    entry.meanRate += rates[s.id]!
    if (!rates[s.id]) entry.neverSeen++
  }
  for (const e of Object.values(arcRates)) e.meanRate = round(e.meanRate / e.stories, 3)
  return {
    pooledLives: pooled.length,
    seenInOver50Percent: values.filter(v => v > .5).length,
    seenIn10To50Percent: values.filter(v => v >= .1 && v <= .5).length,
    seenInUnder10Percent: values.filter(v => v > 0 && v < .1).length,
    neverSeen: storylets.filter(s => !rates[s.id]).map(s => s.id),
    byArc: arcRates,
    mostFrequent: Object.fromEntries(Object.entries(rates).sort((a, b) => b[1] - a[1]).slice(0, 10)),
    rates
  }
}

/** Среднее абсолютное различие частот встречи сюжетов между двумя группами жизней. */
function rateDistance(a: Life[], b: Life[]) {
  const rate = (g: Life[], id: string) => g.filter(l => l.seen.includes(id)).length / Math.max(1, g.length)
  return round(mean(storylets.map(s => Math.abs(rate(a, s.id) - rate(b, s.id)))), 4)
}

function professionReport(runs: Life[]) {
  const byJob: Record<string, Life[]> = {}
  runs.forEach(l => (byJob[l.job] ??= []).push(l))
  const jobs = Object.keys(byJob).filter(j => byJob[j]!.length >= 10)
  const pairs: number[] = []
  for (let i = 0; i < jobs.length; i++) for (let j = i + 1; j < jobs.length; j++) pairs.push(rateDistance(byJob[jobs[i]!]!, byJob[jobs[j]!]!))
  const bundle = JSON.parse(readFileSync(join(root, 'src/content/bundle.json'), 'utf8')) as { storylets: any[]; moments: any[] }
  const gatedJson = new Set(bundle.storylets.filter(s => s.requires?.job).map(s => s.id))
  const jsonIds = new Set([...bundle.storylets, ...bundle.moments].map(s => s.id))
  const gatedStorylets = storylets.filter(s => gatedJson.has(s.id) || (!jsonIds.has(s.id) && /protagonist\.job/.test(s.available.toString()))).length
  const gatedMoments = moments.filter(m => bundle.moments.some(j => j.id === m.id && j.requires?.job) || (!jsonIds.has(m.id) && m.available && /protagonist\.job/.test(m.available.toString()))).length
  return {
    lives: Object.fromEntries(jobs.map(j => [j, byJob[j]!.length])),
    decisionsPerLife: Object.fromEntries(jobs.map(j => [j, round(mean(byJob[j]!.map(l => l.decisions.length)), 1)])),
    storyletsGatedByJob: gatedStorylets, momentsGatedByJob: gatedMoments,
    meanRateDistanceBetweenJobs: round(mean(pairs), 4)
  }
}

function focusReport(base: Life[], byFocus: Record<string, Life[]>) {
  const sameSequence = (a: Life, b: Life) => a.decisions.length === b.decisions.length && a.decisions.every((d, i) => d.id === b.decisions[i]!.id)
  const result: Record<string, unknown> = {}
  for (const [focus, runs] of Object.entries(byFocus)) {
    const identical = runs.filter((l, i) => sameSequence(l, base[i]!)).length
    result[focus] = {
      decisionsPerLife: round(mean(runs.map(l => l.decisions.length)), 1),
      memoriesPerLife: round(mean(runs.map(l => l.memories)), 1),
      meanAge: round(mean(runs.map(l => l.age)), 1),
      knowledgeAt40: round(mean(runs.map(l => l.stats40?.knowledge ?? 0)), 1),
      stressAt40: round(mean(runs.map(l => l.stats40?.stress ?? 0)), 1),
      bondsAt40: round(mean(runs.map(l => l.stats40?.bonds ?? 0)), 1),
      sameDecisionSequenceAsStudy: pct(identical, runs.length),
      rateDistanceFromStudy: rateDistance(base, runs)
    }
  }
  return result
}

/** Реальные секунды на жизнь при заданной скорости: моменты не трогаем, решения принимаем мгновенно. */
function paceReport(sample = 4) {
  const DT = .1
  const out: Record<string, unknown> = {}
  for (const preset of LIFE_PRESETS) {
    const row: Record<string, unknown> = {}
    for (const speed of SPEEDS) {
      let seconds = 0, years = 0, withMoment = 0, moments = 0, decisions = 0
      for (let seed = 1; seed <= sample; seed++) {
        let g = createGame(seed + 900)
        let p = 0
        for (let guard = 0; guard < 4_000_000 && !g.stopped; guard++) {
          if (g.pending) { g = decide(g, 0); decisions++; continue }
          const before = g.moment
          const r = runClock(g, p, DT, speed, preset.secondsPerYear)
          if (r.game.moment && r.game.moment !== before) moments++
          g = r.game
          p = r.progress
          seconds += DT
          if (g.moment) withMoment += DT
        }
        years += g.age
      }
      const secPerYear = seconds / years
      row[`${speed}x`] = {
        secondsPerYear: round(secPerYear, 2),
        minutesPerLife: round(secPerYear * years / sample / 60, 1),
        nominalSecondsPerYear: round(preset.secondsPerYear / speed, 2),
        effectiveSpeedup: round(preset.secondsPerYear / secPerYear, 2),
        shareOfTimeWithMomentOpen: round(withMoment / seconds, 3),
        momentsOpenedPerYear: round(moments / years, 3)
      }
    }
    out[`${preset.secondsPerYear}s`] = row
  }
  return out
}

function economySummary(values: readonly (number | null | undefined)[]) {
  const s = summarize(values)
  const value = (n: number | null) => n === null ? null : round(n)
  return { observations: s.observations, p10: value(s.p10), p50: value(s.p50), p90: value(s.p90), mean: value(s.mean) }
}

function economyStrategyReport(runs: Life[]) {
  const years = runs.flatMap(l => l.economy.years)
  const adults = runs.filter(l => l.economy.years.some(y => y.age >= 16))
  const checkpointByAge = Object.fromEntries(economyAges.map(age => {
    const observations = runs.flatMap(l => l.economy.checkpoints[age] ? [l.economy.checkpoints[age]!] : [])
    return [age, {
      livesObserved: observations.length,
      balanceKr: economySummary(observations.map(o => o.balance)),
      balanceInAnnualTariffs: economySummary(observations.map(o => o.tariffYears)),
      reserveYears: economySummary(observations.map(o => o.reserveYears)),
      tariffIncomeKr: economySummary(observations.map(o => o.tariffIncome)),
    }]
  }))

  const gradeDistribution = Object.fromEntries(([40, 60] as const).map(age => {
    const observations = runs.flatMap(l => l.economy.checkpoints[age] ? [l.economy.checkpoints[age]!] : [])
    const byProfession = Object.fromEntries(professions.map(job => {
      const professionRows = observations.filter(o => o.job === job)
      const grades = Object.fromEntries(([1, 2, 3, 4] as const).map(grade => {
        const count = professionRows.filter(o => o.grade === grade).length
        return [grade, { count, pct: pct(count, professionRows.length) }]
      }))
      return [job, {
        observations: professionRows.length,
        grades,
        tariffIncomeKr: economySummary(professionRows.map(o => o.tariffIncome)),
      }]
    }))
    return [age, { livesObserved: observations.length, byProfession }]
  }))

  const annualIncomeByProfession = Object.fromEntries(professions.map(job => {
    const rows = years.filter(y => y.job === job && y.age >= 18 && y.kind !== 'retired')
    const byWorkState = Object.fromEntries(['working', 'trainee', 'between', 'sick'].map(kind => {
      const stateRows = rows.filter(y => y.kind === kind)
      return [kind, { observations: stateRows.length, wageKr: economySummary(stateRows.map(y => y.wage)) }]
    }))
    return [job, {
      observations: rows.length,
      wageKr: economySummary(rows.map(y => y.wage)),
      tariffIncomeKr: economySummary(rows.map(y => y.tariffIncome)),
      byWorkState,
    }]
  }))

  const retiredRows = years.filter(y => y.kind === 'retired')
  const retiredLives = runs.filter(l => l.economy.years.some(y => y.kind === 'retired'))
  const firstPensionByLife = retiredLives.flatMap(l => {
    const row = l.economy.years.find(y => y.kind === 'retired')
    return row ? [row] : []
  })
  const retireesWithDecliningSavings = retiredLives.filter(l => l.economy.years.some(y => y.kind === 'retired' && y.balance < y.openingBalance))
  const retireesWithExhaustedReserve = retiredLives.filter(l => l.economy.years.some(y => y.kind === 'retired' && y.balance === 0))
  const coverageRatios = retiredRows.map(y => y.bills > 0 ? y.pension / y.bills : null)
  const aidYears = years.filter(y => y.aid > 0)
  const tightYears = years.filter(y => y.tight)
  const voluntaryShortfallYears = years.filter(y => y.housingDowngrade || y.cancelledServices > 0)
  const closedServiceYears = years.filter(y => y.age >= 16 && y.servicesClosed)
  const sum = (rows: EconomyYear[], select: (row: EconomyYear) => number) => rows.reduce((total, row) => total + select(row), 0)
  const aidPerLife = runs.map(l => sum(l.economy.years, y => y.aid))
  const aidYearsPerAdultLife = adults.map(l => l.economy.years.filter(y => y.aid > 0).length)
  const tightYearsPerAdultLife = adults.map(l => l.economy.years.filter(y => y.tight).length)
  const voluntaryYearsPerAdultLife = adults.map(l => l.economy.years.filter(y => y.housingDowngrade || y.cancelledServices > 0).length)
  const invariantMessages: Record<string, number> = {}
  let invariantChecks = 0
  let invariantViolations = 0
  for (const life of runs) {
    invariantChecks += life.economy.invariantChecks
    invariantViolations += life.economy.invariantViolations
    for (const [message, count] of Object.entries(life.economy.invariantMessages)) {
      const normalized = message.replace(/^возраст \d+: /, '')
      invariantMessages[normalized] = (invariantMessages[normalized] ?? 0) + count
    }
  }

  return {
    lives: runs.length,
    adultsObserved: adults.length,
    checkpointByAge,
    gradeDistributionAtAgeByProfession: gradeDistribution,
    annualIncomeByProfession,
    pension: {
      retireesObserved: retiredLives.length,
      retiredYearsObserved: retiredRows.length,
      firstAnnualPensionPerRetireeKr: economySummary(firstPensionByLife.map(y => y.pension)),
      annualPensionPerRetiredYearKr: economySummary(retiredRows.map(y => y.pension)),
      pensionToObligationsRatio: economySummary(coverageRatios),
      retiredYearsWithPensionCoveringBillsPct: pct(retiredRows.filter(y => y.pension >= y.bills).length, retiredRows.length),
      retireesWithDecliningSavings: { count: retireesWithDecliningSavings.length, pct: pct(retireesWithDecliningSavings.length, retiredLives.length) },
      retireesWithExhaustedReserve: { count: retireesWithExhaustedReserve.length, pct: pct(retireesWithExhaustedReserve.length, retiredLives.length) },
    },
    scarcity: {
      economicYearsObserved: years.length,
      tightYears: tightYears.length,
      tightYearsPctOfEconomicYears: pct(tightYears.length, years.length),
      livesWithAnyTightYear: { count: runs.filter(l => l.economy.years.some(y => y.tight)).length, pct: pct(runs.filter(l => l.economy.years.some(y => y.tight)).length, runs.length) },
      tightYearsPerAdultLife: economySummary(tightYearsPerAdultLife),
      protectedNeedsDeficit: {
        livesWithAid: { count: runs.filter(l => l.economy.years.some(y => y.aid > 0)).length, pct: pct(runs.filter(l => l.economy.years.some(y => y.aid > 0)).length, runs.length) },
        yearsWithAid: aidYears.length,
        aidPerLifeKr: economySummary(aidPerLife),
        aidYearsPerAdultLife: economySummary(aidYearsPerAdultLife),
        totalAidKr: sum(years, y => y.aid),
        meanAidPerUseYearKr: economySummary(aidYears.map(y => y.aid)).mean,
      },
      voluntaryObligationShortfall: {
        years: voluntaryShortfallYears.length,
        yearsPerAdultLife: economySummary(voluntaryYearsPerAdultLife),
        housingDowngradeYears: years.filter(y => y.housingDowngrade).length,
        serviceCancellationYears: years.filter(y => y.cancelledServices > 0).length,
        cancelledServices: sum(years, y => y.cancelledServices),
      },
      serviceClosure: {
        adultYearsObserved: years.filter(y => y.age >= 16).length,
        closedYears: closedServiceYears.length,
        pctOfAdultYears: pct(closedServiceYears.length, years.filter(y => y.age >= 16).length),
      },
    },
    invariants: {
      checks: invariantChecks,
      violations: invariantViolations,
      livesWithViolations: runs.filter(l => l.economy.invariantViolations > 0).length,
      byMessage: invariantMessages,
    },
  }
}

// ───────────────────────── сбор ─────────────────────────

const started = Date.now()
console.error(`Аудит: ${lives} жизней на стратегию…`)
const byStrategy: Record<string, Life[]> = {}
for (const [name, policy] of Object.entries(policies)) byStrategy[name] = batch(policy)
byStrategy['mixed+acceptMoments'] = batch(policies.mixed!, { acceptMoments: true })
const focuses: Record<string, Life[]> = { study: byStrategy.mixed! }
for (const f of ['relationships', 'rest', 'work', 'civic'] as Focus[]) focuses[f] = batch(policies.mixed!, { focus: f })
const pooled = ['first', 'last', 'cycling', 'mixed'].flatMap(k => byStrategy[k]!)

const report = {
  generatedAt: new Date().toISOString(),
  lives,
  catalog: catalogReport(),
  flags: flagReport(),
  strategies: Object.fromEntries(Object.entries(byStrategy).map(([k, v]) => [k, strategyReport(k, v)])),
  rhythm: rhythmReport(byStrategy.mixed!),
  encounter: encounterReport(pooled),
  lateLife: lateLifeReport(byStrategy.mixed!, pooled),
  lateLifeByStrategy: Object.fromEntries(['first', 'last', 'cycling', 'mixed'].map(k => [k, (({ rates: _r, ...rest }) => rest)(lateLifeReport(byStrategy[k]!, byStrategy[k]!))])),
  professions: professionReport(byStrategy.mixed!),
  economy: {
    methodology: {
      ageCheckpoints: 'Только наблюдавшиеся живыми в указанном возрасте; отсутствующие наблюдения не заменяются нулём.',
      tariffEquivalent: 'Баланс делится на базовый годовой тариф текущей профессии и разряда без надбавок и нагрузки.',
      protectedNeedsDeficit: 'Год с aid > 0 означает, что баланс и доход не покрыли защищённый минимум.',
      voluntaryObligationShortfall: 'Год с понижением жилья или отменой услуги из-за нехватки остатка после минимума.',
      pensionCoverage: 'Пенсия сравнивается с фактическими записанными обязательствами данного пенсионного года.',
      mechanicalStrategies: 'Стратегии выбора механические и не являются моделью поведения людей.',
      purchases: 'Покупки не реализованы и не симулируются; частота покупок и их доступность не оцениваются.',
      observation: 'Экономика только считывается после штатного tick(); дополнительный RNG не расходуется.'
    },
    byStrategy: Object.fromEntries(Object.entries(byStrategy).map(([name, runs]) => [name, economyStrategyReport(runs)])),
    pooledChoiceStrategies: economyStrategyReport(pooled),
  },
  focus: focusReport(byStrategy.mixed!, Object.fromEntries(Object.entries(focuses).filter(([k]) => k !== 'study'))),
  pace: paceReport()
}
console.error(`Готово за ${round((Date.now() - started) / 1000, 0)} с`)

// ───────────────────────── вывод ─────────────────────────

if (jsonPath) writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')

if (comparePath) {
  printDiff(JSON.parse(readFileSync(comparePath, 'utf8')), report)
} else {
  const { encounter, lateLife, ...rest } = report
  const { rates: _rates, ...encounterBrief } = encounter
  const { rates: _lateRates, ...lateBrief } = lateLife
  console.log(JSON.stringify({ ...rest, encounter: encounterBrief, lateLife: lateBrief }, null, 2))
}
