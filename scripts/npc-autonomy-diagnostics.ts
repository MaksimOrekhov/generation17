import { writeFileSync } from 'node:fs'
import { canChoose, createGame, decide, tick } from '../src/domain/engine'
import { inspectNpcMilestones, NPC_MILESTONE_FLAGS, type NpcMilestoneAssessment, type NpcMilestoneKind } from '../src/domain/npcMilestones'
import { storylets } from '../src/domain/storylets'
import type { GameState } from '../src/domain/types'
import { censorReason, diagnoseNpcAutonomyScene, NPC_AUTONOMY_SCENES } from '../src/domain/npcAutonomyDiagnostics'

const GOLDEN_SEEDS = [17, 29, 43, 58, 73, 101, 137, 211] as const
const SAMPLE_SEEDS = Array.from({ length: 24 }, (_, index) => 1_000 + index)
const MAX_HERO_AGE = 40
const REPORT_PATH = 'docs/audit/npc-autonomy-diagnostics.md'
const FRIEND_SCENE = 'npc-friend-shift-ledger'
const SIBLING_SCENE = 'npc-sibling-own-rhythm'
const SCENES = [FRIEND_SCENE, SIBLING_SCENE] as const
const CONTACT_CHOICES = new Set(['ask-work', 'talk-meetings', 'ask-routine', 'talk-visits'])
const NO_CONTACT_CHOICE = 'no-contact'

type Policy = 'passive' | 'responsive'
interface Transition {
  personId: string
  kind: NpcMilestoneKind
  heroAge: number
  npcAge: number
  shipYear: number
  publicLogId: number | null
  factRecorded: boolean
  stateRenderable: boolean
}
interface RunResult {
  cohort: string
  seed: number
  policy: Policy
  game: GameState
  eligible: Set<string>
  eligibleNpc: Set<string>
  transitions: Transition[]
  skipReasons: Set<string>
  eligibleScenes: Set<string>
  offeredScenes: Set<string>
  playedContacts: Set<string>
  noContactChoices: Set<string>
  sceneCounts: Map<string, number>
  censored: boolean
  censorReason: string | null
}

const markerInfo = (flag: string): { personId: 'friend' | 'sibling'; kind: NpcMilestoneKind } | undefined => {
  if (flag === 'npcFriendFirstJobAt') return { personId: 'friend', kind: 'firstJob' }
  if (flag === 'npcSiblingFirstJobAt') return { personId: 'sibling', kind: 'firstJob' }
  if (flag === 'npcFriendFirstMoveAt') return { personId: 'friend', kind: 'firstMove' }
  if (flag === 'npcSiblingFirstMoveAt') return { personId: 'sibling', kind: 'firstMove' }
  return undefined
}

function restoreTransitionState(probe: GameState, before: GameState, flag: string) {
  const info = markerInfo(flag)
  if (!info) return
  delete probe.flags[flag]
  const restored = probe.people.find(person => person.id === info.personId)
  const original = before.people.find(person => person.id === info.personId)
  if (!restored || !original) return
  restored.state = original.state && { ...original.state }
}

function transitionFor(after: GameState, personId: string, kind: NpcMilestoneKind, logTitle: string): Transition {
  const person = after.people.find(candidate => candidate.id === personId)!
  const log = after.history.find(entry => entry.title === logTitle && entry.text.includes(person.name))
  const stateRenderable = kind === 'firstJob' ? !!person.state?.job : !!person.state?.sectorId
  return {
    personId, kind, heroAge: after.age, npcAge: person.age, shipYear: after.shipYear,
    publicLogId: log?.id ?? null, factRecorded: !!log, stateRenderable
  }
}

function choiceIndex(state: GameState, policy: Policy) {
  const event = storylets.find(candidate => candidate.id === state.pending)
  if (!event) return -1
  if (SCENES.includes(event.id as typeof SCENES[number])) {
    const choiceId = policy === 'passive' ? NO_CONTACT_CHOICE : event.id === FRIEND_SCENE ? 'ask-work' : 'ask-routine'
    const index = event.choices.findIndex(choice => choice.id === choiceId)
    return index >= 0 && canChoose(state, index).available ? index : -1
  }
  return event.choices.findIndex((_, index) => canChoose(state, index).available)
}

function recordSceneAvailability(run: RunResult, state: GameState) {
  const snapshot = { ...state, pending: null }
  for (const id of NPC_AUTONOMY_SCENES) {
    const result = diagnoseNpcAutonomyScene(snapshot, id, null)
    const pendingResult = diagnoseNpcAutonomyScene(state, id, state.pending)
    const add = (key: string) => run.sceneCounts.set(key, (run.sceneCounts.get(key) ?? 0) + 1)
    if (result.jsonConditionOk) add('JSON_CONDITION_OK')
    if (result.romanceBlock) add('ROMANCE_BLOCK')
    if (result.alreadySeen && result.jsonConditionOk) add('ALREADY_SEEN')
    if (pendingResult.blockedPending) add('BLOCKED_PENDING')
    if (result.realSelectionEligible) {
      run.eligibleScenes.add(id)
      add('REAL_SELECTION_ELIGIBLE')
    }
  }
}

function recordTransitionAssessments(run: RunResult, before: GameState, after: GameState) {
  const changedFlags = NPC_MILESTONE_FLAGS.filter(flag => typeof after.flags[flag] === 'number' && after.flags[flag] !== before.flags[flag])
  const probe = structuredClone(after)
  for (const flag of changedFlags) restoreTransitionState(probe, before, flag)
  const assessments: NpcMilestoneAssessment[] = inspectNpcMilestones(probe)
  for (const assessment of assessments) {
    const key = `${assessment.personId}:${assessment.kind}`
    if (assessment.eligible) {
      run.eligible.add(key)
      run.eligibleNpc.add(assessment.personId)
    } else if (assessment.reason !== 'PAST_WINDOW' && assessment.reason !== 'ALREADY_APPLIED') {
      run.skipReasons.add(`${assessment.personId}:${assessment.kind}:${assessment.reason}`)
    }
  }
  for (const flag of changedFlags) {
    const info = markerInfo(flag)
    const person = info && after.people.find(candidate => candidate.id === info.personId)
    if (!info || !person) continue
    run.transitions.push(transitionFor(after, info.personId, info.kind, info.kind === 'firstJob' ? 'Реестр занятий' : 'Жилищный реестр'))
  }
}

function makeRun(cohort: string, seed: number, policy: Policy): RunResult {
  const run: RunResult = {
    cohort, seed, policy, game: createGame(seed), eligible: new Set(), eligibleNpc: new Set(), transitions: [],
    skipReasons: new Set(), eligibleScenes: new Set(), offeredScenes: new Set(), playedContacts: new Set(), noContactChoices: new Set(), sceneCounts: new Map(), censored: false, censorReason: null
  }
  let terminationReason: string | null = null
  for (let guard = 0; guard < 200 && run.game.age < MAX_HERO_AGE && !run.game.stopped; guard++) {
    if (run.game.pending) {
      const index = choiceIndex(run.game, policy)
      if (index < 0) { terminationReason = 'UNRESOLVED_DECISION'; break }
      const event = storylets.find(candidate => candidate.id === run.game.pending)
      const choice = event?.choices[index]
      const beforeDecisionCount = run.game.decisions.length
      const after = decide(run.game, index)
      if (after === run.game) { terminationReason = 'NO_PROGRESS'; break }
      if (event && SCENES.includes(event.id as typeof SCENES[number])) {
        run.offeredScenes.add(event.id)
        const selected = after.decisions[beforeDecisionCount]?.choice
        if (selected && CONTACT_CHOICES.has(selected)) run.playedContacts.add(event.id)
        else if (selected === NO_CONTACT_CHOICE) run.noContactChoices.add(event.id)
      }
      run.game = after
      continue
    }
    const before = run.game
    const after = tick(before)
    if (after === before) { terminationReason = 'NO_PROGRESS'; break }
    recordTransitionAssessments(run, before, after)
    run.game = after
    recordSceneAvailability(run, after)
    if (after.pending && SCENES.includes(after.pending as typeof SCENES[number])) run.offeredScenes.add(after.pending)
  }
  run.censorReason = terminationReason ?? censorReason(run.game.age, MAX_HERO_AGE, run.game.stopped, false)
  run.censored = run.censorReason !== null
  return run
}

function count(runs: RunResult[], predicate: (run: RunResult) => boolean) {
  return runs.filter(predicate).length
}

function uniqueCount(runs: RunResult[], select: (run: RunResult) => Set<string>) {
  return runs.reduce((sum, run) => sum + select(run).size, 0)
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 'N/A' : `${numerator}/${denominator} (${(100 * numerator / denominator).toFixed(1)}%)`
}

function summarize(runs: RunResult[]) {
  const jobEligible = uniqueCount(runs, run => new Set([...run.eligible].filter(value => value.endsWith(':firstJob'))))
  const moveEligible = uniqueCount(runs, run => new Set([...run.eligible].filter(value => value.endsWith(':firstMove'))))
  const jobs = runs.reduce((sum, run) => sum + run.transitions.filter(item => item.kind === 'firstJob').length, 0)
  const moves = runs.reduce((sum, run) => sum + run.transitions.filter(item => item.kind === 'firstMove').length, 0)
  const totalTransitions = jobs + moves
  const records = runs.reduce((sum, run) => sum + run.transitions.filter(item => item.factRecorded).length, 0)
  const renderable = runs.reduce((sum, run) => sum + run.transitions.filter(item => item.stateRenderable).length, 0)
  const eligibleScenes = uniqueCount(runs, run => run.eligibleScenes)
  const offeredScenes = uniqueCount(runs, run => run.offeredScenes)
  const playedContacts = uniqueCount(runs, run => run.playedContacts)
  const noContact = uniqueCount(runs, run => run.noContactChoices)
  const sceneCounts = new Map<string, number>()
  for (const run of runs) for (const [key, value] of run.sceneCounts) sceneCounts.set(key, (sceneCounts.get(key) ?? 0) + value)
  return {
    runs: runs.length,
    eligibleNpc: uniqueCount(runs, run => run.eligibleNpc),
    jobEligible, jobs, moveEligible, moves, totalTransitions,
    records, renderable, eligibleScenes, offeredScenes, playedContacts, noContact,
    notExposed: Math.max(0, eligibleScenes - offeredScenes),
    censored: count(runs, run => run.censored), sceneCounts,
    jobRate: ratio(jobs, jobEligible), moveRate: ratio(moves, moveEligible),
    presentationRate: ratio(records, totalTransitions), sceneOfferRate: ratio(offeredScenes, eligibleScenes),
    contactRate: ratio(playedContacts, offeredScenes)
  }
}

const goldenPassive = GOLDEN_SEEDS.map(seed => makeRun('Golden', seed, 'passive'))
const goldenResponsive = GOLDEN_SEEDS.map(seed => makeRun('Golden', seed, 'responsive'))
const additionalResponsive = SAMPLE_SEEDS.map(seed => makeRun('Дополнительная', seed, 'responsive'))
const cohorts = [
  ['Golden · passive', goldenPassive],
  ['Golden · responsive', goldenResponsive],
  ['1000..1023 · responsive', additionalResponsive]
] as const

const summaryRows = cohorts.map(([name, runs]) => {
  const stats = summarize([...runs])
  return `| ${name} | ${stats.runs} | ${stats.eligibleNpc} | ${stats.jobEligible} | ${stats.jobs} | ${stats.jobRate} | ${stats.moveEligible} | ${stats.moves} | ${stats.moveRate} | ${stats.records}/${stats.totalTransitions} | ${stats.renderable}/${stats.totalTransitions} | ${stats.eligibleScenes} | ${stats.offeredScenes} | ${stats.playedContacts} | ${stats.noContact} | ${stats.notExposed} | ${stats.censored} |`
})
const sceneCountRows = cohorts.flatMap(([name, runs]) => {
  const stats = summarize([...runs])
  return ['JSON_CONDITION_OK', 'ROMANCE_BLOCK', 'ALREADY_SEEN', 'BLOCKED_PENDING', 'REAL_SELECTION_ELIGIBLE'].map(key => `| ${name} | ${key} | ${stats.sceneCounts.get(key) ?? 0} |`)
})

const eventRows = cohorts.flatMap(([name, runs]) => runs.flatMap(run => run.transitions.map(event =>
  `| ${name} | ${run.seed} | ${run.policy} | ${event.personId} | ${event.kind} | ${event.npcAge} | ${event.heroAge} | ${event.shipYear} | ${event.factRecorded ? `#${event.publicLogId}` : 'MISSING'} | ${event.stateRenderable ? 'yes' : 'no'} |`
)))

const skipCounts = new Map<string, number>()
for (const [, runs] of cohorts) for (const run of runs) for (const reason of run.skipReasons) {
  skipCounts.set(reason, (skipCounts.get(reason) ?? 0) + 1)
}
const skipRows = [...skipCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([reason, amount]) => `| ${reason} | ${amount} |`)
const censoredRows = cohorts.flatMap(([name, runs]) => {
  const rows = runs.filter(run => run.censored).map(run => `| ${name} | ${run.seed} | ${run.game.age} | ${run.game.causeOfDeath ?? '—'} | ${run.censorReason} |`)
  return rows.length ? rows : [`| ${name} | — | — | — | — |`]
})
const offerRows = cohorts.flatMap(([name, runs]) => runs.flatMap(run => run.game.decisions
  .filter(decision => SCENES.includes(decision.id as typeof SCENES[number]))
  .map(decision => `| ${name} | ${run.seed} | ${decision.id} | ${decision.choice} |`)))
const playedRows = cohorts.flatMap(([name, runs]) => runs.flatMap(run => [...run.playedContacts].map(scene => `| ${name} | ${run.seed} | ${scene} | ${[...run.game.decisions].find(decision => decision.id === scene)?.choice ?? 'played'} |`)))

const report = [
  '# GEN-57 — диагностические симуляции автономии NPC',
  '',
  'Фиксированный прогон по GEN-52: golden seeds `17, 29, 43, 58, 73, 101, 137, 211` выполнены в двух политиках; `1000..1023` — одна responsive политика. Прогон детерминирован для одинакового кода и seed. Это синтетическая диагностика, не оценка живой аудитории.',
  '',
  '**Политики:** `passive` выбирает бесплатный `no-contact` в двух новых сценах и первый допустимый ответ в остальных сюжетах; `responsive` выбирает первый контактный ответ (`ask-work` / `ask-routine`) и первый допустимый ответ в остальных сюжетах. Обязательные решения не оставляются открытыми.',
  '',
  '## Разделённые счётчики по cohort',
  '',
  '| Cohort / policy | Runs | eligibleNPC | E_job | T_job | T_job/E_job | E_move | T_move | T_move/E_move | Public records / T | State renderable / T | Scene windows R_eligible | Offered O | Contact played R | No-contact | NOT_EXPOSED | Censored runs |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ...summaryRows,
  '',
  '`eligibleNPC` — уникальные реальные `friend`/`sibling` с хотя бы одним достигнутым безопасным окном. `E_job` и `E_move` — уникальные пары run/person/kind; при `E_move=0` процент — `N/A`. `O` — фактический pending storylet. `R` — реально сыгранный контакт; отказ считается отдельно и не приписывается как контакт. `NOT_EXPOSED` — доступное окно, в котором director не предложил сцену. `Public records` означает созданную factual запись; `State renderable` — текущая профессия/сектор присутствуют в модели и отображаются существующей FamilyPanel. Это proxy, не доказательство, что игрок прочёл запись; `actuallySeen=UNKNOWN`.',
  '',
  'Счётчики scene gates — проверки на post-tick snapshot перед оценкой результатов: JSON_CONDITION_OK — возраст и JSON `available`; ROMANCE_BLOCK — friend scene отсекается relationship guard; ALREADY_SEEN — решение уже есть; BLOCKED_PENDING — другой pending был бы активен при проверке; REAL_SELECTION_ELIGIBLE — валидные engine markers и хотя бы один допустимый choice. OFFERED — фактическая запись решения/director pending; NOT_EXPOSED = REAL_SELECTION_ELIGIBLE − OFFERED. Это диагностические окна, не изменение director.',
  '',
  '| Cohort | Gate | Checks |',
  '|---|---|---:|',
  ...sceneCountRows,
  '',
  '## Фактически применённые переходы и доступные факты',
  '',
  '| Cohort | Seed | Policy | NPC | Event | NPC age | Hero age | Ship year | Public log | Current state renderable |',
  '|---|---:|---|---|---|---:|---:|---:|---|---|',
  ...(eventRows.length ? eventRows : ['| — | — | — | — | — | — | — | — | — | — |']),
  '',
  '## Предложенные сцены и выбранный ответ',
  '',
  '| Cohort | Seed | Предложенная сцена | Ответ |',
  '|---|---:|---|---|',
  ...(offerRows.length ? offerRows : ['| — | — | — | — |']),
  '',
  '## Фактически сыгранные разговоры',
  '',
  '| Cohort | Seed | Storylet | Contact choice |',
  '|---|---:|---|---|',
  ...(playedRows.length ? playedRows : ['| — | — | — | — |']),
  '',
  '## Причины пропуска на достигнутых плановых возрастах',
  '',
  '| NPC:event:reason | Runs |',
  '|---|---:|',
  ...(skipRows.length ? skipRows : ['| — | 0 |']),
  '',
  '## Цензурированные прогоны',
  '',
  '| Cohort | Seed | Last hero age | Recorded cause | Reason |',
  '|---|---:|---:|---|---|',
  ...censoredRows,
  '',
  '## Ограничения интерпретации',
  '',
  '- В fresh lives друг и sibling не имеют исходного `state.sectorId`. Для них переезд корректно пропускается с `UNKNOWN_SOURCE`; synthetic cohort не используется для создания адреса. Ноль переездов при `E_move=0` — `N/A`, не провал порога.',
  '- Сцена может быть eligible, но не предложена director; JSON eligibility не считается предложением. Личный разговор считается только после выбора контактного choice ID. `no-contact` не добавляет memory.',
  '- Public log and current FamilyPanel state are technical presentation proxies. Браузерный smoke, фактическое прочтение записи и человеческий playtest в этом диагностическом CLI не выполнялись.',
  '- Смерть до hero age 40, неразрешённый pending decision или остановка без продвижения помечаются как censored; недостигнутые окна не добавляются в знаменатели. Seed 1013 фактически завершился смертью героя в 2 года от болезней раннего детства.',
  ''
].join('\n')

writeFileSync(REPORT_PATH, report)
const total = cohorts.flatMap(([, runs]) => runs)
const stats = summarize(total)
process.stdout.write(`Wrote ${REPORT_PATH} (${total.length} runs; ${stats.totalTransitions} world transitions; ${stats.offeredScenes} story offers; ${stats.playedContacts} contact choices)\n`)
