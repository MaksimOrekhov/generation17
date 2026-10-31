import { describe, expect, it } from 'vitest'
import { repairSave } from '../save'
import { runClock } from '../clock'
import { advanceYear, canChoose, createGame, decide, tick } from '../engine'
import { friendAutonomyStoryAvailable, inspectNpcMilestones, npcMilestonePlan, npcMilestonesTick, NPC_MILESTONE_FLAGS } from '../npcMilestones'
import { storylets } from '../storylets'
import { collectDeathNotices } from '../deathNotices'
import type { Storylet } from '../types'

const FLAG_BY_ID = {
  friend: { firstJob: 'npcFriendFirstJobAt', firstMove: 'npcFriendFirstMoveAt' },
  sibling: { firstJob: 'npcSiblingFirstJobAt', firstMove: 'npcSiblingFirstMoveAt' }
} as const
const GOLDEN_SEEDS = [17, 29, 43, 58, 73, 101, 137, 211]

function placeAt(g: ReturnType<typeof createGame>, personId: 'friend' | 'sibling', kind: 'firstJob' | 'firstMove') {
  const person = g.people.find(candidate => candidate.id === personId)
  if (!person) return undefined
  const plan = npcMilestonePlan(g.seed, personId)
  const npcAge = kind === 'firstJob' ? plan.jobAge : plan.moveAge
  person.age = npcAge
  person.alive = true
  person.since = 0
  g.age = Math.max(g.age, npcAge)
  g.shipYear = 190 + g.age
  return person
}

function insertStoryletForRuntimeTest(event: Storylet) {
  storylets.push(event)
  return () => {
    const index = storylets.indexOf(event)
    if (index >= 0) storylets.splice(index, 1)
  }
}

describe('автономные рубежи друга и сиблинга', () => {
  it('план фиксирован по seed и даёт только разрешённые возрасты и профессии', () => {
    for (const seed of GOLDEN_SEEDS) for (const personId of ['friend', 'sibling'] as const) {
      const plan = npcMilestonePlan(seed, personId)
      expect(plan.jobAge).toBeGreaterThanOrEqual(16)
      expect(plan.jobAge).toBeLessThanOrEqual(22)
      expect(plan.moveAge).toBeGreaterThanOrEqual(23)
      expect(plan.moveAge).toBeLessThanOrEqual(35)
      expect(['Техник', 'Медик', 'Агроном', 'Координатор']).toContain(plan.job)
      expect(npcMilestonePlan(seed, personId)).toEqual(plan)
    }
  })

  it('применяет firstJob ровно в назначенном возрасте, сохраняет факт и не расходует RNG', () => {
    const a = createGame(17)
    const person = placeAt(a, 'friend', 'firstJob')!
    const before = structuredClone(a)
    const plan = npcMilestonePlan(a.seed, 'friend')
    npcMilestonesTick(a)
    expect(a.rng).toBe(before.rng)
    expect(person.state?.job).toBe(plan.job)
    expect(a.flags[FLAG_BY_ID.friend.firstJob]).toBe(a.age)
    expect(a.history.filter(log => log.title === 'Реестр занятий')).toEqual([expect.objectContaining({
      age: a.age, shipYear: a.shipYear, kind: 'life', text: `${person.name} — ${plan.job}. Запись внесена в ${a.shipYear} году полёта.`
    })])
    expect(a.memories).toEqual(before.memories)
    expect(a.stats).toEqual(before.stats)
    expect(a.ship).toEqual(before.ship)

    const snapshot = JSON.stringify(a)
    npcMilestonesTick(a)
    expect(JSON.stringify(a)).toBe(snapshot)
  })

  it('не создаёт профессию до назначенного возраста, после окна или поверх уже заданного job', () => {
    const g = createGame(29)
    const person = g.people.find(candidate => candidate.id === 'friend')!
    const plan = npcMilestonePlan(g.seed, 'friend')
    person.age = plan.jobAge - 1
    g.age = Math.max(g.age, plan.jobAge - 1)
    npcMilestonesTick(g)
    expect(person.state?.job).toBeUndefined()
    person.age = plan.jobAge + 1
    g.age++
    npcMilestonesTick(g)
    expect(person.state?.job).toBeUndefined()
    expect(g.flags[FLAG_BY_ID.friend.firstJob]).toBeUndefined()

    const alreadyWorking = createGame(43)
    const friend = placeAt(alreadyWorking, 'friend', 'firstJob')!
    friend.state = { ...friend.state, job: 'Ученик' }
    const before = alreadyWorking.history.length
    npcMilestonesTick(alreadyWorking)
    expect(friend.state.job).toBe('Ученик')
    expect(alreadyWorking.flags[FLAG_BY_ID.friend.firstJob]).toBeUndefined()
    expect(alreadyWorking.history).toHaveLength(before)
  })

  it('пропускает известную цель переезда без исходного сектора и никогда не создаёт ложную запись', () => {
    const g = createGame(58)
    const person = placeAt(g, 'friend', 'firstMove')!
    person.state = { job: 'Медик' }
    const beforeHistory = g.history.length
    const assessment = inspectNpcMilestones(g).find(item => item.personId === 'friend' && item.kind === 'firstMove')
    expect(assessment).toMatchObject({ eligible: false, reason: 'UNKNOWN_SOURCE' })
    npcMilestonesTick(g)
    expect(person.state?.sectorId).toBeUndefined()
    expect(g.flags[FLAG_BY_ID.friend.firstMove]).toBeUndefined()
    expect(g.history).toHaveLength(beforeHistory)
  })

  it('выбирает только другой существующий сектор по фиксированному hash-gate', () => {
    const seed = GOLDEN_SEEDS.find(value => npcMilestonePlan(value, 'friend').movePermitted)!
    const g = createGame(seed)
    const person = placeAt(g, 'friend', 'firstMove')!
    person.state = { sectorId: 'bio', job: 'Техник' }
    const originalRng = g.rng
    const assessment = inspectNpcMilestones(g).find(item => item.personId === 'friend' && item.kind === 'firstMove')!
    expect(assessment).toMatchObject({ eligible: true, reason: 'APPLIED', oldSector: 'bio' })
    expect(assessment.newSector).toBeTruthy()
    expect(assessment.newSector).not.toBe('bio')
    npcMilestonesTick(g)
    expect(person.state?.sectorId).toBe(assessment.newSector)
    expect(g.flags[FLAG_BY_ID.friend.firstMove]).toBe(g.age)
    expect(g.rng).toBe(originalRng)
    expect(g.history.filter(log => log.title === 'Жилищный реестр')).toHaveLength(1)
  })

  it('honours the 5-year cooldown and blocks current, former, cohabiting and legacy romance contexts', () => {
    const seed = GOLDEN_SEEDS.find(value => npcMilestonePlan(value, 'friend').movePermitted)!
    for (const relationship of ['current', 'former', 'legacy'] as const) {
      const g = createGame(seed)
      const person = placeAt(g, 'friend', 'firstMove')!
      person.state = { sectorId: 'clinic' }
      if (relationship === 'current') {
        g.relationships = { partnerId: 'friend', formerPartnerIds: [] }
        g.flags.livingTogether = true
      } else if (relationship === 'former') {
        g.relationships = { partnerId: null, formerPartnerIds: ['friend'] }
      } else {
        g.flags.lovePath = 'confessed'
        g.flags.loveStage = 'parted'
      }
      npcMilestonesTick(g)
      expect(g.flags[FLAG_BY_ID.friend.firstMove]).toBeUndefined()
      expect(g.history.some(log => log.title === 'Жилищный реестр')).toBe(false)
    }

    const cooldown = createGame(seed)
    const friend = placeAt(cooldown, 'friend', 'firstMove')!
    friend.state = { sectorId: 'clinic', job: 'Медик' }
    cooldown.flags[FLAG_BY_ID.friend.firstJob] = cooldown.age - 4
    expect(inspectNpcMilestones(cooldown).find(item => item.personId === 'friend' && item.kind === 'firstMove')).toMatchObject({ reason: 'COOLDOWN' })
    npcMilestonesTick(cooldown)
    expect(cooldown.flags[FLAG_BY_ID.friend.firstMove]).toBeUndefined()
  })

  it('keeps first-job autonomy independent from romance and sibling moves independent from friend romance', () => {
    const job = createGame(29)
    const friend = placeAt(job, 'friend', 'firstJob')!
    job.relationships = { partnerId: 'friend', formerPartnerIds: [] }
    job.flags.livingTogether = true
    npcMilestonesTick(job)
    expect(friend.state?.job).toBe(npcMilestonePlan(job.seed, 'friend').job)

    const seed = GOLDEN_SEEDS.find(value => npcMilestonePlan(value, 'sibling').movePermitted)!
    const move = createGame(seed)
    const sibling = placeAt(move, 'sibling', 'firstMove')!
    sibling.state = { sectorId: 'bio' }
    move.relationships = { partnerId: 'friend', formerPartnerIds: [] }
    move.flags.livingTogether = true
    npcMilestonesTick(move)
    expect(sibling.state?.sectorId).toBeTruthy()
    expect(sibling.state?.sectorId).not.toBe('bio')
    expect(move.flags[FLAG_BY_ID.sibling.firstMove]).toBe(move.age)
  })

  it('не меняет отсутствующего или умершего sibling и пропускает смерть в peopleTick до автономии', () => {
    const absent = createGame(73)
    absent.people = absent.people.filter(person => person.id !== 'sibling')
    const before = JSON.stringify(absent)
    npcMilestonesTick(absent)
    expect(JSON.stringify(absent)).toBe(before)

    const dead = createGame(101)
    const sibling = placeAt(dead, 'sibling', 'firstJob')!
    sibling.alive = false
    const beforeLogs = dead.history.length
    expect(inspectNpcMilestones(dead).find(item => item.personId === 'sibling' && item.kind === 'firstJob')).toMatchObject({ reason: 'DEAD' })
    npcMilestonesTick(dead)
    expect(sibling.state?.job).toBeUndefined()
    expect(dead.flags[FLAG_BY_ID.sibling.firstJob]).toBeUndefined()
    expect(dead.history).toHaveLength(beforeLogs)

    const sameYear = createGame(137)
    const friend = sameYear.people.find(person => person.id === 'friend')!
    let liveSibling = sameYear.people.find(person => person.id === 'sibling')
    if (!liveSibling) {
      liveSibling = { id: 'sibling', name: 'Мира Марек', gender: 'f', role: 'Старшая сестра', bond: 58, age: 18, alive: true, since: 0 }
      sameYear.people.push(liveSibling)
    }
    friend.age = 103
    friend.since = 0
    liveSibling.age = npcMilestonePlan(sameYear.seed, 'sibling').jobAge - 1
    liveSibling.since = 0
    sameYear.age = liveSibling.age
    sameYear.shipYear = 190 + sameYear.age
    sameYear.seen = [...new Set([...sameYear.seen, ...storylets.map(event => event.id)])]
    const next = tick(sameYear)
    expect(next.people.find(person => person.id === 'friend')?.alive).toBe(false)
    expect(next.flags[FLAG_BY_ID.friend.firstJob]).toBeUndefined()
    expect(next.people.find(person => person.id === 'sibling')?.state?.job).toBe(npcMilestonePlan(sameYear.seed, 'sibling').job)
  })

  it('сохраняет очередь извещения о смерти sibling при одновременной профессии друга', () => {
    const before = createGame(58)
    const friend = before.people.find(person => person.id === 'friend')!
    let sibling = before.people.find(person => person.id === 'sibling')
    if (!sibling) {
      sibling = { id: 'sibling', name: 'Ян Тест', gender: 'm', role: 'Старший брат', bond: 58, age: 104, alive: true, since: 0 }
      before.people.push(sibling)
    }
    const plan = npcMilestonePlan(before.seed, 'friend')
    friend.age = plan.jobAge - 1
    friend.since = 0
    sibling.age = 104
    sibling.since = 0
    before.age = plan.jobAge - 1
    before.shipYear = 190 + before.age
    before.seen = [...new Set([...before.seen, ...storylets.map(event => event.id)])]

    const after = tick(before)
    const notices = collectDeathNotices(before, after, [])
    expect(after.flags[FLAG_BY_ID.friend.firstJob]).toBe(after.age)
    expect(after.people.find(person => person.id === 'sibling')?.alive).toBe(false)
    expect(notices).toContainEqual(expect.objectContaining({ personId: 'sibling', shipYear: after.shipYear }))
    expect(after.history.some(log => log.title === 'Реестр занятий')).toBe(true)
  })

  it('может записать два разных NPC в одном shipYear, но не дублирует переходы', () => {
    const g = createGame(211)
    const plan = npcMilestonePlan(g.seed, 'friend')
    const friend = g.people.find(person => person.id === 'friend')!
    let sibling = g.people.find(person => person.id === 'sibling')
    if (!sibling) {
      sibling = { id: 'sibling', name: 'Мира Марек', gender: 'f', role: 'Старшая сестра', bond: 58, age: 18, alive: true, since: 0 }
      g.people.push(sibling)
    }
    friend.age = plan.jobAge
    sibling.age = npcMilestonePlan(g.seed, 'sibling').jobAge
    friend.since = sibling.since = 0
    g.age = Math.max(friend.age, sibling.age)
    g.shipYear = 190 + g.age
    npcMilestonesTick(g)
    expect(g.flags[FLAG_BY_ID.friend.firstJob]).toBe(g.age)
    expect(g.flags[FLAG_BY_ID.sibling.firstJob]).toBe(g.age)
    expect(g.history.filter(log => log.title === 'Реестр занятий' && log.shipYear === g.shipYear)).toHaveLength(2)
    const before = JSON.stringify(g)
    npcMilestonesTick(g)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('не восстанавливает пропущенную биографию старого сохранения и сохраняет marker после reload', () => {
    const old = createGame(17)
    const friend = old.people.find(person => person.id === 'friend')!
    friend.age = npcMilestonePlan(old.seed, 'friend').jobAge + 1
    old.age = friend.age + 10
    const before = JSON.stringify(old)
    npcMilestonesTick(old)
    expect(old.flags[FLAG_BY_ID.friend.firstJob]).toBeUndefined()
    expect(friend.state?.job).toBeUndefined()
    expect(old.history).toEqual(JSON.parse(before).history)

    const current = createGame(29)
    placeAt(current, 'friend', 'firstJob')
    npcMilestonesTick(current)
    const repaired = repairSave(JSON.parse(JSON.stringify(current))).game
    const saved = JSON.stringify(repaired)
    npcMilestonesTick(repaired)
    expect(JSON.stringify(repaired)).toBe(saved)
    expect(repaired.flags[FLAG_BY_ID.friend.firstJob]).toBe(current.age)
    expect(createGame(29).flags[FLAG_BY_ID.friend.firstJob]).toBeUndefined()
  })

  it('совпадает при годовом ходе и кадре 16×', () => {
    const start = createGame(43)
    const friend = start.people.find(person => person.id === 'friend')!
    const targetAge = npcMilestonePlan(start.seed, 'friend').jobAge
    start.age = targetAge - 1
    start.shipYear = 190 + start.age
    friend.age = targetAge - 1
    friend.since = 0
    start.phase = 3
    start.seen = [...new Set([...start.seen, ...storylets.map(event => event.id)])]
    const stepped = advanceYear(structuredClone(start))
    const fast = runClock(structuredClone(start), .75, 49 / (4 * 16), 16, 49).game
    expect(fast).toEqual(stepped)
    expect(fast.flags[FLAG_BY_ID.friend.firstJob]).toBe(targetAge)
  })

  it('разделяет автономный факт, опубликованную возможность и контактную память', () => {
    const g = createGame(101)
    const friend = g.people.find(person => person.id === 'friend')!
    friend.age = 20
    friend.since = 4
    friend.gender = 'm'
    friend.state = { job: 'Медик' }
    friend.alive = true
    g.age = 21
    g.shipYear = 211
    g.flags[FLAG_BY_ID.friend.firstJob] = 20
    g.pending = 'npc-friend-shift-ledger'
    expect(canChoose(g, 2).available).toBe(true)
    const refused = decide(g, 2)
    expect(refused.memories).toEqual(g.memories)
    expect(refused.people.find(person => person.id === 'friend')?.state?.job).toBe('Медик')
    expect(refused.decisions.find(decision => decision.id === 'npc-friend-shift-ledger')?.choice).toBe('no-contact')

    const talked = decide(g, 0)
    expect(talked.memories).toContain(`${friend.name.split(' ')[0]} рассказал о работе и о том, как ищет время для себя.`)
    expect(talked.people.find(person => person.id === 'friend')?.state?.job).toBe('Медик')
    expect(talked.decisions.find(decision => decision.id === 'npc-friend-shift-ledger')?.choice).toBe('ask-work')
    expect(talked.history[0]?.text).toContain('В медицине хочется быть внимательным к другим')
  })

  it('держит sibling scene за present/firstJob, сохраняет род и не меняет память без контакта', () => {
    const female = createGame(58)
    let sibling = female.people.find(person => person.id === 'sibling')
    if (!sibling) {
      female.people.push({ id: 'sibling', name: 'Мира Марек', gender: 'f', role: 'Старшая сестра', bond: 58, age: 20, alive: true, since: 0 })
      sibling = female.people.at(-1)!
    }
    sibling.age = 20
    sibling.gender = 'f'
    sibling.state = { job: 'Техник' }
    female.age = 21
    female.flags[FLAG_BY_ID.sibling.firstJob] = 20
    female.pending = 'npc-sibling-own-rhythm'
    expect(canChoose(female, 0).available).toBe(true)
    expect(decide(female, 0).history[0]?.text).toContain('Я учусь вовремя заканчивать')

    const male = structuredClone(female)
    male.people.find(person => person.id === 'sibling')!.gender = 'm'
    expect(decide(male, 0).history[0]?.text).toContain('Я учусь вовремя заканчивать')

    const noJob = structuredClone(female)
    delete noJob.flags[FLAG_BY_ID.sibling.firstJob]
    noJob.pending = 'npc-sibling-own-rhythm'
    expect(canChoose(noJob, 0).available).toBe(false)

    const distant = structuredClone(female)
    distant.people.find(person => person.id === 'sibling')!.state = { job: 'Техник', availability: 'distant' }
    distant.pending = 'npc-sibling-own-rhythm'
    expect(canChoose(distant, 0).available).toBe(false)
  })

  it('не предлагает устаревшую сцену другу в романе, former partner или при distant/unknown sibling', () => {
    const g = createGame(73)
    const friend = g.people.find(person => person.id === 'friend')!
    friend.age = 20
    friend.state = { job: 'Медик' }
    friend.gender = 'm'
    friend.since = 4
    g.age = 25
    g.flags[FLAG_BY_ID.friend.firstJob] = 20
    g.pending = 'npc-friend-shift-ledger'
    g.relationships = { partnerId: 'friend', formerPartnerIds: [] }
    expect(friendAutonomyStoryAvailable(g)).toBe(false)
    expect(canChoose(g, 0).available).toBe(false)
    g.relationships = { partnerId: null, formerPartnerIds: ['friend'] }
    expect(canChoose(g, 0).available).toBe(false)

    const absentSibling = createGame(101)
    absentSibling.people = absentSibling.people.filter(person => person.id !== 'sibling')
    absentSibling.age = 22
    absentSibling.flags[FLAG_BY_ID.sibling.firstJob] = 20
    absentSibling.pending = 'npc-sibling-own-rhythm'
    expect(canChoose(absentSibling, 0).available).toBe(false)
  })

  it('runtime разрешает только безопасную sibling state-запись и запрещает все четыре engine markers', () => {
    const sibling = createGame(137)
    let person = sibling.people.find(candidate => candidate.id === 'sibling')
    if (!person) {
      sibling.people.push({ id: 'sibling', name: 'Мира Марек', gender: 'f', role: 'Старшая сестра', bond: 58, age: 18, alive: true, since: 0 })
      person = sibling.people.at(-1)!
    }
    person.age = 18
    const fixture = (id: string, effects: Storylet['choices'][number]['effects']): Storylet => ({
      id, category: 'Тест', title: 'Тест', body: 'Тестовый сюжет без упоминания близких.', min: 0, max: 95, weight: 1,
      available: () => true,
      choices: [{ text: 'Выбрать', hint: 'Проверка', result: 'Результат.', effects }]
    })

    const valid = fixture('test-sibling-effect', { person: { sibling: { job: 'Медик', sectorId: 'clinic' } } })
    const removeValid = insertStoryletForRuntimeTest(valid)
    try {
      sibling.pending = valid.id
      expect(canChoose(sibling, 0).available).toBe(true)
    } finally { removeValid() }

    const forbiddenNeighbor = fixture('test-neighbor-effect', { person: { neighbor: { job: 'Медик' } } })
    const removeNeighbor = insertStoryletForRuntimeTest(forbiddenNeighbor)
    try {
      sibling.pending = forbiddenNeighbor.id
      expect(canChoose(sibling, 0).available).toBe(false)
    } finally { removeNeighbor() }

    for (const marker of NPC_MILESTONE_FLAGS) {
      const forbidden = fixture(`test-${marker.toLowerCase()}`, { flags: { [marker]: 18 } })
      const remove = insertStoryletForRuntimeTest(forbidden)
      try {
        sibling.pending = forbidden.id
        expect(canChoose(sibling, 0).available).toBe(false)
      } finally { remove() }
    }
  })
})
