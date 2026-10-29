/**
 * T9 comparative audit of personal time. Usage:
 *   npx tsx scripts/personal-time-t9.ts -- 100 --json docs/audit/personal-time-t9.json --md docs/audit/personal-time-t9-tables.md
 * Never rewrites the historical T8 JSON files.
 */
import { writeFileSync } from 'node:fs'
import { MODES, T9_POLICIES, policyFor, runBatch } from './personal-time-t9-core'
import type { Mode, T9Life } from './personal-time-t9-core'
import type { Policy } from './economy-t8-core'
import type { OfferId } from '../src/domain/offers'
import { TIME_RULESETS } from './personal-time-rules'

const args = process.argv.slice(2).filter(a => a !== '--')
const value = (key: string, fallback?: string) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1] }
const count = Number(args[0] && /^\d+$/.test(args[0]) ? args[0] : 100), start = Number(value('--start', '102'))
const jsonPath = value('--json'), mdPath = value('--md'), mainOnly = args.includes('--main-only')
/** Independent check: T8, T9 without the free evening, full T9; plus reduced-vs-full and retirement paths. */
const holdout = args.includes('--holdout')
if (!Number.isInteger(count) || count < 1 || count > 2000) throw Error('Usage: [1..2000] --start seed --json file --md file --main-only')
const seeds = Array.from({ length: count }, (_, i) => start + i)

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const mean = (xs: number[]) => xs.length ? sum(xs) / xs.length : null
const r2 = (n: number | null) => n === null ? null : Math.round(n * 100) / 100
const pct = (n: number, d: number) => d ? Math.round(1000 * n / d) / 10 : null
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]! }

function perBasis(lives: T9Life[]) {
  const out: Record<string, unknown> = {}
  for (const basis of ['full', 'reduced', 'trainee', 'retired', 'mentor']) {
    const ys = lives.flatMap(l => l.years.filter(y => y.basis === basis && y.age >= 18))
    if (!ys.length) continue
    const granted = sum(ys.map(y => y.limit)), spent = sum(ys.map(y => y.limit - y.left))
    out[basis] = { years: ys.length, limit: r2(mean(ys.map(y => y.limit))), spentPerYear: r2(spent / ys.length), unusedPct: pct(granted - spent, granted),
      momentsPerYear: r2(sum(ys.map(y => y.accepted)) / ys.length), offeredPerYear: r2(sum(ys.map(y => y.offered)) / ys.length),
      purchaseTimePerYear: r2(sum(ys.map(y => y.purchaseSpend + y.storySpend)) / ys.length),
      fullyUsedYearsPct: pct(ys.filter(y => y.left === 0).length, ys.length), declinedForPlanPerYear: r2(sum(ys.map(y => y.declinedForPlan)) / ys.length) }
  }
  return out
}

function windows(lives: T9Life[], id: OfferId) {
  const ws = lives.flatMap(l => l.windows.map(w => w.offers[id])).filter(s => s && s !== 'other')
  return { eligibleWindows: ws.length, availablePct: pct(ws.filter(s => s === 'available').length, ws.length),
    timeBlockedPct: pct(ws.filter(s => s === 'time').length, ws.length), moneyBlockedPct: pct(ws.filter(s => s === 'money').length, ws.length) }
}

function at(lives: T9Life[], age: number) {
  const cs = lives.flatMap(l => l.checkpoints.filter(c => c.age === age))
  const stat = (k: keyof T9Life['checkpoints'][number]['stats']) => r2(mean(cs.map(c => c.stats[k])))
  return { alive: cs.length, health: stat('health'), stress: stat('stress'), morale: stat('morale'), bonds: stat('bonds'),
    meanBond: r2(mean(cs.flatMap(c => c.meanBond === null ? [] : [c.meanBond]))), closePeople: r2(mean(cs.map(c => c.closePeople))), balance: r2(mean(cs.map(c => c.balance))) }
}

export function summarize(lives: T9Life[]) {
  const n = lives.length
  const adult = lives.flatMap(l => l.years.filter(y => y.age >= 18))
  const granted = sum(adult.map(y => y.limit)), spent = sum(adult.map(y => y.limit - y.left))
  const bought = (id: OfferId) => lives.map(l => l.purchases.filter(p => p.id === id).length)
  const courses = bought('course-pro')
  const unique = lives.map(l => new Set(l.acceptedMoments.map(m => m.id)).size)
  const blocked = (id?: string) => r2(sum(lives.map(l => l.timeBlockedAttempts.filter(a => !id || a.id === id).length)) / n)
  return {
    lives: n, deathAge: r2(mean(lives.map(l => l.deathAge))),
    time: {
      grantedPerLife: r2(granted / n), spentPerLife: r2(spent / n), unusedPct: pct(granted - spent, granted),
      grantedPerAdultYear: r2(granted / adult.length), spentPerAdultYear: r2(spent / adult.length),
      fullyUsedAdultYearsPct: pct(adult.filter(y => y.left === 0).length, adult.length),
      onMomentsPerLife: r2(sum(adult.map(y => y.momentSpend)) / n), onPurchasesPerLife: r2(sum(adult.map(y => y.purchaseSpend + y.storySpend)) / n)
    },
    moments: {
      offeredPerLife: r2(sum(lives.map(l => sum(l.years.map(y => y.offered)))) / n), acceptedPerLife: r2(mean(lives.map(l => l.acceptedMoments.length))),
      adultAcceptedPerLife: r2(mean(lives.map(l => l.acceptedMoments.filter(m => m.age >= 18).length))),
      uniqueAcceptedPerLife: r2(mean(unique)), declinedForPlanPerLife: r2(sum(adult.map(y => y.declinedForPlan)) / n),
      emptyBeatsPerLife: r2(sum(lives.map(l => sum(l.years.map(y => y.emptyBeats)))) / n),
      t9OfferedPerLife: r2(mean(lives.map(l => l.offeredT9.length))), t9AcceptedPerLife: r2(mean(lives.map(l => l.acceptedMoments.filter(m => m.id.startsWith('m-free') || m.id.startsWith('m-retired') || m.id === 'm-mentor-question').length))),
      t9LivesWithAny: lives.filter(l => l.offeredT9.length).length
    },
    refusals: { timeBlockedPurchasesPerLife: blocked(), course: blocked('course-pro'), familyTrip: blocked('family-trip'), sectorTrip: blocked('sector-trip'),
      livesWithTimeBlockedPurchase: lives.filter(l => l.timeBlockedAttempts.length).length },
    purchases: { coursesPerLife: r2(mean(courses)), livesWithCourse: courses.filter(c => c >= 1).length, livesWith2Courses: courses.filter(c => c >= 2).length,
      storyCourses: sum(lives.map(l => l.purchases.filter(p => p.id === 'course-pro' && p.source === 'story').length)),
      familyTripsPerLife: r2(mean(bought('family-trip'))), sectorTripsPerLife: r2(mean(bought('sector-trip'))), spentCreditsPerLife: r2(mean(lives.map(l => sum(l.purchases.map(p => p.cost))))) },
    availability: { course: windows(lives, 'course-pro'), familyTrip: windows(lives, 'family-trip'), sectorTrip: windows(lives, 'sector-trip'), retrain: windows(lives, 'retrain') },
    career: { grade3Lives: lives.filter(l => l.grade3 !== null).length, grade3MedianAge: median(lives.flatMap(l => l.grade3 === null ? [] : [l.grade3])),
      grade4Lives: lives.filter(l => l.grade4 !== null).length, grade4MedianAge: median(lives.flatMap(l => l.grade4 === null ? [] : [l.grade4])),
      lifetimeIncome: r2(mean(lives.map(l => l.wage + l.pension))), finalBalance: r2(mean(lives.map(l => l.finalBalance))),
      reducedYears: r2(mean(lives.map(l => l.reducedYears))), retiredYears: r2(mean(lives.map(l => l.retiredYears))) },
    narrative: { storyletsPerLife: r2(mean(lives.map(l => l.storylets))), memoriesPerLife: r2(mean(lives.map(l => l.memories))), followupsPerLife: r2(mean(lives.map(l => l.followups))),
      uniqueLivedEventsPerLife: r2(mean(lives.map((l, i) => l.storylets + unique[i]!))) },
    at60: at(lives, 60), at80: at(lives, 80),
    byBasis: perBasis(lives),
    integrity: { checks: sum(lives.map(l => l.invariantChecks)), violations: sum(lives.map(l => l.violations.length)), first: lives.flatMap(l => l.violations)[0] ?? null }
  }
}
type Summary = ReturnType<typeof summarize>

/** Same seeds, two policies or two modes: mean paired deltas (b − a) among lives that both reach the age. */
function paired(a: T9Life[], b: T9Life[]) {
  const pairs = a.map((x, i) => [x, b[i]!] as const)
  const d = (f: (l: T9Life) => number) => r2(mean(pairs.map(([x, y]) => f(y) - f(x))))
  const cp = (age: number, f: (c: T9Life['checkpoints'][number]) => number | null) => {
    const vs = pairs.flatMap(([x, y]) => { const cx = x.checkpoints.find(c => c.age === age), cy = y.checkpoints.find(c => c.age === age); const fx = cx && f(cx), fy = cy && f(cy); return fx != null && fy != null ? [fy - fx] : [] })
    return { n: vs.length, delta: r2(mean(vs)) }
  }
  const after40 = (l: T9Life) => l.acceptedMoments.filter(m => m.age >= 40).length
  return {
    pairs: pairs.length,
    incomeDelta: d(l => l.wage + l.pension), finalBalanceDelta: d(l => l.finalBalance),
    momentsDelta: d(l => l.acceptedMoments.length), momentsAfter40Delta: d(after40), uniqueMomentsDelta: d(l => new Set(l.acceptedMoments.map(m => m.id)).size),
    timeSpentDelta: d(l => sum(l.years.filter(y => y.age >= 18).map(y => y.limit - y.left))),
    coursesDelta: d(l => l.purchases.filter(p => p.id === 'course-pro').length), familyTripsDelta: d(l => l.purchases.filter(p => p.id === 'family-trip').length),
    sectorTripsDelta: d(l => l.purchases.filter(p => p.id === 'sector-trip').length),
    memoriesDelta: d(l => l.memories), storyletsDelta: d(l => l.storylets), followupsDelta: d(l => l.followups),
    grade3Delta: d(l => l.grade3 === null ? 0 : 1), grade4Delta: d(l => l.grade4 === null ? 0 : 1),
    bond60: cp(60, c => c.meanBond), bond80: cp(80, c => c.meanBond), stress60: cp(60, c => c.stats.stress), health80: cp(80, c => c.stats.health),
    morale60: cp(60, c => c.stats.morale), close80: cp(80, c => c.closePeople)
  }
}

/** Pareto check on outcomes a player might value: no single policy should be best at everything. */
function dominance(groups: Record<string, Summary>, prefix: string) {
  const vec = (s: Summary) => [s.moments.acceptedPerLife ?? 0, s.narrative.uniqueLivedEventsPerLife ?? 0, s.narrative.memoriesPerLife ?? 0,
    s.at60.meanBond ?? 0, -(s.at60.stress ?? 0), s.career.lifetimeIncome ?? 0, s.career.grade3Lives]
  const names = T9_POLICIES.filter(p => groups[`${prefix}/${p}`])
  const dominated: string[] = []
  for (const a of names) for (const b of names) {
    if (a === b) continue
    const va = vec(groups[`${prefix}/${a}`]!), vb = vec(groups[`${prefix}/${b}`]!)
    if (va.every((x, i) => x >= vb[i]!) && va.some((x, i) => x > vb[i]!)) dominated.push(`${a} ≻ ${b}`)
  }
  const best = Object.fromEntries(['moments', 'uniqueEvents', 'memories', 'bond60', 'lowStress60', 'income', 'grade3'].map((k, i) => {
    const top = [...names].sort((x, y) => vec(groups[`${prefix}/${y}`]!)[i]! - vec(groups[`${prefix}/${x}`]!)[i]!)[0]
    return [k, top]
  }))
  return { dominatedPairs: dominated, bestBy: best }
}

const groups: Record<string, Summary> = {}, comparisons: Record<string, unknown> = {}
const cache = new Map<string, T9Life[]>()
const t0 = Date.now()
function batch(mode: Mode, policy: Policy, label = policy.name) {
  const lives = runBatch(mode, policy, seeds)
  groups[`${mode.key}/${label}`] = summarize(lives)
  cache.set(`${mode.key}/${label}`, lives)
  console.error(`${mode.key}/${label}: ${lives.length} lives, ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  return lives
}

for (const key of holdout ? ['A', 'N', 'C'] as const : ['A', 'N', 'B', 'C'] as const) for (const name of T9_POLICIES) batch(MODES[key], policyFor(name))
for (const name of T9_POLICIES) {
  comparisons[`N-vs-A/${name}`] = paired(cache.get(`A/${name}`)!, cache.get(`N/${name}`)!)
  if (!holdout) {
    comparisons[`B-vs-N/${name}`] = paired(cache.get(`N/${name}`)!, cache.get(`B/${name}`)!)
    comparisons[`C-vs-B/${name}`] = paired(cache.get(`B/${name}`)!, cache.get(`C/${name}`)!)
  } else comparisons[`C-vs-N/${name}`] = paired(cache.get(`N/${name}`)!, cache.get(`C/${name}`)!)
  comparisons[`C-vs-A/${name}`] = paired(cache.get(`A/${name}`)!, cache.get(`C/${name}`)!)
}
comparisons['C/Family-vs-Careerist'] = paired(cache.get('C/Careerist')!, cache.get('C/Family')!)
comparisons['A/Family-vs-Careerist'] = paired(cache.get('A/Careerist')!, cache.get('A/Family')!)
comparisons['C/TimeBuyer-vs-Moderate'] = paired(cache.get('C/Moderate')!, cache.get('C/TimeBuyer')!)
comparisons['A/TimeBuyer-vs-Moderate'] = paired(cache.get('A/Moderate')!, cache.get('A/TimeBuyer')!)

if (holdout) {
  const full = { ...policyFor('TimeBuyer'), name: 'TimeBuyerFull', fullLoad: true }
  for (const key of ['A', 'N', 'C'] as const) {
    batch(MODES[key], full)
    comparisons[`${key}/TimeBuyer-vs-TimeBuyerFull`] = paired(cache.get(`${key}/TimeBuyerFull`)!, cache.get(`${key}/TimeBuyer`)!)
  }
  for (const key of ['A', 'C'] as const) {
    for (const path of ['left', 'mentor', 'continue'] as const) batch(MODES[key], { ...policyFor('Moderate'), name: `Retire-${path}`, retirement: path })
    comparisons[`${key}/Retire-left-vs-continue`] = paired(cache.get(`${key}/Retire-continue`)!, cache.get(`${key}/Retire-left`)!)
    comparisons[`${key}/Retire-mentor-vs-continue`] = paired(cache.get(`${key}/Retire-continue`)!, cache.get(`${key}/Retire-mentor`)!)
  }
} else if (!mainOnly) {
  for (const key of ['AG', 'CG'] as const) for (const name of T9_POLICIES) batch(MODES[key], policyFor(name))
  for (const name of T9_POLICIES) comparisons[`CG-vs-AG/${name}`] = paired(cache.get(`AG/${name}`)!, cache.get(`CG/${name}`)!)
  // Reduced vs full load with an identical TimeBuyer focus: the clean price and value of 0.6.
  const full = { ...policyFor('TimeBuyer'), name: 'TimeBuyerFull', fullLoad: true }
  for (const key of ['A', 'N', 'C', 'CG'] as const) {
    batch(MODES[key], full)
    comparisons[`${key}/TimeBuyer-vs-TimeBuyerFull`] = paired(cache.get(`${key}/TimeBuyerFull`)!, cache.get(`${key}/TimeBuyer`)!)
  }
  // Retirement paths with the same Moderate prehistory.
  for (const key of ['A', 'C'] as const) {
    for (const path of ['left', 'mentor', 'continue'] as const) batch(MODES[key], { ...policyFor('Moderate'), name: `Retire-${path}`, retirement: path })
    comparisons[`${key}/Retire-left-vs-continue`] = paired(cache.get(`${key}/Retire-continue`)!, cache.get(`${key}/Retire-left`)!)
    comparisons[`${key}/Retire-mentor-vs-continue`] = paired(cache.get(`${key}/Retire-continue`)!, cache.get(`${key}/Retire-mentor`)!)
  }
  // Cost-model experiments on the same seeds.
  const course1 = { key: 'C-course1', rules: 'T9-course1', content: 'T9', moments: 'planned' } as const
  const course2old = { key: 'A-course2', rules: 'T8-course2', content: 'T8', moments: 'planned' } as const
  const retired3 = { key: 'C-retired3', rules: 'T9-retired3', content: 'T9', moments: 'planned' } as const
  for (const name of ['Careerist', 'Moderate', 'Spender', 'Family'] as const) {
    batch(course1, policyFor(name)); batch(course2old, policyFor(name))
    comparisons[`C-vs-C-course1/${name}`] = paired(cache.get(`C-course1/${name}`)!, cache.get(`C/${name}`)!)
    comparisons[`A-course2-vs-A/${name}`] = paired(cache.get(`A/${name}`)!, cache.get(`A-course2/${name}`)!)
  }
  for (const name of ['Moderate', 'Family', 'Saver'] as const) {
    batch(retired3, policyFor(name))
    comparisons[`C-vs-C-retired3/${name}`] = paired(cache.get(`C-retired3/${name}`)!, cache.get(`C/${name}`)!)
  }
}

const report = {
  schemaVersion: 1, task: 'T9 personal time', seeds: { first: start, last: start + count - 1, count, cohort: start === 102 ? 'development' : start === 1002 ? 'holdout' : 'custom' }, holdout,
  rules: TIME_RULESETS,
  modes: { A: 'T8 rules (3 every year, course 1), T8 catalogue', N: 'T9 allowances and costs without the free-evening roll, T8 catalogue (resource only)',
    B: 'Full T9 rules incl. free-evening roll, T8 catalogue', C: 'T9 rules and T9 free-time moments (shipped)',
    AG: 'A with greedy moments', CG: 'C with greedy moments' },
  methodology: {
    loop: 'Resolve stories with the T8 policy choice (economy-t8a hash, first available fallback); focus by policy; three real beats; then one shop window (financialDecisions) before tick. Same as the T8 audit.',
    moments: 'planned: accept a moment only if it does not change the purchases the policy would make this year (financialDecisions before/after the real takeMoment on a copy); greedy: accept every affordable moment before the shop.',
    accounting: 'Personal time spent per year = year limit − remainder before tick (moments, catalogue purchases and story purchases). Adult years are 18+.',
    windows: 'At the shop window each eligible offer is classified by canBuy: available, blocked only by personal time, blocked by money; other refusals (age, cooldown, conditions, targets) are excluded.',
    limits: ['Bots accept every affordable moment their plan allows; humans are pickier.', 'Moment offers are rolled by the engine (≤ 1 per beat, 3 beats a year); the audit never forces offers.', 'Mean lifetime values include infant deaths; checkpoint rows report survivors.']
  },
  groups, comparisons,
  dominance: { A: dominance(groups, 'A'), C: dominance(groups, 'C') },
  integrity: { lives: Object.values(groups).reduce((n, g) => n + g.lives, 0), violations: Object.values(groups).reduce((n, g) => n + g.integrity.violations, 0) }
}
const json = JSON.stringify(report, null, 2) + '\n'
if (jsonPath) writeFileSync(jsonPath, json)
if (mdPath) writeFileSync(mdPath, tables(report))
if (!jsonPath && !mdPath) console.log(json)
console.error(`Done: ${report.integrity.lives} lives, invariant violations ${report.integrity.violations}, ${((Date.now() - t0) / 1000).toFixed(0)}s`)
if (report.integrity.violations) process.exitCode = 1

function tables(rep: typeof report) {
  const g = rep.groups
  const row = (cells: (string | number | null | undefined)[]) => `| ${cells.map(c => c === null || c === undefined ? '—' : String(c)).join(' | ')} |`
  const head = (cols: string[]) => `${row(cols)}\n${row(cols.map(() => '---'))}`
  let out = `<!-- Generated by scripts/personal-time-t9.ts; seeds ${rep.seeds.first}..${rep.seeds.last} -->\n\n`
  out += '## Личное время: выдано и использовано (взрослые годы)\n\n' + head(['Режим/стратегия', 'Выдано за жизнь', 'Потрачено', 'Не использовано %', 'В год: выдано / потрачено', 'Полностью исп. годы %', 'На моменты', 'На покупки']) + '\n'
  for (const k of Object.keys(g)) { const s = g[k]!; out += row([k, s.time.grantedPerLife, s.time.spentPerLife, s.time.unusedPct, `${s.time.grantedPerAdultYear} / ${s.time.spentPerAdultYear}`, s.time.fullyUsedAdultYearsPct, s.time.onMomentsPerLife, s.time.onPurchasesPerLife]) + '\n' }
  out += '\n## Моменты, отказы и покупки\n\n' + head(['Режим/стратегия', 'Предложено', 'Принято', 'Уник.', 'Отложено ради плана', 'Пустые отметки', 'Покупок отказано по времени', 'Курсов', 'Жизней с курсом', 'Поездок', 'Экскурсий', 'T9: предложено / принято']) + '\n'
  for (const k of Object.keys(g)) { const s = g[k]!; out += row([k, s.moments.offeredPerLife, s.moments.acceptedPerLife, s.moments.uniqueAcceptedPerLife, s.moments.declinedForPlanPerLife, s.moments.emptyBeatsPerLife, s.refusals.timeBlockedPurchasesPerLife, s.purchases.coursesPerLife, s.purchases.livesWithCourse, s.purchases.familyTripsPerLife, s.purchases.sectorTripsPerLife, `${s.moments.t9OfferedPerLife} / ${s.moments.t9AcceptedPerLife}`]) + '\n' }
  out += '\n## Доступность в окне трат (из подходящих по прочим условиям окон)\n\n' + head(['Режим/стратегия', 'Курс: доступен / время / деньги %', 'Поездка: доступна / время / деньги %', 'Экскурсия: доступна / время / деньги %']) + '\n'
  const w = (x: { availablePct: number | null; timeBlockedPct: number | null; moneyBlockedPct: number | null }) => `${x.availablePct ?? '—'} / ${x.timeBlockedPct ?? '—'} / ${x.moneyBlockedPct ?? '—'}`
  for (const k of Object.keys(g)) { const s = g[k]!; out += row([k, w(s.availability.course), w(s.availability.familyTrip), w(s.availability.sectorTrip)]) + '\n' }
  out += '\n## Карьера, повествование, состояние\n\n' + head(['Режим/стратегия', 'III разряд (жизней, медиана)', 'IV разряд', 'Доход за жизнь', 'Сюжетов', 'Воспоминаний', 'Последствий', 'Связь в 60', 'Стресс в 60', 'Здоровье в 80']) + '\n'
  for (const k of Object.keys(g)) { const s = g[k]!; out += row([k, `${s.career.grade3Lives} (${s.career.grade3MedianAge ?? '—'})`, `${s.career.grade4Lives} (${s.career.grade4MedianAge ?? '—'})`, s.career.lifetimeIncome, s.narrative.storyletsPerLife, s.narrative.memoriesPerLife, s.narrative.followupsPerLife, s.at60.meanBond, s.at60.stress, s.at80.health]) + '\n' }
  out += '\n## Годы по режиму (основание лимита), режимы A и C\n\n' + head(['Режим/стратегия', 'Основание', 'Лет', 'Лимит', 'Потрачено в год', 'Не исп. %', 'Моментов в год', 'Покупки в год', 'Год исп. полностью %']) + '\n'
  for (const k of Object.keys(g).filter(k => /^(A|N|C)\//.test(k))) for (const [basis, v] of Object.entries(g[k]!.byBasis as Record<string, Record<string, number>>)) out += row([k, basis, v.years, v.limit, v.spentPerYear, v.unusedPct, v.momentsPerYear, v.purchaseTimePerYear, v.fullyUsedYearsPct]) + '\n'
  out += '\n## Парные сравнения (b − a на тех же seed)\n\n' + head(['Сравнение', 'Доход', 'Моменты', 'После 40', 'Уник.', 'Время', 'Курсы', 'Поездки', 'Экскурсии', 'Воспом.', 'III разряд', 'Связь 60 (n)', 'Стресс 60', 'Здоровье 80']) + '\n'
  for (const [k, v] of Object.entries(rep.comparisons) as [string, ReturnType<typeof paired>][]) out += row([k, v.incomeDelta, v.momentsDelta, v.momentsAfter40Delta, v.uniqueMomentsDelta, v.timeSpentDelta, v.coursesDelta, v.familyTripsDelta, v.sectorTripsDelta, v.memoriesDelta, v.grade3Delta, `${v.bond60.delta} (${v.bond60.n})`, v.stress60.delta, v.health80.delta]) + '\n'
  out += `\n## Доминирование\n\nA: ${JSON.stringify(rep.dominance.A)}\n\nC: ${JSON.stringify(rep.dominance.C)}\n`
  return out
}
