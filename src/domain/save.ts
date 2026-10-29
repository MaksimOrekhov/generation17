import { repairDecisions } from './decisionMemory'
import { repairEconomy } from './economy'
import { dropMissingPending, dropUnanswerablePending } from './engine'
import { cohabitationOk } from './invariants'
import { getMomentDef } from './moments'
import { getOffer } from './offers'
import { repairPersonalTime } from './personalTime'
import type { GameState } from './types'
import { relationshipState } from './people'

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
  const economyWasMigrated = !state.economy || state.economy.v !== 1
  const decisions = repairDecisions(state.decisions, state.age)
  if (JSON.stringify(decisions) !== JSON.stringify(state.decisions)) notes.push('Журнал решений: отсутствующие или повреждённые записи удалены; прошлые решения не восстанавливались.')
  let g = { ...state, decisions, economy: repairEconomy(state) }
  if (g.relationships?.partnerId) {
    const id = g.relationships.partnerId
    const person = g.people.find(p => p.id === id)
    if (!person || !person.alive) {
      notes.push(person ? 'отношения с умершим человеком сохранены в истории' : `партнёр «${id}» отсутствует в сохранении`)
      g = { ...g, flags: { ...g.flags, livingTogether: false }, relationships: {
        partnerId: null,
        formerPartnerIds: person ? [...new Set([...g.relationships.formerPartnerIds, id])] : g.relationships.formerPartnerIds
      } }
    }
  }
  if (economyWasMigrated) notes.push('Личные средства: выполнен расчёт по прошлым годам; история расходов до введения учёта недоступна.')
  // Цель накопления ссылается только на позицию каталога: неизвестный id молча снимается (§6.4).
  if (g.economy.goal !== null && !getOffer(g.economy.goal)) {
    notes.push(`цель накопления «${g.economy.goal}» не найдена в каталоге и снята`)
    g = { ...g, economy: { ...g.economy, goal: null } }
  }
  const dropped = dropMissingPending(g)
  if (dropped !== g) {
    notes.push(`решение «${g.pending}» удалено из каталога и снято`)
    g = dropped
  }
  if (g.moment && !getMomentDef(g.moment)) {
    notes.push(`момент «${g.moment}» удалён из каталога и снят`)
    g = { ...g, moment: null }
  }
  // Личное время после экономики: лимит нового года зависит от уже восстановленного рабочего режима.
  const time = repairPersonalTime(g)
  if (time.note) notes.push(time.note)
  g = time.game
  const answerable = dropUnanswerablePending(g)
  if (answerable !== g) notes.push(`решение «${g.pending}» не имеет доступного выхода и снято`)
  g = answerable
  if (!cohabitationOk(g)) {
    notes.push('совместная жизнь не сходилась с состоянием отношений и снята')
    // При старой подтверждённой совместной жизни не теряем связь после смерти друга,
    // когда сам флаг уже нельзя сохранить как текущий.
    const historical = !g.relationships ? relationshipState(g) : undefined
    g = { ...g, flags: { ...g.flags, livingTogether: false }, ...(historical?.formerPartnerIds.length ? { relationships: historical } : {}) }
  }
  return { game: g, notes }
}
