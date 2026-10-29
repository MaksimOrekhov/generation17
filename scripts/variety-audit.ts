/**
 * Аудит разнообразия и готовности к масштабному контенту (Core Systems Audit).
 * Диагностика без изменения игры: все действия — настоящие доменные операции, политики не тратят RNG игры.
 *
 *   npm run audit:variety                        100 жизней на политику (6 политик T9), отчёт в консоль
 *   npm run audit:variety -- 100 --json out.json сохранить показатели
 *   npm run audit:variety -- 200 --scale         + нагрузочный опыт директора: JSON-каталог ×1/×4/×10/×25 (по 150 жизней)
 *
 * Что считается:
 *  - статический разбор каталога (код + JSON): линии, продолжения, возраст, профессии, семья, корабль;
 *  - повторяемость между жизнями: пересечение сюжетов двух жизней, доля нового в k-й жизни (k = 2…10),
 *    отдельно «то же событие» и «тот же тип ситуации» (линия или категория);
 *  - доставку: в скольких жизнях сюжет был доступен (условия выполнены) и в скольких показан;
 *  - возрастное покрытие, пустые годы, профессии, семья/одиночество, личное время, размер сохранения;
 *  - частые мотивы в текстах (основы слов, встречающиеся во многих сценах).
 *
 * Ограничения: игроки — боты (ответы по хэшу, покупки по стратегиям T8/T9), а не люди; «не встретилось» ≠ «недостижимо»;
 * нагрузочный опыт размножает существующие JSON-сюжеты с переименованными флагами — это проверка механики выбора,
 * а не модель будущего каталога (у копий те же возрастные окна и веса).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { beat, canChoose, canTakeMoment, createGame, decide, setFocus, takeMoment, tick } from '../src/domain/engine'
import { isKnown } from '../src/domain/birth'
import { ATMOSPHERE_LEVEL } from '../src/domain/constants'
import { codeStorylets, storylets } from '../src/domain/storylets'
import { codeMoments, moments } from '../src/domain/moments'
import { priorityOf } from '../src/domain/director'
import { findInconsistencies, COHABITING_STAGES } from '../src/domain/invariants'
import { compileStorylet } from '../src/content/load'
import type { JsonStorylet } from '../src/content/types'
import type { GameState, Storylet } from '../src/domain/types'
import { hash32 } from '../src/domain/random'
import { chooseStory, focusFor, leanState, policyFor, targetForChoice } from './economy-t8-core'
import type { Policy, PolicyName } from './economy-t8-core'
import { financialDecisions } from './economy-pilot-core'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const lives = Number(args.find(a => /^[0-9]+$/.test(a)) ?? 100)
const flagValue = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const jsonPath = flagValue('--json')
const START = Number(flagValue('--start') ?? 3001)
const scale = args.includes('--scale')
if (!Number.isInteger(lives) || lives < 10 || lives > 2000) throw Error('Usage: npm run audit:variety -- [10…2000] [--start seed] [--json file] [--scale]')

const POLICIES = ['Careerist', 'Moderate', 'Family', 'TimeBuyer', 'Spender', 'Saver'] as const satisfies readonly PolicyName[]
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pct = (n: number, d: number) => round(100 * n / Math.max(1, d), 1)
const quantile = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : 0 }
const jaccard = (a: Set<string>, b: Set<string>) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / Math.max(1, a.size + b.size - i) }

const bundle = JSON.parse(readFileSync(join(root, 'src/content/bundle.json'), 'utf8')) as { storylets: JsonStorylet[]; moments: any[] }
const jsonIds = new Set(bundle.storylets.map(s => s.id))
const jsonById = new Map(bundle.storylets.map(s => [s.id, s]))
const PEOPLE = ['parent', 'parent2', 'sibling', 'friend', 'neighbor', 'mentor', 'child']
const ENGINE_GUARDED = ['friend', 'parent', 'neighbor', 'mentor', 'child']
const mentions = (text: string, id: string) => text.includes(`{{${id}}}`) || text.includes(`{{${id}:`)
const situation = (s: Storylet) => s.arc ? `линия:${s.arc}` : `кат:${s.category}`

// ───────────────────────── статический разбор каталога ─────────────────────────

/** Кто пишет каждый флаг: сюжеты, моменты и движок (семейная поездка, авария). */
const flagWriters = (() => {
  const out = new Map<string, Set<string>>()
  const add = (id: string, e?: { flags?: Record<string, unknown> }) => Object.keys(e?.flags ?? {}).forEach(k => out.set(k, (out.get(k) ?? new Set()).add(id)))
  for (const s of storylets) for (const c of s.choices) { add(s.id, c.effects); add(s.id, c.check?.success); add(s.id, c.check?.failure) }
  for (const m of moments) { add(m.id, m.accept.effects); add(m.id, m.skip.effects) }
  for (const k of ['familyTrip', 'shipIncidentAge', ...PEOPLE.map(p => `familyTrip${p[0]!.toUpperCase()}${p.slice(1)}`)]) out.set(k, (out.get(k) ?? new Set()).add('engine'))
  return out
})()

/**
 * Читает ли условие следы других событий: флаги, которые пишет кто-то другой.
 * Защита от повтора (`flagNot`, `!g.flags.x`) не считается чтением прошлого. Для кода — по исходнику замыкания (грубо).
 */
function pastReads(s: Storylet) {
  const j = jsonById.get(s.id)
  const r = j?.requires ?? {}
  const text = j ? JSON.stringify({ flag: r.flag, flagIs: r.flagIs, flagNotIs: r.flagNotIs, since: r.since, until: r.until }) : s.available.toString().replace(/!g\.flags\.\w+/g, '')
  const has = (k: string) => text.includes(`"${k}"`) || text.includes(`.${k}`) || text.includes(`'${k}'`)
  const foreign = [...flagWriters.keys()].filter(k => has(k) && [...flagWriters.get(k)!].some(w => w !== s.id))
  return { past: foreign.length > 0, window: foreign.some(k => /Age$/.test(k)) || (!j && /leakFor\(g|since\(g/.test(text)) }
}

/** Что читает условие: для JSON — ключи requires, для кода — исходник замыкания (грубо). */
function reads(s: Storylet) {
  const j = jsonById.get(s.id)
  const { past, window } = pastReads(s)
  if (j) {
    const r = j.requires ?? {}
    return {
      flags: past,
      since: window,
      job: !!r.job,
      people: !!(r.alive || r.present || r.personAge) || PEOPLE.some(p => mentions(s.body, p)),
      ship: r.servicesOpen !== undefined,
      economy: !!(r.money || r.work || r.regime || r.grade || r.housing || r.owns || r.ownsNot || r.reserveYears || r.ownedYears)
    }
  }
  const src = s.available.toString()
  return {
    flags: past,
    since: window,
    job: /protagonist\.job/.test(src),
    people: /people|alive\(g|isKnown/.test(src) || PEOPLE.some(p => mentions(s.body, p)),
    ship: /g\.ship|shipIncident/.test(src),
    economy: /economy/.test(src)
  }
}

function catalogReport() {
  const bands = [[0, 5], [6, 11], [12, 15], [16, 24], [25, 34], [35, 49], [50, 64], [65, 79], [80, 95]] as const
  const r = storylets.map(s => ({ s, ...reads(s) }))
  const count = (f: (x: typeof r[number]) => boolean) => r.filter(f).length
  const byCategory: Record<string, number> = {}
  for (const s of storylets) byCategory[s.category] = (byCategory[s.category] ?? 0) + 1
  const arcs: Record<string, { stories: number; forks: number; followups: number; json: number }> = {}
  for (const s of storylets) if (s.arc) {
    const a = (arcs[s.arc] ??= { stories: 0, forks: 0, followups: 0, json: 0 })
    a.stories++; if (s.fork) a.forks++; if (priorityOf(s) !== 'normal') a.followups++; if (jsonIds.has(s.id)) a.json++
  }
  const choices = storylets.flatMap(s => s.choices)
  return {
    storylets: { total: storylets.length, code: codeStorylets.length, json: storylets.length - codeStorylets.length },
    moments: { total: moments.length, code: codeMoments.length, json: moments.length - codeMoments.length, once: moments.filter(m => m.cooldown === Infinity).length },
    arcs, arcsInJson: Object.values(arcs).reduce((n, a) => n + a.json, 0),
    forks: count(x => !!x.s.fork),
    byPriority: { normal: count(x => priorityOf(x.s) === 'normal'), followup: count(x => priorityOf(x.s) === 'followup'), critical: count(x => priorityOf(x.s) === 'critical') },
    jsonFollowups: bundle.storylets.filter(s => s.priority).length,
    readsEarlierEventsWithWindow: count(x => x.since),
    readsEarlierEvents: count(x => x.flags),
    professionGated: count(x => x.job),
    professionGatedByJob: Object.fromEntries(['Техник', 'Медик', 'Агроном', 'Координатор'].map(j => [j, storylets.filter(s => {
      const json = jsonById.get(s.id)
      return json ? json.requires?.job?.includes(j as never) : new RegExp(`protagonist\\.job[^']*'${j}'|'${j}'`).test(s.available.toString()) && /protagonist\.job/.test(s.available.toString())
    }).length])),
    familyOrPeople: count(x => x.people),
    childhood: storylets.filter(s => s.max <= 15).length,
    youth: storylets.filter(s => s.min >= 12 && s.max <= 30).length,
    late: storylets.filter(s => s.min >= 60).length,
    shipDependent: count(x => x.ship),
    economyDependent: count(x => x.economy),
    momentsShipDependent: bundle.moments.filter(m => m.requires?.servicesOpen !== undefined).length,
    momentsEconomyDependent: bundle.moments.filter(m => m.requires && (m.requires.owns || m.requires.money || m.requires.regime || m.requires.housing || m.requires.ownedYears)).length,
    choices: {
      total: choices.length,
      withSkillCheck: choices.filter(c => c.check).length,
      withMoney: choices.filter(c => c.effects.money).length,
      withPurchase: choices.filter(c => c.purchase).length,
      withMemory: choices.filter(c => c.effects.memory).length,
      settingFlags: choices.filter(c => Object.keys(c.effects.flags ?? {}).length).length,
      conditionalChoices: 'нет: у ChoiceDef нет условия показа'
    },
    byCategory,
    coverage: Object.fromEntries(bands.map(([a, b]) => [`${a}-${b}`, {
      storylets: storylets.filter(s => s.min <= b && s.max >= a).length,
      normalStorylets: storylets.filter(s => s.min <= b && s.max >= a && priorityOf(s) === 'normal').length,
      moments: moments.filter(m => m.min <= b && m.max >= a).length
    }])),
    textVariation: {
      stateDependentText: 'нет: body и result не имеют условных фрагментов',
      storyletsWithGenderForms: storylets.filter(s => /\{\{\w+:/.test(s.body + s.choices.map(c => c.result).join(' '))).length,
      note: 'body/result статичны: меняются только имена и формы рода; вариативность достигается отдельными сюжетами-вариантами'
    }
  }
}

/** Флаги: сколько имён, чьи значения сравниваются в JSON, но нигде не записываются. */
function flagReport() {
  const src = ['storylets', 'storyletsExtra', 'storyletsArcs', 'storyletsLines', 'storyletsMystery', 'moments', 'momentsExtra', 'engine', 'offers']
    .map(f => readFileSync(join(root, `src/domain/${f}.ts`), 'utf8')).join('\n')
  const written = new Map<string, Set<string>>()
  const add = (k: string, v: unknown) => { const set = written.get(k) ?? new Set<string>(); set.add(String(v)); written.set(k, set) }
  const effects = (e: any) => { for (const [k, v] of Object.entries(e?.flags ?? {})) add(k, v) }
  for (const s of bundle.storylets) for (const c of s.choices) { effects(c.effects); effects(c.check?.success); effects(c.check?.failure) }
  for (const m of bundle.moments) { effects(m.accept?.effects); effects(m.skip?.effects) }
  for (const s of codeStorylets) for (const c of s.choices) { effects(c.effects); effects(c.check?.success); effects(c.check?.failure) }
  for (const m of codeMoments) { effects(m.accept.effects); effects(m.skip.effects) }
  const missing: string[] = []
  for (const item of [...bundle.storylets, ...bundle.moments]) {
    for (const key of ['flagIs', 'flagNotIs'] as const) for (const [k, v] of Object.entries(item.requires?.[key] ?? {})) {
      for (const value of (Array.isArray(v) ? v : [v]).map(String)) {
        if (!written.get(k)?.has(value) && !src.includes(`'${value}'`)) missing.push(`${item.id}: ${key}.${k} = ${value}`)
      }
    }
  }
  return {
    distinctFlags: written.size,
    stringValuedFlags: [...written].filter(([, vs]) => [...vs].some(v => !/^(true|false|-?\d+|__CURRENT_AGE__|@age)$/.test(v))).length,
    jsonComparisonsWithUnwrittenValue: missing
  }
}

// ───────────────────────── мотивы в текстах ─────────────────────────

const STOP = new Set('когда потом только может будто через чтобы этого этому этот такой такая тебе тебя твой твоя твои своей своих своим свою свой после перед между который которая которые сейчас всегда снова очень почти никто ничего ничто нибудь всего всех какой какая какие однаж где-то можно нужно будет было были была есть одна один одно даже разве этого этой этом этих потому теперь просто тоже между много'.split(' '))
function motifReport() {
  const texts = [
    ...storylets.map(s => ({ id: s.id, text: [s.body, ...s.choices.map(c => c.result)].join(' ') })),
    ...moments.map(m => ({ id: m.id, text: [m.text, m.accept.result].join(' ') }))
  ]
  const stemItems = new Map<string, Set<string>>()
  for (const t of texts) {
    const words = t.text.toLowerCase().replace(/\{\{[^}]*\}\}/g, ' ').match(/[а-яё]{5,}/g) ?? []
    for (const w of new Set(words.filter(w => !STOP.has(w)).map(w => w.slice(0, 5)))) {
      const set = stemItems.get(w) ?? new Set<string>(); set.add(t.id); stemItems.set(w, set)
    }
  }
  const top = [...stemItems].map(([stem, ids]) => [stem, ids.size] as const).sort((a, b) => b[1] - a[1]).slice(0, 40)
  const motif = (re: RegExp) => texts.filter(t => re.test(t.text.toLowerCase())).length
  return {
    items: texts.length,
    topStems: Object.fromEntries(top),
    motifs: {
      'чай/чашка/кружка': motif(/(чай|чашк|кружк)/),
      'свет/лампа': motif(/(свет[^л]|ламп)/),
      'окно/стекло/звёзды': motif(/(окн|стекл|звёзд|звезд)/),
      'вентиляция/гул': motif(/(вентиляц|гул)/),
      'архив': motif(/архив/),
      'растение/рассада/грядка': motif(/(растени|рассад|грядк|росток)/),
      'смена (рабочая)': motif(/смен[аеуы]/),
      'письмо/записка': motif(/(письм|записк)/),
      'молча/тишина': motif(/(молч|тишин)/)
    }
  }
}

// ───────────────────────── одна жизнь ─────────────────────────

interface Life {
  seed: number; policy: string; job: string; jobAt30: string; deathAge: number
  decisions: { age: number; id: string; choice: number }[]
  offered: string[]; accepted: { age: number; id: string }[]; withinLifeMomentRepeats: number
  eligible: Set<string>; eligibleYears: Map<string, number>
  forks: { arc: string; age: number; outcomes: number }[]
  child: boolean; partner: boolean; purchases: number
  yearRecords: { age: number; decision: boolean; moment: boolean; purchase: boolean; limit: number; left: number; basis: string }[]
  saveBytes: number; historyEntries: number; flags: number; memories: number; violations: number
}

function eligibleNow(g: GameState) {
  return storylets.filter(s => !g.seen.includes(s.id) && g.age >= s.min && g.age <= s.max && s.available(g)
    && (!s.weird || ATMOSPHERE_LEVEL[g.atmosphere] >= s.weird)
    && ENGINE_GUARDED.every(p => !mentions(s.body, p) || isKnown(g, p)))
}

function plannedIds(g: GameState, policy: Policy) {
  return financialDecisions(g, policy.base, { noReducedLoad: true }).purchases.map(p => p.id).join(',')
}

/** Тот же выбор, что `chooseStory`, но ответ по другой «соли» хэша: другой игрок с той же стратегией трат. */
function chooseWithSalt(g: GameState, policy: Policy, salt: string) {
  if (salt === 'economy-t8a') return chooseStory(g, policy).selected
  const event = storylets.find(s => s.id === g.pending)!
  const options = event.choices.map((choice, index) => {
    const target = targetForChoice(g, event, index)
    return { index, target, choice, a: canChoose(g, index, target) }
  }).filter(o => o.a.available && !(policy.strictSaver && (o.a.cost > 0 || o.choice.purchase)))
  const index = hash32(salt, g.seed, event.id, g.age) % event.choices.length
  return options.find(o => o.index === index) ?? options[0]!
}

function playLife(seed: number, policy: Policy, checkInvariants = false, salt = 'economy-t8a'): Life {
  let g = createGame(seed)
  const life: Life = { seed, policy: policy.name, job: '', jobAt30: '', deathAge: 0, decisions: [], offered: [], accepted: [], withinLifeMomentRepeats: 0,
    eligible: new Set(), eligibleYears: new Map(), forks: [], child: false, partner: false, purchases: 0, yearRecords: [],
    saveBytes: 0, historyEntries: 0, flags: 0, memories: 0, violations: 0 }
  const offeredSet = new Set<string>()
  for (let guard = 0; guard < 130 && !g.stopped; guard++) {
    const rec = { age: g.age, decision: false, moment: false, purchase: false, limit: g.timeYear.limit, left: 0, basis: String(g.timeYear.basis) }
    while (g.pending && !g.stopped) {
      const selected = chooseWithSalt(g, policy, salt)
      life.decisions.push({ age: g.age, id: g.pending, choice: selected.index })
      rec.decision = true
      if (selected.choice.purchase) life.purchases++
      g = decide(g, selected.index, selected.target)
    }
    g = setFocus(g, focusFor(policy, g.age))
    while (g.phase < 3 && !g.pending && !g.stopped) {
      g = beat(g)
      if (!g.moment) continue
      if (offeredSet.has(g.moment)) life.withinLifeMomentRepeats++
      offeredSet.add(g.moment); life.offered.push(g.moment)
      if (!canTakeMoment(g)) continue
      if (g.age >= 16) {
        const lean = leanState(g)
        if (plannedIds(lean, policy) !== plannedIds(takeMoment(lean), policy)) continue
      }
      const id = g.moment
      g = takeMoment(g)
      life.accepted.push({ age: g.age, id }); rec.moment = true
    }
    if (g.age >= 16 && !g.stopped && !g.pending) {
      if (policy.timeBuyer && !policy.fullLoad) g = financialDecisions(g, 'Family', { noPurchases: true }).game
      const r = financialDecisions(g, policy.base, { noReducedLoad: policy.fullLoad })
      if (r.purchases.length) { rec.purchase = true; life.purchases += r.purchases.length }
      g = r.game
    }
    rec.left = g.attention
    life.yearRecords.push(rec)
    g = tick(g)
    if (checkInvariants) life.violations += findInconsistencies(g).length
    if (g.stopped) break
    if (g.age === 30) life.jobAt30 = g.protagonist.job
    if (g.people.some(p => p.id === 'child')) life.child = true
    if (COHABITING_STAGES.includes(String(g.flags.loveStage))) life.partner = true
    const pool = eligibleNow(g)
    if (g.pending) { const p = storylets.find(s => s.id === g.pending); if (p) pool.push(p) }
    for (const s of pool) { life.eligible.add(s.id); life.eligibleYears.set(s.id, (life.eligibleYears.get(s.id) ?? 0) + 1) }
  }
  if (!g.stopped) throw Error(`Жизнь не завершилась: seed ${seed}`)
  life.deathAge = g.age; life.job = g.protagonist.job
  life.forks = g.forks.map(f => ({ arc: f.arc, age: f.age, outcomes: f.outcomes.length }))
  life.saveBytes = JSON.stringify(g).length; life.historyEntries = g.history.length
  life.flags = Object.keys(g.flags).length; life.memories = g.memories.length
  return life
}

// ───────────────────────── показатели ─────────────────────────

const storySet = (l: Life) => new Set(l.decisions.map(d => d.id))
const situationSet = (l: Life) => new Set(l.decisions.map(d => situation(storylets.find(s => s.id === d.id)!)))
const momentSet = (l: Life) => new Set(l.offered)
const experienceSet = (l: Life) => new Set([...l.decisions.map(d => d.id), ...l.accepted.map(m => m.id)])

function pairOverlap(runs: Life[], get: (l: Life) => Set<string>) {
  const sets = runs.map(get)
  const js: number[] = [], share: number[] = []
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
    js.push(jaccard(sets[i]!, sets[j]!))
    let inter = 0; for (const x of sets[j]!) if (sets[i]!.has(x)) inter++
    share.push(inter / Math.max(1, sets[j]!.size))
  }
  return { jaccard: round(mean(js), 3), p10: round(quantile(js, .1), 3), p90: round(quantile(js, .9), 3), shareOfSecondAlreadySeen: round(mean(share), 3) }
}

/** Последовательности по `len` жизней: доля нового в k-й жизни относительно всех предыдущих. */
function novelty(runs: Life[], get: (l: Life) => Set<string>, len = 10) {
  const sequences: Life[][] = []
  for (let i = 0; i + len <= runs.length; i += len) sequences.push(runs.slice(i, i + len))
  const newShare = Array.from({ length: len }, () => [] as number[])
  const newCount = Array.from({ length: len }, () => [] as number[])
  const union = Array.from({ length: len }, () => [] as number[])
  for (const seq of sequences) {
    const seen = new Set<string>()
    seq.forEach((l, k) => {
      const s = get(l)
      let fresh = 0; for (const x of s) if (!seen.has(x)) fresh++
      newShare[k]!.push(fresh / Math.max(1, s.size)); newCount[k]!.push(fresh)
      for (const x of s) seen.add(x)
      union[k]!.push(seen.size)
    })
  }
  return {
    sequences: sequences.length,
    newSharePct: Object.fromEntries(newShare.map((xs, k) => [`life${k + 1}`, round(100 * mean(xs), 1)])),
    newItems: Object.fromEntries(newCount.map((xs, k) => [`life${k + 1}`, round(mean(xs), 1)])),
    cumulativeDistinct: Object.fromEntries(union.map((xs, k) => [`after${k + 1}`, round(mean(xs), 1)]))
  }
}

function repetitionReport(runs: Life[]) {
  // Одна жизнь на seed: у политик общие seed (парный план), а одинаковый seed — одинаковое рождение и детство.
  const byPolicy = POLICIES.map(p => runs.filter(l => l.policy === p))
  const interleaved = Array.from({ length: lives }, (_, i) => byPolicy[i % POLICIES.length]![i]!)
  const moderate = runs.filter(l => l.policy === 'Moderate')
  const sample = interleaved.slice(0, 150)
  return {
    pairs: {
      storylets: pairOverlap(sample, storySet),
      situationTypes: pairOverlap(sample, situationSet),
      momentsOffered: pairOverlap(sample, momentSet),
      experienced: pairOverlap(sample, experienceSet),
      storyletsSamePolicyModerate: pairOverlap(moderate.slice(0, 150), storySet)
    },
    noveltyMixedPolicies: { storylets: novelty(interleaved, storySet), moments: novelty(interleaved, momentSet), situationTypes: novelty(interleaved, situationSet) },
    noveltySamePolicyModerate: { storylets: novelty(moderate, storySet) },
    perLife: {
      storylets: round(mean(runs.map(l => storySet(l).size)), 1),
      momentsOffered: round(mean(runs.map(l => l.offered.length)), 1),
      distinctMomentsOffered: round(mean(runs.map(l => momentSet(l).size)), 1),
      momentsAccepted: round(mean(runs.map(l => l.accepted.length)), 1),
      withinLifeMomentRepeatSharePct: pct(runs.reduce((n, l) => n + l.withinLifeMomentRepeats, 0), runs.reduce((n, l) => n + l.offered.length, 0))
    }
  }
}

function deliveryReport(runs: Life[]) {
  const rows = storylets.map(s => {
    const eligibleLives = runs.filter(l => l.eligible.has(s.id)).length
    const shown = runs.filter(l => l.decisions.some(d => d.id === s.id)).length
    return { id: s.id, priority: priorityOf(s), json: jsonIds.has(s.id), eligibleLives, shown, rate: shown / runs.length, delivery: eligibleLives ? shown / eligibleLives : null }
  })
  const group = (p: string) => {
    const xs = rows.filter(r => r.priority === p && r.eligibleLives > 0)
    return { stories: xs.length, eligibleLives: xs.reduce((n, r) => n + r.eligibleLives, 0), shown: xs.reduce((n, r) => n + r.shown, 0),
      deliveryPct: pct(xs.reduce((n, r) => n + r.shown, 0), xs.reduce((n, r) => n + r.eligibleLives, 0)) }
  }
  const lostFollowups = rows.filter(r => r.priority !== 'normal' && r.eligibleLives >= 5 && r.delivery! < .9)
    .map(r => `${r.id}: доступен ${r.eligibleLives}, показан ${r.shown}`)
  const crowdedNormals = rows.filter(r => r.priority === 'normal' && r.eligibleLives >= runs.length * .2 && r.delivery! < .35)
    .sort((a, b) => a.delivery! - b.delivery!).map(r => `${r.id}: доступен в ${pct(r.eligibleLives, runs.length)}% жизней, показан в ${pct(r.shown, r.eligibleLives)}% из них`)
  // Развилки линий: продолжение так и не пришло, хотя герой прожил после развилки 20+ лет
  const arcs: Record<string, { started: number; longLived: number; noOutcome: number }> = {}
  for (const l of runs) for (const f of l.forks) {
    const a = (arcs[f.arc] ??= { started: 0, longLived: 0, noOutcome: 0 })
    a.started++
    if (l.deathAge - f.age >= 20) { a.longLived++; if (!f.outcomes) a.noOutcome++ }
  }
  return {
    byPriority: { normal: group('normal'), followup: group('followup'), critical: group('critical') },
    lostFollowups, crowdedNormals: crowdedNormals.slice(0, 15),
    never: rows.filter(r => r.shown === 0).map(r => `${r.id}${r.eligibleLives ? ` (доступен в ${r.eligibleLives})` : ' (условия ни разу не выполнились)'}`),
    rareUnder2Pct: rows.filter(r => r.shown > 0 && r.rate < .02).map(r => r.id),
    seenOver50Pct: rows.filter(r => r.rate > .5).map(r => `${r.id} ${round(100 * r.rate, 0)}%`),
    arcsWithoutOutcome: Object.fromEntries(Object.entries(arcs).map(([k, v]) => [k, { ...v, noOutcomePct: pct(v.noOutcome, v.longLived) }])),
    perStorylet: Object.fromEntries(rows.map(r => [r.id, { priority: r.priority, eligiblePct: pct(r.eligibleLives, runs.length), shownPct: pct(r.shown, runs.length), deliveryPct: r.eligibleLives ? pct(r.shown, r.eligibleLives) : null }]))
  }
}

function ageReport(runs: Life[]) {
  const decade = (a: number) => Math.min(9, Math.floor(a / 10))
  const years = new Array(10).fill(0), dec = new Array(10).fill(0), empty = new Array(10).fill(0), mom = new Array(10).fill(0)
  const streaks: number[] = []
  for (const l of runs) {
    let run = 0, best = 0
    for (const y of l.yearRecords) {
      const d = decade(y.age)
      years[d]++
      if (y.decision) dec[d]++
      if (y.moment) mom[d]++
      const isEmpty = !y.decision && !y.moment && !y.purchase
      if (isEmpty && y.age >= 6) { empty[d]++; run++; best = Math.max(best, run) } else run = 0
    }
    streaks.push(best)
  }
  const label = (d: number) => `${d * 10}-${d * 10 + 9}`
  return {
    decisionsPer10Years: Object.fromEntries(dec.map((n, d) => [label(d), round(10 * n / Math.max(1, years[d]), 2)])),
    yearsWithAcceptedMomentPct: Object.fromEntries(mom.map((n, d) => [label(d), pct(n, years[d])])),
    emptyYearsPct: Object.fromEntries(empty.map((n, d) => [label(d), pct(n, years[d])])),
    longestEmptyStreak: { mean: round(mean(streaks), 1), p90: quantile(streaks, .9), max: Math.max(...streaks) },
    deathAge: { mean: round(mean(runs.map(l => l.deathAge)), 1), p10: quantile(runs.map(l => l.deathAge), .1), p90: quantile(runs.map(l => l.deathAge), .9) }
  }
}

/** Тот же seed (то же рождение): насколько меняется набор сюжетов от стратегии трат и фокуса и от других ответов. */
function trajectoryReport(runs: Life[], otherAnswers: Life[]) {
  const bySeed = new Map<number, Life[]>()
  for (const l of runs) bySeed.set(l.seed, [...(bySeed.get(l.seed) ?? []), l])
  const policyPairs: number[] = []
  for (const group of bySeed.values()) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) policyPairs.push(jaccard(storySet(group[i]!), storySet(group[j]!)))
  const moderate = new Map(runs.filter(l => l.policy === 'Moderate').map(l => [l.seed, l]))
  const answerPairs = otherAnswers.map(l => jaccard(storySet(l), storySet(moderate.get(l.seed)!)))
  const famCar = groupCompare(runs.filter(l => l.policy === 'Family'), runs.filter(l => l.policy === 'Careerist'))
  return {
    sameSeedOtherPolicyJaccard: round(mean(policyPairs), 3),
    sameSeedOtherAnswersJaccard: round(mean(answerPairs), 3),
    differentSeedsJaccard: pairOverlap(runs.filter(l => l.policy === 'Moderate').slice(0, 150), storySet).jaccard,
    familyVsCareeristRateDistance: famCar.meanRateDistance,
    noiseFloorRateDistance: groupCompare(...[0, 1].map(k => runs.filter(l => l.policy === 'Moderate' && l.seed % 2 === k)) as [Life[], Life[]]).meanRateDistance,
    note: 'ответы при одном seed у всех стратегий одинаковы (хэш economy-t8a): первая строка измеряет только траты, фокус и время; вторая — только другие ответы при стратегии Moderate'
  }
}

function groupCompare(a: Life[], b: Life[]) {
  const distinctA = new Set(a.flatMap(l => [...storySet(l)])), distinctB = new Set(b.flatMap(l => [...storySet(l)]))
  const onlyA = [...distinctA].filter(x => !distinctB.has(x)), onlyB = [...distinctB].filter(x => !distinctA.has(x))
  const rate = (g: Life[], id: string) => g.filter(l => storySet(l).has(id)).length / Math.max(1, g.length)
  const all = [...new Set([...distinctA, ...distinctB])]
  return {
    lives: [a.length, b.length],
    decisions: [round(mean(a.map(l => l.decisions.length)), 1), round(mean(b.map(l => l.decisions.length)), 1)],
    acceptedMoments: [round(mean(a.map(l => l.accepted.length)), 1), round(mean(b.map(l => l.accepted.length)), 1)],
    meanRateDistance: round(mean(all.map(id => Math.abs(rate(a, id) - rate(b, id)))), 4),
    storyletsOnlyInFirst: onlyA.length, storyletsOnlyInSecond: onlyB.length
  }
}

function professionReport(runs: Life[]) {
  const jobs = ['Техник', 'Медик', 'Агроном', 'Координатор']
  const by = Object.fromEntries(jobs.map(j => [j, runs.filter(l => l.jobAt30 === j)]))
  const within: number[] = [], across: number[] = []
  for (let i = 0; i < Math.min(runs.length, 200); i++) for (let j = i + 1; j < Math.min(runs.length, 200); j++) {
    const a = runs[i]!, b = runs[j]!
    if (!a.jobAt30 || !b.jobAt30) continue
    ;(a.jobAt30 === b.jobAt30 ? within : across).push(jaccard(storySet(a), storySet(b)))
  }
  const gated = new Set(storylets.filter(s => reads(s).job).map(s => s.id))
  return {
    livesByJobAt30: Object.fromEntries(jobs.map(j => [j, by[j]!.length])),
    jaccardSameJob: round(mean(within), 3), jaccardDifferentJob: round(mean(across), 3),
    jobGatedStoryletsSeenPerLife: Object.fromEntries(jobs.map(j => [j, round(mean(by[j]!.map(l => l.decisions.filter(d => gated.has(d.id)).length)), 2)])),
    pairwiseRateDistance: Object.fromEntries(jobs.flatMap((x, i) => jobs.slice(i + 1).map(y => [`${x}/${y}`, groupCompare(by[x]!, by[y]!).meanRateDistance])))
  }
}

function familyReport(runs: Life[]) {
  const withChild = runs.filter(l => l.child), noChild = runs.filter(l => !l.child)
  const partner = runs.filter(l => l.partner), single = runs.filter(l => !l.partner && !l.child)
  const late = (l: Life) => l.decisions.filter(d => d.age >= 65).length
  return {
    childPct: pct(withChild.length, runs.length), partnerPct: pct(partner.length, runs.length), singlePct: pct(single.length, runs.length),
    childVsNoChild: groupCompare(withChild, noChild),
    partnerVsSingle: groupCompare(partner, single),
    lateDecisions: { withChild: round(mean(withChild.filter(l => l.deathAge >= 70).map(late)), 2), single: round(mean(single.filter(l => l.deathAge >= 70).map(late)), 2) },
    childByPolicy: Object.fromEntries(POLICIES.map(p => [p, pct(runs.filter(l => l.policy === p && l.child).length, runs.filter(l => l.policy === p).length)]))
  }
}

function timeReport(runs: Life[]) {
  const adult = runs.flatMap(l => l.yearRecords.filter(y => y.age >= 18))
  const by = (basis: string) => adult.filter(y => y.basis === basis)
  const unused = (ys: typeof adult) => pct(ys.reduce((n, y) => n + y.left, 0), ys.reduce((n, y) => n + y.limit, 0))
  return {
    adultUnusedPct: unused(adult),
    unusedByBasis: Object.fromEntries(['full', 'reduced', 'retired', 'mentor', 'trainee'].map(b => [b, { years: by(b).length, unusedPct: unused(by(b)) }])),
    adultYearsWithAcceptedMomentPct: pct(adult.filter(y => y.moment).length, adult.length)
  }
}

function saveReport(runs: Life[]) {
  return {
    finalSaveKb: { mean: round(mean(runs.map(l => l.saveBytes / 1024)), 1), max: round(Math.max(...runs.map(l => l.saveBytes / 1024)), 1) },
    historyEntries: { mean: round(mean(runs.map(l => l.historyEntries)), 0), max: Math.max(...runs.map(l => l.historyEntries)) },
    flagsAtDeath: { mean: round(mean(runs.map(l => l.flags)), 1), max: Math.max(...runs.map(l => l.flags)) },
    memoriesAtDeath: { mean: round(mean(runs.map(l => l.memories)), 1), max: Math.max(...runs.map(l => l.memories)) },
    invariantViolations: runs.reduce((n, l) => n + l.violations, 0)
  }
}

// ───────────────────────── нагрузочный опыт директора ─────────────────────────

/** Копия JSON-сюжета с собственными id и флагами: каждая копия — независимая линия с теми же окнами и весами. */
function cloneStorylet(s: JsonStorylet, k: number, ownFlags: Set<string>): JsonStorylet {
  const rename = (name: string) => ownFlags.has(name) ? `${name}X${k}` : name
  const mapKeys = (o: Record<string, unknown> | undefined) => o && Object.fromEntries(Object.entries(o).map(([key, v]) => [rename(key), v]))
  const r = s.requires
  const requires = r && { ...r,
    ...(r.flag ? { flag: r.flag.map(rename) } : {}), ...(r.flagNot ? { flagNot: r.flagNot.map(rename) } : {}),
    ...(r.flagIs ? { flagIs: mapKeys(r.flagIs) as never } : {}), ...(r.flagNotIs ? { flagNotIs: mapKeys(r.flagNotIs) as never } : {}),
    ...(r.since ? { since: mapKeys(r.since) as never } : {}), ...(r.until ? { until: mapKeys(r.until) as never } : {}) }
  const fx = (e: any) => e && ({ ...e, ...(e.flags ? { flags: mapKeys(e.flags) } : {}) })
  return { ...s, id: `${s.id}-x${k}`, requires, choices: s.choices.map(c => ({ ...c, effects: fx(c.effects), ...(c.check ? { check: { ...c.check, success: fx(c.check.success), failure: fx(c.check.failure) } } : {}) })) }
}

function scaleExperiment(n: number) {
  const ownFlags = new Set<string>()
  for (const s of bundle.storylets) for (const c of s.choices) for (const e of [c.effects, c.check?.success, c.check?.failure]) Object.keys(e?.flags ?? {}).forEach(f => ownFlags.add(f))
  const original = [...storylets]
  const codeArcIds = new Set(codeStorylets.filter(s => s.arc && !s.fork && priorityOf(s) !== 'normal').map(s => s.id))
  const out: Record<string, unknown> = {}
  for (const copies of [1, 4, 10, 25]) {
    const extra = Array.from({ length: copies - 1 }, (_, i) => bundle.storylets.map(s => compileStorylet(cloneStorylet(s, i + 2, ownFlags)))).flat()
    storylets.splice(0, storylets.length, ...original, ...extra)
    try {
      // Разные seed у всех жизней опыта: пересечение пар не завышается одинаковым рождением.
      const runs = POLICIES.slice(0, 3).flatMap((p, k) => Array.from({ length: n }, (_, i) => playLife(START + 5000 + k * n + i, policyFor(p))))
      const d = deliveryReport(runs)
      const gaps = runs.flatMap(l => l.decisions.slice(1).map((x, i) => x.age - l.decisions[i]!.age))
      out[`x${copies}`] = {
        storylets: storylets.length,
        decisionsPerLife: round(mean(runs.map(l => l.decisions.length)), 1),
        followupSharePct: pct(runs.reduce((s, l) => s + l.decisions.filter(x => priorityOf(storylets.find(t => t.id === x.id)!) !== 'normal').length, 0), runs.reduce((s, l) => s + l.decisions.length, 0)),
        followupDeliveryPct: d.byPriority.followup.deliveryPct,
        normalDeliveryPct: d.byPriority.normal.deliveryPct,
        codeArcFollowupsPerLife: round(mean(runs.map(l => l.decisions.filter(x => codeArcIds.has(x.id)).length)), 2),
        lostFollowups: d.lostFollowups.length,
        meanGap: round(mean(gaps), 2), maxGap: Math.max(...gaps),
        decisionsPer10Years: ageReport(runs).decisionsPer10Years,
        pairJaccard: pairOverlap(runs.filter((_, i) => i % 2 === 0), storySet).jaccard,
        distinctStoryletsSeenAllLives: new Set(runs.flatMap(l => [...storySet(l)])).size
      }
      console.error(`  ×${copies}: ${storylets.length} сюжетов`)
    } finally { storylets.splice(0, storylets.length, ...original) }
  }
  return out
}

// ───────────────────────── сбор ─────────────────────────

const started = Date.now()
console.error(`Аудит разнообразия: ${lives} жизней × ${POLICIES.length} политик, seed с ${START}…`)
const runs = POLICIES.flatMap(p => Array.from({ length: lives }, (_, i) => playLife(START + i, policyFor(p), i < 10)))
const otherAnswers = Array.from({ length: Math.min(lives, 150) }, (_, i) => playLife(START + i, policyFor('Moderate'), false, 'variety-other-player'))
console.error(`Жизни: ${round((Date.now() - started) / 1000, 0)} с`)
const report: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  method: { lives: runs.length, perPolicy: lives, policies: POLICIES, seeds: [START, START + lives - 1], answers: 'хэш economy-t8a (как T8/T9)', moments: 'planned (T9)', purchases: 'financialDecisions T8a' },
  catalog: catalogReport(),
  flags: flagReport(),
  motifs: motifReport(),
  repetition: repetitionReport(runs),
  delivery: deliveryReport(runs),
  ages: ageReport(runs),
  trajectories: trajectoryReport(runs, otherAnswers),
  professions: professionReport(runs),
  family: familyReport(runs),
  personalTime: timeReport(runs),
  save: saveReport(runs)
}
if (scale) {
  console.error('Нагрузочный опыт директора…')
  report.directorScale = scaleExperiment(50)
}
console.error(`Готово за ${round((Date.now() - started) / 1000, 0)} с`)
if (jsonPath) writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
