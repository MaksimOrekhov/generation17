import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { advanceYear, createGame } from '../../domain/engine'
import { storylets } from '../../domain/storylets'
import { useGameStore } from '../game'

function storage(throws = false) {
  const records = new Map<string, string>()
  const writes: { key: string; value: string; persisted: boolean }[] = []
  let shouldThrow = throws
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      const write = { key, value, persisted: false }
      writes.push(write)
      if (shouldThrow && key === 'generation17-v2') throw new Error('blocked storage')
      records.set(key, value)
      write.persisted = true
    },
    removeItem: (key: string) => records.delete(key)
  })
  return { records, writes, setThrows: (next: boolean) => { shouldThrow = next } }
}

function snapshotWrites(writes: { key: string; value: string; persisted: boolean }[]) {
  return writes.filter(write => write.key === 'generation17-v2' && write.persisted).map(write => JSON.parse(write.value) as {
    game: ReturnType<typeof createGame>
    pendingDeathNotices: { personId: string; shipYear: number }[]
  })
}

describe('persisted family death notices', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('writes each step/frame snapshot with all deaths and their actual year, then durably acknowledges', async () => {
    const db = storage()
    setActivePinia(createPinia())
    const store = useGameStore()
    const game = createGame(184)
    game.age = 28
    for (const id of ['parent', 'parent2']) game.people.find(person => person.id === id)!.age = 103
    store.game = game
    await nextTick()
    db.writes.length = 0

    store.step()
    const snapshots = snapshotWrites(db.writes)
    expect(snapshots.length).toBeGreaterThan(0)
    for (const snapshot of snapshots) {
      const deadParents = snapshot.game.people.filter(person => ['parent', 'parent2'].includes(person.id) && !person.alive)
      for (const person of deadParents) {
        expect(snapshot.pendingDeathNotices).toContainEqual(expect.objectContaining({ personId: person.id, shipYear: snapshot.game.shipYear }))
      }
    }
    expect(store.pendingDeathNotices).toHaveLength(2)
    expect(store.game.history.filter(entry => entry.title === `Умерла ${store.game.people.find(person => person.id === 'parent')!.name}` || entry.title === `Умер ${store.game.people.find(person => person.id === 'parent2')!.name}`)).toHaveLength(2)

    setActivePinia(createPinia())
    const reloaded = useGameStore()
    expect(reloaded.pendingDeathNotices).toHaveLength(2)
    expect(reloaded.acknowledgeDeathNotices()).toBe(true)
    const persisted = JSON.parse(db.records.get('generation17-v2')!)
    expect(persisted.pendingDeathNotices).toEqual([])
    setActivePinia(createPinia())
    expect(useGameStore().pendingDeathNotices).toEqual([])
  })

  it('keeps a same-year family death readable beside a persisted hero ending', async () => {
    const db = storage()
    setActivePinia(createPinia())
    const store = useGameStore()
    const game = createGame(189)
    game.age = 104
    game.people.find(person => person.id === 'parent')!.age = 103
    store.game = game
    await nextTick()
    db.writes.length = 0

    store.step()

    expect(store.game.stopped).toBe(true)
    expect(store.pendingDeathNotices).toHaveLength(1)
    const finalSave = snapshotWrites(db.writes).at(-1)!
    expect(finalSave.game.stopped).toBe(true)
    expect(finalSave.pendingDeathNotices).toHaveLength(1)
    expect(finalSave.game.history.filter(entry => entry.title.startsWith('Умер')).length).toBeGreaterThan(0)
  })

  it('captures a clock boundary synchronously and keeps unread items on failed ack', async () => {
    storage(true)
    setActivePinia(createPinia())
    const store = useGameStore()
    const game = createGame(185)
    game.age = 28
    game.phase = 3
    game.people.find(person => person.id === 'parent')!.age = 103
    store.game = game
    await nextTick()
    store.begin()
    store.changeSpeed(16)
    store.progress = .9999
    store.frame(.1)

    expect(store.game.age).toBe(29)
    expect(store.pendingDeathNotices).toHaveLength(1)
    expect(store.game.people.find(person => person.id === 'parent')!.alive).toBe(false)
    expect(store.acknowledgeDeathNotices()).toBe(false)
    expect(store.pendingDeathNotices).toHaveLength(1)
  })

  it('intercepts every successful frame/runClock write and stores each death with its year in that snapshot', async () => {
    const db = storage()
    setActivePinia(createPinia())
    const store = useGameStore()
    const game = createGame(185)
    game.age = 28
    game.phase = 3
    game.people.find(person => person.id === 'parent')!.age = 103
    store.game = game
    await nextTick()
    store.begin()
    store.changeSpeed(16)
    store.progress = .9999
    await nextTick()
    db.writes.length = 0

    store.frame(.1)

    const attempts = db.writes.filter(write => write.key === 'generation17-v2')
    expect(attempts.length).toBeGreaterThan(0)
    expect(attempts.every(write => write.persisted)).toBe(true)
    const snapshots = snapshotWrites(db.writes)
    expect(snapshots).toHaveLength(attempts.length)
    for (const snapshot of snapshots) {
      for (const person of snapshot.game.people.filter(person => ['parent', 'parent2', 'sibling', 'child'].includes(person.id) && !person.alive)) {
        expect(snapshot.pendingDeathNotices).toContainEqual(expect.objectContaining({ personId: person.id, shipYear: snapshot.game.shipYear }))
      }
    }
    expect(store.pendingDeathNotices).toContainEqual(expect.objectContaining({ personId: 'parent', shipYear: store.game.shipYear }))
  })

  it('restores unread notices after a failed durable ack and reloads the last successful snapshot', async () => {
    const db = storage()
    setActivePinia(createPinia())
    const store = useGameStore()
    const game = createGame(184)
    game.age = 28
    game.people.find(person => person.id === 'parent')!.age = 103
    store.game = game
    await nextTick()
    store.step()
    expect(store.pendingDeathNotices).toHaveLength(1)
    expect(JSON.parse(db.records.get('generation17-v2')!).pendingDeathNotices).toHaveLength(1)

    db.setThrows(true)
    expect(store.acknowledgeDeathNotices()).toBe(false)
    expect(store.pendingDeathNotices).toHaveLength(1)
    db.setThrows(false)
    setActivePinia(createPinia())
    expect(useGameStore().pendingDeathNotices).toHaveLength(1)
  })

  it('runToDecision persists each intermediate year and does not collapse death years', async () => {
    const db = storage()
    let seed = 1
    let prepared: ReturnType<typeof createGame> | undefined
    for (; seed < 500 && !prepared; seed++) {
      const candidate = createGame(seed)
      candidate.age = 20
      candidate.seen = storylets.map(storylet => storylet.id)
      candidate.people.find(person => person.id === 'parent')!.age = 103
      candidate.people.find(person => person.id === 'parent2')!.age = 101
      const first = advanceYear(candidate)
      const second = advanceYear(first)
      if (!first.people.find(person => person.id === 'parent2')!.alive
        || !second.people.find(person => person.id === 'parent2')!.alive) continue
      prepared = candidate
    }
    expect(prepared).toBeDefined()

    setActivePinia(createPinia())
    const store = useGameStore()
    store.game = prepared!
    await nextTick()
    db.writes.length = 0
    store.runToDecision()

    const snapshots = snapshotWrites(db.writes)
    expect(snapshots.length).toBeGreaterThan(2)
    expect(snapshots.some(snapshot => snapshot.game.shipYear === prepared!.shipYear + 1)).toBe(true)
    const parentNotice = store.pendingDeathNotices.find(notice => notice.personId === 'parent')
    const parent2Notice = store.pendingDeathNotices.find(notice => notice.personId === 'parent2')
    expect(parentNotice?.shipYear).toBe(prepared!.shipYear + 1)
    expect(parent2Notice?.shipYear).toBe(prepared!.shipYear + 3)
    for (const snapshot of snapshots) {
      for (const person of snapshot.game.people.filter(person => ['parent', 'parent2'].includes(person.id) && !person.alive)) {
        expect(snapshot.pendingDeathNotices).toContainEqual(expect.objectContaining({ personId: person.id }))
      }
    }
  })

  it('legacy dead people do not create notices; newLife clears the queue', async () => {
    const db = storage()
    const legacy = createGame(186)
    legacy.people.find(person => person.id === 'parent')!.alive = false
    db.records.set('generation17-v2', JSON.stringify({ game: legacy, started: true, preset: 60 }))
    setActivePinia(createPinia())
    const store = useGameStore()
    expect(store.pendingDeathNotices).toEqual([])

    const game = createGame(187)
    game.people.find(person => person.id === 'parent')!.alive = false
    store.game = game
    store.pendingDeathNotices = [{ personId: 'parent', personName: game.people.find(person => person.id === 'parent')!.name, role: 'Мать', personAge: 40, shipYear: game.shipYear, wasCurrentPartner: false }]
    store.newLife(188)
    expect(store.pendingDeathNotices).toEqual([])
  })
})
