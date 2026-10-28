import { afterEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createGame } from '../engine'
import { useGameStore } from '../../stores/game'

it('загрузка старого сохранения сохраняет жизнь и не перезаписывает localStorage', () => {
  const g = createGame(1234); g.age = 30; g.pending = 'school-track'; g.memories.push('Запись')
  const old = JSON.parse(JSON.stringify(g)); delete old.economy
  const raw = JSON.stringify({game:old,started:true,preset:12})
  const storage = { getItem: vi.fn((key:string) => key === 'generation17-v2' ? raw : null), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(), key: vi.fn(), length: 1 }
  vi.stubGlobal('localStorage', storage)
  setActivePinia(createPinia())
  const store = useGameStore()
  expect(store.game.seed).toBe(g.seed)
  expect(store.game.rng).toBe(g.rng)
  expect(store.game.pending).toBe(g.pending)
  expect(store.game.memories).toEqual(g.memories)
  expect(store.game.economy.settledAge).toBe(30)
  expect(storage.setItem).not.toHaveBeenCalled()
})
afterEach(() => vi.unstubAllGlobals())
