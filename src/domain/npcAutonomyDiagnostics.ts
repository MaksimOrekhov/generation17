import { canChoose } from './engine'
import { friendAutonomyStoryAvailable, npcMilestoneMarkersValid } from './npcMilestones'
import { npcAutonomyJsonAvailable, storylets } from './storylets'
import type { GameState } from './types'

export const NPC_AUTONOMY_SCENES = ['npc-friend-shift-ledger', 'npc-sibling-own-rhythm'] as const
export type NpcAutonomyScene = typeof NPC_AUTONOMY_SCENES[number]

export interface SceneEligibility {
  jsonConditionOk: boolean
  romanceBlock: boolean
  alreadySeen: boolean
  blockedPending: boolean
  realSelectionEligible: boolean
}

/** Measures scene gates and choice feasibility without changing director selection. */
export function diagnoseNpcAutonomyScene(state: GameState, id: NpcAutonomyScene, selectionPending = state.pending): SceneEligibility {
  const event = storylets.find(candidate => candidate.id === id)
  const inAgeWindow = !!event && state.age >= event.min && state.age <= event.max
  const jsonConditionOk = !!event && inAgeWindow && npcAutonomyJsonAvailable(event, state)
  const romanceBlock = id === 'npc-friend-shift-ledger' && jsonConditionOk && !friendAutonomyStoryAvailable(state)
  const alreadySeen = state.seen.includes(id) || !!state.decisions?.some(decision => decision.id === id)
  const blockedPending = !!selectionPending && selectionPending !== id
  const probe = { ...state, pending: id }
  const choicePossible = !!event?.choices.some((_, index) => canChoose(probe, index).available)
  const realSelectionEligible = jsonConditionOk && npcMilestoneMarkersValid(state) && !romanceBlock && !alreadySeen && !blockedPending && choicePossible
  return { jsonConditionOk, romanceBlock, alreadySeen, blockedPending, realSelectionEligible }
}

export function censorReason(age: number, horizon: number, stopped: boolean, unresolved: boolean): string | null {
  if (unresolved) return 'UNRESOLVED_DECISION'
  if (age < horizon && stopped) return 'STOPPED_BEFORE_HORIZON'
  if (age < horizon) return 'HORIZON_NOT_REACHED'
  return null
}
