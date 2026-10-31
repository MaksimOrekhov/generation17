import { sectorById } from './birth'
import { friendRomancePending, relationshipState } from './people'
import { hash32 } from './random'
import type { GameState, Job, Person, SectorId } from './types'
import { NPC_MILESTONE_FLAGS } from './npcMilestoneFlags'
import { npcMarkerFactAccessible } from './validateNpcMarkers'
export { NPC_MILESTONE_FLAGS } from './npcMilestoneFlags'

const NPC_IDS = ['friend', 'sibling'] as const
const JOBS = ['Техник', 'Медик', 'Агроном', 'Координатор'] as const satisfies readonly Job[]
const SECTORS: readonly SectorId[] = ['atrium', 'bio', 'engineering', 'clinic', 'lower']
const HISTORY_LIMIT = 1500

export type NpcMilestoneKind = 'firstJob' | 'firstMove'
export type NpcMilestoneReason = 'APPLIED' | 'ABSENT' | 'DEAD' | 'NOT_YET_KNOWN' | 'PAST_WINDOW' | 'JOB_KNOWN' | 'UNKNOWN_SOURCE' | 'INVALID_SOURCE' | 'ALREADY_APPLIED' | 'INVALID_MARKER' | 'COOLDOWN' | 'RELATIONSHIP' | 'HASH_GATE'

export interface NpcMilestoneAssessment {
  personId: typeof NPC_IDS[number]
  kind: NpcMilestoneKind
  npcAge: number | null
  eligible: boolean
  reason: NpcMilestoneReason
  job?: Job
  oldSector?: SectorId
  newSector?: SectorId
}

export interface NpcMilestonePlan {
  jobAge: number
  moveAge: number
  job: Job
  movePermitted: boolean
}

const jobFlag = (id: typeof NPC_IDS[number]) => id === 'friend' ? 'npcFriendFirstJobAt' : 'npcSiblingFirstJobAt'
const moveFlag = (id: typeof NPC_IDS[number]) => id === 'friend' ? 'npcFriendFirstMoveAt' : 'npcSiblingFirstMoveAt'
const hasOwn = (g: GameState, flag: string) => Object.prototype.hasOwnProperty.call(g.flags, flag)

export function npcMilestonePlan(seed: number, personId: typeof NPC_IDS[number]): NpcMilestonePlan {
  return {
    jobAge: 16 + hash32('npc-autonomy-v1', seed, personId, 'first-job-age') % 7,
    moveAge: 23 + hash32('npc-autonomy-v1', seed, personId, 'first-move-age') % 13,
    job: JOBS[hash32('npc-autonomy-v1', seed, personId, 'first-job-kind') % JOBS.length]!,
    movePermitted: hash32('npc-autonomy-v1', seed, personId, 'first-move-permit') % 2 === 0
  }
}

function markerAge(g: GameState, flag: string): { present: boolean; valid: boolean; age?: number } {
  if (!hasOwn(g, flag)) return { present: false, valid: true }
  const value = g.flags[flag]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > g.age) return { present: true, valid: false }
  return { present: true, valid: true, age: value }
}

/** A marker is trusted only when its timestamp is accessible and its recorded fact exists. */
export function npcMilestoneMarkersValid(g: GameState): boolean {
  for (const flag of NPC_MILESTONE_FLAGS) {
    const marker = markerAge(g, flag)
    if (!marker.valid) return false
    if (!marker.present) continue
    if (!npcMarkerFactAccessible(g, flag, marker.age!)) return false
  }
  return true
}

function personMarkersValid(g: GameState, id: typeof NPC_IDS[number]): boolean {
  for (const flag of [jobFlag(id), moveFlag(id)]) {
    const marker = markerAge(g, flag)
    if (!marker.valid) return false
    if (!marker.present) continue
    if (!npcMarkerFactAccessible(g, flag, marker.age!)) return false
  }
  return true
}

function personMarkerAges(g: GameState, id: typeof NPC_IDS[number]): { valid: boolean; ages: number[] } {
  const markers = [markerAge(g, jobFlag(id)), markerAge(g, moveFlag(id))]
  return { valid: markers.every(marker => marker.valid), ages: markers.flatMap(marker => marker.age === undefined ? [] : [marker.age]) }
}

function friendRomanceContext(g: GameState): boolean {
  const relationships = relationshipState(g)
  const stage = String(g.flags.loveStage ?? '')
  return relationships.partnerId === 'friend'
    || relationships.formerPartnerIds.includes('friend')
    || friendRomancePending(g)
    || g.flags.lovePath === 'confessed'
    || ['together', 'moved-together', 'held', 'reunited', 'apart'].includes(stage)
    || g.flags.livingTogether === true && !g.relationships
}

function relationshipBlocksFriendMove(g: GameState): boolean {
  const stage = String(g.flags.loveStage ?? '')
  const ambiguousLegacy = !g.relationships && g.flags.lovePath === undefined && ['open', 'parted', 'drifted'].includes(stage)
  return friendRomanceContext(g) || ambiguousLegacy
}

export function friendAutonomyStoryAvailable(g: GameState): boolean {
  return !friendRomanceContext(g)
}

function inspectJob(g: GameState, id: typeof NPC_IDS[number], person: Person | undefined, npcAge: number | null): NpcMilestoneAssessment {
  const plan = npcMilestonePlan(g.seed, id)
  const assessment: NpcMilestoneAssessment = { personId: id, kind: 'firstJob', npcAge, eligible: false, reason: 'PAST_WINDOW', job: plan.job }
  if (!person) return { ...assessment, reason: 'ABSENT' }
  if (npcAge !== plan.jobAge) return assessment
  if (person.since > g.age) return { ...assessment, reason: 'NOT_YET_KNOWN' }
  if (!person.alive) return { ...assessment, reason: 'DEAD' }
  if (!personMarkerAges(g, id).valid || !personMarkersValid(g, id)) return { ...assessment, reason: 'INVALID_MARKER' }
  if (markerAge(g, jobFlag(id)).present) return { ...assessment, reason: 'ALREADY_APPLIED' }
  if (person.state?.job !== undefined) return { ...assessment, reason: 'JOB_KNOWN' }
  return { ...assessment, eligible: true, reason: 'APPLIED' }
}

function inspectMove(g: GameState, id: typeof NPC_IDS[number], person: Person | undefined, npcAge: number | null): NpcMilestoneAssessment {
  const plan = npcMilestonePlan(g.seed, id)
  const assessment: NpcMilestoneAssessment = { personId: id, kind: 'firstMove', npcAge, eligible: false, reason: 'PAST_WINDOW' }
  if (!person) return { ...assessment, reason: 'ABSENT' }
  if (npcAge !== plan.moveAge) return assessment
  if (person.since > g.age) return { ...assessment, reason: 'NOT_YET_KNOWN' }
  if (!person.alive) return { ...assessment, reason: 'DEAD' }
  if (!personMarkerAges(g, id).valid || !personMarkersValid(g, id)) return { ...assessment, reason: 'INVALID_MARKER' }
  if (markerAge(g, moveFlag(id)).present) return { ...assessment, reason: 'ALREADY_APPLIED' }
  const oldSector = person.state?.sectorId
  if (oldSector === undefined) return { ...assessment, reason: 'UNKNOWN_SOURCE' }
  if (!SECTORS.includes(oldSector)) return { ...assessment, reason: 'INVALID_SOURCE' }
  const { ages } = personMarkerAges(g, id)
  if (ages.some(age => g.age - age < 5)) return { ...assessment, reason: 'COOLDOWN' }
  if (id === 'friend' && relationshipBlocksFriendMove(g)) return { ...assessment, reason: 'RELATIONSHIP', oldSector }
  if (!plan.movePermitted) return { ...assessment, eligible: true, reason: 'HASH_GATE', oldSector }
  const candidates = SECTORS.filter(sector => sector !== oldSector)
  const newSector = candidates[hash32('npc-autonomy-v1', g.seed, id, 'first-move-target') % candidates.length]!
  return { ...assessment, eligible: true, reason: 'APPLIED', oldSector, newSector }
}

/** Returns the fixed-age assessment used by both the production tick and the diagnostic harness. */
export function inspectNpcMilestones(g: GameState): NpcMilestoneAssessment[] {
  return NPC_IDS.flatMap(id => {
    const person = g.people.find(candidate => candidate.id === id)
    return [
      inspectJob(g, id, person, person?.age ?? null),
      inspectMove(g, id, person, person?.age ?? null)
    ]
  }).filter(item => item.reason !== 'PAST_WINDOW')
}

function addFactualLog(g: GameState, title: string, text: string) {
  g.history.unshift({ id: g.nextLogId++, age: g.age, shipYear: g.shipYear, kind: 'life', title, text })
  if (g.history.length > HISTORY_LIMIT) {
    let drop = g.history.length - 1
    while (drop > 0 && g.history[drop]!.kind !== 'ambient') drop--
    g.history.splice(g.history[drop]!.kind === 'ambient' ? drop : g.history.length - 1, 1)
  }
}

/** Applies only fixed-age, hash-planned NPC milestones; it never consumes the shared game RNG. */
export function npcMilestonesTick(g: GameState): void {
  for (const assessment of inspectNpcMilestones(g)) {
    if (!assessment.eligible || assessment.reason !== 'APPLIED') continue
    const person = g.people.find(candidate => candidate.id === assessment.personId)
    if (!person) continue
    if (assessment.kind === 'firstJob' && assessment.job) {
      person.state = { ...person.state, job: assessment.job }
      g.flags[jobFlag(assessment.personId)] = g.age
      addFactualLog(g, 'Реестр занятий', `${person.name} — ${assessment.job}. Запись внесена в ${g.shipYear} году полёта.`)
    } else if (assessment.kind === 'firstMove' && assessment.oldSector && assessment.newSector) {
      person.state = { ...person.state, sectorId: assessment.newSector }
      g.flags[moveFlag(assessment.personId)] = g.age
      addFactualLog(g, 'Жилищный реестр', `${person.name}. Прежний сектор: ${sectorById(assessment.oldSector).name}. Новый сектор: ${sectorById(assessment.newSector).name}. Год полёта ${g.shipYear}.`)
    }
  }
}
