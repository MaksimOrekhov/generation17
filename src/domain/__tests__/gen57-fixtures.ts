import storyletsJson from '../../../content/storylets/npc-autonomy.json'

/** GEN-57 adds real narrative scenes, so legacy T6/T9 replay tests isolate those scenes. */
export const GEN57_STORYLET_IDS = new Set((storyletsJson as { id: string }[]).map(storylet => storylet.id))
