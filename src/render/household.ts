import { residenceOf } from '../domain/birth'
import { currentPartner, relationshipState } from '../domain/people'
import type { GameState } from '../domain/types'
import type { SceneResolution } from './scene'

/**
 * `shared` — только условный знак подтверждённого общего домохозяйства, а не присутствие человека в комнате.
 * Любое отсутствие доказательства даёт `ordinary`.
 */
export type HouseholdLook = 'ordinary' | 'shared'

/** Чистая read-only проверка: ничего не пишет в GameState и не тратит RNG. */
export function householdLook(g: GameState, scene: SceneResolution): HouseholdLook {
  if (scene.sceneId !== 'home.cabin' || scene.presentation !== 'home' || scene.fallbackReason !== null) return 'ordinary'
  // Только явная новая модель отношений: старые флаги `friend`/`loveStage` общего дома не доказывают.
  if (!g.relationships?.partnerId) return 'ordinary'
  const relationships = relationshipState(g)
  const partner = currentPartner(g)
  if (!partner || partner.id !== relationships.partnerId || relationships.formerPartnerIds.includes(partner.id)) return 'ordinary'
  if (g.flags.livingTogether !== true) return 'ordinary'
  if (!partner.alive || partner.since > g.age || partner.state?.availability === 'distant') return 'ordinary'
  const sectorId = partner.state?.sectorId
  if (!sectorId || sectorId !== residenceOf(g)) return 'ordinary'
  return 'shared'
}
