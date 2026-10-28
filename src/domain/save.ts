import { dropMissingPending } from './engine'
import { cohabitationOk } from './invariants'
import { getMomentDef } from './moments'
import type { GameState } from './types'

export interface Repaired {
  game: GameState
  /** Что пришлось исправить. Пусто — сохранение уже согласовано с каталогом. */
  notes: string[]
}

/**
 * Согласует сохранение с актуальным каталогом событий и правилами мира.
 * Устаревшие ссылки снимаются по одной, жизнь героя остаётся: сбрасывать всё из-за одного id нельзя.
 * Снятое ожидание решения попадает в хронику, остальное возвращается в `notes`.
 */
export function repairSave(state: GameState): Repaired {
  const notes: string[] = []
  let g = state
  const dropped = dropMissingPending(g)
  if (dropped !== g) {
    notes.push(`решение «${g.pending}» удалено из каталога и снято`)
    g = dropped
  }
  if (g.moment && !getMomentDef(g.moment)) {
    notes.push(`момент «${g.moment}» удалён из каталога и снят`)
    g = { ...g, moment: null }
  }
  if (!cohabitationOk(g)) {
    notes.push('совместная жизнь не сходилась с состоянием отношений и снята')
    g = { ...g, flags: { ...g.flags, livingTogether: false } }
  }
  return { game: g, notes }
}
