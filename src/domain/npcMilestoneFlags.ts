/** Engine-owned event markers for the four GEN-57 NPC autonomy milestones. */
export const NPC_MILESTONE_FLAGS = [
  'npcFriendFirstJobAt',
  'npcSiblingFirstJobAt',
  'npcFriendFirstMoveAt',
  'npcSiblingFirstMoveAt'
] as const

export type NpcMilestoneFlag = typeof NPC_MILESTONE_FLAGS[number]
