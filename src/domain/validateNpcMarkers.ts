import { NPC_MILESTONE_FLAGS } from './npcMilestoneFlags'
import type { GameState } from './types'

const FIRST_JOBS = ['Техник', 'Медик', 'Агроном', 'Координатор']
const SECTORS = ['atrium', 'bio', 'engineering', 'clinic', 'lower']

export function npcMarkerFactAccessible(state: GameState, flag: string, age: number): boolean {
  const friend = flag.startsWith('npcFriend')
  const person = state.people.find(candidate => candidate.id === (friend ? 'friend' : 'sibling'))
  if (!person || person.since > age) return false
  if (flag.endsWith('FirstJobAt')) return FIRST_JOBS.includes(String(person.state?.job))
  return SECTORS.includes(String(person.state?.sectorId))
}

/** Drop malformed or unsupported persisted autonomy markers without inventing history. */
export function stripInvalidNpcMilestoneMarkers(state: GameState): { flags: GameState['flags']; removed: string[] } {
  let flags = state.flags
  const removed: string[] = []
  for (const flag of NPC_MILESTONE_FLAGS) {
    if (!Object.prototype.hasOwnProperty.call(flags, flag)) continue
    const value = flags[flag]
    const valid = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= state.age
      && npcMarkerFactAccessible(state, flag, value)
    if (valid) continue
    if (flags === state.flags) flags = { ...flags }
    delete flags[flag]
    removed.push(flag)
  }
  return { flags, removed }
}
