import { describe, expect, it } from 'vitest'
import { censorReason, diagnoseNpcAutonomyScene } from '../npcAutonomyDiagnostics'
import { createGame } from '../engine'

describe('GEN-57 diagnostic classification', () => {
  it('counts early death as censored before the age-40 horizon', () => {
    expect(censorReason(27, 40, true, false)).toBe('STOPPED_BEFORE_HORIZON')
    expect(censorReason(40, 40, true, false)).toBeNull()
    expect(censorReason(27, 40, false, true)).toBe('UNRESOLVED_DECISION')
  })

  it('separates raw JSON eligibility, relationship blocks, prior decisions and pending blocks', () => {
    const g = createGame(58)
    g.age = 24
    const friend = g.people.find(person => person.id === 'friend')!
    friend.age = 22
    friend.since = 0
    friend.state = { job: 'Медик' }
    g.flags.npcFriendFirstJobAt = 22
    const id = 'npc-friend-shift-ledger'
    expect(diagnoseNpcAutonomyScene(g, id, null)).toMatchObject({ jsonConditionOk: true, realSelectionEligible: true })
    expect(diagnoseNpcAutonomyScene(g, id, 'another-pending').blockedPending).toBe(true)
    g.flags.npcFriendFirstJobAt = 22.5
    expect(diagnoseNpcAutonomyScene(g, id, null)).toMatchObject({ jsonConditionOk: true, realSelectionEligible: false })
    g.flags.npcFriendFirstJobAt = 22
    g.seen.push(id)
    expect(diagnoseNpcAutonomyScene(g, id, null)).toMatchObject({ alreadySeen: true, realSelectionEligible: false })
  })
})
