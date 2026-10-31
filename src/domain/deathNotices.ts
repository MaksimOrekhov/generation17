import type { GameState } from './types'
import { relationshipState } from './people'
import { genderOfName } from './birth'

export interface DeathNotice {
  personId: string
  personName: string
  role: string
  personAge: number
  shipYear: number
  wasCurrentPartner: boolean
}

const FAMILY_IDS = new Set(['parent', 'parent2', 'sibling', 'child'])

/** Capture only new, meaningful deaths, using relationship state before the yearly tick. */
export function collectDeathNotices(before: GameState, after: GameState, existing: DeathNotice[]): DeathNotice[] {
  const partnerId = relationshipState(before).partnerId
  const seen = new Set(existing.map(notice => notice.personId))
  const additions: DeathNotice[] = []

  for (const person of after.people) {
    const wasAlive = before.people.find(previous => previous.id === person.id)?.alive
    if (!wasAlive || person.alive || person.since > after.age || seen.has(person.id)) continue
    const wasCurrentPartner = person.id === partnerId
    if (!FAMILY_IDS.has(person.id) && !wasCurrentPartner) continue
    additions.push({
      personId: person.id,
      personName: person.name,
      role: person.role,
      personAge: person.age,
      shipYear: after.shipYear,
      wasCurrentPartner
    })
    seen.add(person.id)
  }

  return additions.length ? [...existing, ...additions] : existing
}

/** Discard malformed, stale, or inconsistent notices without inferring deaths from old saves. */
export function repairDeathNotices(value: unknown, game: GameState): DeathNotice[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const notices: DeathNotice[] = []

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const notice = entry as Partial<DeathNotice>
    if (typeof notice.personId !== 'string' || !notice.personId
      || typeof notice.personName !== 'string' || !notice.personName
      || typeof notice.role !== 'string' || !notice.role
      || !Number.isInteger(notice.personAge) || (notice.personAge ?? -1) < 0
      || !Number.isInteger(notice.shipYear) || (notice.shipYear ?? -1) < 190
      || typeof notice.wasCurrentPartner !== 'boolean' || seen.has(notice.personId)) continue

    const person = game.people.find(candidate => candidate.id === notice.personId)
    const meaningful = FAMILY_IDS.has(notice.personId) || notice.wasCurrentPartner
    if (!person || person.alive || !meaningful || person.name !== notice.personName
      || person.role !== notice.role || person.age !== notice.personAge || person.since > game.age
      || notice.shipYear! > game.shipYear) continue

    notices.push(notice as DeathNotice)
    seen.add(notice.personId)
  }
  return notices
}

export function deathNoticeText(notice: DeathNotice, gender: 'm' | 'f'): string {
  const phrase = notice.personId === 'parent' ? 'Умерла мама'
    : notice.personId === 'parent2' ? 'Умер папа'
      : notice.personId === 'sibling' ? gender === 'f' ? 'Умерла твоя старшая сестра' : 'Умер твой старший брат'
        : notice.personId === 'child' ? gender === 'f' ? 'Умерла твоя дочь' : 'Умер твой сын'
          : gender === 'f' ? 'Умерла твоя партнёрша' : 'Умер твой партнёр'
  return `${phrase} — ${notice.personName} (${formatYears(notice.personAge)}).`
}

export function deathNoticeGender(game: GameState, notice: DeathNotice): 'm' | 'f' {
  const person = game.people.find(candidate => candidate.id === notice.personId)
  return person?.gender ?? (person ? genderOfName(person.name) : 'm')
}

function formatYears(age: number): string {
  const last = age % 10
  const lastTwo = age % 100
  const word = last === 1 && lastTwo !== 11 ? 'год'
    : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'года' : 'лет'
  return `${age} ${word}`
}
