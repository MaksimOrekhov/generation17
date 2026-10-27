import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../game'

describe('хранилище игры', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('ход времени работает через реактивное хранилище (без ошибок клонирования)', () => {
    const store = useGameStore()
    store.begin()
    store.changeSpeed(16)
    const seed = store.game.seed
    for (let i = 0; i < 4000 && !store.blocked; i++) store.frame(.1)
    expect(store.game.seed).toBe(seed)
    expect(store.game.age).toBeGreaterThan(0)
  })

  it('останавливается на решении и продолжает после результата', () => {
    const store = useGameStore()
    store.begin()
    store.changeSpeed(16)
    for (let i = 0; i < 20000 && !store.game.pending && !store.game.stopped; i++) store.frame(.1)
    if (!store.game.pending) return
    expect(store.playing).toBe(false)
    const age = store.game.age
    store.frame(5)
    expect(store.game.age).toBe(age)
    store.choose(0)
    expect(store.result?.length).toBeGreaterThan(0)
    store.frame(5)
    expect(store.game.age).toBe(age)
    store.continueAfterResult()
    expect(store.playing).toBe(true)
  })

  it('моменты принимаются и пропускаются', () => {
    const store = useGameStore()
    store.begin()
    store.changeSpeed(16)
    for (let i = 0; i < 40000 && !store.game.moment && !store.blocked; i++) store.frame(.1)
    if (!store.game.moment) return
    const attention = store.game.attention
    store.acceptMoment()
    expect(store.game.attention).toBe(attention - 1)
    expect(store.game.moment).toBeNull()
  })

  it('новая жизнь возвращает на экран рождения', () => {
    const store = useGameStore()
    store.begin()
    store.newLife()
    expect(store.started).toBe(false)
    expect(store.playing).toBe(false)
    expect(store.game.age).toBe(0)
  })
})
